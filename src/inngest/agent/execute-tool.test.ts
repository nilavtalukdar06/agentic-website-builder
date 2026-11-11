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

function makeCtx(writtenPaths: string[] = []) {
  const sandbox = makeSandbox();
  const publish = vi.fn().mockResolvedValue(undefined);
  return {
    sandbox,
    publish,
    ctx: { sandbox: sandbox as never, publish: publish as never, writtenPaths },
  };
}

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
      "npm install framer-motion",
      expect.objectContaining({ cwd: "/home/user/app" }),
    );
    expect(result.output).toBe("Exit code: 0\nok");
    expect(result.terminal).toEqual({
      command: "npm install framer-motion",
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
      command: "npm install framer-motion",
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
    expect(result.output).toBe("Exit code: 2\nType error");
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
      { kind: "file", verb: "edited", path: "app/page.tsx", lines: 2 },
      { kind: "file", verb: "created", path: "components/hero.tsx", lines: 1 },
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
    expect(JSON.parse(result.output)).toEqual([
      { path: "app/page.tsx", content: "content" },
      { path: "nope.ts", error: "missing" },
    ]);
  });
});
