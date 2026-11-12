// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("e2b", () => ({ CommandExitError: class extends Error {} }));

const SECRET = "sk-proj-NoLeakValue-7f3a9c2e41";
const SECRET_B64 = Buffer.from(SECRET).toString("base64");

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
            stdout: `${command}: ${SECRET} ${SECRET_B64}`,
            stderr: `warn ${encodeURIComponent(SECRET)}`,
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
    updateNetwork: vi.fn().mockResolvedValue(undefined),
  };
}
vi.mock("@/server/sandbox/sandbox", () => ({
  connectSandbox: vi.fn(async (id: string) => makeSandbox(id)),
  createSandbox: vi.fn(async () => makeSandbox("recovered")),
  ensureDevOrigins: vi.fn().mockResolvedValue(true),
  ensureAgentInstructions: vi.fn().mockResolvedValue(true),
  previewUrlFor: (box: { sandboxId: string }) =>
    `https://3000-${box.sandboxId}.e2b.app`,
  extendSandbox: vi.fn(),
  snapshotSandbox: vi.fn().mockResolvedValue({}),
}));

const dbMock = vi.hoisted(() => ({
  projectSecret: {
    findMany: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
  },
  secretEvent: { create: vi.fn().mockResolvedValue({}) },
  inputRequest: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  version: { findFirst: vi.fn().mockResolvedValue(null) },
  project: { update: vi.fn().mockResolvedValue({}) },
  guardEvent: { create: vi.fn().mockResolvedValue({}) },
  creditLedger: { upsert: vi.fn().mockResolvedValue({}) },
  message: { upsert: vi.fn().mockResolvedValue({}) },
  $transaction: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: dbMock }));

const { encryptSecret } = await import("@/server/secrets/crypto");
const { answerInputRequest } = await import("@/server/inputs/answer");
const { runToolStep, RECOVERED_NOTE } = await import("./runtime");
const { debitCredits, recordPausedReply } = await import("./persist");
const { createRedactor } = await import("@/server/secrets/redact");

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
  agent: "builder" as const,
  tools: [
    "terminal",
    "createOrUpdateFiles",
    "readFiles",
    "loadSkill",
    "askUser",
  ],
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
  const sealed = encryptSecret({
    projectId: "p1",
    name: "OPENAI_API_KEY",
    value: SECRET,
  });
  dbMock.projectSecret.findMany.mockResolvedValue([
    { projectId: "p1", name: "OPENAI_API_KEY", ...sealed },
  ]);
});

function expectNoSecret(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain(SECRET);
  expect(text).not.toContain(SECRET_B64);
  expect(text).not.toContain(encodeURIComponent(SECRET));
}

describe("a stored secret never leaks", () => {
  test("the answer route stores it without putting it in the event or the request row", async () => {
    dbMock.inputRequest.findFirst.mockResolvedValue({
      id: "i1",
      projectId: "p1",
      messageId: "m1",
      chainId: "r1",
      status: "PENDING",
      payload: {
        request: {
          kind: "secret",
          name: "OPENAI_API_KEY",
          label: "OpenAI API key",
          reason: "Chat",
        },
      },
    });
    const send = vi.fn();
    await answerInputRequest(
      { db: dbMock as never, send },
      { userId: "u1", requestId: "i1", body: { value: SECRET } },
    );
    expectNoSecret([
      send.mock.calls,
      dbMock.inputRequest.updateMany.mock.calls,
      dbMock.secretEvent.create.mock.calls,
      dbMock.projectSecret.upsert.mock.calls,
      logs,
    ]);
  });

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
    expect(write.output).toMatch(/contains the value of OPENAI_API_KEY/);
    expectNoSecret([terminal, read, write, published, logs]);
    expect(terminal.output).toContain("[secret OPENAI_API_KEY]");
  });

  test("messages and the ledger only ever get redacted parts", async () => {
    const redactor = createRedactor([
      { name: "OPENAI_API_KEY", value: SECRET },
    ]);
    await recordPausedReply(dbMock as never, {
      projectId: "p1",
      runId: "r1",
      content: "Waiting",
      parts: redactor.redactDeep([
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
      versionNumber: null,
      paused: true,
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
