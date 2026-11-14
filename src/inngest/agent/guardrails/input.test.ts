import { describe, expect, test, vi } from "vitest";
import { guardStoredPrompt, sanitizeHistory } from "./input";
import { historyToMessages } from "../conversation";

const secret = "sk-9Y5Q7Z2H8N4W6R3T1M0B9V8C7L6K5J4D";
const input = { userId: "u1", projectId: "p1", messageId: "m1", runId: "r1" };

function database(content: string) {
  return {
    message: {
      findFirst: vi.fn().mockResolvedValue({
        content,
        project: { name: "A website", description: content },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    project: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    guardEvent: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("guardStoredPrompt", () => {
  test("redacts legacy prompts and project text before returning only a verdict", async () => {
    const db = database(`Build with ${secret}`);
    db.message.findFirst.mockResolvedValue({
      content: `Build with ${secret}`,
      project: { name: `Key ${secret}`, description: `Use ${secret}` },
    });
    await expect(guardStoredPrompt(db as never, input)).resolves.toBe(true);
    expect(db.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "m1",
          projectId: "p1",
          role: "USER",
          project: { userId: "u1" },
        },
      }),
    );
    expect(db.message.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { content: "Build with [secret removed]" },
    });
    expect(db.project.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", userId: "u1" },
      data: {
        name: "Key [secret removed]",
        description: "Use [secret removed]",
      },
    });
    expect(
      JSON.stringify([
        db.message.update.mock.calls,
        db.project.updateMany.mock.calls,
        db.guardEvent.create.mock.calls,
      ]),
    ).not.toContain(secret);
    expect(db.guardEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        textHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });

  test("allows ordinary prompts without writes", async () => {
    const db = database("Build a bakery");
    await expect(guardStoredPrompt(db as never, input)).resolves.toBe(false);
    expect(db.message.update).not.toHaveBeenCalled();
    expect(db.project.updateMany).not.toHaveBeenCalled();
    expect(db.guardEvent.create).not.toHaveBeenCalled();
  });

  test("refuses a missing or unowned prompt", async () => {
    const db = database("");
    db.message.findFirst.mockResolvedValue(null);
    await expect(guardStoredPrompt(db as never, input)).rejects.toThrow(
      "Project or message not found",
    );
    expect(db.message.update).not.toHaveBeenCalled();
  });
});

describe("sanitizeHistory", () => {
  test("cleans old user and assistant messages before durable state or model context", async () => {
    const db = database("");
    const history = [
      { id: "old-user", role: "USER" as const, content: `Use ${secret}` },
      {
        id: "old-reply",
        role: "ASSISTANT" as const,
        content: `Echo ${secret}`,
      },
      {
        id: "new-user",
        role: "USER" as const,
        content: "Build a bakery",
        attachments: [],
      },
    ];
    const clean = await sanitizeHistory(db as never, history);
    expect(JSON.stringify(clean)).not.toContain(secret);
    expect(
      JSON.stringify(historyToMessages(clean, [], { vision: false })),
    ).not.toContain(secret);
    expect(db.message.update).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(db.message.update.mock.calls)).not.toContain(secret);
    expect(clean[2]).toEqual(history[2]);
  });
});
