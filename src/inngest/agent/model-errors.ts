export const MODEL_UNAVAILABLE =
  "The selected AI model isn't available right now, so this run wasn't charged. Pick another model and send your message again.";

const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MAX_RETRY_AFTER_SECONDS = 300;

export type ModelErrorKind =
  | { kind: "rate-limit"; retryAfterSeconds: number }
  | { kind: "unavailable" }
  | { kind: "invalid" }
  | { kind: "transient" };

function statusOf(error: object) {
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : null;
}

function retryAfterSeconds(error: object) {
  const headers = (error as { responseHeaders?: unknown }).responseHeaders;
  const header =
    headers && typeof headers === "object"
      ? Number((headers as Record<string, unknown>)["retry-after"])
      : Number.NaN;
  const fromMessage = /retry after (\d+)\s*s/i.exec(
    String((error as { message?: unknown }).message ?? ""),
  );
  const seconds =
    Number.isFinite(header) && header > 0
      ? header
      : fromMessage
        ? Number(fromMessage[1])
        : DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
}

export function classifyModelError(error: unknown): ModelErrorKind {
  let current: unknown = error;
  for (let depth = 0; depth < 6; depth++) {
    if (!current || typeof current !== "object") break;
    const status = statusOf(current);
    if (status === 429) {
      return {
        kind: "rate-limit",
        retryAfterSeconds: retryAfterSeconds(current),
      };
    }
    if (status === 401 || status === 403 || status === 404) {
      return { kind: "unavailable" };
    }
    if (status === 400 || status === 413 || status === 422) {
      return { kind: "invalid" };
    }
    current =
      (current as { lastError?: unknown }).lastError ??
      (current as { cause?: unknown }).cause;
  }
  return { kind: "transient" };
}
