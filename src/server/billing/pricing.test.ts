import { describe, expect, test } from "vitest";
import type { ModelPricing } from "@/lib/ai/models";
import {
  addUsage,
  creditsForCost,
  emptyUsage,
  estimateCostUsd,
  toTokenUsage,
} from "./pricing";

const pricing: ModelPricing = {
  inputPerMTok: 2,
  outputPerMTok: 10,
  cachedInputPerMTok: 0.2,
  cacheWritePerMTok: 2.5,
};

const rate = { creditsPerUsd: 100, markup: 1 };

describe("toTokenUsage", () => {
  test("fills missing numbers with 0", () => {
    expect(
      toTokenUsage({ inputTokens: undefined, outputTokens: undefined }),
    ).toEqual(emptyUsage);
  });

  test("never reports more cached tokens than input tokens", () => {
    expect(
      toTokenUsage({
        inputTokens: 10,
        inputTokenDetails: { cacheReadTokens: 8, cacheWriteTokens: 50 },
        outputTokens: 2,
      }),
    ).toEqual({
      inputTokens: 10,
      cachedInputTokens: 8,
      cacheWriteTokens: 2,
      outputTokens: 2,
    });
  });
});

describe("addUsage", () => {
  test("sums every field", () => {
    expect(
      addUsage(
        {
          inputTokens: 1,
          cachedInputTokens: 2,
          cacheWriteTokens: 3,
          outputTokens: 4,
        },
        {
          inputTokens: 10,
          cachedInputTokens: 20,
          cacheWriteTokens: 30,
          outputTokens: 40,
        },
      ),
    ).toEqual({
      inputTokens: 11,
      cachedInputTokens: 22,
      cacheWriteTokens: 33,
      outputTokens: 44,
    });
  });
});

describe("estimateCostUsd", () => {
  test("bills uncached, cache-read, cache-write and output tokens", () => {
    expect(
      estimateCostUsd(
        {
          inputTokens: 1_000_000,
          cachedInputTokens: 500_000,
          cacheWriteTokens: 100_000,
          outputTokens: 100_000,
        },
        pricing,
      ),
    ).toBeCloseTo(0.8 + 0.1 + 0.25 + 1);
  });

  test("falls back to the input price without cache prices", () => {
    expect(
      estimateCostUsd(
        {
          inputTokens: 1_000_000,
          cachedInputTokens: 1_000_000,
          cacheWriteTokens: 0,
          outputTokens: 0,
        },
        { ...pricing, cachedInputPerMTok: null },
      ),
    ).toBeCloseTo(2);
  });
});

describe("creditsForCost", () => {
  test("rounds up and applies the markup", () => {
    expect(creditsForCost(1, rate)).toBe(100);
    expect(creditsForCost(1, { ...rate, markup: 1.5 })).toBe(150);
    expect(creditsForCost(0.000001, rate)).toBe(1);
    expect(creditsForCost(0, rate)).toBe(0);
  });

  test("floating point noise does not add a credit", () => {
    expect(creditsForCost(0.1 + 0.2, rate)).toBe(30);
  });
});
