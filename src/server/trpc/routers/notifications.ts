import { z } from "zod";
import { env } from "@/config/env";
import { emailAvailability } from "@/server/email";
import { rateRules } from "@/server/rate-limit";
import {
  createTRPCRouter,
  protectedProcedure,
  rateLimitedProcedure,
} from "../init";

export const notificationsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { email: true, notifyEmail: true },
    });
    return {
      configured: emailAvailability().enabled,
      enabled: user?.notifyEmail ?? false,
      email: user?.email ?? null,
      limited: env.EMAIL_FROM.includes("@resend.dev"),
    };
  }),
  setEnabled: rateLimitedProcedure(rateRules.notifications)
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { notifyEmail: input.enabled },
      });
      return { enabled: input.enabled };
    }),
});
