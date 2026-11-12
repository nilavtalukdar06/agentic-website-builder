// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findFirst: vi.fn(),
  setSecret: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/server/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/db", () => ({
  db: { project: { findFirst: mocks.findFirst } },
}));
vi.mock("@/server/secrets/store", () => ({ setSecret: mocks.setSecret }));
vi.mock("@/server/secrets/refresh", () => ({
  refreshSandboxSecrets: mocks.refresh,
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

const { PUT } = await import("./route");

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/projects/p1/secrets", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ projectId: "p1" }) },
  );

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ user: { id: "u1" } });
  mocks.findFirst.mockReset().mockResolvedValue({ id: "p1" });
  mocks.setSecret
    .mockReset()
    .mockResolvedValue({ name: "OPENAI_API_KEY", replaced: false });
  mocks.refresh.mockReset().mockResolvedValue(undefined);
});

describe("PUT /api/projects/[projectId]/secrets", () => {
  test("rejects signed-out callers and other users' projects", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await put({ name: "A_KEY", value: "x" })).status).toBe(401);
    mocks.findFirst.mockResolvedValueOnce(null);
    expect((await put({ name: "A_KEY", value: "x" })).status).toBe(404);
    expect(mocks.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "p1", userId: "u1" } }),
    );
  });

  test("validates the name and value", async () => {
    expect((await put({ name: "PATH", value: "x" })).status).toBe(400);
    expect((await put({ name: "lower", value: "x" })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect(mocks.setSecret).not.toHaveBeenCalled();
  });

  test("stores the value, returns names only and refreshes the sandbox", async () => {
    const response = await put({ name: "OPENAI_API_KEY", value: " sk-value " });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ name: "OPENAI_API_KEY", replaced: false });
    expect(JSON.stringify(body)).not.toContain("sk-value");
    expect(mocks.setSecret).toHaveBeenCalledWith(expect.anything(), {
      projectId: "p1",
      userId: "u1",
      name: "OPENAI_API_KEY",
      value: "sk-value",
    });
    expect(mocks.refresh).toHaveBeenCalledWith("p1");
  });
});
