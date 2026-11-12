// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  answer: vi.fn(),
}));
vi.mock("@/server/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/inputs/send", () => ({ sendAnswerEvent: vi.fn() }));
vi.mock("@/server/inputs/answer", () => ({ answerInputRequest: mocks.answer }));

const { POST } = await import("./route");

const post = (body: unknown, id = "i1") =>
  POST(
    new Request(`http://localhost/api/inputs/${id}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ user: { id: "u1" } });
  mocks.answer
    .mockReset()
    .mockResolvedValue({ status: 200, body: { status: "answered" } });
});

describe("POST /api/inputs/[id]", () => {
  test("rejects signed-out callers without touching the request", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await post({ text: "x" });
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  test("answers for the signed-in user and never caches", async () => {
    const response = await post({ value: "sk-secret" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.answer).toHaveBeenCalledWith(expect.anything(), {
      userId: "u1",
      requestId: "i1",
      body: { value: "sk-secret" },
    });
  });

  test("passes through the service's status", async () => {
    mocks.answer.mockResolvedValue({
      status: 404,
      body: { error: "Not found" },
    });
    expect((await post({})).status).toBe(404);
  });
});
