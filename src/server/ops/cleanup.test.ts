// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  deleteOrphanUploads,
  killOrphanSandboxes,
  MAX_SANDBOX_KILLS,
  purgeExpiredRows,
  retireIdleSandboxes,
  SANDBOX_IDLE_DAYS,
} = await import("./cleanup");

const now = Date.UTC(2026, 10, 14, 4, 0, 0);
const DAY = 86_400_000;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("retireIdleSandboxes", () => {
  const stale = new Date(now - 20 * DAY);

  function setup(
    projects: { id: string; sandboxId: string; updatedAt: Date }[],
  ) {
    const findMany = vi.fn().mockResolvedValue(projects);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const kill = vi.fn().mockResolvedValue(true);
    return {
      db: { project: { findMany, updateMany } } as never,
      findMany,
      updateMany,
      kill,
    };
  }

  test("selects idle projects with a sandbox and no running operation", async () => {
    const { db, findMany, kill } = setup([]);
    await retireIdleSandboxes(db, kill, now);
    expect(findMany.mock.calls[0][0].where).toEqual({
      sandboxId: { not: null },
      operationId: null,
      updatedAt: { lt: new Date(now - SANDBOX_IDLE_DAYS * DAY) },
    });
    expect(findMany.mock.calls[0][0].take).toBe(MAX_SANDBOX_KILLS);
  });

  test("detaches the sandbox without touching the edited time, then kills it", async () => {
    const { db, updateMany, kill } = setup([
      { id: "p1", sandboxId: "sbx1", updatedAt: stale },
    ]);
    await expect(retireIdleSandboxes(db, kill, now)).resolves.toEqual({
      retired: 1,
      failed: 0,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "p1",
        sandboxId: "sbx1",
        operationId: null,
        updatedAt: stale,
      },
      data: { sandboxId: null, previewUrl: null, updatedAt: stale },
    });
    expect(kill).toHaveBeenCalledWith("sbx1");
  });

  test("leaves a sandbox alone when the project was used meanwhile", async () => {
    const { db, updateMany, kill } = setup([
      { id: "p1", sandboxId: "sbx1", updatedAt: stale },
    ]);
    updateMany.mockResolvedValue({ count: 0 });
    await expect(retireIdleSandboxes(db, kill, now)).resolves.toEqual({
      retired: 0,
      failed: 0,
    });
    expect(kill).not.toHaveBeenCalled();
  });

  test("counts a failed kill and keeps going", async () => {
    const { db, kill } = setup([
      { id: "p1", sandboxId: "sbx1", updatedAt: stale },
      { id: "p2", sandboxId: "sbx2", updatedAt: stale },
    ]);
    kill
      .mockRejectedValueOnce(new Error("e2b down"))
      .mockResolvedValueOnce(true);
    await expect(retireIdleSandboxes(db, kill, now)).resolves.toEqual({
      retired: 1,
      failed: 1,
    });
  });
});

describe("killOrphanSandboxes", () => {
  test("kills paused sandboxes that no project references", async () => {
    const findMany = vi.fn().mockResolvedValue([{ sandboxId: "keep" }]);
    const kill = vi.fn().mockResolvedValue(true);
    const listPaused = vi
      .fn()
      .mockResolvedValue([
        { id: "keep" },
        { id: "orphan-1" },
        { id: "orphan-2" },
      ]);
    const result = await killOrphanSandboxes(
      { project: { findMany } } as never,
      { listPaused, kill },
      now,
    );
    expect(result).toEqual({ killed: 2, failed: 0 });
    expect(kill).toHaveBeenCalledTimes(2);
    expect(kill).not.toHaveBeenCalledWith("keep");
    expect(listPaused).toHaveBeenCalledWith(new Date(now - DAY));
  });

  test("does nothing when nothing is paused", async () => {
    const findMany = vi.fn();
    const result = await killOrphanSandboxes(
      { project: { findMany } } as never,
      { listPaused: vi.fn().mockResolvedValue([]), kill: vi.fn() },
      now,
    );
    expect(result).toEqual({ killed: 0, failed: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  test("caps the kills in one run", async () => {
    const paused = Array.from({ length: MAX_SANDBOX_KILLS + 25 }, (_, i) => ({
      id: `o${i}`,
    }));
    const kill = vi.fn().mockResolvedValue(true);
    const result = await killOrphanSandboxes(
      { project: { findMany: vi.fn().mockResolvedValue([]) } } as never,
      { listPaused: vi.fn().mockResolvedValue(paused), kill },
      now,
    );
    expect(result.killed).toBe(MAX_SANDBOX_KILLS);
  });
});

describe("deleteOrphanUploads", () => {
  test("removes the object first and the row only for deleted objects", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "a1", key: "users/u/a1.png" },
      { id: "a2", key: "users/u/a2.png" },
    ]);
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const deleteObject = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("storage down"));
    const result = await deleteOrphanUploads(
      { attachment: { findMany, deleteMany } } as never,
      deleteObject,
      now,
    );
    expect(result).toEqual({ deleted: 1, failed: 1 });
    expect(findMany.mock.calls[0][0].where).toEqual({
      messageId: null,
      createdAt: { lt: new Date(now - DAY) },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1"] }, messageId: null },
    });
  });

  test("skips the row delete when nothing was removed", async () => {
    const deleteMany = vi.fn();
    await deleteOrphanUploads(
      {
        attachment: { findMany: vi.fn().mockResolvedValue([]), deleteMany },
      } as never,
      vi.fn(),
      now,
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe("purgeExpiredRows", () => {
  test("deletes expired counters, auth limits and old sandbox events", async () => {
    const throttle = vi.fn().mockResolvedValue({ count: 3 });
    const auth = vi.fn().mockResolvedValue({ count: 2 });
    const events = vi.fn().mockResolvedValue({ count: 1 });
    const result = await purgeExpiredRows(
      {
        throttleWindow: { deleteMany: throttle },
        rateLimit: { deleteMany: auth },
        sandboxEvent: { deleteMany: events },
      } as never,
      now,
    );
    expect(result).toEqual({
      throttleWindows: 3,
      authLimits: 2,
      sandboxEvents: 1,
    });
    expect(auth.mock.calls[0][0].where.lastRequest.lt).toBe(BigInt(now - DAY));
    expect(events.mock.calls[0][0].where.createdAt.lt).toEqual(
      new Date(now - 30 * DAY),
    );
  });
});
