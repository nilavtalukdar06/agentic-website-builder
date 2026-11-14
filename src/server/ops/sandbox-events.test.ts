// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  checkSandboxHealth,
  HEALTH_WINDOW_MS,
  recordSandboxEvent,
  sandboxHealth,
} = await import("./sandbox-events");

describe("sandboxHealth", () => {
  test("stays healthy with too few attempts", () => {
    expect(sandboxHealth({ resumed: 0, rebuilt: 1, failed: 1 }).unhealthy).toBe(
      false,
    );
  });
  test("is healthy when most resumes work", () => {
    expect(sandboxHealth({ resumed: 8, rebuilt: 1, failed: 1 }).unhealthy).toBe(
      false,
    );
  });
  test("is unhealthy when half the attempts rebuild or fail", () => {
    const health = sandboxHealth({ resumed: 2, rebuilt: 1, failed: 1 });
    expect(health).toMatchObject({ total: 4, trouble: 2, unhealthy: true });
  });
});

describe("checkSandboxHealth", () => {
  test("counts the events of the last window by outcome", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { outcome: "RESUMED", _count: { _all: 1 } },
      { outcome: "FAILED", _count: { _all: 3 } },
    ]);
    const now = Date.UTC(2026, 10, 14);
    const health = await checkSandboxHealth(
      { sandboxEvent: { groupBy } } as never,
      now,
    );
    expect(health).toMatchObject({
      resumed: 1,
      rebuilt: 0,
      failed: 3,
      unhealthy: true,
    });
    expect(groupBy.mock.calls[0][0].where.createdAt.gte).toEqual(
      new Date(now - HEALTH_WINDOW_MS),
    );
  });
});

describe("recordSandboxEvent", () => {
  test("writes the outcome", async () => {
    const create = vi.fn().mockResolvedValue({});
    await recordSandboxEvent(
      { sandboxEvent: { create } } as never,
      "p1",
      "FAILED",
    );
    expect(create).toHaveBeenCalledWith({
      data: { projectId: "p1", outcome: "FAILED" },
    });
  });
  test("never lets telemetry break a run", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const create = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(
      recordSandboxEvent(
        { sandboxEvent: { create } } as never,
        "p1",
        "RESUMED",
      ),
    ).resolves.toBeUndefined();
  });
});
