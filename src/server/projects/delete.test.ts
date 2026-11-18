// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const raiseAlert = vi.hoisted(() => vi.fn());
vi.mock("@/server/ops/alert", () => ({ raiseAlert }));

const { deleteProjectRecords, removeProjectResources } =
  await import("./delete");

const project = {
  id: "p1",
  userId: "u1",
  name: "Expense tracker",
  sandboxId: "sbx1",
  operationId: null,
  operationKind: null,
  operationStartedAt: null,
};

function setup(overrides: Record<string, unknown> = {}, pending = 0) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    project: {
      findFirst: vi.fn().mockResolvedValue({ ...project, ...overrides }),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
    message: {
      count: vi.fn().mockResolvedValue(pending),
      findMany: vi.fn().mockResolvedValue([]),
    },
    attachment: {
      findMany: vi.fn().mockResolvedValue([{ key: "k1" }, { key: "k2" }]),
    },
    guardEvent: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    sandboxEvent: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const db = {
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, db: db as never };
}

const input = { projectId: "p1", userId: "u1", name: "Expense tracker" };

beforeEach(() => {
  raiseAlert.mockReset();
});

describe("deleteProjectRecords", () => {
  test("deletes the project, detaches its events and returns what to clean up", async () => {
    const { tx, db } = setup();
    await expect(deleteProjectRecords(db, input)).resolves.toEqual({
      sandboxId: "sbx1",
      projectId: "p1",
      attachmentKeys: ["k1", "k2"],
    });
    expect(tx.attachment.findMany).toHaveBeenCalledWith({
      where: { message: { projectId: "p1" } },
      select: { key: true },
    });
    expect(tx.guardEvent.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1" },
      data: { projectId: null },
    });
    expect(tx.sandboxEvent.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1" },
      data: { projectId: null },
    });
    expect(tx.project.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });

  test("refuses a name that doesn't match exactly", async () => {
    const { tx, db } = setup();
    await expect(
      deleteProjectRecords(db, { ...input, name: "expense tracker" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(tx.project.delete).not.toHaveBeenCalled();
  });

  test("refuses while a build is running", async () => {
    const { tx, db } = setup({}, 1);
    await expect(deleteProjectRecords(db, input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(tx.project.delete).not.toHaveBeenCalled();
  });

  test("refuses while an export or restore holds the project", async () => {
    const { tx, db } = setup({
      operationId: "op1",
      operationKind: "EXPORT",
      operationStartedAt: new Date(),
    });
    await expect(deleteProjectRecords(db, input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(tx.project.delete).not.toHaveBeenCalled();
  });

  test("answers not found for a project the user doesn't own", async () => {
    const { tx, db } = setup();
    tx.project.findFirst.mockResolvedValue(null);
    await expect(deleteProjectRecords(db, input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("removeProjectResources", () => {
  const resources = { sandboxId: "sbx1", attachmentKeys: ["k1", "k2"] };

  test("kills the sandbox and deletes every object without alerting", async () => {
    const killSandbox = vi.fn().mockResolvedValue(true);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    await removeProjectResources(resources, { killSandbox, deleteObject });
    expect(killSandbox).toHaveBeenCalledWith("sbx1");
    expect(deleteObject.mock.calls).toEqual([["k1"], ["k2"]]);
    expect(raiseAlert).not.toHaveBeenCalled();
  });

  test("treats a synchronous throw like a failed removal", async () => {
    const killSandbox = vi.fn(() => {
      throw new Error("sync");
    });
    await removeProjectResources(
      { sandboxId: "sbx1", attachmentKeys: [] },
      { killSandbox, deleteObject: vi.fn() },
    );
    expect(raiseAlert).toHaveBeenCalledOnce();
  });

  test("skips the sandbox when the project had none", async () => {
    const killSandbox = vi.fn();
    await removeProjectResources(
      { sandboxId: null, attachmentKeys: [] },
      { killSandbox, deleteObject: vi.fn() },
    );
    expect(killSandbox).not.toHaveBeenCalled();
  });

  test("alerts with counts only when something couldn't be removed", async () => {
    const killSandbox = vi.fn().mockRejectedValue(new Error("down"));
    const deleteObject = vi
      .fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValueOnce(undefined);
    await removeProjectResources(resources, { killSandbox, deleteObject });
    expect(raiseAlert).toHaveBeenCalledOnce();
    expect(raiseAlert.mock.calls[0][0]).toMatchObject({
      kind: "project-delete-cleanup",
      details: { sandboxFailed: true, failedObjects: 1 },
    });
  });

  test("drops the project's memory and alerts if that fails", async () => {
    const dropMemory = vi.fn().mockResolvedValue(undefined);
    await removeProjectResources(
      { sandboxId: null, attachmentKeys: [], projectId: "p1" },
      { killSandbox: vi.fn(), deleteObject: vi.fn(), dropMemory },
    );
    expect(dropMemory).toHaveBeenCalledWith("p1");
    expect(raiseAlert).not.toHaveBeenCalled();
    dropMemory.mockRejectedValue(new Error("down"));
    await removeProjectResources(
      { sandboxId: null, attachmentKeys: [], projectId: "p1" },
      { killSandbox: vi.fn(), deleteObject: vi.fn(), dropMemory },
    );
    expect(raiseAlert.mock.calls[0][0]).toMatchObject({
      details: { memoryFailed: true },
    });
  });
});

test("project deletion returns unique owned screenshots along with uploads", async () => {
  const { tx, db } = setup();
  const key = "qa/p1/run1/0-desktop.png";
  tx.message.findMany.mockResolvedValue([
    {
      parts: [
        {
          type: "browser",
          status: "passed",
          reason: null,
          checks: [],
          screenshots: [
            key,
            key,
            "qa/p2/run1/0-desktop.png",
            "users/u2/private.png",
          ].map((key) => ({ viewport: "desktop", key })),
        },
      ],
    },
  ]);
  await expect(deleteProjectRecords(db, input)).resolves.toEqual({
    sandboxId: "sbx1",
    projectId: "p1",
    attachmentKeys: ["k1", "k2", key],
  });
});
