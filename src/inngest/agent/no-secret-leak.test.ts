// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("e2b", () => ({ CommandExitError: class extends Error {} }));

const SECRET = "sk-proj-NoLeakValue7f3a9c2e41Ab12Cd34Ef56Gh78";

const published = vi.hoisted(() => [] as unknown[]);
vi.mock("../client", () => ({
  inngest: {
    realtime: {
      publish: vi.fn(async (_ref: unknown, data: unknown) => {
        published.push(data);
      }),
    },
  },
}));

const sandboxState = vi.hoisted(() => ({ goneOnce: false }));
function makeSandbox(id: string) {
  return {
    sandboxId: id,
    commands: {
      run: vi.fn(
        async (
          command: string,
          options?: { onStdout?: (c: string) => unknown },
        ) => {
          if (sandboxState.goneOnce) {
            sandboxState.goneOnce = false;
            const error = new Error(`sandbox ${id} was not found`);
            error.name = "SandboxNotFoundError";
            throw error;
          }
          await options?.onStdout?.(`printing ${SECRET}`);
          return {
            stdout: `${command}: ${SECRET}`,
            stderr: `warn ${SECRET}`,
            exitCode: 0,
          };
        },
      ),
    },
    files: {
      exists: vi.fn().mockResolvedValue(false),
      write: vi.fn().mockResolvedValue({}),
      read: vi.fn().mockResolvedValue(`OPENAI_API_KEY=${SECRET}`),
    },
  };
}
vi.mock("@/server/sandbox/sandbox", () => ({
  connectSandbox: vi.fn(async (id: string) => makeSandbox(id)),
  createSandbox: vi.fn(async () => makeSandbox("recovered")),
  ensureDevOrigins: vi.fn().mockResolvedValue(true),
  ensureAgentInstructions: vi.fn().mockResolvedValue(true),
  previewUrlFor: (box: { sandboxId: string }) =>
    `https://3000-${box.sandboxId}.e2b.app`,
  snapshotSandbox: vi.fn().mockResolvedValue({}),
}));

const dbMock = vi.hoisted(() => ({
  version: {
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  project: { update: vi.fn().mockResolvedValue({}) },
  guardEvent: { create: vi.fn().mockResolvedValue({}) },
  creditLedger: { upsert: vi.fn().mockResolvedValue({}) },
  message: { upsert: vi.fn().mockResolvedValue({}) },
  $transaction: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: dbMock }));

const { runToolStep, RECOVERED_NOTE } = await import("./runtime");
const { debitCredits, saveRunResult } = await import("./persist");
const { patternRedactor } = await import("./guardrails/redact");

const logs: unknown[] = [];
const run = {
  runId: "r1",
  chainId: "r1",
  userId: "u1",
  restricted: false,
  sandbox: { id: "s1", previewUrl: "https://3000-s1.e2b.app" },
};
const base = {
  writtenPaths: [],
  tools: ["terminal", "createOrUpdateFiles", "readFiles", "loadSkill"],
  skills: { allowed: ["shadcn"], installed: ["shadcn"] },
  progress: { readAgentsMd: true, loadedSkills: ["shadcn"] },
};

beforeEach(() => {
  published.length = 0;
  logs.length = 0;
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => {
      logs.push(args);
    });
  }
  dbMock.$transaction.mockImplementation((fn: (tx: typeof dbMock) => unknown) =>
    fn(dbMock),
  );
});

function expectNoSecret(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain(SECRET);
}

describe("a pasted or printed key never leaks", () => {
  test("tool results, realtime events and logs are redacted", async () => {
    const terminal = await runToolStep({
      call: {
        toolCallId: "c1",
        toolName: "terminal",
        input: { command: "node print.mjs" },
      },
      projectId: "p1",
      run,
      base,
      replay: [],
    });
    const read = await runToolStep({
      call: {
        toolCallId: "c2",
        toolName: "readFiles",
        input: { paths: ["notes.txt"] },
      },
      projectId: "p1",
      run,
      base,
      replay: [],
    });
    const write = await runToolStep({
      call: {
        toolCallId: "c3",
        toolName: "createOrUpdateFiles",
        input: {
          files: [
            { path: "lib/key.ts", content: `export const k = "${SECRET}"` },
          ],
        },
      },
      projectId: "p1",
      run,
      base,
      replay: [],
    });
    expect(write.writtenPaths).toEqual([]);
    expect(write.output).toMatch(/contains what looks like a secret/);
    expectNoSecret([terminal, read, write, published, logs]);
    expect(terminal.output).toContain("[secret removed]");
  });

  test("messages and the ledger only ever get redacted parts", async () => {
    await saveRunResult(dbMock as never, {
      projectId: "p1",
      runId: "r1",
      title: "First version",
      content: "Done",
      files: {},
      creditCost: 1,
      previewUrl: "https://3000-s1.e2b.app",
      parts: patternRedactor.redactDeep([
        { type: "text", text: `key ${SECRET}` },
        {
          type: "tool",
          callId: "c",
          name: "terminal",
          command: "x",
          output: SECRET,
          exitCode: 0,
        },
      ]),
    });
    await debitCredits(dbMock as never, {
      userId: "u1",
      projectId: "p1",
      runId: "r1",
      credits: 1,
      firstVersion: true,
      usage: {
        inputTokens: 1,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1,
      },
      model: "m",
      cost: {
        costUsd: 0.01,
        exactCalls: 1,
        estimatedCalls: 0,
        generationIds: [],
        agents: [],
      },
      versionNumber: 1,
    });
    expectNoSecret([
      dbMock.message.upsert.mock.calls,
      dbMock.creditLedger.upsert.mock.calls,
    ]);
  });
});

describe("sandbox expiry mid-call", () => {
  test("recreates the sandbox, replays writes and retries once", async () => {
    sandboxState.goneOnce = true;
    const result = await runToolStep({
      call: {
        toolCallId: "c1",
        toolName: "terminal",
        input: { command: "npx tsc --noEmit" },
      },
      projectId: "p1",
      run,
      base,
      replay: [
        { path: "app/page.tsx", content: "export default function P() {}" },
      ],
    });
    expect(result.sandbox).toEqual({
      id: "recovered",
      previewUrl: "https://3000-recovered.e2b.app",
    });
    expect(result.output.startsWith(RECOVERED_NOTE)).toBe(true);
    expect(result.terminal?.exitCode).toBe(0);
    expect(dbMock.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        sandboxId: "recovered",
        previewUrl: "https://3000-recovered.e2b.app",
      },
    });
    expect(published).toContainEqual({ url: "https://3000-recovered.e2b.app" });
  });
});
