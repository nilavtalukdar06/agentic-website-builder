import { describe, expect, test } from "vitest";
import { orderConversation } from "./conversation-order";

const user = (id: string) => ({ id, role: "USER" as const, replyToId: null });
const reply = (id: string, replyToId: string | null) => ({
  id,
  role: "ASSISTANT" as const,
  replyToId,
});

describe("orderConversation", () => {
  test("puts each reply under its prompt, even when a queued prompt came first", () => {
    const ordered = orderConversation([
      user("u1"),
      user("u2"),
      reply("a1", "u1"),
      reply("a2", "u2"),
    ]);
    expect(ordered.map((message) => message.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
    ]);
  });

  test("keeps unlinked notes and replies to missing prompts in place", () => {
    const ordered = orderConversation([
      user("u1"),
      reply("a1", "u1"),
      reply("restore", null),
      reply("orphan", "gone"),
    ]);
    expect(ordered.map((message) => message.id)).toEqual([
      "u1",
      "a1",
      "restore",
      "orphan",
    ]);
  });
});
