import { describe, expect, test, vi } from "vitest";
import { resolveRunCost } from "./run-cost";

describe("resolveRunCost", () => {
  test("uses the gateway's exact cost and falls back to the estimate", async () => {
    const lookup = vi.fn(async (id: string) =>
      id === "gen_missing" ? null : { costUsd: id === "gen_a" ? 0.1 : 0.2 },
    );
    const result = await resolveRunCost(
      [
        { generationIds: ["gen_a"], estimatedUsd: 0.5 },
        { generationIds: ["gen_b", "gen_missing"], estimatedUsd: 0.3 },
        { generationIds: [], estimatedUsd: 0.05 },
      ],
      lookup,
    );
    expect(result.costUsd).toBeCloseTo(0.1 + 0.3 + 0.05);
    expect(result).toMatchObject({
      exactCalls: 1,
      estimatedCalls: 2,
      generationIds: ["gen_a", "gen_b", "gen_missing"],
    });
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  test("an empty run costs nothing", async () => {
    await expect(resolveRunCost([], vi.fn())).resolves.toEqual({
      costUsd: 0,
      exactCalls: 0,
      estimatedCalls: 0,
      generationIds: [],
    });
  });
});
