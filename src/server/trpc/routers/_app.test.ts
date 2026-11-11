// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import type { Session, TRPCContext } from "../init";
import { createCaller } from "./_app";

function makeSession(userId: string): Session {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    user: {
      id: userId,
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "s1",
      userId,
      token: "token",
      expiresAt: now,
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
  };
}

function makeContext(overrides: Partial<TRPCContext> = {}) {
  const db = {
    project: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
    },
    creditLedger: {
      aggregate: vi.fn(),
    },
  };
  const ctx = {
    db: db as unknown as TRPCContext["db"],
    session: null,
    ...overrides,
  } satisfies TRPCContext;
  return { ctx, db };
}

function signedIn(userId = "u1") {
  return makeContext({ session: makeSession(userId) });
}

function uniqueViolation(target: unknown = ["slug"]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint", {
    code: "P2002",
    clientVersion: "7.10.1",
    meta: target === undefined ? undefined : { target },
  });
}

const project = {
  id: "p1",
  slug: "demo",
  name: "Demo",
  description: null,
  githubRepo: null,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("auth", () => {
  test("every procedure rejects signed-out callers", async () => {
    const caller = createCaller(makeContext().ctx);
    for (const call of [
      () => caller.project.list(),
      () => caller.project.recent({}),
      () => caller.project.bySlug({ slug: "demo" }),
      () => caller.project.create({ prompt: "A site" }),
      () => caller.credits.balance(),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });
});

describe("project.list", () => {
  test("defaults to the user's projects by last edit, with a total", async () => {
    const { ctx, db } = signedIn();
    db.project.findMany.mockResolvedValue([project]);
    db.project.count.mockResolvedValue(3);
    await expect(createCaller(ctx).project.list()).resolves.toEqual({
      projects: [project],
      total: 3,
    });
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        orderBy: { updatedAt: "desc" },
      }),
    );
    expect(db.project.count).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  test.each([
    ["github", { githubRepo: { not: null } }],
    ["local", { githubRepo: null }],
  ] as const)("filter=%s", async (filter, where) => {
    const { ctx, db } = signedIn();
    await createCaller(ctx).project.list({ filter });
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", ...where } }),
    );
  });

  test.each([
    ["name", { name: "asc" }],
    ["created", { createdAt: "desc" }],
  ] as const)("sort=%s", async (sort, orderBy) => {
    const { ctx, db } = signedIn();
    await createCaller(ctx).project.list({ sort });
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy }),
    );
  });

  test("searches name, slug and description case-insensitively", async () => {
    const { ctx, db } = signedIn();
    await createCaller(ctx).project.list({ q: "  coffee " });
    const { where } = db.project.findMany.mock.calls[0][0];
    expect(where.userId).toBe("u1");
    expect(where.OR).toEqual([
      { name: { contains: "coffee", mode: "insensitive" } },
      { slug: { contains: "coffee", mode: "insensitive" } },
      { description: { contains: "coffee", mode: "insensitive" } },
    ]);
  });

  test("rejects unknown filters", async () => {
    const { ctx } = signedIn();
    await expect(
      createCaller(ctx).project.list({ filter: "nope" as "all" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("project.recent", () => {
  test("takes the most recently edited projects", async () => {
    const { ctx, db } = signedIn();
    await createCaller(ctx).project.recent({ limit: 4 });
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),
    );
  });

  test("caps the limit", async () => {
    const { ctx } = signedIn();
    await expect(
      createCaller(ctx).project.recent({ limit: 50 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("project.bySlug", () => {
  test("applies the ownership filter and returns the first prompt", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({
      ...project,
      messages: [{ content: "Build a coffee site" }],
    });
    await expect(
      createCaller(ctx).project.bySlug({ slug: "demo" }),
    ).resolves.toEqual({ ...project, prompt: "Build a coffee site" });
    expect(db.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "demo", userId: "u1" } }),
    );
  });

  test("prompt is null when there is no message", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ ...project, messages: [] });
    await expect(
      createCaller(ctx).project.bySlug({ slug: "demo" }),
    ).resolves.toMatchObject({ prompt: null });
  });

  test("throws NOT_FOUND for a project the user does not own", async () => {
    const { ctx } = signedIn();
    await expect(
      createCaller(ctx).project.bySlug({ slug: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("validates its input", async () => {
    const { ctx } = signedIn();
    await expect(
      createCaller(ctx).project.bySlug({ slug: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("project.create", () => {
  const prompt = "Build me a landing page for Ember & Oak. Warm and editorial.";

  test("names the project from the prompt and stores the prompt", async () => {
    const { ctx, db } = signedIn();
    db.project.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "p1", slug: data.slug, name: data.name }),
    );
    await expect(
      createCaller(ctx).project.create({ prompt: `  ${prompt}  ` }),
    ).resolves.toEqual({
      id: "p1",
      slug: "landing-page-for-ember-and-oak",
      name: "Landing page for Ember & Oak",
    });
    expect(db.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          slug: "landing-page-for-ember-and-oak",
          name: "Landing page for Ember & Oak",
          description: prompt,
          userId: "u1",
          messages: { create: { role: "USER", content: prompt } },
        },
      }),
    );
  });

  test("retries with a suffix when the slug is taken", async () => {
    const { ctx, db } = signedIn();
    db.project.create
      .mockRejectedValueOnce(uniqueViolation())
      .mockImplementation(({ data }) =>
        Promise.resolve({ id: "p2", slug: data.slug, name: data.name }),
      );
    const result = await createCaller(ctx).project.create({ prompt });
    expect(result.slug).toMatch(/^landing-page-for-ember-and-oak-[a-z0-9]{4}$/);
    expect(db.project.create).toHaveBeenCalledTimes(2);
  });

  test("treats a P2002 without target metadata as a slug conflict", async () => {
    const { ctx, db } = signedIn();
    db.project.create
      .mockRejectedValueOnce(uniqueViolation(undefined))
      .mockResolvedValue({ id: "p2", slug: "x", name: "x" });
    await createCaller(ctx).project.create({ prompt });
    expect(db.project.create).toHaveBeenCalledTimes(2);
  });

  test("gives up with CONFLICT after five collisions", async () => {
    const { ctx, db } = signedIn();
    db.project.create.mockRejectedValue(uniqueViolation());
    await expect(
      createCaller(ctx).project.create({ prompt }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.project.create).toHaveBeenCalledTimes(5);
  });

  test("rethrows other database errors without retrying", async () => {
    const { ctx, db } = signedIn();
    db.project.create.mockRejectedValue(uniqueViolation(["id"]));
    await expect(
      createCaller(ctx).project.create({ prompt }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.project.create).toHaveBeenCalledOnce();
  });

  test.each(["", "   ", "x".repeat(4001)])(
    "rejects an invalid prompt (%#)",
    async (value) => {
      const { ctx, db } = signedIn();
      await expect(
        createCaller(ctx).project.create({ prompt: value }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.project.create).not.toHaveBeenCalled();
    },
  );
});

describe("credits.balance", () => {
  test("sums the ledger and the credits granted", async () => {
    const { ctx, db } = signedIn();
    db.creditLedger.aggregate
      .mockResolvedValueOnce({ _sum: { delta: 1198 } })
      .mockResolvedValueOnce({ _sum: { delta: 2000 } });
    await expect(createCaller(ctx).credits.balance()).resolves.toEqual({
      balance: 1198,
      granted: 2000,
    });
    expect(db.creditLedger.aggregate).toHaveBeenNthCalledWith(1, {
      where: { userId: "u1" },
      _sum: { delta: true },
    });
    expect(db.creditLedger.aggregate).toHaveBeenNthCalledWith(2, {
      where: { userId: "u1", delta: { gt: 0 } },
      _sum: { delta: true },
    });
  });

  test("is zero with an empty ledger", async () => {
    const { ctx, db } = signedIn();
    db.creditLedger.aggregate.mockResolvedValue({ _sum: { delta: null } });
    await expect(createCaller(ctx).credits.balance()).resolves.toEqual({
      balance: 0,
      granted: 0,
    });
  });
});
