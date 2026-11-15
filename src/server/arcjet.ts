import "server-only";
import arcjet, {
  type ArcjetDecision,
  detectBot,
  shield,
  slidingWindow,
} from "@arcjet/next";
import { env } from "@/config/env";

export const aj = arcjet({
  key: env.ARCJET_KEY,
  rules: [shield({ mode: "LIVE" })],
});

export const ajBrowserBot = aj.withRule(
  detectBot({ mode: "LIVE", allow: ["CATEGORY:SEARCH_ENGINE"] }),
);

export function ajPerIpRateLimit(max: number, interval: number) {
  return aj.withRule(slidingWindow({ mode: "LIVE", interval, max }));
}

export function ajBrowserBotWithRateLimit(max: number, interval: number) {
  return ajBrowserBot.withRule(slidingWindow({ mode: "LIVE", interval, max }));
}

export function arcjetDenialResponse(decision: ArcjetDecision) {
  if (decision.isDenied()) {
    if (decision.reason.isRateLimit()) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (decision.isErrored()) {
    console.error("[arcjet] decision errored", decision.reason.message);
  }
  return null;
}
