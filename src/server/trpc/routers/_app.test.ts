// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const send = vi.hoisted(() => vi.fn());
const gateway = vi.hoisted(() => ({
  findAgentModel: vi.fn(),
  getAgentModels: vi.fn(),
  pickDefaultModel: vi.fn(),
}));
const workspace = vi.hoisted(() => ({
  wakeSandbox: vi.fn(),
  writeVersionToSandbox: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/inngest/client", () => ({ inngest: { send } }));
vi.mock("@/server/sandbox/workspace", () => workspace);
vi.mock("@/server/storage/attachments", () => ({
  attachmentUrl: vi.fn(async (key: string) => `https://files.test/${key}`),
}));
vi.mock("@/server/ai/gateway", () => gateway);

const sonnet = {
  id: "anthropic/claude-sonnet-5.5",
  name: "Claude Sonnet 5.5",
  provider: "anthropic",
  providerLabel: "Anthropic",
  vision: true,
  pricing: null,
};
const textOnly = {
  ...sonnet,
  id: "zai/glm-5.3",
  name: "GLM 5.3",
  vision: false,
};

beforeEach(() => {
  send.mockReset().mockResolvedValue({ ids: ["e1"] });
  gateway.findAgentModel.mockReset().mockResolvedValue(sonnet);
  gateway.getAgentModels.mockReset().mockResolvedValue([sonnet, textOnly]);
  gateway.pickDefaultModel.mockReset().mockReturnValue(sonnet);
  workspace.wakeSandbox.mockReset();
  workspace.writeVersionToSandbox.mockReset();
});
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
    message: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    version: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    attachment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    creditLedger: {
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  Object.assign(db.project, { update: vi.fn().mockResolvedValue({}) });
  db.$transaction.mockImplementation(
    (fn: ((tx: typeof db) => unknown) | Promise<unknown>[]) =>
      Array.isArray(fn) ? Promise.all(fn) : fn(db),
  );
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
      () => caller.model.list(),
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
  test("applies the ownership filter and returns the workspace state", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({
      ...project,
      previewUrl: null,
      messages: [{ content: "Build a coffee site" }],
    });
    db.message.count.mockResolvedValue(1);
    db.version.findFirst.mockResolvedValue({ number: 3 });
    await expect(
      createCaller(ctx).project.bySlug({ slug: "demo" }),
    ).resolves.toEqual({
      ...project,
      previewUrl: null,
      prompt: "Build a coffee site",
      building: true,
      version: 3,
    });
    expect(db.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "demo", userId: "u1" } }),
    );
    expect(db.message.count).toHaveBeenCalledWith({
      where: {
        project: { slug: "demo", userId: "u1" },
        role: "USER",
        replies: { none: {} },
      },
    });
  });

  test("is idle with no version when nothing is pending", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ ...project, messages: [] });
    await expect(
      createCaller(ctx).project.bySlug({ slug: "demo" }),
    ).resolves.toMatchObject({ prompt: null, building: false, version: null });
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
      Promise.resolve({
        id: "p1",
        slug: data.slug,
        name: data.name,
        messages: [{ id: "m1" }],
      }),
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
          messages: {
            create: {
              role: "USER",
              content: prompt,
              model: sonnet.id,
              attachments: { connect: [] },
            },
          },
        },
      }),
    );
    expect(gateway.findAgentModel).toHaveBeenCalledWith(undefined);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({
      name: "agent/run",
      data: { projectId: "p1", userId: "u1", messageId: "m1" },
    });
  });

  test("stores the chosen model and links the user's images", async () => {
    const { ctx, db } = signedIn();
    db.attachment.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    db.project.create.mockResolvedValue({
      id: "p1",
      slug: "x",
      name: "X",
      messages: [{ id: "m1" }],
    });
    await createCaller(ctx).project.create({
      prompt,
      model: sonnet.id,
      attachmentIds: ["a1", "a2", "a1"],
    });
    expect(gateway.findAgentModel).toHaveBeenCalledWith(sonnet.id);
    expect(db.attachment.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1", "a2"] }, userId: "u1", messageId: null },
      select: { id: true },
    });
    expect(
      db.project.create.mock.calls[0][0].data.messages.create.attachments,
    ).toEqual({ connect: [{ id: "a1" }, { id: "a2" }] });
  });

  test("rejects an unknown model", async () => {
    const { ctx, db } = signedIn();
    gateway.findAgentModel.mockResolvedValue(null);
    await expect(
      createCaller(ctx).project.create({ prompt, model: "nope/model" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.project.create).not.toHaveBeenCalled();
  });

  test("rejects images that aren't the user's or are already used", async () => {
    const { ctx, db } = signedIn();
    db.attachment.findMany.mockResolvedValue([{ id: "a1" }]);
    await expect(
      createCaller(ctx).project.create({ prompt, attachmentIds: ["a1", "a2"] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.project.create).not.toHaveBeenCalled();
  });

  test("rejects images for a model without vision", async () => {
    const { ctx, db } = signedIn();
    gateway.findAgentModel.mockResolvedValue(textOnly);
    db.attachment.findMany.mockResolvedValue([{ id: "a1" }]);
    await expect(
      createCaller(ctx).project.create({ prompt, attachmentIds: ["a1"] }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/can't read images/),
    });
  });

  test("allows at most four images", async () => {
    const { ctx } = signedIn();
    await expect(
      createCaller(ctx).project.create({
        prompt,
        attachmentIds: ["1", "2", "3", "4", "5"],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("still returns the project when the agent can't be started", async () => {
    const { ctx, db } = signedIn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValue(new Error("Inngest is down"));
    db.project.create.mockResolvedValue({
      id: "p1",
      slug: "x",
      name: "X",
      messages: [{ id: "m1" }],
    });
    await expect(createCaller(ctx).project.create({ prompt })).resolves.toEqual(
      { id: "p1", slug: "x", name: "X" },
    );
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test("retries with a suffix when the slug is taken", async () => {
    const { ctx, db } = signedIn();
    db.project.create
      .mockRejectedValueOnce(uniqueViolation())
      .mockImplementation(({ data }) =>
        Promise.resolve({
          id: "p2",
          slug: data.slug,
          name: data.name,
          messages: [{ id: "m2" }],
        }),
      );
    const result = await createCaller(ctx).project.create({ prompt });
    expect(result.slug).toMatch(/^landing-page-for-ember-and-oak-[a-z0-9]{4}$/);
    expect(db.project.create).toHaveBeenCalledTimes(2);
  });

  test("treats a P2002 without target metadata as a slug conflict", async () => {
    const { ctx, db } = signedIn();
    db.project.create
      .mockRejectedValueOnce(uniqueViolation(undefined))
      .mockResolvedValue({
        id: "p2",
        slug: "x",
        name: "x",
        messages: [{ id: "m2" }],
      });
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
    expect(send).not.toHaveBeenCalled();
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

describe("model.list", () => {
  test("returns the curated models and the default", async () => {
    const { ctx } = signedIn();
    await expect(createCaller(ctx).model.list()).resolves.toEqual({
      models: [sonnet, textOnly],
      defaultModelId: sonnet.id,
    });
  });

  test("reports an unavailable catalogue", async () => {
    const { ctx } = signedIn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    gateway.getAgentModels.mockRejectedValue(new Error("down"));
    await expect(createCaller(ctx).model.list()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    error.mockRestore();
  });
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

describe("workspace procedures reject signed-out callers", () => {
  test("message, version and sandbox", async () => {
    const caller = createCaller(makeContext().ctx);
    for (const call of [
      () => caller.message.list({ projectId: "p1" }),
      () => caller.message.send({ projectId: "p1", prompt: "Add a footer" }),
      () => caller.message.stop({ projectId: "p1" }),
      () => caller.message.retry({ messageId: "m1" }),
      () => caller.version.list({ projectId: "p1" }),
      () => caller.version.files({ projectId: "p1" }),
      () => caller.version.restore({ projectId: "p1", number: 1 }),
      () => caller.sandbox.wake({ projectId: "p1" }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });
});

const message = {
  content: "",
  parts: null,
  model: null,
  replyToId: null,
  stopRequestedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  _count: { replies: 0 },
  attachments: [],
};

describe("message.list", () => {
  test("rejects a project the user does not own", async () => {
    const { ctx, db } = signedIn();
    await expect(
      createCaller(ctx).message.list({ projectId: "p1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1", userId: "u1" } }),
    );
  });

  test("orders replies under their prompt and attaches versions", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ id: "p1" });
    db.message.findMany.mockResolvedValue([
      {
        ...message,
        id: "u1",
        role: "USER",
        content: "Build",
        _count: { replies: 1 },
        attachments: [
          { id: "a1", name: "ref.png", contentType: "image/png", key: "k1" },
        ],
      },
      {
        ...message,
        id: "u2",
        role: "USER",
        content: "Add footer",
        stopRequestedAt: new Date(),
      },
      {
        ...message,
        id: "run_r1_reply",
        role: "ASSISTANT",
        content: "Done",
        parts: [{ type: "text", text: "Done" }],
        replyToId: "u1",
      },
    ]);
    db.version.findMany.mockResolvedValue([
      { number: 1, title: "First", creditCost: 42, runId: "r1" },
    ]);
    const result = await createCaller(ctx).message.list({ projectId: "p1" });
    expect(result.latestVersion).toBe(1);
    expect(result.messages.map((item) => item.id)).toEqual([
      "u1",
      "run_r1_reply",
      "u2",
    ]);
    expect(result.messages[0]).toMatchObject({
      pending: false,
      attachments: [{ id: "a1", url: "https://files.test/k1" }],
    });
    expect(result.messages[1]).toMatchObject({
      version: { number: 1, title: "First", creditCost: 42 },
      parts: [{ type: "text", text: "Done" }],
    });
    expect(result.messages[2]).toMatchObject({ pending: true, stopping: true });
  });
});

describe("message.send", () => {
  test("stores the follow-up and starts the agent", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ id: "p1" });
    db.message.create.mockResolvedValue({ id: "m9" });
    await expect(
      createCaller(ctx).message.send({
        projectId: "p1",
        prompt: "  Add a footer ",
      }),
    ).resolves.toEqual({ id: "m9" });
    expect(db.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "p1",
          role: "USER",
          content: "Add a footer",
          model: sonnet.id,
        }),
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "agent/run",
        data: { projectId: "p1", userId: "u1", messageId: "m9" },
      }),
    );
  });

  test("rejects images for a model without vision", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ id: "p1" });
    gateway.findAgentModel.mockResolvedValue(textOnly);
    db.attachment.findMany.mockResolvedValue([{ id: "a1" }]);
    await expect(
      createCaller(ctx).message.send({
        projectId: "p1",
        prompt: "Like this",
        attachmentIds: ["a1"],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.message.create).not.toHaveBeenCalled();
  });
});

describe("message.stop", () => {
  test("replies at once to a prompt that hasn't started", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ id: "p1" });
    db.message.findMany.mockResolvedValue([{ id: "m1" }]);
    await expect(
      createCaller(ctx).message.stop({ projectId: "p1" }),
    ).resolves.toEqual({ stopped: 1 });
    expect(db.message.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", startedAt: null, stopRequestedAt: null },
      data: { stopRequestedAt: expect.any(Date) },
    });
    expect(db.message.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stopped_m1" },
        create: expect.objectContaining({
          replyToId: "m1",
          parts: [{ type: "stopped" }],
        }),
      }),
    );
  });

  test("flags a running prompt for the loop to stop", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ id: "p1" });
    db.message.findMany.mockResolvedValue([{ id: "m1" }]);
    db.message.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    await createCaller(ctx).message.stop({ projectId: "p1" });
    expect(db.message.updateMany).toHaveBeenLastCalledWith({
      where: { id: "m1", stopRequestedAt: null },
      data: { stopRequestedAt: expect.any(Date) },
    });
    expect(db.message.upsert).not.toHaveBeenCalled();
  });
});

