// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("e2b", () => ({ CommandExitError: class extends Error {} }));
vi.mock("@/server/sandbox/sandbox", () => ({
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
vi.mock("@/server/ai/gateway", () => ({
  gateway: { tools: { parallelSearch: () => ({}) } },
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

async function run(
  options: Record<string, unknown> & { search?: boolean } = {},
) {
  const { builderSpec } = await import("./agents");
  const { search = false, ...rest } = options;
  return runAgentLoop({
    step: step as never,
    spec: builderSpec({ search }),
    projectId: "p1",
    sandboxId: "s1",
    model,
    messages: [{ role: "user", content: "Build it" }],
    installedSkills: [{ name: "shadcn", description: "UI" }],
    budget,
    ...rest,
  });
}

beforeEach(async () => {
  runModelTurn.mockReset();
  step.run.mockClear();
  dbMock.version.upsert.mockReset().mockResolvedValue({});
  const { connectSandbox } = await import("@/server/sandbox/sandbox");
  recover.connectOrRecover.mockReset().mockImplementation(async () => ({
    sandbox: await connectSandbox("s1"),
    recovered: null,
  }));
});

describe("runAgentLoop", () => {
  test("namespaces steps and stops when the builder answers", async () => {
    runModelTurn.mockResolvedValueOnce(
      turn("<task_summary>Done</task_summary>"),
    );
    const result = await run();
    expect(result).toMatchObject({ output: "Done", finished: true });
    expect(step.run.mock.calls.map(([id]) => id)).toEqual(["builder-model-0"]);
    expect(result.calls[0]).toMatchObject({ agent: "builder", searches: 0 });
  });

  test("runs tools in their own steps and carries skill progress", async () => {
    runModelTurn
      .mockResolvedValueOnce(
        turn("", [{ toolName: "readFiles", input: { paths: ["AGENTS.md"] } }]),
      )
      .mockResolvedValueOnce(turn("<task_summary>Done</task_summary>"));
    const result = await run();
    expect(step.run.mock.calls.map(([id]) => id)).toEqual([
      "builder-model-0",
      "builder-tool-0-0",
      "builder-model-1",
    ]);
    expect(result.progress.readAgentsMd).toBe(true);
  });

  test("an askUser call is answered as an unknown tool", async () => {
    runModelTurn
      .mockResolvedValueOnce(
        turn("", [
          { toolName: "askUser", input: { kind: "text", question: "Name?" } },
        ]),
      )
      .mockResolvedValueOnce(turn("<task_summary>Done</task_summary>"));
    const result = await run();
    expect(JSON.stringify(result.messages)).toContain("Unknown tool: askUser");
    expect(result.finished).toBe(true);
  });

  test("the builder is nudged once when it finishes without writing", async () => {
    runModelTurn
      .mockResolvedValueOnce(turn("<task_summary>Built it</task_summary>"))
      .mockResolvedValueOnce(
        turn("<task_summary>No change needed</task_summary>"),
      );
    const result = await run({ expectWrites: true });
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
    const result = await run();
    expect(result).toMatchObject({ output: "All done.", finished: true });
  });

  test("offers web search only when the spec has it", async () => {
    runModelTurn.mockResolvedValue(turn("<task_summary>Done</task_summary>"));
    await run();
    expect(runModelTurn.mock.calls[0][0].tools).not.toHaveProperty(
      "parallel_search",
    );
    await run({ search: true });
    expect(runModelTurn.mock.calls[1][0].tools).toHaveProperty(
      "parallel_search",
    );
  });

  test("drops the search tool once the run used its searches", async () => {
    runModelTurn.mockResolvedValueOnce(
      turn("<task_summary>Done</task_summary>"),
    );
    await run({ search: true, budget: { ...budget, searches: 6 } });
    const call = runModelTurn.mock.calls[0][0];
    expect(call.activeTools).toEqual([
      "terminal",
      "createOrUpdateFiles",
      "readFiles",
      "loadSkill",
    ]);
    expect(JSON.stringify(call.messages)).toContain("all 6 web searches");
  });

  test("stops when the balance runs out", async () => {
    runModelTurn.mockResolvedValue(
      turn("", [{ toolName: "readFiles", input: { paths: ["a.ts"] } }], {
        estimatedUsd: 0.5,
      }),
    );
    const result = await run({
      budget: { balance: 10, spentUsd: 0, searches: 0 },
    });
    expect(result.outOfCredits).toBe(true);
    expect(runModelTurn).toHaveBeenCalledTimes(1);
  });

  test("stops before the next turn when the user asks", async () => {
    runModelTurn.mockResolvedValue(
      turn("", [{ toolName: "readFiles", input: { paths: ["a.ts"] } }]),
    );
    const shouldStop = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const result = await run({ shouldStop });
    expect(result.stopped).toBe(true);
    expect(result.finished).toBe(false);
    expect(runModelTurn).toHaveBeenCalledTimes(1);
    expect(step.run).toHaveBeenCalledWith(
      "builder-stop-1",
      expect.any(Function),
    );
  });
});

describe("checkpoints", () => {
  test("the builder saves a checkpoint every 5 turns", async () => {
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
    await run({
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
    const result = await run({
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
    const result = await run({ run: runContext });
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
    await run({
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
