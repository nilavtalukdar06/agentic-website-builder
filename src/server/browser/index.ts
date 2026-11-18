import "server-only";
import { env } from "@/config/env";
import { browserbaseProvider } from "./browserbase";
import type { BrowserProvider } from "./types";

export type BrowserAvailability =
  | { enabled: true; provider: BrowserProvider }
  | { enabled: false; reason: string };

export function browserAvailability(): BrowserAvailability {
  if (env.AGENT_BROWSER_QA === "off") {
    return { enabled: false, reason: "browser checks are turned off" };
  }
  if (!env.BROWSERBASE_API_KEY) {
    return { enabled: false, reason: "no Browserbase key is set" };
  }
  return {
    enabled: true,
    provider: browserbaseProvider(env.BROWSERBASE_API_KEY),
  };
}
