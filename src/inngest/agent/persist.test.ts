// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import {
  checkpointId,
  debitCredits,
  debitId,
  loadRestoreFiles,
  recordAssistantError,
  saveCheckpoint,
  replyId,
  saveRunResult,
  versionId,
} from "./persist";

function makeDb() {
  const tx = {
    version: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue({ number: 2 }),
      create: vi.fn().mockResolvedValue({}),
    },
    message: { upsert: vi.fn().mockResolvedValue({}) },
    project: { update: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    ...tx,
    creditLedger: { upsert: vi.fn().mockResolvedValue({ id: "l1" }) },
    $transaction: vi.fn(
      (fn: (client: typeof tx) => unknown, _options?: object) => fn(tx),
    ),
  };
  return { db, tx };
}

const usage = {
  inputTokens: 10,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 5,
};
const cost = {
  costUsd: 0.42,
  exactCalls: 2,
  estimatedCalls: 0,
  generationIds: ["gen_1", "gen_2"],
  agents: [
    { name: "researcher", model: "m", usd: 0.02, searches: 1 },
    { name: "builder", model: "m", usd: 0.4, searches: 0 },
  ],
};

describe("saveRunResult", () => {
  const input = {
    projectId: "p1",
    runId: "r1",
    title: "Built the hero",
    content: "Done",
    parts: [{ type: "text" as const, text: "Done" }],
    files: { "app/page.tsx": "export {}" },
    creditCost: 42,
    previewUrl: "https://3000-sbx.e2b.app",
  };

  test("writes the next version, the reply and the preview URL", async () => {
    const { db, tx } = makeDb();
    await expect(saveRunResult(db as never, input)).resolves.toEqual({
      versionNumber: 3,
    });
    expect(tx.version.create).toHaveBeenCalledWith({
      data: {
        id: versionId("r1"),
        projectId: "p1",
        number: 3,
        title: "Built the hero",
        files: input.files,
        creditCost: 42,
        runId: "r1",
      },
    });
    expect(tx.version.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "p1", status: "READY" },
      }),
    );
    expect(tx.message.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: replyId("r1") } }),
    );
    expect(tx.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { previewUrl: input.previewUrl },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 15_000,
      timeout: 30_000,
    });
  });

  test("starts at version 1", async () => {
    const { db, tx } = makeDb();
    tx.version.findFirst.mockResolvedValue(null);
    await expect(saveRunResult(db as never, input)).resolves.toEqual({
      versionNumber: 1,
    });
  });

  test("is idempotent when the step is retried", async () => {
    const { db, tx } = makeDb();
    tx.version.findUnique.mockResolvedValue({ number: 3 });
    await expect(saveRunResult(db as never, input)).resolves.toEqual({
      versionNumber: 3,
    });
    expect(tx.version.create).not.toHaveBeenCalled();
    expect(tx.message.upsert).not.toHaveBeenCalled();
  });
});

describe("debitCredits", () => {
  const input = {
    userId: "u1",
    projectId: "p1",
    runId: "r1",
    credits: 42,
    firstVersion: true,
    usage,
    model: "m",
    cost,
    versionNumber: 1,
  };

  test("writes one negative GENERATION entry keyed by run", async () => {
    const { db } = makeDb();
    await debitCredits(db as never, input);
    expect(db.creditLedger.upsert).toHaveBeenCalledWith({
      where: { id: debitId("r1") },
      create: {
        id: debitId("r1"),
        userId: "u1",
        projectId: "p1",
        delta: -42,
        reason: "GENERATION",
        meta: {
          runId: "r1",
          model: "m",
          version: 1,
          costUsd: 0.42,
          exactCalls: 2,
          estimatedCalls: 0,
          generationIds: ["gen_1", "gen_2"],
          agents: [
            { name: "researcher", model: "m", usd: 0.02, searches: 1 },
            { name: "builder", model: "m", usd: 0.4, searches: 0 },
          ],
          ...usage,
        },
      },
      update: {},
    });
  });

  test("uses EDIT after the first version", async () => {
    const { db } = makeDb();
    await debitCredits(db as never, { ...input, firstVersion: false });
    expect(db.creditLedger.upsert.mock.calls[0][0].create.reason).toBe("EDIT");
  });

  test("writes nothing for a free run", async () => {
    const { db } = makeDb();
    await expect(
      debitCredits(db as never, { ...input, credits: 0 }),
    ).resolves.toBeNull();
    expect(db.creditLedger.upsert).not.toHaveBeenCalled();
  });
});

