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
  makePlan: vi.fn(),
  generateFromPlan: vi.fn(),
  checkProject: vi.fn(),
  answerQuestion: vi.fn(),
  browse: vi.fn(),
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
  makePlan: mocks.makePlan,
  generateFromPlan: mocks.generateFromPlan,
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

const { runAgent, issuesNote, pipelineSummary, rollbackPlan, routesToCheck } =
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

describe("create intent", () => {
  const plan = {
    projectName: "Night Owl",
    title: "Night Owl Coffee",
    summary: "A café site for late-night studying.",
    design: {
      preset: "sunset",
      headingFont: "Fraunces",
      bodyFont: "Inter",
      theme: "system",
      direction: "Warm.",
    },
    pages: [{ route: "/", title: "Home", sections: ["Hero", "Menu"] }],
    blocks: [],
    files: [{ path: "app/page.tsx", purpose: "home", dependsOn: [] }],
    packages: [],
  };

  const setup = {
    "load-project": {
      model,
      history: [{ role: "USER", content: "A café site" }],
      prompt: "A café site",
      balance: 100,
      hasVersion: false,
      files: [],
      repoMap: "",
      designNotes: "",
      routes: [],
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

  beforeEach(() => {
    mocks.makePlan.mockResolvedValue({
      plan,
      warnings: [],
      spend: noSpend,
      ms: 4000,
    });
    mocks.generateFromPlan.mockResolvedValue({
      files: [{ path: "app/page.tsx", content: "export default 1" }],
      tasks: [
        { kind: "file", verb: "created", path: "app/page.tsx", lines: 1 },
      ],
      missing: [],
      spend: noSpend,
      stopped: false,
      outOfCredits: false,
      ms: 20000,
    });
  });

  test("plans, generates and verifies without the builder loop, and replies from the plan", async () => {
    mocks.checkProject.mockResolvedValue({
      diagnostics: [],
      affected: [],
      fixed: [],
      tasks: [
        { kind: "note", label: "Checked types, lint and pages: no problems" },
      ],
      ms: 3000,
    });
    const step = stepFor(results(setup));
    const result = await handler({
      event: { data: { projectId: "p1", userId: "u1", messageId: "m1" } },
      runId: "r1",
      step,
    });
    expect(result).toMatchObject({
      status: "done",
      mode: "pipeline",
      issues: 0,
    });
    expect(mocks.loop).not.toHaveBeenCalled();
    expect(mocks.db.project.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", userId: "u1" },
      data: { name: "Night Owl" },
    });
    expect(mocks.checkProject).toHaveBeenCalledTimes(1);
    expect(mocks.checkProject).toHaveBeenCalledWith(
      expect.objectContaining({ routes: ["/"], changed: ["app/page.tsx"] }),
    );
    const saved = mocks.saveRunResult.mock.calls[0][1];
    expect(saved.title).toBe("Night Owl Coffee");
    expect(saved.content).toBe(pipelineSummary(plan as never));
    expect(saved.parts[0]).toMatchObject({
      type: "task",
      title: "Night Owl Coffee",
      items: [
        { kind: "sandbox", label: "Sandbox ready" },
        { kind: "file", verb: "created", path: "app/page.tsx", lines: 1 },
        { kind: "note", label: "Checked types, lint and pages: no problems" },
        {
          kind: "note",
          label:
            "Checked the site in the browser on desktop and phone: no problems",
        },
      ],
    });
    expect(mocks.browse).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: "browse-0",
        round: 0,
        routes: ["/"],
        interactions: [],
        model,
      }),
    );
    expect(saved.parts).toContainEqual({
      type: "browser",
      status: "passed",
      reason: null,
      checks: passedBrowser.checks,
      screenshots: passedBrowser.screenshots,
    });
  });

  test("repairs reported problems, then says honestly what is still broken", async () => {
    const problem = {
      source: "tsc",
      path: "app/page.tsx",
      line: 1,
      message: "TS2304: Cannot find name 'Menu'.",
    };
    mocks.checkProject
      .mockResolvedValueOnce({
        diagnostics: [problem, { ...problem, line: 2 }],
        affected: [{ path: "app/page.tsx", content: "export default 1" }],
        fixed: [],
        tasks: [],
        ms: 1000,
      })
      .mockResolvedValueOnce({
        diagnostics: [problem],
        affected: [],
        fixed: [],
        tasks: [],
        ms: 1000,
      })
      .mockResolvedValueOnce({
        diagnostics: [problem],
        affected: [],
        fixed: [],
        tasks: [],
        ms: 1000,
      });
    mocks.loop.mockResolvedValue({
      output: "Fixed one",
      finished: true,
      outOfCredits: false,
      stopped: false,
      capped: false,
      messages: [],
      usage: emptyUsage,
      calls: [],
      tasks: [],
      toolParts: [],
      reasoning: [],
      reasoningMs: 0,
      written: ["app/page.tsx"],
      searches: [],
      progress: {},
      spentUsd: 0,
      handoff: null,
      modelMs: 100,
      toolMs: 50,
    });
    const step = stepFor(results(setup));
    const result = await handler({
      event: { data: { projectId: "p1", userId: "u1", messageId: "m1" } },
      runId: "r1",
      step,
    });
    expect(mocks.loop).toHaveBeenCalledTimes(2);
    expect(mocks.loop.mock.calls[0][0]).toMatchObject({
      stepPrefix: "repair-0",
      maxTurns: 6,
    });
    expect(result.issues).toBe(1);
    const saved = mocks.saveRunResult.mock.calls[0][1];
    expect(saved.content).toContain(
      "**Heads-up:** the automatic checks still report 1 problem",
    );
  });
});

