import { describe, expect, test } from "vitest";
import {
  buildHourlyBuckets,
  formatUptime,
  formatUtcHourRange,
  overallStatus,
  stateForUptime,
  summarizeBuckets,
  type HealthCheckSample,
} from "./status";

const now = new Date("2026-11-11T14:30:00Z");

function checksIn(hour: string, count: number, okCount = count, latency = 80) {
  return Array.from({ length: count }, (_, index): HealthCheckSample => ({
    checkedAt: new Date(
      `2026-11-11T${hour}:${String(index * 5).padStart(2, "0")}:00Z`,
    ),
    ok: index < okCount,
    latencyMs: latency,
  }));
}

describe("stateForUptime", () => {
  test.each([
    [null, "no-data"],
    [1, "operational"],
    [0.99, "operational"],
    [11 / 12, "degraded"],
    [0.8, "degraded"],
    [0.79, "outage"],
    [0, "outage"],
  ] as const)("%s → %s", (uptime, state) => {
    expect(stateForUptime(uptime)).toBe(state);
  });
});

describe("buildHourlyBuckets", () => {
  test("returns one bucket per hour, oldest first, ending at the current hour", () => {
    const buckets = buildHourlyBuckets({
      checks: [],
      hours: 3,
      now,
      firstCheckAt: null,
    });
    expect(buckets.map((bucket) => bucket.start.toISOString())).toEqual([
      "2026-11-11T12:00:00.000Z",
      "2026-11-11T13:00:00.000Z",
      "2026-11-11T14:00:00.000Z",
    ]);
    expect(buckets.every((bucket) => bucket.state === "no-data")).toBe(true);
  });

  test("full hours with all checks are 100% operational", () => {
    const buckets = buildHourlyBuckets({
      checks: checksIn("13", 12),
      hours: 2,
      now,
      firstCheckAt: new Date("2026-11-10T00:00:00Z"),
    });
    expect(buckets[0]).toMatchObject({
      checks: 12,
      expected: 12,
      uptime: 1,
      state: "operational",
    });
  });

  test("missing checks in a past hour count as downtime", () => {
    const buckets = buildHourlyBuckets({
      checks: checksIn("13", 6),
      hours: 2,
      now,
      firstCheckAt: new Date("2026-11-10T00:00:00Z"),
    });
    expect(buckets[0]).toMatchObject({
      checks: 6,
      expected: 12,
      uptime: 0.5,
      state: "outage",
    });
  });

  test("failed checks count as downtime", () => {
    const buckets = buildHourlyBuckets({
      checks: checksIn("13", 12, 11),
      hours: 2,
      now,
      firstCheckAt: new Date("2026-11-10T00:00:00Z"),
    });
    expect(buckets[0].state).toBe("degraded");
  });

  test("a past hour with no checks after monitoring started is an outage", () => {
    const buckets = buildHourlyBuckets({
      checks: [],
      hours: 2,
      now,
      firstCheckAt: new Date("2026-11-10T00:00:00Z"),
    });
    expect(buckets[0]).toMatchObject({
      checks: 0,
      expected: 12,
      uptime: 0,
      state: "outage",
    });
  });

  test("hours before the first check have no data and the first hour is pro-rated", () => {
    const buckets = buildHourlyBuckets({
      checks: checksIn("13", 6).map((check) => ({
        ...check,
        checkedAt: new Date(check.checkedAt.getTime() + 30 * 60 * 1000),
      })),
      hours: 3,
      now,
      firstCheckAt: new Date("2026-11-11T13:30:00Z"),
    });
    expect(buckets[0].state).toBe("no-data");
    expect(buckets[1]).toMatchObject({ expected: 6, ok: 6, uptime: 1 });
  });

  test("the current hour only counts recorded checks", () => {
    const buckets = buildHourlyBuckets({
      checks: checksIn("14", 6),
      hours: 1,
      now,
      firstCheckAt: new Date("2026-11-10T00:00:00Z"),
    });
    expect(buckets[0]).toMatchObject({ checks: 6, expected: 6, uptime: 1 });
  });

  test("the current hour with no checks yet is no data", () => {
    const [bucket] = buildHourlyBuckets({
      checks: [],
      hours: 1,
      now,
      firstCheckAt: new Date("2026-11-10T00:00:00Z"),
    });
    expect(bucket.state).toBe("no-data");
  });

  test("never exceeds 100% when the cron fires more often than expected", () => {
    const buckets = buildHourlyBuckets({
      checks: [...checksIn("13", 12), ...checksIn("13", 2)],
      hours: 2,
      now,
      firstCheckAt: new Date("2026-11-10T00:00:00Z"),
    });
    expect(buckets[0].uptime).toBe(1);
  });

  test("averages latency per hour", () => {
    const [bucket] = buildHourlyBuckets({
      checks: [
        {
          checkedAt: new Date("2026-11-11T14:00:00Z"),
          ok: true,
          latencyMs: 100,
        },
        {
          checkedAt: new Date("2026-11-11T14:05:00Z"),
          ok: true,
          latencyMs: 201,
        },
      ],
      hours: 1,
      now,
      firstCheckAt: new Date("2026-11-11T14:00:00Z"),
    });
    expect(bucket.averageLatencyMs).toBe(151);
  });
});

