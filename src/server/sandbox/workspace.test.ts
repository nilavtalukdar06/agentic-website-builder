// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  create: vi.fn(),
  db: {
    project: { update: vi.fn() },
    version: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));
vi.mock("e2b", () => ({
  Sandbox: { connect: mocks.connect, create: mocks.create },
}));
vi.mock("@/server/db", () => ({ db: mocks.db }));

const { staleFiles, wakeSandbox } = await import("./workspace");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.project.update.mockResolvedValue({});
});

describe("staleFiles", () => {
  test("removes stale oversized files beyond the snapshot cap and retains the npm lockfile", () => {
    const listing = [
      ...Array.from({ length: 401 }, (_, i) => `200000\t./old-${i}.tsx`),
      "379046\t./package-lock.json",
      "10\t./app/page.tsx",
    ].join("\0");
    const stale = staleFiles(listing, { "app/page.tsx": "current" });
    expect(stale).toHaveLength(401);
    expect(stale).toContain("old-400.tsx");
    expect(stale).not.toContain("package-lock.json");
  });
  test("lists source files that the restored version doesn't have", () => {
    const listing = [
      "120\t./app/page.tsx",
      "80\t./components/old.tsx",
      "30\t./public/logo.png",
    ].join("\n");
    expect(
      staleFiles(listing, {
        "app/page.tsx": "x",
        "public/logo.png": "data:image/png;base64,AA==",
      }),
    ).toEqual(["components/old.tsx"]);
  });
});

describe("wakeSandbox", () => {
  function sandbox() {
    return {
      sandboxId: "replacement",
      getHost: () => "3000-replacement.e2b.app",
      files: {
        read: vi.fn().mockResolvedValue(""),
        write: vi.fn().mockResolvedValue({}),
      },
      commands: { run: vi.fn().mockResolvedValue({ stdout: "", exitCode: 0 }) },
    };
  }

  test("rebuilds a detached sandbox from the latest ready snapshot", async () => {
    const box = sandbox();
    mocks.create.mockResolvedValue(box);
    mocks.db.version.findFirst.mockResolvedValue({
      files: { "app/page.tsx": "restored version" },
    });
    await expect(
      wakeSandbox({ projectId: "p1", sandboxId: null }),
    ).resolves.toEqual({
      created: true,
      previewUrl: "https://3000-replacement.e2b.app",
    });
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.db.version.findFirst).toHaveBeenCalledWith({
      where: { projectId: "p1", status: "READY" },
      orderBy: { number: "desc" },
      select: { files: true },
    });
    expect(box.files.write).toHaveBeenCalledWith([
      { path: "/home/user/app/app/page.tsx", data: "restored version" },
    ]);
    expect(mocks.db.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        sandboxId: "replacement",
        previewUrl: "https://3000-replacement.e2b.app",
      },
    });
  });

  test("rejects an unhealthy preview so the workspace can show retry", async () => {
    const box = sandbox();
    mocks.connect.mockResolvedValue(box);
    box.commands.run.mockRejectedValue(new Error("preview returned HTTP 500"));
    await expect(
      wakeSandbox({ projectId: "p1", sandboxId: "replacement" }),
    ).rejects.toThrow("HTTP 500");
    expect(box.commands.run).toHaveBeenCalledWith(
      expect.stringContaining("curl -fsS"),
      expect.any(Object),
    );
  });
});
