// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    message: { update: vi.fn(), upsert: vi.fn() },
    project: { update: vi.fn(), updateMany: vi.fn() },
    guardEvent: { create: vi.fn() },
  },
  publish: vi.fn(),
  loop: vi.fn(),
  saveRunResult: vi.fn(),
  debitCredits: vi.fn(),
  checkProject: vi.fn(),
  answerQuestion: vi.fn(),
  browse: vi.fn(),
  send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: mocks.db }));
vi.mock("@/inngest/client", () => ({
  inngest: {
    createFunction: (_options: unknown, handler: unknown) => handler,
    send: mocks.send,
  },
}));
vi.mock("@/inngest/publisher", () => ({
  createPublisher: () => mocks.publish,
}));
vi.mock("@/server/ai/gateway", () => ({
  findAgentModel: vi.fn(),
  lookupGenerationCost: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/server/sandbox/recover", () => ({
  connectOrRecover: vi.fn(async () => ({
    sandbox: { commands: { run: vi.fn().mockResolvedValue({}) } },
    recovered: null,
  })),
  recoverSandbox: vi.fn(),
}));
vi.mock("@/server/sandbox/sandbox", () => ({
  ensureAgentInstructions: vi.fn(),
  ensureDevOrigins: vi.fn(),
  getOrCreateSandbox: vi.fn(),
  PREVIEW_PORT: 3000,
  previewUrlFor: vi.fn(),
  snapshotSandbox: vi.fn(async () => ({ "app/page.tsx": "export default 1" })),
}));
vi.mock("@/inngest/agent/loop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/inngest/agent/loop")>()),
  runAgentLoop: mocks.loop,
}));
vi.mock("@/inngest/agent/persist", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/inngest/agent/persist")>()),
  saveRunResult: mocks.saveRunResult,
  debitCredits: mocks.debitCredits,
}));
vi.mock("@/inngest/agent/pipeline", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/inngest/agent/pipeline")>()),
  checkProject: mocks.checkProject,
  answerQuestion: mocks.answerQuestion,
}));
vi.mock("@/inngest/agent/browser-step", () => ({
  runBrowserCheck: mocks.browse,
}));
vi.mock("@/inngest/agent/guardrails/classifier", () => ({
  classifyText: vi.fn(async () => ({
    verdict: "allow",
    categories: [],
    call: null,
    usage: emptyUsage,
  })),
}));

const emptyUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
};
const noSpend = { calls: [], usage: emptyUsage, spentUsd: 0 };

const { runAgent, issuesNote, gateMessage, GATE_CYCLES } =
  await import("./run-agent");

const model = { id: "moonshotai/kimi-k2.7-code", vision: true, pricing: null };

function results(overrides: Record<string, unknown>) {
  return {
    "guard-input": false,
    claim: true,
    "guard-classify": {
      verdict: "allow",
      categories: [],
      skipped: false,
      call: null,
      usage: emptyUsage,
    },
    sandbox: {
      sandboxId: "sbx",
      previewUrl: "https://preview.test",
      task: { kind: "sandbox", label: "Sandbox ready" },
      ms: 5,
    },
    "secret-scan": [],
    cost: {
      costUsd: 0.05,
      agents: [],
      exactCalls: 0,
      estimatedCalls: 0,
      generationIds: [],
    },
    ...overrides,
  } as Record<string, unknown>;
}

function stepFor(canned: Record<string, unknown>) {
  return {
    run: vi.fn(async (name: string, fn: () => Promise<unknown>) =>
      Object.hasOwn(canned, name) ? canned[name] : fn(),
    ),
    sendEvent: vi.fn(),
  };
}

const handler = runAgent as unknown as (args: object) => Promise<{
  status: string;
  mode: string;
  intent: string;
  issues: number;
}>;

const passedBrowser = {
  status: "passed",
  reason: null,
  checks: [
    {
      id: "0-page-desktop-/",
      kind: "page",
      label: "Open / at desktop width",
      route: "/",
      viewport: "desktop",
      status: "passed",
      detail: "No errors, nothing scrolls sideways, images load",
    },
  ],
  screenshots: [{ viewport: "desktop", key: "qa/p1/r1/0-desktop.png" }],
  diagnostics: [],
  calls: [],
  ms: 9000,
  task: {
    kind: "note",
    label: "Checked the site in the browser on desktop and phone: no problems",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.browse.mockResolvedValue(passedBrowser);
  mocks.publish.mockResolvedValue(undefined);
  mocks.saveRunResult.mockResolvedValue({ versionNumber: 2 });
  mocks.debitCredits.mockResolvedValue(null);
});

