// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("e2b", () => ({
  CommandExitError: class CommandExitError extends Error {
    exitCode: number;
    constructor(exitCode: number) {
      super("exit");
      this.exitCode = exitCode;
    }
  },
}));

const { CommandExitError } = await import("e2b");
const {
  canRunTerminal,
  checkTerminalCommand,
  mergeSnapshot,
  missingPaths,
  streamCommand,
  syncWorkingCopy,
} = await import("./terminal");
const { draftId } = await import("./ids");
const { fakeEditDb, readyVersion } = await import("./fake-db");

function sandboxEmitting(chunks: string[], exit: number | Error = 0) {
  return {
    commands: {
      run: vi.fn(
        async (
          _command: string,
          options: { onStdout: (chunk: string) => void },
        ) => {
          for (const chunk of chunks) options.onStdout(chunk);
          if (exit instanceof Error) throw exit;
          return { exitCode: exit };
        },
      ),
    },
  };
}

describe("streamCommand", () => {
  test("forwards output as it arrives and reports the exit code", async () => {
    const emitted: string[] = [];
    const result = await streamCommand({
      sandbox: sandboxEmitting(["a", "b"]),
      command: "ls",
      emit: (chunk) => emitted.push(chunk),
    });
    expect(emitted).toEqual(["a", "b"]);
    expect(result).toEqual({ exitCode: 0, truncated: false });
  });

  test("a failing command is a normal result, not an error", async () => {
    const result = await streamCommand({
      sandbox: sandboxEmitting(
        ["oops"],
        new (CommandExitError as unknown as new (exitCode: number) => Error)(2),
      ),
      command: "false",
      emit: () => {},
    });
    expect(result.exitCode).toBe(2);
  });

  test("other failures are shown to the user and have no exit code", async () => {
    const emitted: string[] = [];
    const result = await streamCommand({
      sandbox: sandboxEmitting([], new Error("timed out")),
      command: "sleep 999",
      emit: (chunk) => emitted.push(chunk),
    });
    expect(result.exitCode).toBeNull();
    expect(emitted.join("")).toContain("timed out");
  });

  test("cuts very long output once and says so", async () => {
    const emitted: string[] = [];
    const result = await streamCommand({
      sandbox: sandboxEmitting(["x".repeat(60), "y".repeat(60), "z"]),
      command: "yes",
      emit: (chunk) => emitted.push(chunk),
      maxChars: 100,
    });
    const all = emitted.join("");
    expect(result.truncated).toBe(true);
    expect(all.startsWith("x".repeat(60) + "y".repeat(40))).toBe(true);
    expect(all).toContain("output cut");
    expect(all).not.toContain("z");
  });

  test("runs in the project folder with a timeout", async () => {
    const sandbox = sandboxEmitting([]);
    await streamCommand({ sandbox, command: "npm i", emit: () => {} });
    expect(sandbox.commands.run).toHaveBeenCalledWith(
      "npm i",
      expect.objectContaining({ cwd: "/home/user/app", timeoutMs: 100_000 }),
    );
  });
});

describe("checkTerminalCommand", () => {
  test("keeps the dev server and the system safe, allows everything else", () => {
    expect(checkTerminalCommand("npm install zod")).toBeNull();
    expect(checkTerminalCommand("ls -la && cat package.json")).toBeNull();
    for (const command of ["sudo rm x", "npm run dev", "pkill node", ""]) {
      expect(checkTerminalCommand(command)).toEqual(expect.any(String));
    }
  });
});

describe("canRunTerminal", () => {
  const project = {
    operationId: null,
    operationKind: null,
    operationStartedAt: null,
  };
  const db = (pending: number) =>
    ({ message: { count: vi.fn(async () => pending) } }) as never;

  test("is locked while an agent is building or an operation runs", async () => {
    expect(await canRunTerminal(db(0), "p1", project)).toBe("ok");
    expect(await canRunTerminal(db(1), "p1", project)).toBe("building");
    expect(
      await canRunTerminal(db(0), "p1", {
        operationId: "op",
        operationKind: "EXPORT",
        operationStartedAt: new Date(),
      }),
    ).toBe("busy");
  });
});

