// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/ai/gateway", () => ({ gateway: vi.fn() }));

const { toModelMessages, toToolSet } = await import("./llm");

describe("toModelMessages", () => {
  test("maps text, images, tool calls and tool results onto AI SDK messages", () => {
    const messages = toModelMessages({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Click the add button" },
            { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
          ],
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Using click" },
            { type: "tool_use", id: "t1", name: "click", input: { ref: "e3" } },
          ],
        },
        {
          role: "user",
          content: {
            type: "tool_result",
            toolUseId: "t1",
            content: [{ type: "text", text: "clicked" }],
          },
        },
      ],
    } as never);
    expect(messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Click the add button" },
          { type: "file", data: "aGVsbG8=", mediaType: "image/png" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Using click" },
          {
            type: "tool-call",
            toolCallId: "t1",
            toolName: "click",
            input: { ref: "e3" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "t1",
            toolName: "click",
            output: { type: "text", value: "clicked" },
          },
        ],
      },
    ]);
  });

  test("keeps structured tool results as JSON", () => {
    const [message] = toModelMessages({
      messages: [
        {
          role: "user",
          content: {
            type: "tool_result",
            toolUseId: "x",
            content: [],
            structuredContent: { ok: true },
          },
        },
      ],
    } as never);
    expect(message).toMatchObject({
      role: "tool",
      content: [{ output: { type: "json", value: { ok: true } } }],
    });
  });
});

describe("toToolSet", () => {
  test("turns Stagehand's tools into AI SDK tools without execute functions", () => {
    const tools = toToolSet({
      messages: [],
      tools: [
        {
          name: "click",
          description: "Click an element",
          inputSchema: {
            type: "object",
            properties: { ref: { type: "string" } },
          },
        },
      ],
    } as never);
    expect(Object.keys(tools ?? {})).toEqual(["click"]);
    expect(tools?.click.description).toBe("Click an element");
    expect(
      "execute" in (tools?.click ?? {}) && tools?.click.execute,
    ).toBeFalsy();
  });

  test("returns nothing when there are no tools", () => {
    expect(toToolSet({ messages: [] } as never)).toBeUndefined();
  });
});