describe("question intent", () => {
  test("answers without tools, saves no version and charges the answer", async () => {
    mocks.answerQuestion.mockResolvedValue({
      text: "The site uses Inter for body text.",
      spend: {
        calls: [
          {
            generationIds: [],
            estimatedUsd: 0.001,
            agent: "answer",
            model: model.id,
          },
        ],
        usage: emptyUsage,
        spentUsd: 0.001,
      },
      ms: 900,
    });
    const step = stepFor(
      results({
        "load-project": {
          model,
          history: [{ role: "USER", content: "What fonts does the site use?" }],
          prompt: "What fonts does the site use?",
          balance: 100,
          hasVersion: true,
          files: ["app/layout.tsx"],
          repoMap: "",
          designNotes: "Fonts: Inter",
          routes: ["/"],
        },
        route: {
          intent: "question",
          targets: [],
          preloaded: [],
          spend: noSpend,
          memory: { status: "off", reason: null, block: "", reads: 0, ms: 0 },
          ms: 2,
        },
      }),
    );
    const result = await handler({
      event: { data: { projectId: "p1", userId: "u1", messageId: "m1" } },
      runId: "r1",
      step,
    });
    expect(result).toMatchObject({ status: "done", mode: "answer" });
    expect(mocks.loop).not.toHaveBeenCalled();
    expect(mocks.checkProject).not.toHaveBeenCalled();
    expect(step.run.mock.calls.map(([name]) => name)).not.toContain(
      "secret-scan",
    );
    expect(mocks.saveRunResult).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        saveVersion: false,
        files: {},
        title: "Answered a question",
        content: "The site uses Inter for body text.",
      }),
    );
    expect(mocks.debitCredits).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        run: expect.objectContaining({
          intent: "question",
          timings: expect.objectContaining({ answer: 900 }),
        }),
      }),
    );
  });
});

const createSetup = {
  "load-project": {
    model,
    history: [{ role: "USER", content: "A todo app" }],
    prompt: "A todo app",
    balance: 100,
    hasVersion: false,
    files: [],
    repoMap: "",
    designNotes: "",
  },
  route: {
    intent: "create",
    targets: [],
    preloaded: [],
    spend: noSpend,
    memory: { status: "off", reason: null, block: "", reads: 0, ms: 0 },
    ms: 1,
  },
};

const plan = {
  projectName: "Night Owl",
  title: "Night Owl Todo",
  steps: [{ step: "Build the task list", status: "done" }],
  checks: [{ route: "/", action: "Add a task", expect: "The task is listed" }],
};

function agentRun(overrides: Record<string, unknown> = {}) {
  return {
    output: "Built a todo app.",
    finished: true,
    outOfCredits: false,
    stopped: false,
    capped: false,
    messages: [
      { role: "user", content: "A todo app" },
      { role: "assistant", content: "done" },
    ],
    usage: emptyUsage,
    calls: [{ generationIds: [], estimatedUsd: 0, agent: "builder" }],
    tasks: [{ kind: "file", verb: "created", path: "app/page.tsx", lines: 1 }],
    toolParts: [],
    reasoning: [],
    reasoningMs: 0,
    written: ["app/page.tsx"],
    searches: [],
    progress: { plan },
    spentUsd: 0,
    handoff: null,
    modelMs: 100,
    toolMs: 50,
    ...overrides,
  };
}

function checked(diagnostics: unknown[], files: Record<string, string> = {}) {
  return {
    diagnostics,
    routes: ["/"],
    fixed: [],
    files: { "app/page.tsx": "export default 1", ...files },
    tasks: [
      {
        kind: "note",
        label:
          diagnostics.length === 0
            ? "Checked types, lint and pages: no problems"
            : `Checks found ${diagnostics.length} problems`,
      },
    ],
    ms: 1000,
  };
}

const typeError = {
  source: "tsc",
  path: "components/tasks/TaskStats.tsx",
  line: 58,
  message: "TS2322: Property 'title' does not exist on type 'LucideProps'.",
};
const missingModule = {
  source: "tsc",
  path: "app/page.tsx",
  line: 3,
  message: "TS2307: Cannot find module '@/components/tasks/TaskApp'.",
};
const routeFailure = {
  source: "route",
  path: null,
  line: null,
  message: "GET / returned 500: Module not found",
};

