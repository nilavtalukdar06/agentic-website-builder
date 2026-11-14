// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));

const upsert = vi.hoisted(() => vi.fn());
const deleteMany = vi.hoisted(() => vi.fn());
const db = { throttleWindow: { upsert, deleteMany } } as never;

const {
  consumeRateLimit,
  enforceRateLimit,
  purgeThrottleWindows,
  rateRules,
  retryMessage,
} = await import("./rate-limit");

const rule = { name: "demo", limit: 3, windowMs: 60_000 };
const now = Date.UTC(2026, 10, 14, 12, 0, 20);

beforeEach(() => {
  upsert.mockReset();
  deleteMany.mockReset();
});

describe("consumeRateLimit", () => {
  test("counts hits in a fixed window keyed by rule and subject", async () => {
    upsert.mockResolvedValue({ count: 1 });
    await expect(consumeRateLimit(db, rule, "u1", now)).resolves.toEqual({
      allowed: true,
      remaining: 2,
    });
    const args = upsert.mock.calls[0][0];
    expect(args.where.key_windowStart.key).toBe("demo:u1");
    expect(args.where.key_windowStart.windowStart).toEqual(
      new Date(Date.UTC(2026, 10, 14, 12, 0, 0)),
    );
    expect(args.update).toEqual({ count: { increment: 1 } });
    expect(args.create.count).toBe(1);
  });

  test("allows exactly the limit and refuses the next hit with the time left", async () => {
    upsert.mockResolvedValueOnce({ count: 3 });
    expect((await consumeRateLimit(db, rule, "u1", now)).allowed).toBe(true);
    upsert.mockResolvedValueOnce({ count: 4 });
    await expect(consumeRateLimit(db, rule, "u1", now)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 40,
    });
  });

  test("retries once when two requests create the window together", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("Unique", {
      code: "P2002",
      clientVersion: "7.10.1",
    });
    upsert.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ count: 2 });
    await expect(consumeRateLimit(db, rule, "u1", now)).resolves.toEqual({
      allowed: true,
      remaining: 1,
    });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  test("rethrows other database errors", async () => {
    upsert.mockRejectedValue(new Error("connection lost"));
    await expect(consumeRateLimit(db, rule, "u1", now)).rejects.toThrow(
      "connection lost",
    );
  });
});

describe("enforceRateLimit", () => {
  test("throws TOO_MANY_REQUESTS with a readable wait", async () => {
    upsert.mockResolvedValue({ count: 99 });
    await expect(enforceRateLimit(db, rule, "u1")).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: expect.stringMatching(/try again/i),
    });
  });

  test("does nothing under the limit", async () => {
    upsert.mockResolvedValue({ count: 1 });
    await expect(enforceRateLimit(db, rule, "u1")).resolves.toBeUndefined();
  });
});

describe("retryMessage", () => {
  test("rounds long waits up to whole minutes", () => {
    expect(retryMessage(30)).toMatch(/minute/);
    expect(retryMessage(61)).toContain("2 minutes");
    expect(retryMessage(3000)).toContain("50 minutes");
  });
});

describe("rateRules", () => {
  test("every rule has a unique name and sane numbers", () => {
    const rules = Object.values(rateRules);
    expect(new Set(rules.map((entry) => entry.name)).size).toBe(rules.length);
    for (const entry of rules) {
      expect(entry.limit).toBeGreaterThan(0);
      expect(entry.windowMs).toBeGreaterThanOrEqual(60_000);
    }
  });
});

describe("purgeThrottleWindows", () => {
  test("deletes windows older than the retention", async () => {
    deleteMany.mockResolvedValue({ count: 4 });
    await expect(purgeThrottleWindows(db, 86_400_000, now)).resolves.toBe(4);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { windowStart: { lt: new Date(now - 86_400_000) } },
    });
  });
});