describe("recordAssistantError", () => {
  test("stores an error reply once per run", async () => {
    const { db } = makeDb();
    await recordAssistantError(db as never, {
      projectId: "p1",
      runId: "r1",
      message: "Something broke",
    });
    expect(db.message.upsert).toHaveBeenCalledWith({
      where: { id: replyId("r1") },
      create: {
        id: replyId("r1"),
        projectId: "p1",
        role: "ASSISTANT",
        content: "Something broke",
        parts: [{ type: "error", message: "Something broke" }],
      },
      update: {},
    });
  });
});

describe("checkpoints", () => {
  test("upserts one draft per run chain", async () => {
    const db = { version: { upsert: vi.fn().mockResolvedValue({}) } };
    await saveCheckpoint(db as never, {
      projectId: "p1",
      chainId: "r0",
      runId: "r1",
      files: { "app/page.tsx": "x" },
    });
    expect(db.version.upsert).toHaveBeenCalledWith({
      where: { id: checkpointId("r0") },
      create: expect.objectContaining({
        id: "checkpoint_r0",
        status: "DRAFT",
        number: null,
        creditCost: 0,
        runId: "r1",
      }),
      update: {
        runId: "r1",
        files: { "app/page.tsx": "x" },
        title: "Checkpoint",
      },
    });
  });

  test("restores the chain's draft first, then the latest ready version", async () => {
    const db = {
      version: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ files: { draft: "1" } })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ files: { ready: "1" } }),
      },
    };
    await expect(
      loadRestoreFiles(db as never, { projectId: "p1", chainId: "r0" }),
    ).resolves.toEqual({ draft: "1" });
    await expect(
      loadRestoreFiles(db as never, { projectId: "p1", chainId: "r0" }),
    ).resolves.toEqual({ ready: "1" });
    expect(db.version.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { projectId: "p1", status: "READY" } }),
    );
  });

  test("saving the real version deletes the chain's draft", async () => {
    const { db, tx } = makeDb();
    (tx.version as Record<string, unknown>).deleteMany = vi
      .fn()
      .mockResolvedValue({ count: 1 });
    await saveRunResult(db as never, {
      projectId: "p1",
      runId: "r2",
      title: "t",
      content: "c",
      parts: [],
      files: {},
      creditCost: 1,
      previewUrl: "https://x.e2b.app",
      chainId: "r0",
    });
    expect(
      (tx.version as unknown as { deleteMany: ReturnType<typeof vi.fn> })
        .deleteMany,
    ).toHaveBeenCalledWith({ where: { id: "checkpoint_r0", projectId: "p1" } });
  });
});

describe("paused debits", () => {
  test("charge the work done and mark the run paused", async () => {
    const db = { creditLedger: { upsert: vi.fn().mockResolvedValue({}) } };
    await debitCredits(db as never, {
      userId: "u1",
      projectId: "p1",
      runId: "r1",
      credits: 3,
      firstVersion: true,
      usage: {
        inputTokens: 1,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1,
      },
      model: "m",
      cost: {
        costUsd: 0.03,
        exactCalls: 1,
        estimatedCalls: 0,
        generationIds: [],
        agents: [],
      },
      versionNumber: null,
      paused: true,
      guard: { input: "allow" },
    });
    expect(db.creditLedger.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          delta: -3,
          meta: expect.objectContaining({
            paused: true,
            version: null,
            guard: { input: "allow" },
          }),
        }),
      }),
    );
  });
});
