// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TRPCContext } from "../init";
import { createCaller } from "./_app";

function setup({
  checks = [] as { checkedAt: Date; ok: boolean; latencyMs: number }[],
  first = null as Date | null,
  latest = null as { checkedAt: Date; ok: boolean; latencyMs: number } | null,
} = {}) {
  const db = {
    healthCheck: {
      findMany: vi.fn().mockResolvedValue(checks),
      aggregate: vi.fn().mockResolvedValue({ _min: { checkedAt: first } }),
      findFirst: vi.fn().mockResolvedValue(latest),
    },
  };
  const ctx: TRPCContext = {
    db: db as unknown as TRPCContext["db"],
    session: null,
  };
  return { caller: createCaller(ctx), db };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T14:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("status.uptime", () => {
  test("is public and reports no data before the first check", async () => {
    const { caller } = setup();
    await expect(caller.status.uptime()).resolves.toMatchObject({
      hasData: false,
      range: "24h",
    });
  });

  test("queries only the requested window", async () => {
    const { caller, db } = setup();
    await caller.status.uptime({ range: "72h" });
    expect(db.healthCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { checkedAt: { gte: new Date("2026-11-08T15:00:00Z") } },
      }),
    );
  });

  test("returns hourly buckets, a summary and the overall status", async () => {
    const checks = Array.from({ length: 6 }, (_, index) => ({
      checkedAt: new Date(
        `2026-11-11T14:${String(index * 5).padStart(2, "0")}:00Z`,
      ),
      ok: true,
      latencyMs: 100,
    }));
    const { caller } = setup({
      checks,
      first: new Date("2026-11-11T14:00:00Z"),
      latest: checks[5],
    });
    const result = await caller.status.uptime({ range: "24h" });
    if (!result.hasData) throw new Error("expected data");
    expect(result.buckets).toHaveLength(24);
    expect(result.buckets[23]).toMatchObject({
      checks: 6,
      state: "operational",
    });
    expect(result.buckets[0].state).toBe("no-data");
    expect(result.uptime).toBe(1);
    expect(result.averageLatencyMs).toBe(100);
    expect(result.status).toBe("operational");
    expect(result.lastCheckedAt).toEqual(checks[5].checkedAt);
  });

  test("rejects unknown ranges", async () => {
    const { caller } = setup();
    await expect(
      caller.status.uptime({ range: "1y" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
