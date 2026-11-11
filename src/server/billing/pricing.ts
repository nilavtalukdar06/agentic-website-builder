import type { ModelPricing } from "@/lib/ai/models";

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
};

export type CreditRate = {
  creditsPerUsd: number;
  markup: number;
};

export const emptyUsage: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
};

type SdkUsage = {
  inputTokens: number | undefined;
  inputTokenDetails?: {
    cacheReadTokens: number | undefined;
    cacheWriteTokens?: number | undefined;
  };
  outputTokens: number | undefined;
};

export function toTokenUsage(usage: SdkUsage): TokenUsage {
  const inputTokens = usage.inputTokens ?? 0;
  const cachedInputTokens = Math.min(
    usage.inputTokenDetails?.cacheReadTokens ?? 0,
    inputTokens,
  );
  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens: Math.min(
      usage.inputTokenDetails?.cacheWriteTokens ?? 0,
      inputTokens - cachedInputTokens,
    ),
    outputTokens: usage.outputTokens ?? 0,
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

export function estimateCostUsd(usage: TokenUsage, pricing: ModelPricing) {
  const uncached = Math.max(
    0,
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens,
  );
  return (
    (uncached * pricing.inputPerMTok +
      usage.cachedInputTokens *
        (pricing.cachedInputPerMTok ?? pricing.inputPerMTok) +
      usage.cacheWriteTokens *
        (pricing.cacheWritePerMTok ?? pricing.inputPerMTok) +
      usage.outputTokens * pricing.outputPerMTok) /
    1_000_000
  );
}

export function creditsForCost(costUsd: number, rate: CreditRate) {
  const credits = costUsd * rate.creditsPerUsd * rate.markup;
  return Math.max(0, Math.ceil(Number(credits.toFixed(6))));
}
