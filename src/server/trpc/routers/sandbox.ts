import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { pendingPromptWhere } from "@/inngest/agent/prompt-state";
import { wakeSandbox } from "@/server/sandbox/workspace";
import { createTRPCRouter, protectedProcedure } from "../init";

export const sandboxRouter = createTRPCRouter({
  wake: protectedProcedure
    .input(z.object({ projectId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true, sandboxId: true, previewUrl: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      const [pending, version] = await Promise.all([
        ctx.db.message.count({
          where: { projectId: project.id, ...pendingPromptWhere },
        }),
        ctx.db.version.findFirst({
          where: { projectId: project.id, status: "READY" },
          select: { id: true },
        }),
      ]);
      if (pending > 0) {
        return { status: "building" as const, previewUrl: project.previewUrl };
      }
      if (!version) {
        return { status: "empty" as const, previewUrl: null };
      }
      try {
        const { previewUrl } = await wakeSandbox({
          projectId: project.id,
          sandboxId: project.sandboxId,
        });
        return { status: "ready" as const, previewUrl };
      } catch (error) {
        console.error("[sandbox.wake] failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Couldn't wake the preview. Try again.",
        });
      }
    }),
});
