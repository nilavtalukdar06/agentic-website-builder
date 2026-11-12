// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("e2b", () => ({ CommandExitError: class extends Error {} }));
vi.mock("@/server/sandbox/sandbox", () => ({
  extendSandbox: vi.fn().mockResolvedValue(undefined),
  snapshotSandbox: vi.fn().mockResolvedValue({ "app/page.tsx": "x" }),
  connectSandbox: vi.fn(async () => ({
    commands: { run: vi.fn() },
    files: {
      exists: vi.fn().mockResolvedValue(false),
      write: vi.fn().mockResolvedValue({}),
      read: vi.fn().mockResolvedValue("rules"),
    },
  })),
}));
const dbMock = vi.hoisted(() => ({
  projectSecret: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  inputRequest: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  guardEvent: { create: vi.fn() },
  version: { upsert: vi.fn() },
}));
vi.mock("@/server/db", () => ({ db: dbMock }));
const recover = vi.hoisted(() => ({
  recoverSandbox: vi.fn(),
  connectOrRecover: vi.fn(),
}));
vi.mock("@/server/sandbox/recover", () => recover);
vi.mock("../publisher", () => ({
  createPublisher: () => vi.fn().mockResolvedValue(undefined),
}));
const runModelTurn = vi.fn();
vi.mock("./model", () => ({ runModelTurn }));

const { runAgentLoop, NO_WRITES_NOTE } = await import("./loop");

const model = {
  id: "openai/test",
  name: "Test",
  provider: "openai",
  providerLabel: "OpenAI",
  vision: false,
  pricing: null,
};

const step = {
  run: vi.fn((_id: string, fn: () => unknown) => fn()),
  waitForEvent: vi.fn(),
};

let callIndex = 0;
function turn(
  text: string,
  toolCalls: { toolName: string; input: unknown }[] = [],
  extra: Record<string, unknown> = {},
) {
  return {
    messages: [
      {
        role: "assistant",
        content: [
          ...(text ? [{ type: "text", text }] : []),
          ...toolCalls.map((call) => ({
            type: "tool-call",
            toolCallId: `c${callIndex++}`,
            ...call,
          })),
        ],
      },
    ],
    finishReason: toolCalls.length > 0 ? "tool-calls" : "stop",
    text,
    reasoning: "",
    reasoningMs: 0,
    usage: {
      inputTokens: 1,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1,
    },
    estimatedUsd: 0.001,
    generationIds: [],
    searches: [],
    ...extra,
  };
}

const budget = { balance: 1000, spentUsd: 0, searches: 0 };

async function run(spec: string, options: Record<string, unknown> = {}) {
  const { agentSpecs } = await import("./agents/index");
  return runAgentLoop({
    step: step as never,
    spec: agentSpecs[spec as "builder"],
    projectId: "p1",
    sandboxId: "s1",
    model,
    messages: [{ role: "user", content: "Build it" }],
    installedSkills: [{ name: "shadcn", description: "UI" }],
    budget,
    ...options,
  });
}

vi.mock("./agents/index", async () => {
  const { builder } = await import("./agents/builder");
  const { designer } = await import("./agents/designer");
  const { reviewer } = await import("./agents/reviewer");
  return {
    agentSpecs: {
      builder,
      designer,
      reviewer,
      researcher: {
        ...designer,
        name: "researcher",
        skills: [],
        maxTurns: 6,
        tools: { readFiles: designer.tools.readFiles, parallel_search: {} },
      },
    },
  };
});

beforeEach(async () => {
  runModelTurn.mockReset();
  step.run.mockClear();
  step.waitForEvent.mockReset();
  dbMock.projectSecret.findMany.mockReset().mockResolvedValue([]);
  dbMock.projectSecret.count.mockReset().mockResolvedValue(0);
  dbMock.inputRequest.findMany.mockReset().mockResolvedValue([]);
  dbMock.inputRequest.findFirst.mockReset().mockResolvedValue(null);
  dbMock.inputRequest.findUnique.mockReset().mockResolvedValue(null);
  dbMock.inputRequest.upsert.mockReset().mockResolvedValue({});
  dbMock.inputRequest.updateMany.mockReset().mockResolvedValue({ count: 1 });
  dbMock.version.upsert.mockReset().mockResolvedValue({});
  const { connectSandbox } = await import("@/server/sandbox/sandbox");
  recover.connectOrRecover.mockReset().mockImplementation(async () => ({
    sandbox: await connectSandbox("s1"),
    recovered: null,
  }));
});

