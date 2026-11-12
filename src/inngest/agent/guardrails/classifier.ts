import "server-only";
import { generateText } from "ai";
import { z } from "zod";
import { findGuardModel, gateway } from "@/server/ai/gateway";
import {
  estimateCostUsd,
  type TokenUsage,
  toTokenUsage,
} from "@/server/billing/pricing";
import type { BilledCall } from "@/server/billing/run-cost";
import { GUARD_CATEGORIES, GUARD_POLICY } from "../prompts/guard";

export const MAX_GUARD_CHARS = 6000;

export const guardVerdicts = ["allow", "review", "block"] as const;
export type GuardVerdict = (typeof guardVerdicts)[number];

const verdictSchema = z.object({
  verdict: z.enum(guardVerdicts),
  categories: z
    .array(z.string())
    .default([])
    .transform((list) =>
      list.filter((item): item is (typeof GUARD_CATEGORIES)[number] =>
        (GUARD_CATEGORIES as readonly string[]).includes(item),
      ),
    ),
});

export type Classification = {
  verdict: GuardVerdict;
  categories: string[];
  usage: TokenUsage;
  call: BilledCall;
};

export function parseVerdict(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = verdictSchema.safeParse(
      JSON.parse(text.slice(start, end + 1)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function generationIdOf(metadata: unknown) {
  const id = (metadata as { gateway?: { generationId?: unknown } } | undefined)
    ?.gateway?.generationId;
  return typeof id === "string" ? id : null;
}

export async function classifyText(
  text: string,
  stage: "input" | "output",
): Promise<Classification> {
  const model = await findGuardModel();
  const result = await generateText({
    model: gateway(model.id),
    instructions: GUARD_POLICY,
    prompt: `Stage: ${stage === "input" ? "a message from the user" : "the agent's reply to the user"}.\n\n<text>\n${text.slice(0, MAX_GUARD_CHARS)}\n</text>`,
    maxRetries: 1,
  });
  const verdict = parseVerdict(result.text);
  if (!verdict) throw new Error("The guard model returned no verdict.");
  const usage = toTokenUsage(result.totalUsage);
  const generationId = generationIdOf(result.providerMetadata);
  return {
    ...verdict,
    usage,
    call: {
      generationIds: generationId ? [generationId] : [],
      estimatedUsd: model.pricing ? estimateCostUsd(usage, model.pricing) : 0,
      agent: "guard",
      model: model.id,
    },
  };
}
