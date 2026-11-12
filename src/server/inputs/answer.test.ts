// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import { answerInputRequest } from "./answer";

const payloads = {
  choice: {
    request: {
      kind: "choice",
      question: "Which provider?",
      options: ["Gemini API directly", "Vercel AI Gateway"],
    },
  },
  text: { request: { kind: "text", question: "Cafe name?" } },
  secret: {
    request: {
      kind: "secret",
      name: "OPENAI_API_KEY",
      label: "OpenAI API key",
      reason: "Chat",
    },
  },
  confirm: {
    request: {
      kind: "confirm",
      action: "Install x",
      risk: "medium",
      summary: "s",
    },
    packages: ["x"],
  },
};

function makeDb(kind: keyof typeof payloads, status = "PENDING") {
  const db = {
    inputRequest: {
      findFirst: vi.fn().mockResolvedValue({
        id: "i1",
        projectId: "p1",
        messageId: "m1",
        chainId: "r0",
        status,
        payload: payloads[kind],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    projectSecret: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    secretEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) =>
    fn(db),
  );
  return db;
}

const send = vi.fn();

beforeEach(() => {
  send.mockReset().mockResolvedValue(undefined);
});

const answer = (db: ReturnType<typeof makeDb>, body: unknown) =>
  answerInputRequest(
    { db: db as never, send },
    { userId: "u1", requestId: "i1", body },
  );

describe("answerInputRequest", () => {
  test("404s for a missing or foreign request", async () => {
    const db = makeDb("text");
    db.inputRequest.findFirst.mockResolvedValue(null);
    await expect(answer(db, { text: "x" })).resolves.toMatchObject({
      status: 404,
    });
    expect(db.inputRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "i1", userId: "u1" } }),
    );
  });

  test("409s once answered", async () => {
    await expect(
      answer(makeDb("text", "ANSWERED"), { text: "x" }),
    ).resolves.toMatchObject({
      status: 409,
    });
  });

  test("validates each kind", async () => {
    await expect(
      answer(makeDb("choice"), { selected: ["Nope"] }),
    ).resolves.toMatchObject({
      status: 400,
    });
    await expect(
      answer(makeDb("choice"), {
        selected: ["Gemini API directly", "Vercel AI Gateway"],
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { error: "Pick one option." },
    });
    await expect(answer(makeDb("text"), {})).resolves.toMatchObject({
      status: 400,
    });
    await expect(
      answer(makeDb("confirm"), { approve: "yes" }),
    ).resolves.toMatchObject({
      status: 400,
    });
  });

  test("a waiting run gets the answer through the event", async () => {
    const db = makeDb("choice");
    await expect(
      answer(db, { selected: [], other: "OpenRouter" }),
    ).resolves.toEqual({ status: 200, body: { status: "answered" } });
    expect(db.inputRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", status: "PENDING" },
      data: expect.objectContaining({
        status: "ANSWERED",
        answer: { ok: true, answer: "OpenRouter" },
      }),
    });
    expect(send).toHaveBeenCalledWith({
      type: "provided",
      data: { requestId: "i1", ok: true, answer: "OpenRouter" },
    });
  });

  test("a secret is stored encrypted and never sent with the event", async () => {
    const db = makeDb("secret");
    const value = "sk-proj-SuperSecretValue999";
    await expect(answer(db, { value })).resolves.toMatchObject({ status: 200 });
    expect(db.projectSecret.upsert).toHaveBeenCalled();
    const everything = JSON.stringify([
      db.inputRequest.updateMany.mock.calls,
      db.projectSecret.upsert.mock.calls,
      db.secretEvent.create.mock.calls,
      send.mock.calls,
    ]);
    expect(everything).not.toContain(value);
    expect(send).toHaveBeenCalledWith({
      type: "provided",
      data: { requestId: "i1", ok: true },
    });
  });

  test("a paused run is continued with a new run", async () => {
    const db = makeDb("confirm", "PAUSED");
    await expect(answer(db, { approve: true })).resolves.toMatchObject({
      status: 200,
    });
    expect(send).toHaveBeenCalledWith({
      type: "resume",
      data: {
        projectId: "p1",
        userId: "u1",
        messageId: "m1",
        resume: { requestId: "i1", chainId: "r0" },
      },
    });
  });

  test("a run that paused while the user answered is continued", async () => {
    const db = makeDb("text");
    db.inputRequest.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    await answer(db, { text: "Ember" });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "resume" }),
    );
  });

  test("dismissing sends ok false, and a failed send reopens the question", async () => {
    const db = makeDb("text");
    send.mockRejectedValue(new Error("down"));
    await expect(answer(db, { dismiss: true })).resolves.toMatchObject({
      status: 503,
    });
    expect(db.inputRequest.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING" }),
      }),
    );
  });

  test("invalid secrets are rejected before anything is stored", async () => {
    const db = makeDb("secret");
    db.inputRequest.findFirst.mockResolvedValue({
      ...(await db.inputRequest.findFirst()),
      payload: {
        request: {
          kind: "secret",
          name: "DATABASE_URL",
          label: "DB",
          reason: "x",
        },
      },
    });
    await expect(
      answer(db, { value: "mysql://a:b@c/d" }),
    ).resolves.toMatchObject({
      status: 400,
    });
    expect(db.projectSecret.upsert).not.toHaveBeenCalled();
  });
});