function runCreate(extra: Record<string, unknown> = {}) {
  const step = stepFor(results({ ...createSetup, ...extra }));
  return {
    step,
    done: handler({
      event: { data: { projectId: "p1", userId: "u1", messageId: "m1" } },
      runId: "r1",
      step,
    }),
  };
}

describe("create intent", () => {
  test("one agent loop builds, the done gate checks and browses, and the reply comes from the agent", async () => {
    mocks.loop.mockResolvedValue(agentRun());
    mocks.checkProject.mockResolvedValue(checked([]));
    const { done } = runCreate();
    const result = await done;
    expect(result).toMatchObject({
      status: "done",
      mode: "builder",
      issues: 0,
    });
    expect(mocks.loop).toHaveBeenCalledTimes(1);
    expect(mocks.loop.mock.calls[0][0]).toMatchObject({
      maxTurns: 40,
      expectWrites: true,
    });
    expect(mocks.db.project.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", userId: "u1" },
      data: { name: "Night Owl" },
    });
    expect(mocks.checkProject).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: "gate-check-0",
        changed: ["app/page.tsx"],
        snapshot: true,
      }),
    );
    expect(mocks.browse).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: "gate-browse-0",
        routes: ["/"],
        interactions: plan.checks,
      }),
    );
    const saved = mocks.saveRunResult.mock.calls[0][1];
    expect(saved.title).toBe("Night Owl Todo");
    expect(saved.content).toBe("Built a todo app.");
    expect(saved.parts).toContainEqual({
      type: "browser",
      status: "passed",
      reason: null,
      checks: passedBrowser.checks,
      screenshots: passedBrowser.screenshots,
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "notify/send",
        data: expect.objectContaining({ kind: "run-finished" }),
      }),
    );
    expect(mocks.debitCredits).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        run: expect.objectContaining({
          gateCycles: 0,
          blockers: { first: 0, final: 0 },
          browse: { status: "passed", reason: null, untestable: 0 },
        }),
      }),
    );
  });

  test("failures go back into the same conversation and the fixed result is saved", async () => {
    const build = agentRun();
    mocks.loop
      .mockResolvedValueOnce(build)
      .mockResolvedValueOnce(
        agentRun({ output: "Built a todo app and fixed the icon label." }),
      );
    mocks.checkProject
      .mockResolvedValueOnce(checked([typeError]))
      .mockResolvedValueOnce(checked([]));
    const result = await runCreate().done;
    expect(result.issues).toBe(0);
    expect(mocks.browse).toHaveBeenCalledTimes(2);
    const fix = mocks.loop.mock.calls[1][0];
    expect(fix).toMatchObject({
      stepPrefix: "gate-0",
      maxTurns: 12,
      progress: build.progress,
    });
    expect(fix.messages.slice(0, 2)).toEqual(build.messages);
    const text = JSON.stringify(fix.messages[2].content);
    expect(text).toContain("LucideProps");
    expect(text).toContain('<untrusted source=\\"checks\\">');
    expect(fix.messages[2].content).toContainEqual(
      expect.objectContaining({
        type: "file",
        data: new URL("vibe-attachment:qa/p1/r1/0-desktop.png"),
      }),
    );
    const saved = mocks.saveRunResult.mock.calls[0][1];
    expect(saved.content).toBe("Built a todo app and fixed the icon label.");
  });

  test("stops after the gate cycle limit and reports what is still broken", async () => {
    mocks.loop.mockResolvedValue(agentRun());
    mocks.checkProject.mockResolvedValue(checked([typeError]));
    const result = await runCreate().done;
    expect(mocks.loop).toHaveBeenCalledTimes(1 + GATE_CYCLES);
    expect(mocks.checkProject).toHaveBeenCalledTimes(1 + GATE_CYCLES);
    expect(result.issues).toBe(1);
    const saved = mocks.saveRunResult.mock.calls[0][1];
    expect(saved.content).toContain(
      "**Heads-up:** the automatic checks still report 1 problem",
    );
  });

  test("a failing page skips the browser, and creating the missing file counts as progress", async () => {
    mocks.loop.mockResolvedValue(agentRun());
    mocks.checkProject
      .mockResolvedValueOnce(checked([missingModule, routeFailure]))
      .mockResolvedValueOnce(
        checked([typeError, { ...typeError, line: 60 }], {
          "components/tasks/TaskApp.tsx": "export function TaskApp() {}",
        }),
      )
      .mockResolvedValueOnce(checked([]));
    const { step, done } = runCreate();
    const result = await done;
    expect(result.issues).toBe(0);
    expect(mocks.browse.mock.calls.map(([input]) => input.stepId)).toEqual([
      "gate-browse-1",
      "gate-browse-2",
    ]);
    expect(step.run.mock.calls.map(([name]) => name)).not.toContain(
      "gate-restore",
    );
  });

  test("restores the state with fewer blockers when fixing made pages fail", async () => {
    mocks.loop.mockResolvedValue(agentRun());
    mocks.checkProject
      .mockResolvedValueOnce(checked([typeError]))
      .mockResolvedValue(
        checked([routeFailure], {
          "app/page.tsx": "broken",
          "components/new.tsx": "x",
        }),
      );
    const { step, done } = runCreate({
      "gate-restore": {
        sandbox: null,
        task: {
          kind: "note",
          label:
            "Restored the earlier state, which had fewer blocking problems",
        },
      },
    });
    const result = await done;
    const restore = step.run.mock.calls.find(
      ([name]) => name === "gate-restore",
    );
    expect(restore).toBeDefined();
    expect(result.issues).toBe(1);
    const saved = mocks.saveRunResult.mock.calls[0][1];
    expect(saved.content).toContain("LucideProps");
    expect(saved.parts[0].items).toContainEqual({
      kind: "note",
      label: "Restored the earlier state, which had fewer blocking problems",
    });
  });

  test("stop during a gate cycle ends the run without another check", async () => {
    mocks.loop
      .mockResolvedValueOnce(agentRun())
      .mockResolvedValueOnce(agentRun({ stopped: true, output: null }));
    mocks.checkProject.mockResolvedValue(checked([typeError]));
    const result = await runCreate().done;
    expect(result.status).toBe("stopped");
    expect(mocks.checkProject).toHaveBeenCalledTimes(1);
  });
});

