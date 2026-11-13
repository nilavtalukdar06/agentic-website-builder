// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.hoisted(() => vi.fn());
vi.mock("e2b", () => ({ Sandbox: { create } }));

const {
  createSandbox,
  ensureAgentInstructions,
  ensureDevOrigins,
  pickSnapshotEntries,
  SANDBOX_LIFECYCLE,
  snapshotListCommand,
  snapshotSandbox,
} = await import("./sandbox");

describe("snapshotListCommand", () => {
  test("prunes build and dependency folders and skips lock and env files", () => {
    const command = snapshotListCommand();
    expect(command).toContain("-name 'node_modules'");
    expect(command).toContain("-name '.next'");
    expect(command).toContain("! -name 'package-lock.json'");
    expect(command).toContain("! -name '.env*'");
    expect(command).toContain("-name '.agents'");
    expect(command).toContain("-name '.claude'");
    expect(command).toContain("! -name 'skills-lock.json'");
    expect(command).toContain("-size -1048577c");
    expect(command).toMatch(/-printf '%s\\t%p\\n'$/);
  });
});

describe("pickSnapshotEntries", () => {
  test("keeps text under 200 KB and binaries up to 1 MB, sorted", () => {
    expect(
      pickSnapshotEntries(
        [
          "120\t./app/page.tsx",
          "5000\t./public/logo.png",
          "",
          "1048576\t./public/hero.jpg",
          "250000\t./lib/data.json",
          "900\t./components/hero.tsx",
          "garbage",
        ].join("\n"),
      ),
    ).toEqual([
      { path: "app/page.tsx", size: 120, binary: false },
      { path: "components/hero.tsx", size: 900, binary: false },
      { path: "public/hero.jpg", size: 1048576, binary: true },
      { path: "public/logo.png", size: 5000, binary: true },
    ]);
  });

  test("caps the number of files", () => {
    const listing = Array.from(
      { length: 500 },
      (_, i) => `10\t./f${i}.ts`,
    ).join("\n");
    expect(pickSnapshotEntries(listing)).toHaveLength(400);
  });
});

describe("snapshotSandbox", () => {
  test("stores small binaries as data URLs next to the text files", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const sandbox = {
      commands: {
        run: vi.fn().mockResolvedValue({
          stdout: "4\t./public/logo.png\n9\t./app/page.tsx\n",
        }),
      },
      files: {
        read: vi.fn(async (_path: string, options?: { format?: string }) =>
          options?.format === "bytes" ? bytes : "export {}",
        ),
      },
    };
    await expect(snapshotSandbox(sandbox as never)).resolves.toEqual({
      "app/page.tsx": "export {}",
      "public/logo.png": `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
    });
  });
});

describe("createSandbox", () => {
  test("pauses on timeout without auto-resume and restores binaries as bytes", async () => {
    const write = vi.fn().mockResolvedValue({});
    create.mockResolvedValue({ files: { write }, commands: { run: vi.fn() } });
    await createSandbox({
      "app/page.tsx": "export {}",
      "public/logo.png": "data:image/png;base64,iVBORw==",
    });
    expect(SANDBOX_LIFECYCLE).toEqual({
      onTimeout: "pause",
      autoResume: false,
    });
    expect(create).toHaveBeenCalledWith(
      "test-template",
      expect.objectContaining({
        lifecycle: { onTimeout: "pause", autoResume: false },
      }),
    );
    const [entries] = write.mock.calls[0];
    expect(entries[0]).toEqual({
      path: "/home/user/app/app/page.tsx",
      data: "export {}",
    });
    expect(entries[1].data).toBeInstanceOf(Uint8Array);
    expect(Array.from(entries[1].data as Uint8Array)).toEqual([
      137, 80, 78, 71,
    ]);
  });
});

describe("ensureDevOrigins", () => {
  const config =
    "const nextConfig: NextConfig = {}\n\nexport default nextConfig\n";

  function fakeSandbox(source: string | Error) {
    return {
      files: {
        read: vi.fn(() =>
          source instanceof Error
            ? Promise.reject(source)
            : Promise.resolve(source),
        ),
        write: vi.fn().mockResolvedValue({}),
      },
    };
  }

  test("writes the patched config", async () => {
    const sandbox = fakeSandbox(config);
    await expect(ensureDevOrigins(sandbox as never)).resolves.toBe(true);
    expect(sandbox.files.write).toHaveBeenCalledWith(
      "/home/user/app/next.config.ts",
      expect.stringContaining('allowedDevOrigins: ["*.e2b.app"]'),
    );
  });

  test("does not write when it is already set", async () => {
    const sandbox = fakeSandbox("const nextConfig = { allowedDevOrigins: [] }");
    await expect(ensureDevOrigins(sandbox as never)).resolves.toBe(false);
    expect(sandbox.files.write).not.toHaveBeenCalled();
  });

  test("never throws when the write fails", async () => {
    const sandbox = fakeSandbox(config);
    sandbox.files.write.mockRejectedValue(new Error("disk full"));
    await expect(ensureDevOrigins(sandbox as never)).resolves.toBe(false);
  });

  test("ignores a missing config file", async () => {
    const sandbox = fakeSandbox(new Error("not found"));
    await expect(ensureDevOrigins(sandbox as never)).resolves.toBe(false);
    expect(sandbox.files.write).not.toHaveBeenCalled();
  });
});

describe("ensureAgentInstructions", () => {
  function fakeSandbox(source: string | Error) {
    return {
      files: {
        read: vi.fn(() =>
          source instanceof Error
            ? Promise.reject(source)
            : Promise.resolve(source),
        ),
        write: vi.fn().mockResolvedValue({}),
      },
    };
  }

  test("adds the rules to an older project's AGENTS.md", async () => {
    const sandbox = fakeSandbox("<!-- BEGIN:nextjs-agent-rules -->\n");
    await expect(ensureAgentInstructions(sandbox as never)).resolves.toBe(true);
    expect(sandbox.files.write).toHaveBeenCalledWith(
      "/home/user/app/AGENTS.md",
      expect.stringMatching(/^# Instructions for AI coding agents/),
    );
  });

  test("does nothing when the rules are there", async () => {
    const sandbox = fakeSandbox("## Always start here\n");
    await expect(ensureAgentInstructions(sandbox as never)).resolves.toBe(
      false,
    );
    expect(sandbox.files.write).not.toHaveBeenCalled();
  });

  test("creates AGENTS.md when it is missing", async () => {
    const sandbox = fakeSandbox(new Error("not found"));
    await expect(ensureAgentInstructions(sandbox as never)).resolves.toBe(true);
  });
});
