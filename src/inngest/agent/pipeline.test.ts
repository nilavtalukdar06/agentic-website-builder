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
vi.mock("@/server/db", () => ({
  db: { version: { findFirst: mocks.versionFind } },
}));
vi.mock("../publisher", () => ({ createPublisher: () => mocks.publish }));
vi.mock("@/server/memory", () => ({
  memoryAccess: vi.fn(async () => ({ enabled: false, reason: "off in tests" })),
  trackMemoryUse: vi.fn(),
}));

const { checkProject, routeRequest } = await import("./pipeline");
const { createRunContext } = await import("./loop");

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

describe("checkProject", () => {
  test("adds missing use client directives, then reports type errors and failing pages with a snapshot", async () => {
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
      if (command.includes("-name 'page.*'")) {
        return {
          stdout: "app/page.tsx\napp/blog/[slug]/page.tsx\n",
          stderr: "",
        };
      }
      if (command.startsWith("find app components")) {
        return { stdout: "components/counter.tsx\n", stderr: "" };
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
      changed: ["components/counter.tsx"],
      snapshot: true,
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
    expect(result.routes).toEqual(["/"]);
    expect(Object.keys(result.files ?? {})).toEqual(["components/counter.tsx"]);
    expect(result.files?.["components/counter.tsx"]).toMatch(/^"use client";/);
    expect(mocks.publish).toHaveBeenCalledWith("task", {
      kind: "note",
      label: "Checks found 2 problems",
    });
  });
});