describe("summarizeBuckets", () => {
  test("weights uptime and latency by checks", () => {
    const buckets = buildHourlyBuckets({
      checks: [...checksIn("13", 12, 6, 100), ...checksIn("14", 6, 6, 400)],
      hours: 2,
      now: new Date("2026-11-11T14:40:00Z"),
      firstCheckAt: new Date("2026-11-11T13:00:00Z"),
    });
    const summary = summarizeBuckets(buckets);
    expect(summary.uptime).toBeCloseTo(12 / 18);
    expect(summary.averageLatencyMs).toBe(200);
  });

  test("is null without any expected checks", () => {
    expect(summarizeBuckets([])).toEqual({
      uptime: null,
      averageLatencyMs: null,
    });
  });
});

describe("overallStatus", () => {
  const fresh = {
    checkedAt: new Date("2026-11-11T14:28:00Z"),
    ok: true,
    latencyMs: 90,
  };

  test("operational when the latest check is fresh, ok and fast", () => {
    expect(overallStatus({ latest: fresh, lastHourUptime: 1, now })).toBe(
      "operational",
    );
  });

  test("outage when the latest check failed", () => {
    expect(
      overallStatus({
        latest: { ...fresh, ok: false },
        lastHourUptime: 1,
        now,
      }),
    ).toBe("outage");
  });

  test("outage when the latest check is stale", () => {
    const stale = { ...fresh, checkedAt: new Date("2026-11-11T13:00:00Z") };
    expect(overallStatus({ latest: stale, lastHourUptime: 1, now })).toBe(
      "outage",
    );
  });

  test("degraded when slow or when the last hour dipped", () => {
    expect(
      overallStatus({
        latest: { ...fresh, latencyMs: 3000 },
        lastHourUptime: 1,
        now,
      }),
    ).toBe("degraded");
    expect(overallStatus({ latest: fresh, lastHourUptime: 0.9, now })).toBe(
      "degraded",
    );
  });
});

describe("formatting", () => {
  test("formatUptime never rounds up to 100%", () => {
    expect(formatUptime(1)).toBe("100%");
    expect(formatUptime(0.99999)).toBe("99.99%");
    expect(formatUptime(11 / 12)).toBe("91.66%");
    expect(formatUptime(null)).toBe("—");
  });

  test("formatUtcHourRange is stable UTC text", () => {
    expect(formatUtcHourRange(new Date("2026-11-11T14:00:00Z"))).toBe(
      "Wed 11 Nov, 14:00–15:00 UTC",
    );
    expect(formatUtcHourRange(new Date("2026-11-11T23:00:00Z"))).toBe(
      "Wed 11 Nov, 23:00–00:00 UTC",
    );
  });
});
