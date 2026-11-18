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

const { executeTool, MAX_FILES_PER_RUN } = await import("./execute-tool");
const { agentToolNames } = await import("./tools");

const builderToolNames = [...agentToolNames];

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
    progress: { installs?: number };
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
      progress: overrides.progress ?? {},
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
      call("readFiles", {
        files: [{ path: "app/page.tsx" }, { path: "nope.ts" }],
      }),
      ctx,
    );
    expect(JSON.parse(unwrap(result.output))).toEqual([
      { path: "app/page.tsx", content: "content" },
      { path: "nope.ts", error: "missing" },
    ]);
  });
});

describe("no gate before writing", () => {
  test("writes on the first call, without reading AGENTS.md or loading skills", async () => {
    const { ctx, sandbox } = makeCtx();
    const result = await executeTool(
      call("createOrUpdateFiles", {
        files: [{ path: "app/page.tsx", content: "x" }],
      }),
      ctx,
    );
    expect(sandbox.files.write).toHaveBeenCalledOnce();
    expect(result.writtenPaths).toEqual(["app/page.tsx"]);
  });

  test("loadSkill no longer exists", async () => {
    const { ctx } = makeCtx([], { tools: [...builderToolNames, "loadSkill"] });
    const result = await executeTool(
      call("loadSkill", { name: "shadcn" }),
      ctx,
    );
    expect(result.output).toBe("Unknown tool: loadSkill");
  });

  test("skills can be read but not written", async () => {
    const { ctx, sandbox } = makeCtx();
    const read = await executeTool(
      call("readFiles", {
        files: [{ path: ".agents/skills/shadcn/rules/forms.md" }],
      }),
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

describe("editFile", () => {
  const source =
    'export function Hero() {\n  return <h1 className="text-red-500">Hi</h1>;\n}\n';

  test("applies search-and-replace blocks and reports the new contents", async () => {
    const { ctx, sandbox, publish } = makeCtx();
    sandbox.files.read.mockResolvedValue(source);
    sandbox.files.exists.mockResolvedValue(true);
    const result = await executeTool(
      call("editFile", {
        path: "components/hero.tsx",
        edits: [{ search: "text-red-500", replace: "text-blue-500" }],
      }),
      ctx,
    );
    const expected = source.replace("text-red-500", "text-blue-500");
    expect(sandbox.files.write).toHaveBeenCalledWith(
      "/home/user/app/components/hero.tsx",
      expected,
    );
    expect(result.writtenPaths).toEqual(["components/hero.tsx"]);
    expect(result.edited).toEqual([
      { path: "components/hero.tsx", content: expected },
    ]);
    expect(result.tasks).toEqual([
      { kind: "file", verb: "edited", path: "components/hero.tsx", lines: 3 },
    ]);
    expect(publish).toHaveBeenCalledWith("task", result.tasks[0]);
  });

  test("writes nothing when a block doesn't match, and shows the closest lines", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.files.read.mockResolvedValue(source);
    const result = await executeTool(
      call("editFile", {
        path: "components/hero.tsx",
        edits: [
          { search: "text-red-500", replace: "text-blue-500" },
          { search: '<h1 className="missing">', replace: "x" },
        ],
      }),
      ctx,
    );
    expect(sandbox.files.write).not.toHaveBeenCalled();
    expect(result.output).toContain("Not edited components/hero.tsx");
    expect(result.output).toContain("2| ");
    expect(result.writtenPaths).toEqual([]);
  });

  test("points to createOrUpdateFiles for a file that doesn't exist", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.files.read.mockRejectedValue(new Error("not found"));
    const result = await executeTool(
      call("editFile", {
        path: "components/new.tsx",
        edits: [{ search: "a", replace: "b" }],
      }),
      ctx,
    );
    expect(result.output).toContain("Create it with createOrUpdateFiles");
    expect(sandbox.files.write).not.toHaveBeenCalled();
  });

  test("runs the result through the secret scan", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.files.read.mockResolvedValue('const key = "";\n');
    const result = await executeTool(
      call("editFile", {
        path: "lib/ai.ts",
        edits: [
          {
            search: 'const key = "";',
            replace: `const key = "sk-proj-${"VerySecretValue123".repeat(2)}";`,
          },
        ],
      }),
      ctx,
    );
    expect(sandbox.files.write).not.toHaveBeenCalled();
    expect(result.output).toContain("looks like a secret");
  });

  test("refuses read-only paths", async () => {
    const { ctx, sandbox } = makeCtx();
    const result = await executeTool(
      call("editFile", {
        path: ".agents/skills/shadcn/SKILL.md",
        edits: [{ search: "a", replace: "b" }],
      }),
      ctx,
    );
    expect(result.output).toMatch(/^Not edited: Path is read-only/);
    expect(sandbox.files.read).not.toHaveBeenCalled();
  });
});

describe("reading and searching", () => {
  test("reads a line range", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.files.read.mockResolvedValue("a\nb\nc\nd\ne");
    const result = await executeTool(
      call("readFiles", {
        files: [{ path: "app/page.tsx", startLine: 2, endLine: 3 }],
      }),
      ctx,
    );
    expect(JSON.parse(unwrap(result.output))).toEqual([
      { path: "app/page.tsx", range: "(lines 2-3 of 5)", content: "b\nc" },
    ]);
  });

  test("lists files, skipping ignored folders and env files, filtered by a glob", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.commands.run.mockResolvedValue({
      stdout:
        "./app/page.tsx\n./app/about/page.tsx\n./components/hero.tsx\n./.env.local\n",
      stderr: "",
      exitCode: 0,
    });
    const result = await executeTool(
      call("listFiles", { pattern: "app/**/page.tsx" }),
      ctx,
    );
    expect(unwrap(result.output)).toBe("app/about/page.tsx\napp/page.tsx");
    expect(sandbox.commands.run.mock.calls[0][0]).toContain(
      "-name node_modules",
    );
  });

  test("searches with a quoted pattern and reports no matches plainly", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.commands.run.mockRejectedValue(new FakeExitError("", "", 1));
    const result = await executeTool(
      call("searchCode", { pattern: "it's; rm -rf /", path: "components" }),
      ctx,
    );
    const command = sandbox.commands.run.mock.calls[0][0] as string;
    expect(command).toContain(`-e 'it'\\''s; rm -rf /'`);
    expect(command).toContain("-- 'components'");
    expect(unwrap(result.output)).toBe("No matches.");
  });

  test("returns matching lines without the ./ prefix", async () => {
    const { ctx, sandbox } = makeCtx();
    sandbox.commands.run.mockResolvedValue({
      stdout: "./components/hero.tsx:4:  <Button>Start</Button>\n",
      stderr: "",
      exitCode: 0,
    });
    const result = await executeTool(
      call("searchCode", { pattern: "Button" }),
      ctx,
    );
    expect(unwrap(result.output)).toBe(
      "components/hero.tsx:4:  <Button>Start</Button>",
    );
  });

  test("refuses to search outside the project", async () => {
    const { ctx, sandbox } = makeCtx();
    const result = await executeTool(
      call("searchCode", { pattern: "x", path: "../../etc" }),
      ctx,
    );
    expect(result.output).toMatch(/^Not searched/);
    expect(sandbox.commands.run).not.toHaveBeenCalled();
  });
});