describe("missingPaths", () => {
  test("asks the sandbox which of the files are really gone", async () => {
    const run = vi.fn(async () => ({ stdout: "gone.ts\nalso it's.ts\n" }));
    const result = await missingPaths({ commands: { run } }, [
      "gone.ts",
      "here.ts",
      "also it's.ts",
    ]);
    expect(result).toEqual(["gone.ts", "also it's.ts"]);
    const command = (run.mock.calls[0] as unknown as [string])[0];
    expect(command).toContain("'gone.ts' 'here.ts'");
    expect(command).toContain(`'also it'\\''s.ts'`);
  });

  test("doesn't call the sandbox with nothing to check", async () => {
    const run = vi.fn();
    expect(await missingPaths({ commands: { run } }, [])).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("mergeSnapshot", () => {
  const base = { "a.ts": "1", "b.ts": "2", "AGENTS.md": "old" };

  test("applies changes and new files, ignores the managed AGENTS.md, and never deletes by absence", () => {
    expect(
      mergeSnapshot(
        base,
        { "a.ts": "changed", "c.ts": "new", "AGENTS.md": "new rules" },
        new Set(),
      ),
    ).toEqual({
      "a.ts": "changed",
      "b.ts": "2",
      "c.ts": "new",
      "AGENTS.md": "old",
    });
  });

  test("deletes only files confirmed missing", () => {
    expect(mergeSnapshot(base, { "a.ts": "1" }, new Set(["b.ts"]))).toEqual({
      "a.ts": "1",
      "AGENTS.md": "old",
    });
  });
});

describe("syncWorkingCopy", () => {
  const files = { "app/page.tsx": "page", "package.json": '{"name":"a"}' };
  const setup = (pending = 0) => {
    const fake = fakeEditDb([readyVersion("p1", 1, files)]);
    const db = {
      version: fake.db.version,
      message: { ...fake.db.message, count: vi.fn(async () => pending) },
      project: {},
    } as never;
    return { ...fake, db };
  };
  const noneMissing = async () => [] as string[];

  test("does nothing when the command changed no files", async () => {
    const { db, versions } = setup();
    expect(
      await syncWorkingCopy({
        db,
        projectId: "p1",
        snapshot: { ...files, "AGENTS.md": "x" },
        findMissing: noneMissing,
      }),
    ).toBe(false);
    expect(versions.has(draftId("p1"))).toBe(false);
  });

  test("keeps the changes a command made as an unsaved draft", async () => {
    const { db, versions } = setup();
    expect(
      await syncWorkingCopy({
        db,
        projectId: "p1",
        snapshot: {
          ...files,
          "package.json": '{"name":"a","dependencies":{"zod":"1"}}',
        },
        findMissing: noneMissing,
      }),
    ).toBe(true);
    expect(versions.get(draftId("p1"))?.files["package.json"]).toContain("zod");
  });

  test("a truncated snapshot doesn't delete files that still exist", async () => {
    const { db, versions } = setup();
    const findMissing = vi.fn(async () => []);
    expect(
      await syncWorkingCopy({
        db,
        projectId: "p1",
        snapshot: { "app/page.tsx": "page" },
        findMissing,
      }),
    ).toBe(false);
    expect(findMissing).toHaveBeenCalledWith(["package.json"]);
    expect(versions.has(draftId("p1"))).toBe(false);
  });

  test("a file removed by the command is removed from the working copy", async () => {
    const { db, versions } = setup();
    await syncWorkingCopy({
      db,
      projectId: "p1",
      snapshot: { "app/page.tsx": "page" },
      findMissing: async () => ["package.json"],
    });
    expect(Object.keys(versions.get(draftId("p1"))!.files)).toEqual([
      "app/page.tsx",
    ]);
  });

  test("never stores a secret a command wrote, and never touches a build in progress", async () => {
    const key = `sk-proj-${"VerySecretValue123".repeat(2)}`;
    const leaky = setup();
    expect(
      await syncWorkingCopy({
        db: leaky.db,
        projectId: "p1",
        snapshot: { ...files, "app/page.tsx": `const k = "${key}";` },
        findMissing: noneMissing,
      }),
    ).toBe(false);
    expect(leaky.versions.has(draftId("p1"))).toBe(false);
    const building = setup(1);
    expect(
      await syncWorkingCopy({
        db: building.db,
        projectId: "p1",
        snapshot: { ...files, "app/page.tsx": "edited" },
        findMissing: noneMissing,
      }),
    ).toBe(false);
  });
});