describe("browser findings in the done gate", () => {
  const finding = {
    source: "browser",
    path: null,
    line: null,
    message:
      '/customers: "Type Ada in the search box" didn\'t work as expected. Expected: Only Ada. Seen: all rows',
  };
  const failedBrowser = {
    ...passedBrowser,
    status: "failed",
    diagnostics: [finding],
  };

  test("get one fix cycle, then the run finishes and lists them", async () => {
    mocks.loop.mockResolvedValue(agentRun());
    mocks.checkProject.mockResolvedValue(checked([]));
    mocks.browse.mockResolvedValue(failedBrowser);
    const result = await runCreate().done;
    expect(mocks.loop).toHaveBeenCalledTimes(2);
    expect(mocks.browse).toHaveBeenCalledTimes(2);
    expect(result.issues).toBe(1);
    const message = JSON.stringify(mocks.loop.mock.calls[1][0].messages[2]);
    expect(message).toContain("they can be wrong");
    expect(message).toContain("read the code first");
  });

  test("stop at once when they repeat while code problems are fixed", async () => {
    mocks.loop.mockResolvedValue(agentRun());
    mocks.checkProject
      .mockResolvedValueOnce(checked([typeError]))
      .mockResolvedValue(checked([]));
    mocks.browse.mockResolvedValue({
      ...failedBrowser,
      diagnostics: [
        { ...finding, message: `${finding.message.split(" Seen")[0]} Seen: x` },
      ],
    });
    mocks.browse.mockResolvedValueOnce(failedBrowser);
    await runCreate().done;
    expect(mocks.loop).toHaveBeenCalledTimes(2);
    expect(mocks.checkProject).toHaveBeenCalledTimes(2);
  });

  test("record how many steps couldn't be tested", async () => {
    mocks.loop.mockResolvedValue(agentRun());
    mocks.checkProject.mockResolvedValue(checked([]));
    mocks.browse.mockResolvedValue({ ...passedBrowser, untestable: 2 });
    await runCreate().done;
    expect(mocks.debitCredits).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        run: expect.objectContaining({
          browse: { status: "passed", reason: null, untestable: 2 },
        }),
      }),
    );
  });
});

describe("helpers", () => {
  test("issuesNote is empty without problems and caps the list", () => {
    expect(issuesNote([])).toBe("");
    const many = Array.from({ length: 7 }, (_, index) => ({
      source: "tsc" as const,
      path: "a.tsx",
      line: index,
      message: "x",
    }));
    expect(issuesNote(many)).toContain("…and 2 more");
  });

  test("gateMessage asks for missing files to be created and stays text without screenshots", () => {
    const message = gateMessage({
      diagnostics: [missingModule as never],
      screenshots: [],
    });
    expect(typeof message.content).toBe("string");
    expect(message.content).toContain("create any missing file you import");
    expect(message.content).toContain("Cannot find module");
  });
});
