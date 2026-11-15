import { TRPCError } from "@trpc/server";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { pendingPromptWhere } from "@/inngest/agent/prompt-state";
import {
  projectNameFromPrompt,
  slugFromName,
  withSlugSuffix,
} from "@/lib/project-name";
import { projectFilters, projectSorts } from "@/lib/search-params/projects";
import { rateRules } from "@/server/rate-limit";
import {
  createTRPCRouter,
  protectedProcedure,
  rateLimitedProcedure,
} from "../init";
import {
  deleteProjectRecords,
  removeProjectResources,
} from "@/server/projects/delete";
import { projectOperation } from "@/server/projects/operations";
import { killSandbox } from "@/server/sandbox/admin";
import { deleteAttachment } from "@/server/storage/attachments";
import { promptFields, resolvePrompt, startAgent } from "./prompt";

export const projectSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  githubRepo: true,
  updatedAt: true,
} as const;

const MAX_SLUG_ATTEMPTS = 5;
const slugSuffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 4);

const listInput = z
  .object({
    q: z.string().trim().max(200).default(""),
    filter: z.enum(projectFilters).default("all"),
    sort: z.enum(projectSorts).default("edited"),
  })
  .default({ q: "", filter: "all", sort: "edited" });

const orderBy = {
  edited: { updatedAt: "desc" },
  name: { name: "asc" },
  created: { createdAt: "desc" },
} as const satisfies Record<
  (typeof projectSorts)[number],
  Prisma.ProjectOrderByWithRelationInput
>;

function filterWhere(
  filter: (typeof projectFilters)[number],
): Prisma.ProjectWhereInput {
  if (filter === "github") return { githubRepo: { not: null } };
  if (filter === "local") return { githubRepo: null };
  return {};
}

function searchWhere(q: string): Prisma.ProjectWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ],
  };
}

function isSlugConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = error.meta?.target;
  if (target === undefined) return true;
  return Array.isArray(target)
    ? target.includes("slug")
    : String(target).includes("slug");
}

export const projectRouter = createTRPCRouter({
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const owner = { userId: ctx.session.user.id };
    const [projects, total] = await Promise.all([
      ctx.db.project.findMany({
        where: {
          ...owner,
          ...filterWhere(input.filter),
          ...searchWhere(input.q),
        },
        orderBy: orderBy[input.sort],
        select: projectSelect,
      }),
      ctx.db.project.count({ where: owner }),
    ]);
    return { projects, total };
  }),
  recent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(12).default(6) }))
    .query(({ ctx, input }) =>
      ctx.db.project.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: { updatedAt: "desc" },
        take: input.limit,
        select: projectSelect,
      }),
    ),
  bySlug: protectedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const owner = { slug: input.slug, userId: ctx.session.user.id };
      const [project, pending, latest] = await Promise.all([
        ctx.db.project.findFirst({
          where: owner,
          select: {
            ...projectSelect,
            previewUrl: true,
            operationId: true,
            operationKind: true,
            operationStartedAt: true,
            messages: {
              where: { role: "USER" },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { content: true },
            },
          },
        }),
        ctx.db.message.count({
          where: { project: owner, ...pendingPromptWhere },
        }),
        ctx.db.version.findFirst({
          where: { project: owner, status: "READY" },
          orderBy: { number: "desc" },
          select: { number: true },
        }),
      ]);
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const {
        messages,
        operationId,
        operationKind,
        operationStartedAt,
        ...rest
      } = project;
      return {
        ...rest,
        prompt: messages[0]?.content ?? null,
        building: pending > 0,
        busy: projectOperation({
          operationId,
          operationKind,
          operationStartedAt,
        }),
        version: latest?.number ?? null,
      };
    }),
  create: rateLimitedProcedure(rateRules.projectCreate, rateRules.agent)
    .input(z.object(promptFields))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { model, attachmentIds } = await resolvePrompt(
        ctx.db,
        userId,
        input,
      );

      const name = projectNameFromPrompt(input.prompt);
      const baseSlug = slugFromName(name);

      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
        const slug =
          attempt === 0 ? baseSlug : withSlugSuffix(baseSlug, slugSuffix());
        let project;
        try {
          project = await ctx.db.project.create({
            data: {
              slug,
              name,
              description: input.prompt,
              userId,
              messages: {
                create: {
                  role: "USER",
                  content: input.prompt,
                  model: model.id,
                  attachments: {
                    connect: attachmentIds.map((id) => ({ id })),
                  },
                },
              },
            },
            select: {
              id: true,
              slug: true,
              name: true,
              messages: { select: { id: true }, take: 1 },
            },
          });
        } catch (error) {
          if (!isSlugConflict(error)) throw error;
          continue;
        }

        const { messages, ...created } = project;
        await startAgent({
          projectId: created.id,
          userId,
          messageId: messages[0].id,
        });
        return created;
      }

      throw new TRPCError({
        code: "CONFLICT",
        message: "Couldn't find a free project URL. Try again.",
      });
    }),
  delete: rateLimitedProcedure(rateRules.projectDelete)
    .input(
      z.object({
        projectId: z.string().min(1).max(64),
        name: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const resources = await deleteProjectRecords(ctx.db, {
        ...input,
        userId: ctx.session.user.id,
      });
      await removeProjectResources(resources, {
        killSandbox,
        deleteObject: deleteAttachment,
      });
      return { deleted: true as const };
    }),
});
