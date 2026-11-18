import "server-only";
import { Resend } from "resend";
import type { EmailMessage, EmailProvider, SendResult } from "./types";

const RETRYABLE_NAMES = new Set([
  "rate_limit_exceeded",
  "concurrent_idempotent_requests",
  "application_error",
  "internal_server_error",
]);

export function classifyResendError(error: {
  name: string;
  message: string;
  statusCode: number | null;
}): SendResult {
  const retryable =
    error.statusCode === null ||
    error.statusCode === 429 ||
    error.statusCode >= 500 ||
    RETRYABLE_NAMES.has(error.name);
  const reason = `${error.name}: ${error.message}`.slice(0, 240);
  return retryable
    ? { status: "retry", reason }
    : { status: "rejected", reason };
}

export function resendProvider(apiKey: string, from: string): EmailProvider {
  const client = new Resend(apiKey);
  return {
    async send(message: EmailMessage) {
      try {
        const { data, error } = await client.emails.send(
          {
            from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          },
          { idempotencyKey: message.idempotencyKey },
        );
        if (error) return classifyResendError(error);
        return { status: "sent", id: data?.id ?? "" };
      } catch (error) {
        return {
          status: "retry",
          reason:
            error instanceof Error
              ? error.message.slice(0, 240)
              : "send failed",
        };
      }
    },
  };
}
