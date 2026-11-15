import "server-only";
import { detectPromptInjection, launchArcjet } from "@arcjet/guard";
import { env } from "@/config/env";

export const arcjetGuard = launchArcjet({ key: env.ARCJET_KEY });

const promptInjectionRule = detectPromptInjection();

export async function detectAgentPromptInjection(text: string) {
  const decision = await arcjetGuard.guard({
    label: "agent.prompt-injection",
    rules: [promptInjectionRule(text)],
  });
  return {
    blocked: decision.conclusion === "DENY",
    skipped: decision.hasFailedOpen(),
  };
}