describe("message.retry", () => {
  const reply = {
    projectId: "p1",
    replyToId: "u1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  test("re-runs the prompt of the latest reply", async () => {
    const { ctx, db } = signedIn();
    db.message.findFirst.mockResolvedValue(reply);
    await expect(
      createCaller(ctx).message.retry({ messageId: "r1" }),
    ).resolves.toEqual({ messageId: "u1" });
    expect(db.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1", role: "ASSISTANT", project: { userId: "u1" } },
      }),
    );
    expect(db.message.updateMany).toHaveBeenCalledWith({
      where: { replyToId: "u1" },
      data: { replyToId: null },
    });
    expect(db.message.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { startedAt: null, stopRequestedAt: null },
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { projectId: "p1", userId: "u1", messageId: "u1" },
      }),
    );
  });

  test("refuses an older reply or a busy project", async () => {
    const { ctx, db } = signedIn();
    db.message.findFirst.mockResolvedValue(reply);
    db.message.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(
      createCaller(ctx).message.retry({ messageId: "r1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    db.message.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(
      createCaller(ctx).message.retry({ messageId: "r1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("version.files", () => {
  test("returns the latest version with A / M markers", async () => {
    const { ctx, db } = signedIn();
    db.version.findFirst
      .mockResolvedValueOnce({
        number: 2,
        title: "Footer",
        files: { "app/page.tsx": "new", "components/footer.tsx": "x", a: "1" },
      })
      .mockResolvedValueOnce({ files: { "app/page.tsx": "old", a: "1" } });
    await expect(
      createCaller(ctx).version.files({ projectId: "p1" }),
    ).resolves.toEqual({
      number: 2,
      title: "Footer",
      files: { "app/page.tsx": "new", "components/footer.tsx": "x", a: "1" },
      changes: { "app/page.tsx": "M", "components/footer.tsx": "A" },
    });
    expect(db.version.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          projectId: "p1",
          project: { userId: "u1" },
          status: "READY",
        },
      }),
    );
  });

  test("is null before the first version and NOT_FOUND for a missing one", async () => {
    const { ctx } = signedIn();
    await expect(
      createCaller(ctx).version.files({ projectId: "p1" }),
    ).resolves.toBeNull();
    await expect(
      createCaller(ctx).version.files({ projectId: "p1", number: 4 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("version.restore", () => {
  test("saves a new version from the old files and rewrites the sandbox", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ id: "p1", sandboxId: "sbx" });
    db.version.findFirst
      .mockResolvedValueOnce({ number: 1, files: { a: "1" } })
      .mockResolvedValueOnce({ number: 3 });
    workspace.writeVersionToSandbox.mockResolvedValue({ written: true });
    await expect(
      createCaller(ctx).version.restore({ projectId: "p1", number: 1 }),
    ).resolves.toEqual({ number: 4, sandboxUpdated: true });
    expect(db.version.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "p1",
        number: 4,
        title: "Restored v1",
        files: { a: "1" },
        creditCost: 0,
      }),
    });
    expect(db.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: "ASSISTANT",
        content: "Restored version 1 as version 4.",
      }),
    });
    expect(workspace.writeVersionToSandbox).toHaveBeenCalledWith("sbx", {
      a: "1",
    });
  });

  test("is refused while building", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ id: "p1", sandboxId: null });
    db.message.count.mockResolvedValue(1);
    await expect(
      createCaller(ctx).version.restore({ projectId: "p1", number: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.version.create).not.toHaveBeenCalled();
  });
});

