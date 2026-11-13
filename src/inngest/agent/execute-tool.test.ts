// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

class FakeExitError extends Error {
  constructor(
    public stdout: string,
    public stderr: string,
    public exitCode: number,
  ) {
    super("exit");
  }
}

vi.mock("e2b", () => ({ CommandExitError: FakeExitError }));

const { emptyProgress, executeTool, MAX_FILES_PER_RUN } =
  await import("./execute-tool");

const builderToolNames = [
  "terminal",
  "createOrUpdateFiles",
  "readFiles",
  "loadSkill",
];

const ready = { readAgentsMd: true, loadedSkills: ["shadcn"] };

function makeSandbox() {
  return {
    commands: {
      run: vi.fn().mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 }),
    },
    files: {
      exists: vi.fn().mockResolvedValue(false),
      write: vi.fn().mockResolvedValue({}),
      read: vi.fn().mockResolvedValue("export {}"),
    },
  };
}

function makeCtx(
  writtenPaths: string[] = [],
  overrides: Partial<{
    tools: string[];
    progress: { readAgentsMd: boolean; loadedSkills: string[] };
    installed: string[];
  }> = {},
) {
  const sandbox = makeSandbox();
  const publish = vi.fn().mockResolvedValue(undefined);
  return {
    sandbox,
    publish,
    ctx: {
      sandbox: sandbox as never,
      publish: publish as never,
      writtenPaths,
      tools: overrides.tools ?? builderToolNames,
      skills: {
        allowed: ["shadcn", "next-best-practices"],
        installed: overrides.installed ?? ["shadcn", "next-best-practices"],
      },
      progress: overrides.progress ?? ready,
    },
  };
}

const unwrap = (output: string) =>
  output.replace(/^<untrusted[^>]*>\n/, "").replace(/\n<\/untrusted>$/, "");

const call = (toolName: string, input: unknown) => ({
  toolCallId: "c1",
  toolName,
  input,
});

