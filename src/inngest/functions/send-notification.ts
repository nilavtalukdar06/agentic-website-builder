import "server-only";
import { env } from "@/config/env";
import { db } from "@/server/db";
import { deliverNotification } from "@/server/email/deliver";
import { emailAvailability } from "@/server/email";
import { raiseAlert } from "@/server/ops/alert";
import { inngest } from "../client";
import { notifyUser } from "../events";

export const sendNotification = inngest.createFunction(
  {
    id: "send-notification",
    name: "Email a user about a build or an export",
    triggers: [notifyUser],
    idempotency: 'event.data.kind + "-" + event.data.key',
    concurrency: { limit: 3 },
    retries: 4,
  },
  async ({ event, step }) =>
    step.run("send", async () => {
      const email = emailAvailability();
      if (!email.enabled) {
        return { status: "skipped" as const, reason: email.reason };
      }
      const outcome = await deliverNotification({
        db,
        provider: email.provider,
        request: event.data,
        appUrl: env.NEXT_PUBLIC_APP_URL,
        dailyLimit: env.EMAIL_DAILY_LIMIT,
        alert: (details) =>
          raiseAlert({
            kind: "email-budget",
            message:
              "Email notifications passed 80% of today's limit. Finished-build emails stop now; failure emails continue until the limit.",
            details,
          }),
      });
      if (outcome.status === "rejected") {
        console.warn("[email] rejected", outcome.reason);
      }
      return outcome;
    }),
);