describe("tool set", () => {
  test("rejects a tool the builder doesn't have", async () => {
    const { ctx, sandbox } = makeCtx([], {
      tools: ["readFiles", "editFile"],
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
      call("readFiles", { files: [{ path: "notes.txt" }] }),
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
      { ...ctx, progress: { installs: 20 } },
    );
    expect(capped.output).toMatch(/limit is 20/);
  });
});

describe("activity rows", () => {
  test("a read lists the files it read", async () => {
    const { ctx, sandbox, publish } = makeCtx();
    sandbox.files.read
      .mockResolvedValueOnce("content")
      .mockRejectedValueOnce(new Error("missing"));
    const result = await executeTool(
      call("readFiles", {
        files: [{ path: "app/page.tsx" }, { path: "nope.ts" }],
      }),
      ctx,
    );
    const task = { kind: "read", paths: ["app/page.tsx"] };
    expect(result.tasks).toEqual([task]);
    expect(publish).toHaveBeenCalledWith("task", task);
  });

  test("an rm command records deleted files", async () => {
    const { ctx, publish } = makeCtx();
    const result = await executeTool(
      call("terminal", { command: "rm components/old.tsx" }),
      ctx,
    );
    const task = {
      kind: "file",
      verb: "deleted",
      path: "components/old.tsx",
      lines: 0,
    };
    expect(result.tasks).toContainEqual(task);
    expect(publish).toHaveBeenCalledWith("task", task);
  });
});
