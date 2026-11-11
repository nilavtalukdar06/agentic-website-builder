import { getCreditBalance } from "@/server/billing/balance";
import { createTRPCRouter, protectedProcedure } from "../init";

export const creditsRouter = createTRPCRouter({
  balance: protectedProcedure.query(({ ctx }) =>
    getCreditBalance(ctx.db, ctx.session.user.id),
  ),
});
