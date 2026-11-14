import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pendingPromptWhere } from "@/inngest/agent/prompt-state";
import { wakeSandbox } from "@/server/sandbox/workspace";
import {
  clearOperation,
  projectOperation,
  projectTransaction,
} from "@/server/projects/operations";
import { rateRules } from "@/server/rate-limit";
import { createTRPCRouter, rateLimitedProcedure } from "../init";

export const sandboxRouter = createTRPCRouter({
  wake: rateLimitedProcedure(rateRules.sandbox)
    .input(z.object({ projectId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const operationId = `wake-${nanoid(12)}`;
      const reserved = await projectTransaction(
        ctx.db,
        input.projectId,
        ctx.session.user.id,
        async (tx, project) => {
          if (projectOperation(project))
            return {
              status: "busy" as const,
              previewUrl: project.previewUrl,
              sandboxId: project.sandboxId,
            };
          const [pending, version] = await Promise.all([
            tx.message.count({
              where: { projectId: project.id, ...pendingPromptWhere },
            }),
            tx.version.findFirst({
              where: { projectId: project.id, status: "READY" },
              select: { id: true },
            }),
          ]);
          if (pending > 0) {
            return {
              status: "building" as const,
              previewUrl: project.previewUrl,
              sandboxId: project.sandboxId,
            };
          }
          if (!version) {
            return {
              status: "empty" as const,
              previewUrl: null,
              sandboxId: project.sandboxId,
            };
          }
          await tx.project.update({
            where: { id: project.id },
            data: {
              operationId,
              operationKind: "WAKE",
              operationStartedAt: new Date(),
            },
          });
          return {
            status: "wake" as const,
            sandboxId: project.sandboxId,
            previewUrl: project.previewUrl,
          };
        },
      );
      if (reserved.status !== "wake")
        return { status: reserved.status, previewUrl: reserved.previewUrl };
      try {
        const { previewUrl } = await wakeSandbox({
          projectId: input.projectId,
          sandboxId: reserved.sandboxId,
          operationId,
        });
        return { status: "ready" as const, previewUrl };
      } catch (error) {
        console.error("[sandbox.wake] failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Couldn't wake the preview. Try again.",
        });
      } finally {
        await clearOperation(ctx.db, input.projectId, operationId);
      }
    }),
});
