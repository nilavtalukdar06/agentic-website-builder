// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TRPCContext } from "../init";

const devRoutes = vi.hoisted(() => ({ enabled: true }));

vi.mock("@/config/dev-routes", () => ({
  areDevRoutesEnabled: () => devRoutes.enabled,
}));

import { createCaller } from "./_app";

function makeContext(overrides: Partial<TRPCContext> = {}) {
  const db = {
    project: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
  const ctx = {
    db: db as unknown as TRPCContext["db"],
    session: null,
    ...overrides,
  } satisfies TRPCContext;
  return { ctx, db };
}

const project = {
  id: "p1",
  slug: "demo",
  name: "Demo",
  description: null,
  githubRepo: null,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("project router", () => {
  test("rejects signed-out callers", async () => {
    const { ctx } = makeContext();
    const caller = createCaller(ctx);
    await expect(caller.project.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.project.bySlug({ slug: "demo" })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
  });

  test("list filters by the session user", async () => {
    const { ctx, db } = makeContext({ session: { user: { id: "u1" } } });
    db.project.findMany.mockResolvedValue([project]);
    const result = await createCaller(ctx).project.list();
    expect(result).toEqual([project]);
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } }),
    );
  });

  test("bySlug applies the ownership filter", async () => {
    const { ctx, db } = makeContext({ session: { user: { id: "u1" } } });
    db.project.findFirst.mockResolvedValue(project);
    await createCaller(ctx).project.bySlug({ slug: "demo" });
    expect(db.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "demo", userId: "u1" } }),
    );
  });

  test("bySlug throws NOT_FOUND for a project the user does not own", async () => {
    const { ctx } = makeContext({ session: { user: { id: "u1" } } });
    await expect(
      createCaller(ctx).project.bySlug({ slug: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("bySlug validates its input", async () => {
    const { ctx } = makeContext({ session: { user: { id: "u1" } } });
    await expect(
      createCaller(ctx).project.bySlug({ slug: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("dev router", () => {
  beforeEach(() => {
    devRoutes.enabled = true;
  });

  test("returns a project by slug", async () => {
    const { ctx, db } = makeContext();
    db.project.findUnique.mockResolvedValue(project);
    await expect(
      createCaller(ctx).dev.project.bySlug({ slug: "demo" }),
    ).resolves.toEqual(project);
  });

  test("throws NOT_FOUND for an unknown slug", async () => {
    const { ctx } = makeContext();
    await expect(
      createCaller(ctx).dev.project.bySlug({ slug: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("lists projects", async () => {
    const { ctx, db } = makeContext();
    db.project.findMany.mockResolvedValue([project]);
    await expect(createCaller(ctx).dev.project.list()).resolves.toEqual([
      project,
    ]);
  });

  test("is unavailable when dev routes are disabled", async () => {
    devRoutes.enabled = false;
    const { ctx, db } = makeContext();
    await expect(createCaller(ctx).dev.project.list()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.project.findMany).not.toHaveBeenCalled();
  });
});
