// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  consume: vi.fn(),
  protect: vi.fn(),
  project: vi.fn(),
  count: vi.fn(),
  connect: vi.fn(),
  snapshot: vi.fn(),
  run: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("e2b", () => ({ CommandExitError: class extends Error {} }));
vi.mock("@/server/arcjet", () => ({
  ajBrowserBotWithRateLimit: () => ({ protect: mocks.protect }),
  arcjetDenialResponse: (decision: { denied: boolean }) =>
    decision.denied ? Response.json({}, { status: 403 }) : null,
}));
vi.mock("@/server/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/db", () => ({
  db: {
    project: { findFirst: mocks.project },
    message: { count: mocks.count },
  },
}));
vi.mock("@/server/rate-limit", () => ({
  consumeRateLimit: mocks.consume,
  rateRules: { terminal: { name: "terminal", limit: 60, windowMs: 600_000 } },
}));
vi.mock("@/server/sandbox/sandbox", () => ({
  connectSandbox: mocks.connect,
  snapshotSandbox: mocks.snapshot,
}));
vi.mock("@/server/code/terminal", async (original) => ({
  ...(await original<object>()),
  syncWorkingCopy: mocks.sync,
}));

const { POST } = await import("./route");

const call = (body: unknown) =>
  POST(
    new Request("http://localhost/api/terminal", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
const valid = { projectId: "p1", command: "ls" };
const project = {
  id: "p1",
  sandboxId: "sbx_1",
  operationId: null,
  operationKind: null,
  operationStartedAt: null,
};

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ user: { id: "u1" } });
  mocks.consume.mockReset().mockResolvedValue({ allowed: true, remaining: 59 });
  mocks.protect.mockReset().mockResolvedValue({ denied: false });
  mocks.project.mockReset().mockResolvedValue(project);
  mocks.count.mockReset().mockResolvedValue(0);
  mocks.run.mockReset().mockImplementation(async (_c, options) => {
    options.onStdout("app\npackage.json\n");
    return { exitCode: 0 };
  });
  mocks.connect.mockReset().mockResolvedValue({ commands: { run: mocks.run } });
  mocks.snapshot.mockReset().mockResolvedValue({});
  mocks.sync.mockReset().mockResolvedValue(false);
});

describe("POST /api/terminal", () => {
  test("rejects Arcjet denials, signed-out callers and rate-limited users first", async () => {
    mocks.protect.mockResolvedValue({ denied: true });
    expect((await call(valid)).status).toBe(403);
    mocks.protect.mockResolvedValue({ denied: false });
    mocks.getSession.mockResolvedValue(null);
    expect((await call(valid)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "u1" } });
    mocks.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const limited = await call(valid);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("42");
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  test("validates the body and blocks unsafe commands", async () => {
    expect((await call({ projectId: "p1" })).status).toBe(400);
    expect((await call({ ...valid, command: "x".repeat(2001) })).status).toBe(
      400,
    );
    const blocked = await call({ ...valid, command: "sudo reboot" });
    expect(blocked.status).toBe(400);
    expect(await blocked.text()).toContain("blocked");
    expect(mocks.run).not.toHaveBeenCalled();
  });

  test("only the owner's projects, and never while building or busy", async () => {
    mocks.project.mockResolvedValue(null);
    expect((await call(valid)).status).toBe(404);
    expect(mocks.project.mock.calls[0][0].where).toEqual({
      id: "p1",
      userId: "u1",
    });
    mocks.project.mockResolvedValue(project);
    mocks.count.mockResolvedValue(1);
    const building = await call(valid);
    expect(building.status).toBe(409);
    expect(await building.text()).toContain("locked while Vibe is building");
    mocks.count.mockResolvedValue(0);
    mocks.project.mockResolvedValue({
      ...project,
      operationId: "op",
      operationKind: "EXPORT",
      operationStartedAt: new Date(),
    });
    expect((await call(valid)).status).toBe(409);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  test("explains when there is no sandbox to run in", async () => {
    mocks.project.mockResolvedValue({ ...project, sandboxId: null });
    const none = await call(valid);
    expect(none.status).toBe(409);
    expect(await none.text()).toContain("preview isn't running");
  });

  test("streams the output and the exit code, then keeps the working copy in sync", async () => {
    mocks.sync.mockResolvedValue(true);
    const response = await call(valid);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("app\npackage.json\n");
    expect(body).toContain("[exit 0]");
    expect(body).toContain("your edits are unsaved");
    expect(mocks.run).toHaveBeenCalledWith(
      "ls",
      expect.objectContaining({ cwd: "/home/user/app" }),
    );
    expect(mocks.sync).toHaveBeenCalledOnce();
  });
});