describe("runAgentLoop", () => {
  test("namespaces steps by agent and stops when the agent answers", async () => {
    runModelTurn.mockResolvedValueOnce(turn("<brief>Warm palette</brief>"));
    const result = await run("designer");
    expect(result).toMatchObject({ output: "Warm palette", finished: true });
    expect(step.run.mock.calls.map(([id]) => id)).toEqual(["designer-model-0"]);
    expect(result.calls[0]).toMatchObject({ agent: "designer", searches: 0 });
  });

  test("runs tools in their own steps and carries skill progress", async () => {
    runModelTurn
      .mockResolvedValueOnce(
        turn("", [{ toolName: "readFiles", input: { paths: ["AGENTS.md"] } }]),
      )
      .mockResolvedValueOnce(turn("<brief>Done</brief>"));
    const result = await run("designer");
    expect(step.run.mock.calls.map(([id]) => id)).toEqual([
      "designer-model-0",
      "designer-tool-0-0",
      "designer-model-1",
    ]);
    expect(result.progress.readAgentsMd).toBe(true);
  });

  test("a read-only agent's untagged reply gets a nudge, then counts as unfinished", async () => {
    runModelTurn.mockResolvedValue(
      turn("I'm sorry, but I cannot assist with that request."),
    );
    const result = await run("designer");
    expect(result.finished).toBe(false);
    expect(result.output).toBeNull();
    expect(runModelTurn).toHaveBeenCalledTimes(4);
    const last = runModelTurn.mock.calls.at(-1)?.[0];
    expect(last.toolChoice).toBe("none");
    expect(last.tools).toHaveProperty("readFiles");
  });

  test("the builder is nudged once when it finishes without writing", async () => {
    runModelTurn
      .mockResolvedValueOnce(turn("<task_summary>Built it</task_summary>"))
      .mockResolvedValueOnce(
        turn("<task_summary>No change needed</task_summary>"),
      );
    const result = await run("builder", { expectWrites: true });
    expect(runModelTurn).toHaveBeenCalledTimes(2);
    const second = runModelTurn.mock.calls[1][0];
    expect(JSON.stringify(second.messages)).toContain(
      NO_WRITES_NOTE.slice(0, 40),
    );
    expect(result).toMatchObject({
      output: "No change needed",
      finished: true,
    });
  });

  test("the builder falls back to its plain reply", async () => {
    runModelTurn.mockResolvedValueOnce(turn("All done."));
    const result = await run("builder");
    expect(result).toMatchObject({ output: "All done.", finished: true });
  });

  test("drops the search tool once the run used its searches", async () => {
    runModelTurn.mockResolvedValueOnce(turn("<brief>Facts</brief>"));
    await run("researcher", { budget: { ...budget, searches: 6 } });
    const call = runModelTurn.mock.calls[0][0];
    expect(call.activeTools).toEqual(["readFiles"]);
    expect(JSON.stringify(call.messages)).toContain("all 6 web searches");
  });

  test("stops when the balance runs out", async () => {
    runModelTurn.mockResolvedValue(
      turn("", [{ toolName: "readFiles", input: { paths: ["a.ts"] } }], {
        estimatedUsd: 0.5,
      }),
    );
    const result = await run("builder", {
      budget: { balance: 10, spentUsd: 0, searches: 0 },
    });
    expect(result.outOfCredits).toBe(true);
    expect(runModelTurn).toHaveBeenCalledTimes(1);
  });
});

