import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/config/env";
import { getCreditBalance } from "@/server/billing/balance";
import { stripeProvider } from "@/server/billing/payments";
import { createTRPCRouter, protectedProcedure } from "../init";

export const creditsRouter = createTRPCRouter({
  balance: protectedProcedure.query(({ ctx }) =>
    getCreditBalance(ctx.db, ctx.session.user.id),
  ),
  checkout: protectedProcedure
    .input(z.object({ amount: z.number().int().min(5).max(100) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return {
          url: await stripeProvider().createCheckout(
            input.amount * 100,
            ctx.session.user.id,
          ),
        };
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Checkout is unavailable. Please try again later.",
        });
      }
    }),
  usage: protectedProcedure
    .input(
      z.object({
        range: z.enum(["14d", "30d"]).default("14d"),
        page: z.number().int().min(1).max(100000).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const now = new Date();
      const month = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const start = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - (input.range === "14d" ? 13 : 29),
        ),
      );
      const [balance, used, latest, daily, activity, count] = await Promise.all(
        [
          getCreditBalance(ctx.db, userId),
          ctx.db.creditLedger.aggregate({
            where: { userId, delta: { lt: 0 }, createdAt: { gte: month } },
            _sum: { delta: true },
          }),
          ctx.db.payment.findFirst({
            where: { userId, status: "SUCCEEDED" },
            orderBy: { createdAt: "desc" },
          }),
          ctx.db.creditLedger.findMany({
            where: { userId, delta: { lt: 0 }, createdAt: { gte: start } },
            select: { delta: true, createdAt: true },
          }),
          ctx.db.creditLedger.findMany({
            where: { userId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (input.page - 1) * 10,
            take: 10,
          }),
          ctx.db.creditLedger.count({ where: { userId } }),
        ],
      );
      const projectIds = [
        ...new Set(
          activity.flatMap((row) => (row.projectId ? [row.projectId] : [])),
        ),
      ];
      const projects = await ctx.db.project.findMany({
        where: { userId, id: { in: projectIds } },
        select: { id: true, name: true },
      });
      return {
        balance: balance.balance,
        used: -(used._sum.delta ?? 0),
        latest,
        daily,
        activity,
        projects,
        count,
        rate: env.CREDITS_PER_USD,
      };
    }),
});
