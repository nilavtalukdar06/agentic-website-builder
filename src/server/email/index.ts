import "server-only";
import { env } from "@/config/env";
import { resendProvider } from "./resend";
import type { EmailProvider } from "./types";

export type EmailAvailability =
  | { enabled: true; provider: EmailProvider; from: string }
  | { enabled: false; reason: string };

export function emailAvailability(): EmailAvailability {
  if (env.EMAIL_NOTIFICATIONS === "off") {
    return { enabled: false, reason: "email notifications are turned off" };
  }
  if (!env.RESEND_API_KEY) {
    return { enabled: false, reason: "no Resend key is set" };
  }
  return {
    enabled: true,
    from: env.EMAIL_FROM,
    provider: resendProvider(env.RESEND_API_KEY, env.EMAIL_FROM),
  };
}
