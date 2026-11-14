// @vitest-environment node
import { describe, expect, test, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    message: {
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    project: { updateMany: vi.fn() },
    guardEvent: { create: vi.fn() },
  },
  findAgentModel: vi.fn(),
  publish: vi.fn(),
  loop: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: mocks.db }));
vi.mock("@/inngest/client", () => ({
  inngest: { createFunction: (_options: unknown, handler: unknown) => handler },
}));
vi.mock("@/inngest/publisher", () => ({
  createPublisher: () => mocks.publish,
}));
vi.mock("@/server/ai/gateway", () => ({
  findAgentModel: mocks.findAgentModel,
}));
vi.mock("@/inngest/agent/loop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/inngest/agent/loop")>()),
  runAgentLoop: mocks.loop,
}));

const { runAgent } = await import("./run-agent");
const secret = "sk-9Y5Q7Z2H8N4W6R3T1M0B9V8C7L6K5J4D";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.message.update.mockResolvedValue({});
  mocks.db.message.upsert.mockResolvedValue({});
  mocks.db.project.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.guardEvent.create.mockResolvedValue({});
  mocks.publish.mockResolvedValue(undefined);
});

describe("worker input boundary", () => {
  test.each([null, new Date()])(
    "blocks a legacy secret before claim or zero-credit setup, with stopRequestedAt=%s",
    async (stopRequestedAt) => {
      mocks.db.message.findFirst.mockResolvedValue({
        content: `Build with ${secret}`,
        stopRequestedAt,
        project: { name: "Bakery", description: null },
      });
      const outputs: unknown[] = [];
      const step = {
        run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => {
          const result = await fn();
          outputs.push(result);
          return result;
        }),
      };
      const handler = runAgent as unknown as (args: object) => Promise<unknown>;
      await expect(
        handler({
          event: { data: { projectId: "p1", userId: "u1", messageId: "m1" } },
          runId: "r1",
          step,
        }),
      ).resolves.toEqual({ status: "secret-in-prompt" });
      expect(step.run.mock.calls.map(([name]) => name)).toEqual([
        "guard-input",
      ]);
      expect(mocks.findAgentModel).not.toHaveBeenCalled();
      expect(mocks.db.message.updateMany).not.toHaveBeenCalled();
      expect(
        JSON.stringify([
          outputs,
          mocks.publish.mock.calls,
          mocks.db.message.upsert.mock.calls,
        ]),
      ).not.toContain(secret);
    },
  );
});

describe("handoff checkpoint", () => {
  test("does not meter or continue a handoff whose checkpoint was refused", async () => {
    mocks.loop.mockResolvedValue({
      spentUsd: 0.01,
      searches: [],
      usage: {
        inputTokens: 1,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 1,
      },
      calls: [],
      reasoning: [],
      reasoningMs: 0,
      toolParts: [],
      tasks: [],
      handoff: "Continue building",
      written: ["app/page.tsx"],
      outOfCredits: false,
      stopped: false,
      output: null,
    });
    const results: Record<string, unknown> = {
      "guard-input": false,
      claim: true,
      "load-project": {
        model: { id: "audit-model", vision: false },
        history: [],
        prompt: "Build a bakery",
        balance: 100,
        hasVersion: false,
        files: [],
      },
      "guard-classify": {
        verdict: "allow",
        categories: [],
        skipped: false,
        call: null,
        usage: {
          inputTokens: 0,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
        },
      },
      sandbox: {
        sandboxId: "sbx",
        previewUrl: "https://preview.test",
        task: { kind: "sandbox", label: "Sandbox ready" },
        skills: [],
      },
      "handoff-checkpoint": false,
    };
    const step = {
      run: vi.fn(async (name: string) => {
        if (!Object.hasOwn(results, name))
          throw new Error(`Unexpected step: ${name}`);
        return results[name];
      }),
      sendEvent: vi.fn(),
    };
    const handler = runAgent as unknown as (args: object) => Promise<unknown>;
    await expect(
      handler({
        event: { data: { projectId: "p1", userId: "u1", messageId: "m1" } },
        runId: "r1",
        step,
      }),
    ).rejects.toThrow("Couldn't save a safe checkpoint");
    expect(step.sendEvent).not.toHaveBeenCalled();
    expect(step.run.mock.calls.map(([name]) => name)).not.toContain("meter");
    expect(step.run.mock.calls.map(([name]) => name)).not.toContain("cost");
  });
});