describe("asking the user", () => {
  const ask = {
    toolName: "askUser",
    input: {
      kind: "text",
      question: "What is the cafe called?",
    },
  };

  async function runBuilder() {
    const { createRunContext } = await import("./loop");
    const runContext = createRunContext({
      runId: "r1",
      userId: "u1",
      messageId: "m1",
      sandboxId: "s1",
    });
    const result = await run("builder", { run: runContext });
    return { result, runContext };
  }

  test("pauses on askUser, waits for the event and returns the answer", async () => {
    runModelTurn
      .mockResolvedValueOnce(turn("", [ask]))
      .mockResolvedValueOnce(turn("<task_summary>Done</task_summary>"));
    step.waitForEvent.mockResolvedValue({
      data: { requestId: "x", ok: true, answer: "Ember" },
    });
    dbMock.inputRequest.findUnique.mockResolvedValue({
      status: "ANSWERED",
      answer: { ok: true, answer: "Ember & Oak" },
    });
    const { result, runContext } = await runBuilder();
    const id = "input_r1_builder_0_0";
    expect(step.run.mock.calls.map(([name]) => name)).toEqual([
      "builder-model-0",
      "builder-tool-0-0",
      "builder-ask-0-0",
      "builder-answer-0-0",
      "builder-model-1",
    ]);
    expect(step.waitForEvent).toHaveBeenCalledWith("builder-wait-0-0", {
      event: expect.anything(),
      timeout: "30m",
      if: `async.data.requestId == "${id}"`,
    });
    expect(dbMock.inputRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ id, kind: "TEXT", chainId: "r1" }),
      }),
    );
    expect(dbMock.version.upsert).toHaveBeenCalled();
    expect(runContext.questions).toBe(1);
    const toolMessage = result.messages.find(
      (message) => message.role === "tool",
    );
    expect(JSON.stringify(toolMessage)).toContain(
      'The user answered \\"What is the cafe called?\\": Ember & Oak',
    );
    expect(result.toolParts).toEqual([
      expect.objectContaining({ type: "input-request", requestId: id }),
      {
        type: "input-answer",
        requestId: id,
        kind: "text",
        answer: "Ember & Oak",
      },
    ]);
    expect(result).toMatchObject({ finished: true, paused: null });
  });

  test("ends as paused when nobody answers in time", async () => {
    runModelTurn.mockResolvedValueOnce(turn("", [ask]));
    step.waitForEvent.mockResolvedValue(null);
    dbMock.inputRequest.updateMany.mockResolvedValue({ count: 1 });
    const { result } = await runBuilder();
    expect(result).toMatchObject({
      paused: { requestId: "input_r1_builder_0_0" },
      finished: false,
    });
    expect(runModelTurn).toHaveBeenCalledTimes(1);
    expect(dbMock.inputRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "input_r1_builder_0_0", status: "PENDING" },
      data: { status: "PAUSED" },
    });
  });

  test("an answer that lands as the wait times out still counts", async () => {
    runModelTurn
      .mockResolvedValueOnce(turn("", [ask]))
      .mockResolvedValueOnce(turn("<task_summary>Done</task_summary>"));
    step.waitForEvent.mockResolvedValue(null);
    dbMock.inputRequest.updateMany.mockResolvedValue({ count: 0 });
    dbMock.inputRequest.findUnique.mockResolvedValue({
      status: "ANSWERED",
      answer: { ok: true, answer: "Ember" },
    });
    const { result } = await runBuilder();
    expect(result.paused).toBeNull();
    expect(result.finished).toBe(true);
  });

  test("a question answered before is not asked again", async () => {
    runModelTurn
      .mockResolvedValueOnce(turn("", [ask]))
      .mockResolvedValueOnce(turn("<task_summary>Done</task_summary>"));
    dbMock.inputRequest.findFirst.mockResolvedValue({
      answer: { ok: true, answer: "Ember" },
    });
    const { result, runContext } = await runBuilder();
    expect(step.waitForEvent).not.toHaveBeenCalled();
    expect(dbMock.inputRequest.upsert).not.toHaveBeenCalled();
    expect(runContext.questions).toBe(0);
    expect(result.finished).toBe(true);
  });

  test("an approved confirmation re-runs the command", async () => {
    runModelTurn
      .mockResolvedValueOnce(
        turn("", [
          {
            toolName: "terminal",
            input: { command: "npx prisma migrate reset --force" },
          },
        ]),
      )
      .mockResolvedValueOnce(turn("<task_summary>Done</task_summary>"));
    step.waitForEvent.mockResolvedValue({ data: { requestId: "x", ok: true } });
    dbMock.inputRequest.findUnique.mockResolvedValue({
      status: "ANSWERED",
      answer: { ok: true, answer: "approved" },
    });
    const { result } = await runBuilder();
    expect(step.run.mock.calls.map(([name]) => name)).toContain(
      "builder-tool-0-0-approved",
    );
    expect(JSON.stringify(result.messages)).toContain(
      "The user approved: Run:",
    );
  });

  test("writers save a checkpoint every 5 turns", async () => {
    const write = {
      toolName: "createOrUpdateFiles",
      input: { files: [{ path: "app/page.tsx", content: "x" }] },
    };
    const { createRunContext } = await import("./loop");
    const runContext = createRunContext({ runId: "r1", sandboxId: "s1" });
    for (let index = 0; index < 5; index++) {
      runModelTurn.mockResolvedValueOnce(turn("", [write]));
    }
    runModelTurn.mockResolvedValueOnce(
      turn("<task_summary>Done</task_summary>"),
    );
    await run("builder", {
      run: runContext,
      progress: { readAgentsMd: true, loadedSkills: ["shadcn"] },
    });
    expect(step.run.mock.calls.map(([name]) => name)).toContain(
      "builder-checkpoint-5",
    );
    expect(dbMock.version.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "checkpoint_r1" } }),
    );
    expect(runContext.pendingWrites.size).toBe(0);
  });
});

