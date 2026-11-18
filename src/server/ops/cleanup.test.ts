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

describe("expireScreenshots", () => {
  const key = "qa/p1/run1/0-desktop.png";
  const other = "qa/p1/run1/0-phone.png";
  const browser = (keys: string[]) => ({
    type: "browser",
    status: "passed",
    reason: null,
    checks: [],
    screenshots: keys.map((key) => ({ viewport: "desktop", key })),
  });

  test("reaches old screenshots beyond a full page of screenshot-free messages", async () => {
    const { expireScreenshots, SCREENSHOT_RETENTION_MS } =
      await import("./cleanup");
    const findMany = vi
      .fn()
      .mockResolvedValueOnce(
        Array.from({ length: 200 }, (_, i) => ({
          id: `m${i.toString().padStart(3, "0")}`,
          projectId: "p1",
          parts: [],
        })),
      )
      .mockResolvedValueOnce([
        { id: "m200", projectId: "p1", parts: [browser([key])] },
      ]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const remove = vi.fn().mockResolvedValue(undefined);
    await expect(
      expireScreenshots(
        { message: { findMany, updateMany } } as never,
        remove,
        now,
      ),
    ).resolves.toEqual({ deleted: 1, failed: 0 });
    expect(findMany.mock.calls[0][0].where).toEqual({
      role: "ASSISTANT",
      createdAt: { lt: new Date(now - SCREENSHOT_RETENTION_MS) },
    });
    expect(findMany.mock.calls[1][0].where.id).toEqual({ gt: "m199" });
    expect(remove).toHaveBeenCalledWith(key);
  });

  test("preserves failed keys, checks and unknown parts, then retries successfully", async () => {
    const { expireScreenshots } = await import("./cleanup");
    let parts = [
      browser([key, key, other]),
      { type: "future", payload: "keep" },
    ];
    const findMany = vi.fn(async () => [{ id: "m1", projectId: "p1", parts }]);
    const updateMany = vi.fn(async (args) => {
      parts = args.data.parts;
      return { count: 1 };
    });
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue(undefined);
    const db = { message: { findMany, updateMany } } as never;
    await expect(expireScreenshots(db, remove, now)).resolves.toEqual({
      deleted: 1,
      failed: 1,
    });
    expect(parts).toEqual([
      browser([key, key]),
      { type: "future", payload: "keep" },
    ]);
    expect(updateMany.mock.calls[0][0].where.parts.equals).toEqual([
      browser([key, key, other]),
      { type: "future", payload: "keep" },
    ]);
    await expect(expireScreenshots(db, remove, now)).resolves.toEqual({
      deleted: 1,
      failed: 0,
    });
    expect(parts).toEqual([browser([]), { type: "future", payload: "keep" }]);
    expect(remove.mock.calls).toEqual([[key], [other], [key]]);
  });

  test("never deletes foreign keys and tolerates a concurrently removed message", async () => {
    const { expireScreenshots } = await import("./cleanup");
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "m1",
        projectId: "p1",
        parts: [browser(["qa/p2/run1/0-desktop.png", key])],
      },
    ]);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const remove = vi.fn().mockResolvedValue(undefined);
    await expect(
      expireScreenshots(
        { message: { findMany, updateMany } } as never,
        remove,
        now,
      ),
    ).resolves.toEqual({ deleted: 1, failed: 0 });
    expect(remove.mock.calls).toEqual([[key]]);
    expect(updateMany.mock.calls[0][0].data.parts).toEqual([browser([])]);
  });
});

describe("expireScreenshotObjectsPage", () => {
  test("expires unreferenced older rounds and failed jobs, but keeps fresh objects and uploads", async () => {
    const { expireScreenshotObjectsPage, SCREENSHOT_RETENTION_MS } =
      await import("./cleanup");
    const cutoff = now - SCREENSHOT_RETENTION_MS;
    const list = vi.fn().mockResolvedValue({
      items: [
        {
          key: "qa/p1/failed-run/0-desktop.png",
          lastModified: cutoff - 100 * DAY,
        },
        { key: "qa/p1/run1/0-phone.png", lastModified: cutoff - 1 },
        { key: "qa/p1/run1/1-phone.png", lastModified: cutoff },
        { key: "users/u1/upload.png", lastModified: cutoff - 1 },
        { key: "qa/p1/no-date/0-phone.png" },
      ],
      cursor: "next",
    });
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error("storage down"))
      .mockResolvedValue(undefined);
    await expect(
      expireScreenshotObjectsPage(list, remove, now, "previous"),
    ).resolves.toEqual({ deleted: 1, failed: 2, cursor: "next" });
    expect(list).toHaveBeenCalledWith("previous");
    expect(remove.mock.calls).toEqual([
      ["qa/p1/failed-run/0-desktop.png"],
      ["qa/p1/run1/0-phone.png"],
    ]);
  });

  test("propagates list failures for durable retries and rejects stalled cursors", async () => {
    const { expireScreenshotObjectsPage } = await import("./cleanup");
    await expect(
      expireScreenshotObjectsPage(
        vi.fn().mockRejectedValue(new Error("down")),
        vi.fn(),
        now,
      ),
    ).rejects.toThrow("down");
    await expect(
      expireScreenshotObjectsPage(
        vi.fn().mockResolvedValue({ items: [], cursor: "same" }),
        vi.fn(),
        now,
        "same",
      ),
    ).rejects.toThrow("cursor did not advance");
  });
});