describe("executeTool", () => {
  test("rejects unknown tools", async () => {
    const { ctx } = makeCtx();
    await expect(executeTool(call("nope", {}), ctx)).resolves.toMatchObject({
      output: "Unknown tool: nope",
    });
  });

  test("returns validation errors to the model instead of throwing", async () => {
    const { ctx } = makeCtx();
    const result = await executeTool(call("terminal", {}), ctx);
    expect(result.output).toMatch(/^Invalid input/);
  });

  test("runs commands in the app folder and records installs", async () => {
    const { ctx, sandbox, publish } = makeCtx();
    const result = await executeTool(
      call("terminal", { command: "npm install framer-motion" }),
      ctx,
    );
    expect(sandbox.commands.run).toHaveBeenCalledWith(
      "npm install framer-motion --ignore-scripts",
      expect.objectContaining({ cwd: "/home/user/app" }),
    );
    expect(result.output).toBe(
      'Exit code: 0\n<untrusted source="terminal">\nok\n</untrusted>',
    );
    expect(result.progress.installs).toBe(1);
    expect(result.terminal).toEqual({
      command: "npm install framer-motion --ignore-scripts",
      output: "ok",
      exitCode: 0,
    });
    expect(result.tasks).toEqual([
      { kind: "install", packages: ["framer-motion"] },
    ]);
    expect(publish).toHaveBeenCalledWith("tool", {
      phase: "call",
      callId: "c1",
      name: "terminal",
      command: "npm install framer-motion --ignore-scripts",
    });
  });

  test("returns the output of failing commands", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.commands.run.mockRejectedValue(
      new FakeExitError("", "Type error", 2),
    );
    const result = await executeTool(
      call("terminal", { command: "npx tsc --noEmit" }),
      ctx,
    );
    expect(result.output).toBe(
      'Exit code: 2\n<untrusted source="terminal">\nType error\n</untrusted>',
    );
    expect(result.tasks).toEqual([]);
  });

  test("blocks dangerous commands without running them", async () => {
    const { ctx, sandbox } = makeCtx();
    const result = await executeTool(
      call("terminal", { command: "npm run dev" }),
      ctx,
    );
    expect(sandbox.commands.run).not.toHaveBeenCalled();
    expect(result.output).toMatch(/^Command blocked/);
  });

  test("writes files, reporting created and edited ones", async () => {
    const { ctx, sandbox, publish } = makeCtx();
    sandbox.files.exists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const result = await executeTool(
      call("createOrUpdateFiles", {
        files: [
          { path: "app/page.tsx", content: "a\nb\n" },
          { path: "components/hero.tsx", content: "x" },
        ],
      }),
      ctx,
    );
    expect(sandbox.files.write).toHaveBeenCalledWith(
      "/home/user/app/app/page.tsx",
      "a\nb\n",
    );
    expect(result.writtenPaths).toEqual([
      "app/page.tsx",
      "components/hero.tsx",
    ]);
    expect(result.tasks).toEqual([
      {
        kind: "file",
        verb: "edited",
        path: "app/page.tsx",
        lines: 2,
      },
      {
        kind: "file",
        verb: "created",
        path: "components/hero.tsx",
        lines: 1,
      },
    ]);
    expect(result.output).toBe(
      "Updated app/page.tsx\nCreated components/hero.tsx",
    );
    expect(publish).toHaveBeenCalledWith("file", {
      phase: "written",
      path: "app/page.tsx",
      verb: "edited",
      lines: 2,
    });
  });

  test("skips unsafe paths", async () => {
    const { ctx, sandbox } = makeCtx();
    const result = await executeTool(
      call("createOrUpdateFiles", {
        files: [{ path: "../../etc/passwd", content: "x" }],
      }),
      ctx,
    );
    expect(sandbox.files.write).not.toHaveBeenCalled();
    expect(result.output).toMatch(/^Skipped/);
  });

  test("stops writing new files after the per-run limit", async () => {
    const written = Array.from(
      { length: MAX_FILES_PER_RUN },
      (_, i) => `f${i}.ts`,
    );
    const { ctx, sandbox } = makeCtx(written);
    const result = await executeTool(
      call("createOrUpdateFiles", {
        files: [
          { path: "f0.ts", content: "ok" },
          { path: "new.ts", content: "no" },
        ],
      }),
      ctx,
    );
    expect(sandbox.files.write).toHaveBeenCalledOnce();
    expect(result.writtenPaths).toEqual(["f0.ts"]);
  });

  test("reads files and reports errors per file", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.files.read
      .mockResolvedValueOnce("content")
      .mockRejectedValueOnce(new Error("missing"));
    const result = await executeTool(
      call("readFiles", { paths: ["app/page.tsx", "nope.ts"] }),
      ctx,
    );
    expect(JSON.parse(unwrap(result.output))).toEqual([
      { path: "app/page.tsx", content: "content" },
      { path: "nope.ts", error: "missing" },
    ]);
  });
});

