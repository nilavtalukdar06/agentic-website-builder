import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

export const projectSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  githubRepo: true,
  updatedAt: true,
} as const;

export const projectRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.project.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { updatedAt: "desc" },
      select: projectSelect,
    }),
  ),
  bySlug: protectedProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findFirst({
        where: { slug: input.slug, userId: ctx.session.user.id },
        select: projectSelect,
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return project;
    }),
});
