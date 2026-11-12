// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("e2b", () => ({ Sandbox: {} }));

const {
  ensureAgentInstructions,
  ensureDevOrigins,
  pickSnapshotPaths,
  snapshotListCommand,
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
    expect(command).toMatch(/-size -\d+c -print$/);
  });
});

describe("pickSnapshotPaths", () => {
  test("strips ./, drops binaries and blank lines, and sorts", () => {
    expect(
      pickSnapshotPaths(
        "./app/page.tsx\n./public/logo.png\n\n./app/favicon.ico\n./lib/utils.ts\n./components/hero.tsx\n",
      ),
    ).toEqual(["app/page.tsx", "components/hero.tsx", "lib/utils.ts"]);
  });

  test("caps the number of files", () => {
    const listing = Array.from({ length: 500 }, (_, i) => `./f${i}.ts`).join(
      "\n",
    );
    expect(pickSnapshotPaths(listing)).toHaveLength(400);
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
