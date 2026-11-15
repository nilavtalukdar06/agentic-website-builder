// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  create: vi.fn(),
  storeAttachment: vi.fn(),
  consume: vi.fn(),
  protect: vi.fn(),
}));

vi.mock("@/server/arcjet", () => ({
  ajBrowserBotWithRateLimit: () => ({ protect: mocks.protect }),
  arcjetDenialResponse: (decision: { denied: boolean }) =>
    decision.denied
      ? Response.json({ error: "Forbidden" }, { status: 403 })
      : null,
}));
vi.mock("@/server/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/db", () => ({
  db: { attachment: { create: mocks.create } },
}));
vi.mock("@/server/rate-limit", () => ({
  consumeRateLimit: mocks.consume,
  rateRules: { upload: { name: "upload", limit: 40, windowMs: 600_000 } },
}));
vi.mock("@/server/storage/attachments", () => ({
  storeAttachment: mocks.storeAttachment,
  attachmentKey: (userId: string, id: string) => `users/${userId}/${id}.png`,
}));
vi.mock("nanoid", () => ({ nanoid: () => "att1" }));

const { POST } = await import("./route");

function upload(file?: File) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://localhost/api/attachments", {
    method: "POST",
    body: form,
  });
}

const png = (bytes = 10, type = "image/png") =>
  new File([new Uint8Array(bytes)], "ref.png", { type });

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ user: { id: "u1" } });
  mocks.create.mockReset().mockImplementation(({ data }) =>
    Promise.resolve({
      id: data.id,
      name: data.name,
      contentType: data.contentType,
      size: data.size,
    }),
  );
  mocks.storeAttachment.mockReset().mockResolvedValue(undefined);
  mocks.consume.mockReset().mockResolvedValue({ allowed: true, remaining: 39 });
  mocks.protect.mockReset().mockResolvedValue({ denied: false });
});

describe("POST /api/attachments", () => {
  test("rejects requests Arcjet denies before touching the session", async () => {
    mocks.protect.mockResolvedValue({ denied: true });
    expect((await POST(upload(png()))).status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  test("rejects signed-out callers", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(upload(png()))).status).toBe(401);
  });

  test("answers 429 with Retry-After when the upload limit is spent", async () => {
    mocks.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
    const response = await POST(upload(png()));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(mocks.storeAttachment).not.toHaveBeenCalled();
    expect(mocks.consume.mock.calls[0][2]).toBe("u1");
  });

  test("requires a file", async () => {
    expect((await POST(upload())).status).toBe(400);
  });

  test("rejects other file types and large images", async () => {
    const svg = await POST(upload(png(10, "image/svg+xml")));
    expect(svg.status).toBe(400);
    expect(await svg.json()).toEqual({
      error: "Only PNG, JPEG, WebP and GIF images can be attached.",
    });
    expect((await POST(upload(png(4 * 1024 * 1024 + 1)))).status).toBe(400);
    expect(mocks.storeAttachment).not.toHaveBeenCalled();
  });

  test("stores the image under the user's prefix and records it", async () => {
    const response = await POST(upload(png()));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "att1",
      name: "ref.png",
      contentType: "image/png",
      size: 10,
    });
    expect(mocks.storeAttachment).toHaveBeenCalledWith(
      "users/u1/att1.png",
      expect.any(File),
      "image/png",
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          key: "users/u1/att1.png",
        }),
      }),
    );
  });

  test("reports a storage failure without writing a row", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.storeAttachment.mockRejectedValue(new Error("down"));
    expect((await POST(upload(png()))).status).toBe(502);
    expect(mocks.create).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
