import { describe, expect, test, vi } from "vitest";
import { estimateCallUsd, resolveRunCost, SEARCH_FEE_USD } from "./run-cost";

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
      agents: [],
    });
  });

  test("the fallback estimate adds the search fee; the exact cost already has it", async () => {
    expect(
      estimateCallUsd({ generationIds: [], estimatedUsd: 0.001, searches: 2 }),
    ).toBeCloseTo(0.001 + 2 * SEARCH_FEE_USD);
    const exact = await resolveRunCost(
      [{ generationIds: ["gen_a"], estimatedUsd: 0.001, searches: 1 }],
      async () => ({ costUsd: 0.0062 }),
    );
    expect(exact.costUsd).toBeCloseTo(0.0062);
    const estimated = await resolveRunCost(
      [{ generationIds: ["gen_a"], estimatedUsd: 0.001, searches: 1 }],
      async () => null,
    );
    expect(estimated.costUsd).toBeCloseTo(0.006);
  });

  test("breaks the cost down per agent", async () => {
    const result = await resolveRunCost(
      [
        {
          generationIds: ["r1"],
          estimatedUsd: 0,
          agent: "researcher",
          model: "m",
          searches: 2,
        },
        {
          generationIds: ["b1"],
          estimatedUsd: 0,
          agent: "builder",
          model: "m",
        },
        {
          generationIds: [],
          estimatedUsd: 0.25,
          agent: "builder",
          model: "m",
        },
      ],
      async (id) => ({ costUsd: id === "r1" ? 0.02 : 0.5 }),
    );
    expect(result.agents).toEqual([
      { name: "researcher", model: "m", usd: 0.02, searches: 2 },
      { name: "builder", model: "m", usd: 0.75, searches: 0 },
    ]);
  });
});