describe("no turn limit for the builder", () => {
  const read = { toolName: "readFiles", input: { paths: ["AGENTS.md"] } };

  test("keeps working past 60 turns until it finishes", async () => {
    for (let index = 0; index < 75; index++) {
      runModelTurn.mockResolvedValueOnce(turn("", [read]));
    }
    runModelTurn.mockResolvedValueOnce(
      turn("<task_summary>Finished the big site</task_summary>"),
    );
    const result = await run("builder", {
      progress: { readAgentsMd: true, loadedSkills: ["shadcn"] },
    });
    expect(runModelTurn).toHaveBeenCalledTimes(76);
    expect(result).toMatchObject({
      finished: true,
      output: "Finished the big site",
      handoff: null,
    });
  });

  test("hands over to a fresh run before Inngest's per-run step limit", async () => {
    const { createRunContext, RUN_STEP_BUDGET } = await import("./loop");
    const runContext = createRunContext({ runId: "r1", sandboxId: "s1" });
    runContext.steps = RUN_STEP_BUDGET - 2;
    runModelTurn
      .mockResolvedValueOnce(turn("", [read]))
      .mockResolvedValueOnce(
        turn("Done: hero and menu. Left: footer, contact form."),
      );
    const result = await run("builder", { run: runContext });
    expect(step.run.mock.calls.map(([name]) => name)).toEqual([
      "builder-model-0",
      "builder-tool-0-0",
      "builder-handoff-1",
    ]);
    expect(runModelTurn.mock.calls[1][0]).toMatchObject({ toolChoice: "none" });
    expect(result).toMatchObject({
      finished: false,
      handoff: "Done: hero and menu. Left: footer, contact form.",
    });
  });

  test("counts the state each step stores", async () => {
    const { createRunContext, nearRunBudget, RUN_STATE_BUDGET_BYTES } =
      await import("./loop");
    const runContext = createRunContext({ sandboxId: "s1" });
    runModelTurn.mockResolvedValueOnce(turn("<task_summary>x</task_summary>"));
    await run("builder", {
      run: runContext,
      progress: { readAgentsMd: true, loadedSkills: ["shadcn"] },
    });
    expect(runContext.steps).toBe(1);
    expect(runContext.stateBytes).toBeGreaterThan(0);
    expect(
      nearRunBudget({ steps: 0, stateBytes: RUN_STATE_BUDGET_BYTES }),
    ).toBe(true);
  });
});
