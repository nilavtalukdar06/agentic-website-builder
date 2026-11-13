// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const send = vi.hoisted(() => vi.fn());
const gateway = vi.hoisted(() => ({
  findAgentModel: vi.fn(),
  getAgentModels: vi.fn(),
  pickDefaultModel: vi.fn(),
}));
vi.mock("@/inngest/client", () => ({ inngest: { send } }));
vi.mock("@/server/ai/gateway", () => gateway);
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/server/secrets/refresh", () => ({
  refreshSandboxSecrets: refresh,
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

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
  refresh.mockReset().mockResolvedValue(undefined);
  gateway.findAgentModel.mockReset().mockResolvedValue(sonnet);
  gateway.getAgentModels.mockReset().mockResolvedValue([sonnet, textOnly]);
  gateway.pickDefaultModel.mockReset().mockReturnValue(sonnet);
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
    },
    attachment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    creditLedger: {
      aggregate: vi.fn(),
    },
    inputRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    projectSecret: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    secretEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) =>
    fn(db),
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
  test("applies the ownership filter and returns the first prompt", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({
      ...project,
      previewUrl: null,
      messages: [{ content: "Build a coffee site" }],
    });
    await expect(
      createCaller(ctx).project.bySlug({ slug: "demo" }),
    ).resolves.toEqual({
      ...project,
      previewUrl: null,
      prompt: "Build a coffee site",
      agent: { status: "building", reply: null },
    });
    expect(db.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "demo", userId: "u1" } }),
    );
    expect(db.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { project: { slug: "demo", userId: "u1" } },
      }),
    );
  });

  test.each([
    [{ role: "USER", content: "Add a footer", parts: null }, "building", null],
    [
      {
        role: "ASSISTANT",
        content: "Built it",
        parts: [{ type: "text", text: "Built it" }],
      },
      "done",
      "Built it",
    ],
    [
      {
        role: "ASSISTANT",
        content: "Failed",
        parts: [{ type: "error", message: "Failed" }],
      },
      "failed",
      "Failed",
    ],
  ])(
    "reports the agent state from the latest message (%#)",
    async (latest, status, reply) => {
      const { ctx, db } = signedIn();
      db.project.findFirst.mockResolvedValue({ ...project, messages: [] });
      db.message.findFirst.mockResolvedValue(latest);
      await expect(
        createCaller(ctx).project.bySlug({ slug: "demo" }),
      ).resolves.toMatchObject({ agent: { status, reply } });
    },
  );

  test("reports a paused agent with its open question", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ ...project, messages: [] });
    db.message.findFirst.mockResolvedValue({
      role: "ASSISTANT",
      content: "I need your answer to continue.",
      parts: [],
    });
    db.inputRequest.findFirst.mockResolvedValue({
      kind: "SECRET",
      payload: {
        request: {
          kind: "secret",
          name: "OPENAI_API_KEY",
          label: "OpenAI API key",
          reason: "For the chat feature",
        },
      },
    });
    await expect(
      createCaller(ctx).project.bySlug({ slug: "demo" }),
    ).resolves.toMatchObject({
      agent: {
        status: "paused",
        question: {
          kind: "secret",
          question: "OpenAI API key (OPENAI_API_KEY)",
        },
      },
    });
    expect(db.inputRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          project: { slug: "demo", userId: "u1" },
          status: { in: ["PENDING", "PAUSED"] },
        },
      }),
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
              mode: "STANDARD",
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

  test("stores fast mode on the message", async () => {
    const { ctx, db } = signedIn();
    db.project.create.mockResolvedValue({
      id: "p1",
      slug: "x",
      name: "X",
      messages: [{ id: "m1" }],
    });
    await createCaller(ctx).project.create({ prompt, mode: "fast" });
    expect(db.project.create.mock.calls[0][0].data.messages.create.mode).toBe(
      "FAST",
    );
  });

  test("rejects an unknown mode", async () => {
    const { ctx } = signedIn();
    await expect(
      createCaller(ctx).project.create({
        prompt,
        mode: "turbo" as never,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
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

describe("secret", () => {
  test("requires a session", async () => {
    const { ctx } = makeContext();
    await expect(
      createCaller(ctx).secret.list({ projectId: "p1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("lists names only, for the owner's project", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ id: "p1" });
    db.projectSecret.findMany.mockResolvedValue([
      {
        name: "OPENAI_API_KEY",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      },
    ]);
    const list = await createCaller(ctx).secret.list({ projectId: "p1" });
    expect(list.map((entry) => entry.name)).toEqual(["OPENAI_API_KEY"]);
    expect(db.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1", userId: "u1" } }),
    );
    expect(db.projectSecret.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          name: true,
          createdAt: true,
          updatedAt: true,
          lastUsedAt: true,
        },
      }),
    );
  });

  test("hides other users' projects", async () => {
    const { ctx } = signedIn();
    await expect(
      createCaller(ctx).secret.list({ projectId: "p2" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("deletes a secret, records it and refreshes the sandbox", async () => {
    const { ctx, db } = signedIn();
    db.project.findFirst.mockResolvedValue({ id: "p1" });
    await expect(
      createCaller(ctx).secret.delete({
        projectId: "p1",
        name: "OPENAI_API_KEY",
      }),
    ).resolves.toEqual({ name: "OPENAI_API_KEY" });
    expect(db.secretEvent.create).toHaveBeenCalledWith({
      data: {
        projectId: "p1",
        userId: "u1",
        name: "OPENAI_API_KEY",
        action: "DELETED",
      },
    });
    expect(refresh).toHaveBeenCalledWith("p1");
  });

  test("rejects invalid names", async () => {
    const { ctx } = signedIn();
    await expect(
      createCaller(ctx).secret.delete({ projectId: "p1", name: "lower" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