describe("sandbox.wake", () => {
  test("wakes the sandbox when a version exists", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({
      id: "p1",
      sandboxId: "sbx",
      previewUrl: null,
    });
    db.version.findFirst.mockResolvedValue({ id: "v1" });
    workspace.wakeSandbox.mockResolvedValue({
      previewUrl: "https://3000-sbx.e2b.app",
      created: false,
    });
    await expect(
      createCaller(ctx).sandbox.wake({ projectId: "p1" }),
    ).resolves.toEqual({
      status: "ready",
      previewUrl: "https://3000-sbx.e2b.app",
    });
    expect(workspace.wakeSandbox).toHaveBeenCalledWith({
      projectId: "p1",
      sandboxId: "sbx",
    });
  });

  test("leaves the sandbox alone while building or before a version", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({
      id: "p1",
      sandboxId: null,
      previewUrl: "https://x.e2b.app",
    });
    db.message.count.mockResolvedValueOnce(1);
    await expect(
      createCaller(ctx).sandbox.wake({ projectId: "p1" }),
    ).resolves.toEqual({ status: "building", previewUrl: "https://x.e2b.app" });
    await expect(
      createCaller(ctx).sandbox.wake({ projectId: "p1" }),
    ).resolves.toEqual({ status: "empty", previewUrl: null });
    expect(workspace.wakeSandbox).not.toHaveBeenCalled();
  });
});
