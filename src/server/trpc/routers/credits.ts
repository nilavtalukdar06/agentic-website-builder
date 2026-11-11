import { createTRPCRouter, protectedProcedure } from "../init";

export const creditsRouter = createTRPCRouter({
  balance: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [balance, granted] = await Promise.all([
      ctx.db.creditLedger.aggregate({
        where: { userId },
        _sum: { delta: true },
      }),
      ctx.db.creditLedger.aggregate({
        where: { userId, delta: { gt: 0 } },
        _sum: { delta: true },
      }),
    ]);
    return {
      balance: balance._sum.delta ?? 0,
      granted: granted._sum.delta ?? 0,
    };
  }),
});