describe("skills before writing", () => {
  const write = call("createOrUpdateFiles", {
    files: [{ path: "app/page.tsx", content: "x" }],
  });

  test("rejects a write before AGENTS.md is read", async () => {
    const { ctx, sandbox } = makeCtx([], {
      progress: { readAgentsMd: false, loadedSkills: ["shadcn"] },
    });
    const result = await executeTool(write, ctx);
    expect(sandbox.files.write).not.toHaveBeenCalled();
    expect(result.output).toMatch(/^Not written/);
    expect(result.output).toContain("read AGENTS.md");
    expect(result.output).not.toContain("loadSkill");
  });

  test("rejects a write before a skill is loaded, even a small one", async () => {
    const { ctx, sandbox } = makeCtx([], {
      progress: { readAgentsMd: true, loadedSkills: [] },
    });
    const result = await executeTool(write, ctx);
    expect(sandbox.files.write).not.toHaveBeenCalled();
    expect(result.output).toContain(
      "load the skills that apply with loadSkill (shadcn, next-best-practices)",
    );
  });

  test("allows the write after AGENTS.md and a skill", async () => {
    const { ctx, sandbox } = makeCtx([], { progress: emptyProgress });
    const read = await executeTool(
      call("readFiles", { paths: ["AGENTS.md"] }),
      ctx,
    );
    expect(read.progress.readAgentsMd).toBe(true);
    sandbox.files.read.mockResolvedValueOnce(
      "---\nname: shadcn\ndescription: UI\n---\n# shadcn body",
    );
    sandbox.commands.run.mockResolvedValueOnce({
      stdout: ".agents/skills/shadcn/rules/forms.md\n",
      stderr: "",
      exitCode: 0,
    });
    const loaded = await executeTool(call("loadSkill", { name: "shadcn" }), {
      ...ctx,
      progress: read.progress,
    });
    expect(loaded.output).toContain("# Skill: shadcn\n\n# shadcn body");
    expect(loaded.output).toContain("- .agents/skills/shadcn/rules/forms.md");
    expect(loaded.output).not.toContain("description: UI");
    expect(loaded.progress).toEqual({
      readAgentsMd: true,
      loadedSkills: ["shadcn"],
    });
    const result = await executeTool(write, {
      ...ctx,
      progress: loaded.progress,
    });
    expect(sandbox.files.write).toHaveBeenCalledOnce();
    expect(result.writtenPaths).toEqual(["app/page.tsx"]);
  });

  test("does not require a skill when none are installed", async () => {
    const { ctx, sandbox } = makeCtx([], {
      installed: [],
      progress: { readAgentsMd: true, loadedSkills: [] },
    });
    await executeTool(write, ctx);
    expect(sandbox.files.write).toHaveBeenCalledOnce();
  });

  test("loadSkill rejects skills outside the agent's allowlist", async () => {
    const { ctx, sandbox } = makeCtx();
    const result = await executeTool(
      call("loadSkill", { name: "frontend-design" }),
      ctx,
    );
    expect(sandbox.files.read).not.toHaveBeenCalled();
    expect(result.output).toMatch(/not available to you/);
    expect(result.progress).toBe(ctx.progress);
  });

  test("skills can be read but not written", async () => {
    const { ctx, sandbox } = makeCtx();
    const read = await executeTool(
      call("readFiles", { paths: [".agents/skills/shadcn/rules/forms.md"] }),
      ctx,
    );
    expect(JSON.parse(unwrap(read.output))[0]).toHaveProperty("content");
    const result = await executeTool(
      call("createOrUpdateFiles", {
        files: [{ path: ".agents/skills/shadcn/SKILL.md", content: "x" }],
      }),
      ctx,
    );
    expect(sandbox.files.write).not.toHaveBeenCalled();
    expect(result.output).toMatch(/read-only/);
  });
});

describe("tool set", () => {
  test("rejects a tool the builder doesn't have", async () => {
    const { ctx, sandbox } = makeCtx([], {
      tools: ["readFiles", "loadSkill"],
    });
    const result = await executeTool(call("terminal", { command: "ls" }), ctx);
    expect(sandbox.commands.run).not.toHaveBeenCalled();
    expect(result.output).toBe("Unknown tool: terminal");
  });

  test("askUser no longer exists", async () => {
    const { ctx } = makeCtx([], { tools: [...builderToolNames, "askUser"] });
    const result = await executeTool(
      call("askUser", { kind: "text", question: "Name?" }),
      ctx,
    );
    expect(result.output).toBe("Unknown tool: askUser");
  });
});

