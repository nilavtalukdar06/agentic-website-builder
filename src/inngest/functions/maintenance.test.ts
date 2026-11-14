// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retire: vi.fn(),
  orphans: vi.fn(),
  uploads: vi.fn(),
  purge: vi.fn(),
  health: vi.fn(),
  alert: vi.fn(),
  options: [] as { id: string; triggers: unknown }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: (
      options: { id: string; triggers: unknown },
      handler: unknown,
    ) => {
      mocks.options.push(options);
      return handler;
    },
  },
}));
vi.mock("@/server/ops/cleanup", () => ({
  retireIdleSandboxes: mocks.retire,
  killOrphanSandboxes: mocks.orphans,
  deleteOrphanUploads: mocks.uploads,
  purgeExpiredRows: mocks.purge,
}));
vi.mock("@/server/ops/sandbox-events", () => ({
  checkSandboxHealth: mocks.health,
}));
vi.mock("@/server/ops/alert", () => ({ raiseAlert: mocks.alert }));
vi.mock("@/server/sandbox/admin", () => ({
  killSandbox: vi.fn(),
  listPausedSandboxes: vi.fn(),
}));
vi.mock("@/server/storage/attachments", () => ({ deleteAttachment: vi.fn() }));

const { cleanupResources, monitorSandboxes } = await import("./maintenance");

const step = {
  run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
};
const run = (handler: unknown) =>
  (handler as (args: { step: typeof step }) => Promise<unknown>)({ step });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.retire.mockResolvedValue({ retired: 2, failed: 0 });
  mocks.orphans.mockResolvedValue({ killed: 1, failed: 0 });
  mocks.uploads.mockResolvedValue({ deleted: 3, failed: 0 });
  mocks.purge.mockResolvedValue({ throttleWindows: 5 });
});

describe("schedules", () => {
  test("clean up nightly and check sandbox health every half hour", () => {
    expect(mocks.options.map((option) => [option.id, option.triggers])).toEqual(
      [
        ["cleanup-resources", [{ cron: "0 4 * * *" }]],
        ["monitor-sandboxes", [{ cron: "*/30 * * * *" }]],
      ],
    );
  });
});

describe("cleanupResources", () => {
  test("runs every sweep and stays quiet when nothing failed", async () => {
    const result = await run(cleanupResources);
    expect(result).toMatchObject({
      idle: { retired: 2 },
      orphans: { killed: 1 },
      uploads: { deleted: 3 },
    });
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  test("alerts when some resources couldn't be removed", async () => {
    mocks.orphans.mockResolvedValue({ killed: 0, failed: 2 });
    await run(cleanupResources);
    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "cleanup",
        details: { failures: 2 },
      }),
    );
  });
});

describe("monitorSandboxes", () => {
  test("alerts only when resumes are unhealthy", async () => {
    mocks.health.mockResolvedValue({
      unhealthy: false,
      total: 5,
      rebuilt: 0,
      failed: 0,
    });
    await run(monitorSandboxes);
    expect(mocks.alert).not.toHaveBeenCalled();
    mocks.health.mockResolvedValue({
      unhealthy: true,
      total: 6,
      rebuilt: 2,
      failed: 2,
    });
    await run(monitorSandboxes);
    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "sandbox-resume",
        details: expect.objectContaining({ attempts: 6, failed: 2 }),
      }),
    );
  });
});
