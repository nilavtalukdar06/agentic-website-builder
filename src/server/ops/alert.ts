import "server-only";
import { env } from "@/config/env";

export type Alert = {
  kind: string;
  message: string;
  details?: Record<string, string | number | boolean>;
};

const DELIVERY_TIMEOUT_MS = 5_000;

export function formatAlert({ kind, message, details }: Alert) {
  const extra = Object.entries(details ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  return `Vibe alert (${kind}): ${message}${extra ? ` [${extra}]` : ""}`;
}

export async function raiseAlert(
  alert: Alert,
  send: typeof fetch = fetch,
): Promise<boolean> {
  const text = formatAlert(alert);
  console.error(`[alert] ${text}`);
  const url = env.ALERT_WEBHOOK_URL;
  if (!url) return false;
  try {
    const response = await send(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[alert] webhook answered ${response.status}`);
    }
    return response.ok;
  } catch (error) {
    console.warn(
      "[alert] webhook delivery failed",
      error instanceof Error ? error.name : "unknown",
    );
    return false;
  }
}
