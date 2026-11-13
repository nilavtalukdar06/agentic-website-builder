// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sandboxMocks = vi.hoisted(() => ({
  connectSandbox: vi.fn(),
  createSandbox: vi.fn(),
  ensureDevOrigins: vi.fn().mockResolvedValue(true),
  ensureAgentInstructions: vi.fn().mockResolvedValue(true),
  previewUrlFor: vi.fn(() => "https://3000-new.e2b.app"),
}));
vi.mock("./sandbox", () => sandboxMocks);
const dbMock = vi.hoisted(() => ({
  version: { findFirst: vi.fn() },
  project: { update: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@/server/db", () => ({ db: dbMock }));
const inject = vi.hoisted(() => ({ prepareSandboxSecrets: vi.fn() }));
vi.mock("@/server/secrets/inject", () => inject);

const { connectOrRecover, isSandboxGone, recoverSandbox } =
  await import("./recover");

function gone() {
  const error = new Error("sandbox abc was not found");
  error.name = "SandboxNotFoundError";
  return error;
}

describe("sandbox recovery", () => {
  test("recognises an expired sandbox", () => {
    expect(isSandboxGone(gone())).toBe(true);
    expect(isSandboxGone(new Error("socket hang up"))).toBe(false);
  });

  test("restores the checkpoint, replays writes and re-injects secrets", async () => {
    const files = { write: vi.fn().mockResolvedValue({}) };
    sandboxMocks.createSandbox.mockResolvedValue({ sandboxId: "new", files });
    dbMock.version.findFirst.mockResolvedValue({
      files: { "app/page.tsx": "old" },
    });
    const secrets = [{ name: "A_KEY", value: "value-123" }];
    const result = await recoverSandbox({
      projectId: "p1",
      chainId: "r0",
      replay: [{ path: "app/page.tsx", content: "new" }],
      secrets,
    });
    expect(sandboxMocks.createSandbox).toHaveBeenCalledWith({
      "app/page.tsx": "old",
    });
    expect(files.write).toHaveBeenCalledWith([
      { path: "/home/user/app/app/page.tsx", data: "new" },
    ]);
    expect(inject.prepareSandboxSecrets).toHaveBeenCalledWith(
      expect.anything(),
      secrets,
      { restart: true },
    );
    expect(dbMock.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { sandboxId: "new", previewUrl: "https://3000-new.e2b.app" },
    });
    expect(result.ref).toEqual({
      id: "new",
      previewUrl: "https://3000-new.e2b.app",
    });
  });

  test("connects when alive, recovers only when the sandbox is gone", async () => {
    sandboxMocks.connectSandbox.mockResolvedValueOnce({ sandboxId: "s1" });
    const recover = vi.fn();
    await expect(
      connectOrRecover({ id: "s1", previewUrl: "" }, recover),
    ).resolves.toEqual({ sandbox: { sandboxId: "s1" }, recovered: null });
    expect(recover).not.toHaveBeenCalled();

    sandboxMocks.connectSandbox.mockRejectedValueOnce(gone());
    recover.mockResolvedValue({
      sandbox: { sandboxId: "new" },
      ref: { id: "new", previewUrl: "u" },
    });
    await expect(
      connectOrRecover({ id: "s1", previewUrl: "" }, recover),
    ).resolves.toEqual({
      sandbox: { sandboxId: "new" },
      recovered: { id: "new", previewUrl: "u" },
    });

    sandboxMocks.connectSandbox.mockRejectedValueOnce(new Error("network"));
    await expect(
      connectOrRecover({ id: "s1", previewUrl: "" }, recover),
    ).rejects.toThrow("network");
  });
});

describe("failed resumes", () => {
  test("a paused sandbox whose snapshot can't be restored counts as gone", () => {
    const unresponsive = new Error("resume refused");
    unresponsive.name = "GuestUnresponsiveError";
    expect(isSandboxGone(unresponsive)).toBe(true);
    expect(
      isSandboxGone(
        new Error("409: sandbox_snapshot_guest_agent_unresponsive"),
      ),
    ).toBe(true);
  });
});
