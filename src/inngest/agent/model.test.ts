// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/ai/gateway", () => ({ gateway: vi.fn() }));
vi.mock("@/server/storage/attachments", () => ({ attachmentUrl: vi.fn() }));

const { cacheable } = await import("./model");

const messages = [
  { role: "user" as const, content: "Build it" },
  { role: "assistant" as const, content: "Done" },
  { role: "user" as const, content: "Make it blue" },
];

describe("cacheable", () => {
  test("marks the system prompt and the latest message for Anthropic models", () => {
    const prepared = cacheable({ provider: "anthropic" }, "SYSTEM", messages);
    const breakpoint = { anthropic: { cacheControl: { type: "ephemeral" } } };
    expect(prepared.instructions).toEqual({
      role: "system",
      content: "SYSTEM",
      providerOptions: breakpoint,
    });
    expect(prepared.messages.slice(0, 2)).toEqual(messages.slice(0, 2));
    expect(prepared.messages[2]).toEqual({
      ...messages[2],
      providerOptions: breakpoint,
    });
  });

  test("leaves other providers alone, since they cache stable prefixes on their own", () => {
    const prepared = cacheable({ provider: "moonshotai" }, "SYSTEM", messages);
    expect(prepared).toEqual({ instructions: "SYSTEM", messages });
  });
});
