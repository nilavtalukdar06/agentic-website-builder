import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AuthSession } from "@/server/auth";
import { enforceRateLimit, type RateRule } from "@/server/rate-limit";

export type Session = AuthSession;

export type TRPCContext = {
  db: PrismaClient;
  session: Session | null;
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const rateLimitedProcedure = (...rules: RateRule[]) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    for (const rule of rules) {
      await enforceRateLimit(ctx.db, rule, ctx.session.user.id);
    }
    return next();
  });
