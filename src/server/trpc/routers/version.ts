import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { replyId } from "@/inngest/agent/persist";
import { pendingPromptWhere } from "@/inngest/agent/prompt-state";
import type { AgentPart } from "@/lib/agent/parts";
import { diffVersions } from "@/lib/agent/version-diff";
import { writeVersionToSandbox } from "@/server/sandbox/workspace";
import {
  assertProjectAvailable,
  clearOperation,
  projectTransaction,
} from "@/server/projects/operations";
import { rateRules } from "@/server/rate-limit";
import {
  createTRPCRouter,
  protectedProcedure,
  rateLimitedProcedure,
} from "../init";

const projectId = z.string().min(1).max(64);
const versionNumber = z.number().int().positive();
const ready = { status: "READY" } as const;

type Files = Record<string, string>;

export const restoreReply = (number: number, restored: number) =>
  `Restored version ${restored} as version ${number}.`;

export const versionRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId }))
    .query(async ({ ctx, input }) => {
      const versions = await ctx.db.version.findMany({
        where: {
          projectId: input.projectId,
          project: { userId: ctx.session.user.id },
          ...ready,
        },
        orderBy: { number: "desc" },
        select: {
          number: true,
          title: true,
          creditCost: true,
          createdAt: true,
        },
      });
      return versions.flatMap((version) =>
        version.number === null ? [] : [{ ...version, number: version.number }],
      );
    }),
  files: protectedProcedure
    .input(z.object({ projectId, number: versionNumber.optional() }))
    .query(async ({ ctx, input }) => {
      const scope = {
        projectId: input.projectId,
        project: { userId: ctx.session.user.id },
        ...ready,
      };
      const version = await ctx.db.version.findFirst({
        where:
          input.number === undefined
            ? scope
            : { ...scope, number: input.number },
        orderBy: { number: "desc" },
        select: { number: true, title: true, files: true },
      });
      if (!version || version.number === null) {
        if (input.number !== undefined) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return null;
      }
      const previous = await ctx.db.version.findFirst({
        where: { ...scope, number: { lt: version.number } },
        orderBy: { number: "desc" },
        select: { files: true },
      });
      const files = (version.files ?? {}) as Files;
      return {
        number: version.number,
        title: version.title,
        files,
        changes: diffVersions(
          files,
          previous ? ((previous.files ?? {}) as Files) : null,
        ),
      };
    }),
  restore: rateLimitedProcedure(rateRules.restore)
    .input(z.object({ projectId, number: versionNumber }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const runId = `restore-${nanoid(12)}`;
      const { number, project, files } = await projectTransaction(
        ctx.db,
        input.projectId,
        userId,
        async (tx, project) => {
          assertProjectAvailable(project);
          const pending = await tx.message.count({
            where: { projectId: project.id, ...pendingPromptWhere },
          });
          if (pending > 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Wait for the current request to finish, or stop it.",
            });
          }
          const source = await tx.version.findFirst({
            where: { projectId: project.id, number: input.number, ...ready },
            select: { number: true, files: true },
          });
          if (!source) throw new TRPCError({ code: "NOT_FOUND" });

          const files = (source.files ?? {}) as Files;
          const latest = await tx.version.findFirst({
            where: { projectId: project.id, ...ready },
            orderBy: { number: "desc" },
            select: { number: true },
          });
          const next = (latest?.number ?? 0) + 1;
          const content = restoreReply(next, input.number);
          const parts: AgentPart[] = [{ type: "text", text: content }];
          await tx.version.create({
            data: {
              projectId: project.id,
              number: next,
              title: `Restored v${input.number}`,
              files,
              creditCost: 0,
              runId,
            },
          });
          await tx.message.create({
            data: {
              id: replyId(runId),
              projectId: project.id,
              role: "ASSISTANT",
              content,
              parts,
            },
          });
          await tx.project.update({
            where: { id: project.id },
            data: {
              sandboxId: null,
              previewUrl: null,
              updatedAt: new Date(),
              operationId: runId,
              operationKind: "RESTORE",
              operationStartedAt: new Date(),
            },
          });
          return { number: next, project, files };
        },
      );

      let sandboxUpdated = false;
      try {
        if (project.sandboxId) {
          try {
            sandboxUpdated = (
              await writeVersionToSandbox(project.sandboxId, files, {
                installInBackground: false,
              })
            ).written;
          } catch (error) {
            console.warn(
              "[version.restore] couldn't update the sandbox",
              error,
            );
          }
        }
        if (sandboxUpdated) {
          const attached = await ctx.db.project.updateMany({
            where: {
              id: project.id,
              userId,
              sandboxId: null,
              operationId: runId,
              versions: { none: { status: "READY", number: { gt: number } } },
              messages: { none: pendingPromptWhere },
            },
            data: {
              sandboxId: project.sandboxId,
              previewUrl: project.previewUrl,
            },
          });
          sandboxUpdated = attached.count > 0;
        }
      } finally {
        await clearOperation(ctx.db, project.id, runId);
      }
      return { number, sandboxUpdated };
    }),
});
