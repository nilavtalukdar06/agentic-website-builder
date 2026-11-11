import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { areDevRoutesEnabled } from "@/config/dev-routes";
import { createTRPCRouter, publicProcedure } from "../init";
import { projectSelect } from "./project";

const devProcedure = publicProcedure.use(({ next }) => {
  if (!areDevRoutesEnabled()) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return next();
});

export const devRouter = createTRPCRouter({
  project: createTRPCRouter({
    list: devProcedure.query(({ ctx }) =>
      ctx.db.project.findMany({
        orderBy: { updatedAt: "desc" },
        select: projectSelect,
      }),
    ),
    bySlug: devProcedure
      .input(z.object({ slug: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const project = await ctx.db.project.findUnique({
          where: { slug: input.slug },
          select: projectSelect,
        });
        if (!project) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return project;
      }),
  }),
});