describe("guardrails in the executor", () => {
  const secret = `sk-proj-${"VerySecretValue123".repeat(2)}`;

  test("rejects writes that contain a key pattern or malware", async () => {
    const { ctx, sandbox } = makeCtx();
    const result = await executeTool(
      call("createOrUpdateFiles", {
        files: [
          { path: "lib/ai.ts", content: `const key = "${secret}";` },
          {
            path: "lib/db.ts",
            content:
              'const url = "postgresql://owner:npg_RealPass9876@ep-x-1.us-east-2.aws.neon.tech/db";',
          },
          { path: "lib/x.ts", content: "eval(atob('YWxlcnQoMSk='))" },
          { path: "app/page.tsx", content: "export default function P() {}" },
        ],
      }),
      ctx,
    );
    expect(result.output).toContain(
      "Skipped lib/ai.ts: it contains what looks like a secret",
    );
    expect(result.output).toContain(
      "Skipped lib/db.ts: it contains what looks like a secret",
    );
    expect(result.output).toContain(
      "Skipped lib/x.ts: it runs remote or encoded code",
    );
    expect(result.writtenPaths).toEqual(["app/page.tsx"]);
    expect(result.guard).toMatchObject({
      verdict: "block",
      categories: ["malware"],
    });
    expect(sandbox.files.write).toHaveBeenCalledTimes(1);
  });

  test("redacts key patterns from command output and the live stream", async () => {
    const { ctx, sandbox, publish } = makeCtx();
    sandbox.commands.run.mockImplementation(async (_cmd, options) => {
      await options.onStdout(`token=${secret}`);
      return {
        stdout: `token=${secret}`,
        stderr: "",
        exitCode: 0,
      };
    });
    const result = await executeTool(
      call("terminal", { command: "node scripts/check.mjs" }),
      ctx,
    );
    const everything = JSON.stringify([result, publish.mock.calls]);
    expect(everything).not.toContain(secret);
    expect(result.output).toContain("[secret removed]");
  });

  test("redacts key patterns from file reads", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.files.read.mockResolvedValue(`KEY=${secret}`);
    const result = await executeTool(
      call("readFiles", { paths: ["notes.txt"] }),
      ctx,
    );
    expect(result.output).not.toContain(secret);
  });

  function npqSandbox(report: unknown) {
    const made = makeCtx();
    made.sandbox.commands.run.mockImplementation(async (command: string) => {
      if (command.includes("npq")) {
        throw new FakeExitError(JSON.stringify(report), "", 1);
      }
      return { stdout: "added", stderr: "", exitCode: 0 };
    });
    return made;
  }

  test("an unknown package with npq findings is refused", async () => {
    const { ctx, sandbox } = npqSandbox({
      status: "findings",
      summary: { errors: 1, warnings: 0 },
      packages: [
        {
          requested: "left-pad@*",
          findings: [
            {
              severity: "error",
              marshall: "deprecation",
              message: "Deprecated",
            },
          ],
        },
      ],
    });
    const result = await executeTool(
      call("terminal", { command: "npm install left-pad" }),
      ctx,
    );
    expect(result.output).toMatch(/^Command blocked: the package check/);
    expect(result.output).toContain("left-pad: error (deprecation) Deprecated");
    expect(sandbox.commands.run).toHaveBeenCalledTimes(1);
  });

  test("an unknown package with a clean npq report installs without scripts", async () => {
    const { ctx, sandbox } = npqSandbox({
      status: "ok",
      summary: { errors: 0, warnings: 0 },
      packages: [{ requested: "left-pad@*", findings: [] }],
    });
    await executeTool(
      call("terminal", { command: "npm install left-pad" }),
      ctx,
    );
    expect(sandbox.commands.run).toHaveBeenLastCalledWith(
      "npm install left-pad --ignore-scripts",
      expect.anything(),
    );
  });

  test("an unknown package is refused when npq can't run", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.commands.run.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const result = await executeTool(
      call("terminal", { command: "npm install left-pad" }),
      ctx,
    );
    expect(result.output).toMatch(/^Command blocked: the package check/);
    expect(sandbox.commands.run).toHaveBeenCalledTimes(1);
  });

  test("after a review verdict only vetted packages install", async () => {
    const { ctx, sandbox } = makeCtx();
    const result = await executeTool(
      call("terminal", { command: "npm install left-pad" }),
      { ...ctx, restricted: true },
    );
    expect(result.output).toMatch(/only vetted packages/);
    expect(sandbox.commands.run).not.toHaveBeenCalled();
  });

  test("destructive database commands are blocked", async () => {
    const { ctx, sandbox } = makeCtx();
    const result = await executeTool(
      call("terminal", { command: "npx prisma migrate reset --force" }),
      ctx,
    );
    expect(result.output).toMatch(
      /^Command blocked: it would reset the database/,
    );
    expect(sandbox.commands.run).not.toHaveBeenCalled();
  });

  test("deleting more than 10 files at once is blocked", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.commands.run.mockResolvedValueOnce({
      stdout: "14\n",
      stderr: "",
      exitCode: 0,
    });
    const result = await executeTool(
      call("terminal", { command: "rm -r components/sections" }),
      ctx,
    );
    expect(result.output).toMatch(/^Command blocked: it removes 14 files/);
    expect(sandbox.commands.run).toHaveBeenCalledTimes(1);
  });

  test("refuses git dependencies and caps installs per run", async () => {
    const { ctx } = makeCtx();
    const git = await executeTool(
      call("terminal", { command: "npm install github:evil/pkg" }),
      ctx,
    );
    expect(git.output).toMatch(/^Command blocked: .*npm registry/);
    const capped = await executeTool(
      call("terminal", { command: "npm install zod" }),
      { ...ctx, progress: { ...ready, installs: 20 } },
    );
    expect(capped.output).toMatch(/limit is 20/);
  });
});
