// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generatePlainText: vi.fn(),
  generateStructured: vi.fn(),
  runToolBatch: vi.fn(),
  connectOrRecover: vi.fn(),
  publish: vi.fn(),
  versionFind: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("e2b", () => ({
  CommandExitError: class extends Error {
    stdout = "";
    stderr = "";
  },
}));
vi.mock("./model", () => ({
  generatePlainText: mocks.generatePlainText,
  generateStructured: mocks.generateStructured,
}));
vi.mock("./runtime", () => ({
  runToolBatch: mocks.runToolBatch,
  replayOf: () => [],
}));
vi.mock("@/server/sandbox/recover", () => ({
  connectOrRecover: mocks.connectOrRecover,
  recoverSandbox: vi.fn(),
}));
vi.mock("@/server/sandbox/sandbox", () => ({ PREVIEW_PORT: 3000 }));
vi.mock("@/server/db", () => ({
  db: { version: { findFirst: mocks.versionFind } },
}));
vi.mock("../publisher", () => ({ createPublisher: () => mocks.publish }));
vi.mock("@/server/memory", () => ({
  memoryAccess: vi.fn(async () => ({ enabled: false, reason: "off in tests" })),
  trackMemoryUse: vi.fn(),
}));

const { checkProject, generateFromPlan, makePlan, routeRequest } =
  await import("./pipeline");
const { createRunContext } = await import("./loop");
const { NoObjectGeneratedError } = await import("ai");

const model = {
  id: "moonshotai/kimi-k2.7-code",
  name: "Kimi",
  provider: "moonshotai",
  providerLabel: "Moonshot AI",
  vision: true,
  pricing: null,
};

const usage = {
  inputTokens: 10,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 20,
};

const step = {
  run: vi.fn((_id: string, fn: () => unknown) => fn()),
};

function sandbox(files: Record<string, string> = {}) {
  return {
    files: {
      read: vi.fn(async (path: string) => {
        const key = path.replace("/home/user/app/", "");
        if (key in files) return files[key];
        throw new Error("missing");
      }),
      write: vi.fn(async (path: string, content: string) => {
        files[path.replace("/home/user/app/", "")] = content;
      }),
      remove: vi.fn(),
    },
    commands: { run: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publish.mockResolvedValue(undefined);
  mocks.runToolBatch.mockImplementation(
    async ({ calls }: { calls: { toolName: string; input: unknown }[] }) => ({
      outcomes: calls.map((call) => {
        const files =
          call.toolName === "createOrUpdateFiles"
            ? (call.input as { files: { path: string }[] }).files
            : [];
        return {
          output: "ok",
          tasks: files.map((file) => ({
            kind: "file",
            verb: "created",
            path: file.path,
            lines: 1,
          })),
          writtenPaths: files.map((file) => file.path),
          terminal: null,
          progress: {},
        };
      }),
      sandbox: null,
    }),
  );
});

describe("routeRequest", () => {
  test("uses the heuristics without a model call when they're sure", async () => {
    const result = await routeRequest({
      step: step as never,
      projectId: "p1",
      userId: "u1",
      model,
      prompt: "Make the hero button blue",
      hasVersion: true,
      repoMap: "",
      paths: ["components/hero.tsx"],
    });
    expect(result.intent).toBe("edit");
    expect(mocks.generateStructured).not.toHaveBeenCalled();
    expect(mocks.versionFind).toHaveBeenCalled();
  });

  test("asks the user's chosen model when unsure and keeps only known target paths", async () => {
    mocks.generateStructured.mockResolvedValue({
      output: {
        intent: "edit",
        targetFiles: ["components/footer.tsx", "components/invented.tsx"],
      },
      usage,
      estimatedUsd: 0.0001,
      generationIds: ["g1"],
    });
    mocks.versionFind.mockResolvedValue({
      files: { "components/footer.tsx": "export function Footer() {}" },
    });
    const result = await routeRequest({
      step: step as never,
      projectId: "p1",
      userId: "u1",
      model,
      prompt: "hmm the bottom bit",
      hasVersion: true,
      repoMap: "- components/footer.tsx",
      paths: ["components/footer.tsx", "app/page.tsx"],
    });
    expect(mocks.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ model }),
    );
    expect(result.targets).toEqual(["components/footer.tsx"]);
    expect(result.preloaded).toEqual([
      {
        path: "components/footer.tsx",
        content: "export function Footer() {}",
      },
    ]);
    expect(result.spend.calls).toEqual([
      expect.objectContaining({ agent: "router", model: model.id }),
    ]);
  });

  test("a new project is routed without any lookups", async () => {
    const result = await routeRequest({
      step: step as never,
      projectId: "p1",
      userId: "u1",
      model,
      prompt: "A todo app",
      hasVersion: false,
      repoMap: "",
      paths: [],
    });
    expect(result).toMatchObject({ intent: "create", preloaded: [] });
    expect(mocks.versionFind).not.toHaveBeenCalled();
  });
});