describe("browser findings", () => {
  test("go to the repair agent with screenshots, then the site is checked again", async () => {
    const plan = {
      projectName: "Todo",
      title: "Todo",
      summary: "A todo app.",
      design: {
        preset: "ocean",
        headingFont: "Inter",
        bodyFont: "Inter",
        theme: "system",
        direction: "Calm.",
      },
      pages: [{ route: "/", title: "Home", sections: ["List"] }],
      blocks: [],
      files: [{ path: "app/page.tsx", purpose: "home", dependsOn: [] }],
      packages: [],
      checks: [
        { route: "/", action: "Add a task", expect: "The task is listed" },
      ],
    };
    mocks.makePlan.mockResolvedValue({
      plan,
      warnings: [],
      spend: noSpend,
      ms: 1,
    });
    mocks.generateFromPlan.mockResolvedValue({
      files: [{ path: "app/page.tsx", content: "export default 1" }],
      tasks: [],
      missing: [],
      spend: noSpend,
      stopped: false,
      outOfCredits: false,
      ms: 1,
    });
    mocks.checkProject.mockResolvedValue({
      diagnostics: [],
      affected: [],
      fixed: [],
      tasks: [],
      ms: 1,
    });
    const finding = {
      source: "browser",
      path: null,
      line: null,
      message: "/ at phone width (390px): the page scrolls sideways.",
    };
    mocks.browse
      .mockResolvedValueOnce({
        ...passedBrowser,
        status: "failed",
        diagnostics: [finding],
        calls: [{ usage: emptyUsage, estimatedUsd: 0.002, generationIds: [] }],
      })
      .mockResolvedValueOnce(passedBrowser);
    mocks.loop.mockResolvedValue({
      output: "Fixed the overflow",
      finished: true,
      outOfCredits: false,
      stopped: false,
      capped: false,
      messages: [],
      usage: emptyUsage,
      calls: [],
      tasks: [],
      toolParts: [],
      reasoning: [],
      reasoningMs: 0,
      written: ["app/page.tsx"],
      searches: [],
      progress: {},
      spentUsd: 0,
      handoff: null,
      modelMs: 1,
      toolMs: 1,
    });
    const step = stepFor(
      results({
        "load-project": {
          model,
          history: [{ role: "USER", content: "A todo app" }],
          prompt: "A todo app",
          balance: 100,
          hasVersion: false,
          files: [],
          repoMap: "",
          designNotes: "",
          routes: [],
        },
        route: {
          intent: "create",
          targets: [],
          preloaded: [],
          spend: noSpend,
          memory: { status: "off", reason: null, block: "", reads: 0, ms: 0 },
          ms: 1,
        },
      }),
    );
    const result = await handler({
      event: { data: { projectId: "p1", userId: "u1", messageId: "m1" } },
      runId: "r1",
      step,
    });
    expect(result.issues).toBe(0);
    expect(mocks.browse).toHaveBeenCalledTimes(2);
    expect(mocks.browse.mock.calls[0][0]).toMatchObject({
      interactions: plan.checks,
    });
    const repair = mocks.loop.mock.calls[0][0];
    expect(repair.stepPrefix).toBe("repair-0");
    const content = repair.messages[0].content;
    const text = JSON.stringify(content);
    expect(text).toContain("scrolls sideways");
    expect(text).toContain('<untrusted source=\\"checks\\">');
    expect(content).toContainEqual(
      expect.objectContaining({
        type: "file",
        data: new URL("vibe-attachment:qa/p1/r1/0-desktop.png"),
      }),
    );
    expect(mocks.debitCredits).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        cost: expect.anything(),
        run: expect.objectContaining({
          timings: expect.objectContaining({ browse: 18000 }),
        }),
      }),
    );
  });
});

describe("helpers", () => {
  test("an edit checks the home page and the pages it changed, a build checks them all", () => {
    const known = ["/", "/about", "/pricing"];
    expect(
      routesToCheck({
        mode: "editor",
        known,
        written: ["components/hero.tsx", "app/pricing/page.tsx"],
        planned: [],
      }),
    ).toEqual(["/", "/pricing"]);
    expect(
      routesToCheck({
        mode: "pipeline",
        known,
        written: ["app/blog/page.tsx"],
        planned: ["/contact"],
      }),
    ).toEqual(["/", "/about", "/pricing", "/blog", "/contact"]);
  });

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

  test("rollbackPlan restores known files, removes new ones and refuses unknown versions", () => {
    expect(
      rollbackPlan({
        roundPaths: ["a.tsx", "new.tsx"],
        preRound: new Map([["a.tsx", "old"]]),
        writtenBefore: [],
        versionFiles: ["a.tsx"],
      }),
    ).toEqual({
      restore: [{ path: "a.tsx", content: "old" }],
      remove: ["new.tsx"],
      restorable: true,
    });
    expect(
      rollbackPlan({
        roundPaths: ["b.tsx"],
        preRound: new Map(),
        writtenBefore: [],
        versionFiles: ["b.tsx"],
      }).restorable,
    ).toBe(false);
    expect(
      rollbackPlan({
        roundPaths: ["c.tsx"],
        preRound: new Map(),
        writtenBefore: ["c.tsx"],
        versionFiles: [],
      }),
    ).toEqual({ restore: [], remove: [], restorable: false });
  });
});
