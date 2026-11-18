import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { memoryProvider, memoryScopes } from "@/server/memory";
import { rateRules } from "@/server/rate-limit";
import {
  createTRPCRouter,
  protectedProcedure,
  rateLimitedProcedure,
} from "../init";

const memoryId = z.string().min(1).max(128);

function requireProvider() {
  const provider = memoryProvider();
  if (!provider) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Memory isn't set up on this server.",
    });
  }
  return provider;
}

export const memoryRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      select: { memoryEnabled: true },
    });
    const provider = memoryProvider();
    if (!provider) {
      return { configured: false, enabled: false, items: [] };
    }
    const profile = await provider.profile(memoryScopes(userId).userNs);
    return {
      configured: true,
      enabled: user?.memoryEnabled ?? false,
      items: [...profile.static, ...profile.dynamic].map((item) => ({
        id: item.id,
        memory: item.memory,
        kind: item.kind,
      })),
    };
  }),
  setEnabled: rateLimitedProcedure(rateRules.memory)
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { memoryEnabled: input.enabled },
      });
      return { enabled: input.enabled };
    }),
  forget: rateLimitedProcedure(rateRules.memory)
    .input(
      z.object({
        userIds: z.array(memoryId).max(50).default([]),
        projectId: z.string().min(1).max(64).optional(),
        projectIds: z.array(memoryId).max(50).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const provider = requireProvider();
      const scopes = memoryScopes(ctx.session.user.id);
      if (input.projectIds.length > 0) {
        if (!input.projectId) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }
        const project = await ctx.db.project.findFirst({
          where: { id: input.projectId, userId: ctx.session.user.id },
          select: { id: true },
        });
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });
        await provider.forget(scopes.projectNs(project.id), input.projectIds);
      }
      if (input.userIds.length > 0) {
        await provider.forget(scopes.userNs, input.userIds);
      }
      return { forgotten: input.userIds.length + input.projectIds.length };
    }),
  clear: rateLimitedProcedure(rateRules.memory).mutation(async ({ ctx }) => {
    const provider = requireProvider();
    const userId = ctx.session.user.id;
    const scopes = memoryScopes(userId);
    const projects = await ctx.db.project.findMany({
      where: { userId },
      select: { id: true },
    });
    const results = await Promise.allSettled([
      provider.dropNamespace(scopes.userNs),
      ...projects.map((project) =>
        provider.dropNamespace(scopes.projectNs(project.id)),
      ),
    ]);
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Some memories couldn't be cleared. Try again.",
      });
    }
    return { cleared: true as const };
  }),
});