const plan = {
  projectName: "Night Owl",
  title: "Night Owl Coffee",
  summary: "A café site.",
  design: {
    preset: "sunset" as const,
    headingFont: "Fraunces" as const,
    bodyFont: "Inter" as const,
    theme: "system" as const,
    direction: "Warm.",
  },
  pages: [{ route: "/", title: "Home", sections: ["Hero", "Menu"] }],
  blocks: ["faq"],
  files: [
    { path: "lib/data.ts", purpose: "menu items", dependsOn: [] },
    { path: "app/layout.tsx", purpose: "layout", dependsOn: [] },
    {
      path: "app/page.tsx",
      purpose: "home",
      dependsOn: ["lib/data.ts"],
    },
  ],
  packages: [],
  checks: [],
};

describe("makePlan", () => {
  test("validates the plan and announces it", async () => {
    mocks.generateStructured.mockResolvedValue({
      output: { ...plan, blocks: ["faq", "nope"] },
      usage,
      estimatedUsd: 0.01,
      generationIds: [],
    });
    const result = await makePlan({
      step: step as never,
      projectId: "p1",
      model,
      messages: [{ role: "user", content: "A café site" }],
    });
    expect(result.plan?.blocks).toEqual(["faq"]);
    expect(result.warnings).toEqual(["dropped unknown block nope"]);
    expect(result.spend.calls[0]).toMatchObject({ agent: "planner" });
    expect(mocks.publish).toHaveBeenCalledWith("task", {
      kind: "note",
      label: "Planned Night Owl Coffee: 1 page, 3 files, 1 ready-made blocks",
    });
  });

  test("returns no plan when the model can't produce one, so the run falls back", async () => {
    mocks.generateStructured.mockRejectedValue(
      new NoObjectGeneratedError({
        message: "no object",
        text: "",
        response: { id: "r", timestamp: new Date(), modelId: "m" },
        usage: {} as never,
        finishReason: "stop",
      }),
    );
    const result = await makePlan({
      step: step as never,
      projectId: "p1",
      model,
      messages: [{ role: "user", content: "A café site" }],
    });
    expect(result.plan).toBeNull();
  });

  test("a stop during the planning call ends it as stopped, not as a failed plan", async () => {
    vi.useFakeTimers();
    try {
      mocks.generateStructured.mockImplementation(
        ({ abortSignal }: { abortSignal?: AbortSignal }) =>
          new Promise((_, reject) =>
            abortSignal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          ),
      );
      const pending = makePlan({
        step: step as never,
        projectId: "p1",
        model,
        messages: [{ role: "user", content: "A café site" }],
        shouldStop: async () => true,
      });
      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toMatchObject({
        plan: null,
        stopped: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("generateFromPlan", () => {
  test("themes the site, copies blocks, then writes waves in parallel, retrying a missing file", async () => {
    const box = sandbox({
      "app/globals.css": ":root {\n  --primary: oklch(0 0 0);\n}\n",
      "app/layout.tsx": "export default function Layout() {}",
    });
    mocks.connectOrRecover.mockResolvedValue({ sandbox: box, recovered: null });
    const calls: string[] = [];
    mocks.generatePlainText.mockImplementation(
      async ({ messages }: { messages: { content: string }[] }) => {
        const brief = messages[0].content;
        calls.push(brief);
        const mine = brief.slice(brief.indexOf("## Your files"));
        let text = "";
        if (mine.includes("- lib/data.ts")) {
          text += '<file path="lib/data.ts">export const menu = [];</file>';
        }
        if (mine.includes("- app/page.tsx")) {
          text +=
            '<file path="app/page.tsx">import { menu } from "@/lib/data";</file>';
        }
        if (mine.includes("- app/layout.tsx") && calls.length === 2) {
          text +=
            '<file path="app/layout.tsx">export default function Layout() {}</file>';
        }
        return {
          text,
          finishReason: "stop",
          usage,
          estimatedUsd: 0.002,
          generationIds: [],
        };
      },
    );
    const run = createRunContext({ runId: "r1", sandboxId: "s1" });
    const result = await generateFromPlan({
      step: step as never,
      projectId: "p1",
      run,
      model,
      plan,
      request: "A café site",
      designNotes: "",
      budget: { balance: 1000, spentUsd: 0, searches: 0 },
      shouldStop: async () => false,
    });

    expect(step.run.mock.calls.map(([id]) => id)).toEqual([
      "gen-foundation",
      "gen-0-0",
      "gen-1-0",
    ]);
    const paths = result.files.map((file) => file.path).sort();
    expect(paths).toEqual([
      "app/globals.css",
      "app/layout.tsx",
      "app/page.tsx",
      "components/blocks/faq.tsx",
      "components/blocks/section-heading.tsx",
      "lib/data.ts",
    ]);
    expect(run.pendingWrites.get("app/globals.css")).toContain(
      "--primary: oklch(0.62 0.17 45)",
    );
    expect(result.missing).toEqual([]);
    expect(mocks.generatePlainText).toHaveBeenCalledTimes(3);
    const pageBrief = calls.find((brief) =>
      brief.slice(brief.indexOf("## Your files")).includes("- app/page.tsx"),
    );
    expect(pageBrief).toContain(
      '<file path="lib/data.ts">\nexport const menu = [];\n</file>',
    );
    expect(calls[0]).toContain(
      "## Current contents of files you are rewriting",
    );
    expect(result.spend.calls).toHaveLength(3);
    expect(result.spend.calls[0]).toMatchObject({ agent: "generator" });
  });

  test("stops between waves when the user asks", async () => {
    mocks.connectOrRecover.mockResolvedValue({
      sandbox: sandbox({}),
      recovered: null,
    });
    const result = await generateFromPlan({
      step: step as never,
      projectId: "p1",
      run: createRunContext({ runId: "r1", sandboxId: "s1" }),
      model,
      plan,
      request: "A café site",
      designNotes: "",
      budget: { balance: 1000, spentUsd: 0, searches: 0 },
      shouldStop: async () => true,
    });
    expect(result.stopped).toBe(true);
    expect(mocks.generatePlainText).not.toHaveBeenCalled();
  });

  test("aborts a writer that is mid-call when the user stops", async () => {
    vi.useFakeTimers();
    try {
      mocks.connectOrRecover.mockResolvedValue({
        sandbox: sandbox({}),
        recovered: null,
      });
      let aborted = 0;
      mocks.generatePlainText.mockImplementation(
        ({ abortSignal }: { abortSignal?: AbortSignal }) =>
          new Promise((_, reject) =>
            abortSignal?.addEventListener("abort", () => {
              aborted++;
              reject(new Error("aborted"));
            }),
          ),
      );
      let requested = false;
      const pending = generateFromPlan({
        step: step as never,
        projectId: "p1",
        run: createRunContext({ runId: "r1", sandboxId: "s1" }),
        model,
        plan,
        request: "A café site",
        designNotes: "",
        budget: { balance: 1000, spentUsd: 0, searches: 0 },
        shouldStop: async () => requested,
      });
      await vi.advanceTimersByTimeAsync(4000);
      expect(aborted).toBe(0);
      requested = true;
      await vi.advanceTimersByTimeAsync(2000);
      const result = await pending;
      expect(aborted).toBeGreaterThan(0);
      expect(result.stopped).toBe(true);
      expect(result.spend.calls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("checkProject", () => {
  test("adds missing use client directives, then reports type errors and failing pages", async () => {
    const files: Record<string, string> = {
      "components/counter.tsx":
        "export function Counter() { const [n] = useState(0); return n; }",
    };
    const box = sandbox(files);
    box.commands.run.mockImplementation(async (command: string) => {
      if (command.includes("tsc")) {
        return {
          stdout:
            "components/counter.tsx(1,40): error TS2304: Cannot find name 'useState'.",
          stderr: "",
        };
      }
      if (command.includes("curl")) {
        return { stdout: "500\n<h1>Build Error</h1>", stderr: "" };
      }
      return { stdout: "[]", stderr: "" };
    });
    mocks.connectOrRecover.mockResolvedValue({ sandbox: box, recovered: null });
    const run = createRunContext({ runId: "r1", sandboxId: "s1" });
    const result = await checkProject({
      step: step as never,
      stepId: "verify-0",
      projectId: "p1",
      run,
      routes: ["/", "/blog/[slug]"],
      changed: ["components/counter.tsx"],
    });
    expect(box.files.write).toHaveBeenCalledWith(
      "/home/user/app/components/counter.tsx",
      expect.stringMatching(/^"use client";/),
    );
    expect(run.pendingWrites.get("components/counter.tsx")).toMatch(
      /^"use client";/,
    );
    expect(result.diagnostics.map((item) => item.source)).toEqual([
      "tsc",
      "route",
    ]);
    const curls = box.commands.run.mock.calls.filter(([command]) =>
      String(command).includes("curl"),
    );
    expect(curls).toHaveLength(1);
    expect(result.affected.map((file) => file.path)).toEqual([
      "components/counter.tsx",
    ]);
    expect(mocks.publish).toHaveBeenCalledWith("task", {
      kind: "note",
      label: "Checks found 2 problems",
    });
  });
});
