// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const publish = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/inngest/publisher", () => ({ createPublisher: () => publish }));
import { claimExport, completeExport, failExport } from "./jobs";
import { projectOperation } from "@/server/projects/operations";

const request = {
  exportId: "e1",
  projectId: "p1",
  userId: "u1",
  attempt: 1,
  requestId: "e1:1",
};
const tx = {
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn(), updateMany: vi.fn() },
  githubExport: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  account: { updateMany: vi.fn() },
};
const transaction = vi.fn(async (fn: (arg: typeof tx) => unknown) => fn(tx));
const db = { ...tx, $transaction: transaction } as unknown as PrismaClient;
beforeEach(() => {
  vi.clearAllMocks();
  tx.project.findFirst.mockResolvedValue({
    id: "p1",
    operationId: "e1",
    operationKind: "EXPORT",
    operationStartedAt: new Date(),
  });
  tx.project.updateMany.mockResolvedValue({ count: 1 });
  tx.githubExport.findFirst.mockResolvedValue({
    id: "e1",
    status: "QUEUED",
    runId: null,
  });
  tx.githubExport.updateMany.mockResolvedValue({ count: 1 });
  tx.githubExport.update.mockResolvedValue({ id: "e1", runId: "run1" });
  tx.account.updateMany.mockResolvedValue({ count: 1 });
});
test("only one run may claim an attempt, and terminal deliveries do nothing", async () => {
  await claimExport(db, request, "run1");
  expect(tx.githubExport.update).toHaveBeenCalledWith({
    where: { id: "e1" },
    data: { runId: "run1" },
  });
  tx.githubExport.findFirst.mockResolvedValue({
    id: "e1",
    runId: "run1",
    status: "PUSHING",
  });
  await expect(claimExport(db, request, "run2")).resolves.toBeNull();
  tx.githubExport.findFirst.mockResolvedValue({
    id: "e1",
    status: "SUCCEEDED",
  });
  await expect(claimExport(db, request, "run1")).resolves.toBeNull();
  expect(tx.githubExport.update).toHaveBeenCalledOnce();
});
test("success publishes after both persisted records commit", async () => {
  await completeExport(
    db,
    request,
    "o/repo",
    "https://github.com/o/repo",
    "sha",
  );
  expect(tx.project.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "p1", userId: "u1", operationId: "e1" },
      data: expect.objectContaining({
        githubRepo: "o/repo",
        operationId: null,
      }),
    }),
  );
  expect(publish.mock.invocationCallOrder[0]).toBeGreaterThan(
    tx.project.updateMany.mock.invocationCallOrder[0],
  );
  expect(publish).toHaveBeenCalledWith(
    "export",
    expect.objectContaining({ status: "SUCCEEDED", commitSha: "sha" }),
  );
});
test.each(["job", "project"])(
  "does not publish success if the %s update is lost",
  async (kind) => {
    if (kind === "job")
      tx.githubExport.updateMany.mockResolvedValue({ count: 0 });
    else tx.project.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      completeExport(db, request, "o/repo", "https://github.com/o/repo", "sha"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(publish).not.toHaveBeenCalled();
  },
);
test("success replay does not clear a newer operation", async () => {
  tx.githubExport.findFirst.mockResolvedValue({ status: "SUCCEEDED" });
  await completeExport(
    db,
    request,
    "o/repo",
    "https://github.com/o/repo",
    "sha",
  );
  expect(tx.project.updateMany).not.toHaveBeenCalled();
});
test("failure cannot overwrite success or a newer attempt; errors are sanitized", async () => {
  tx.githubExport.updateMany.mockResolvedValue({ count: 0 });
  await failExport(db, request, new Error("authorization: secret"));
  expect(tx.githubExport.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        attempt: 1,
        status: { not: "SUCCEEDED" },
      }),
      data: {
        status: "FAILED",
        error: "Couldn't export this project. Retry the export.",
        errorCode: "FAILED",
      },
    }),
  );
  expect(tx.project.updateMany).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});
test("an auth failure drops the stored scope so the dialog can offer a reconnect", async () => {
  await failExport(
    db,
    request,
    new Error(
      "Connect GitHub and allow repository access, then retry the export.",
    ),
  );
  expect(tx.githubExport.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ errorCode: "AUTH_REQUIRED" }),
    }),
  );
  expect(tx.account.updateMany).toHaveBeenCalledWith({
    where: { userId: "u1", providerId: "github" },
    data: { scope: null },
  });
});
test("other failures leave the stored scope alone", async () => {
  await failExport(db, request, new Error("transport"));
  expect(tx.account.updateMany).not.toHaveBeenCalled();
});
test("a losing auth failure must not drop the scope of the attempt that won", async () => {
  tx.githubExport.updateMany.mockResolvedValue({ count: 0 });
  await failExport(
    db,
    request,
    new Error(
      "Connect GitHub and allow repository access, then retry the export.",
    ),
  );
  expect(tx.account.updateMany).not.toHaveBeenCalled();
});
test("ambiguous enqueue failure cannot release a worker's claimed reservation", async () => {
  await failExport(db, request, new Error("transport"), true);
  expect(tx.githubExport.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ runId: null }),
    }),
  );
});
test("stale wake/restore reservations expire; durable export reservations do not", () => {
  const project = {
    operationId: "op",
    operationKind: "WAKE" as const,
    operationStartedAt: new Date(0),
  };
  expect(projectOperation(project, 6 * 60_000)).toBeNull();
  expect(
    projectOperation({ ...project, operationKind: "RESTORE" }, 6 * 60_000),
  ).toBeNull();
  expect(
    projectOperation({ ...project, operationKind: "EXPORT" }, 6 * 60_000),
  ).toBe("EXPORT");
});
