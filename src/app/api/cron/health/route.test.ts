// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  healthCheck: { create: vi.fn(), deleteMany: vi.fn() },
}));
const envMock = vi.hoisted(() => ({
  CRON_SECRET: "a-very-long-cron-secret" as string | undefined,
}));

vi.mock("@/server/db", () => ({ db }));
vi.mock("@/config/env", () => ({ env: envMock }));

import { GET } from "./route";

function request(authorization?: string) {
  return new Request("http://localhost/api/cron/health", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.CRON_SECRET = "a-very-long-cron-secret";
  db.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  db.healthCheck.create.mockResolvedValue({});
  db.healthCheck.deleteMany.mockResolvedValue({ count: 0 });
});

describe("GET /api/cron/health", () => {
  test("rejects requests without the bearer secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer nope"))).status).toBe(401);
    expect(db.healthCheck.create).not.toHaveBeenCalled();
  });

  test("rejects everything when no secret is configured", async () => {
    envMock.CRON_SECRET = undefined;
    expect((await GET(request("Bearer undefined"))).status).toBe(401);
  });

  test("records an ok check and prunes old rows", async () => {
    const response = await GET(request("Bearer a-very-long-cron-secret"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      recorded: true,
    });
    expect(db.healthCheck.create).toHaveBeenCalledWith({
      data: { ok: true, latencyMs: expect.any(Number) },
    });
    expect(db.healthCheck.deleteMany).toHaveBeenCalled();
  });

  test("records a failed check when the probe query throws", async () => {
    db.$queryRaw.mockRejectedValue(new Error("down"));
    const response = await GET(request("Bearer a-very-long-cron-secret"));
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      recorded: true,
    });
    expect(db.healthCheck.create).toHaveBeenCalledWith({
      data: { ok: false, latencyMs: expect.any(Number) },
    });
  });

  test("returns 503 when the check cannot be stored", async () => {
    db.healthCheck.create.mockRejectedValue(new Error("write failed"));
    const response = await GET(request("Bearer a-very-long-cron-secret"));
    expect(response.status).toBe(503);
  });
});
