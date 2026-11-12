import { TRPCError } from "@trpc/server";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { inngest } from "@/inngest/client";
import { agentRun } from "@/inngest/events";
import { agentPartsSchema, inputQuestion } from "@/lib/agent/parts";
import { MAX_ATTACHMENTS } from "@/lib/attachments";
import {
  projectNameFromPrompt,
  slugFromName,
  withSlugSuffix,
} from "@/lib/project-name";
import { projectFilters, projectSorts } from "@/lib/search-params/projects";
import { findAgentModel } from "@/server/ai/gateway";
import { storedPayloadSchema } from "@/server/inputs/requests";
import { createTRPCRouter, protectedProcedure } from "../init";

export const projectSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  githubRepo: true,
  updatedAt: true,
} as const;

export const MAX_PROMPT_LENGTH = 4000;
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

function openQuestion(request: { kind: string; payload: unknown } | null) {
  if (!request) return null;
  const stored = storedPayloadSchema.safeParse(request.payload);
  if (!stored.success) return null;
  return {
    kind: stored.data.request.kind,
    question: inputQuestion(stored.data.request),
  };
}

function agentState(
  latest: {
    role: "USER" | "ASSISTANT";
    content: string;
    parts: unknown;
  } | null,
  open: { kind: string; payload: unknown } | null,
) {
  const question = openQuestion(open);
  if (question) {
    return {
      status: "paused" as const,
      reply: latest?.role === "ASSISTANT" ? latest.content : null,
      question,
    };
  }
  if (!latest || latest.role === "USER") {
    return { status: "building" as const, reply: null };
  }
  const parts = agentPartsSchema.safeParse(latest.parts);
  const failed =
    parts.success && parts.data.some((part) => part.type === "error");
  return {
    status: failed ? ("failed" as const) : ("done" as const),
    reply: latest.content,
  };
}

async function startAgent(data: {
  projectId: string;
  userId: string;
  messageId: string;
}) {
  try {
    await inngest.send(agentRun.create(data));
  } catch (error) {
    console.error("[project.create] couldn't start the agent", error);
  }
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
      const [project, latest, open] = await Promise.all([
        ctx.db.project.findFirst({
          where: owner,
          select: {
            ...projectSelect,
            previewUrl: true,
            messages: {
              where: { role: "USER" },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { content: true },
            },
          },
        }),
        ctx.db.message.findFirst({
          where: { project: owner },
          orderBy: { createdAt: "desc" },
          select: { role: true, content: true, parts: true },
        }),
        ctx.db.inputRequest.findFirst({
          where: {
            project: owner,
            status: { in: ["PENDING", "PAUSED"] },
          },
          orderBy: { createdAt: "desc" },
          select: { kind: true, payload: true },
        }),
      ]);
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const { messages, ...rest } = project;
      return {
        ...rest,
        prompt: messages[0]?.content ?? null,
        agent: agentState(latest, open),
      };
    }),
  create: protectedProcedure
    .input(
      z.object({
        prompt: z.string().trim().min(1).max(MAX_PROMPT_LENGTH),
        model: z.string().min(1).max(120).optional(),
        attachmentIds: z
          .array(z.string().min(1).max(64))
          .max(MAX_ATTACHMENTS)
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const attachmentIds = [...new Set(input.attachmentIds)];
      const [model, attachments] = await Promise.all([
        findAgentModel(input.model).catch(() => {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "Couldn't load the model list. Try again in a moment.",
          });
        }),
        attachmentIds.length
          ? ctx.db.attachment.findMany({
              where: { id: { in: attachmentIds }, userId, messageId: null },
              select: { id: true },
            })
          : Promise.resolve([]),
      ]);
      if (!model) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That model isn't available. Pick another one.",
        });
      }
      if (attachments.length !== attachmentIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Some images are missing. Attach them again.",
        });
      }
      if (attachmentIds.length > 0 && !model.vision) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${model.name} can't read images. Pick a model that supports images.`,
        });
      }

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
});
