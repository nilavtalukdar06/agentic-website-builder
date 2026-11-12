// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("e2b", () => ({ CommandExitError: class extends Error {} }));
vi.mock("@/server/sandbox/sandbox", () => ({
  connectSandbox: vi.fn(async () => ({
    commands: { run: vi.fn() },
    files: {
      exists: vi.fn().mockResolvedValue(false),
      write: vi.fn().mockResolvedValue({}),
      read: vi.fn().mockResolvedValue("rules"),
    },
  })),
}));
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

beforeEach(() => {
  runModelTurn.mockReset();
  step.run.mockClear();
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
