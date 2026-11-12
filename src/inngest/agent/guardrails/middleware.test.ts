import { describe, expect, test } from "vitest";
import { createRedactor } from "@/server/secrets/redact";
import { createWindow, secretRedactionMiddleware } from "./middleware";

const secret = "sk-proj-SECRETVALUE123";
const redactor = createRedactor([{ name: "OPENAI_API_KEY", value: secret }]);

async function collect(chunks: string[]) {
  const middleware = secretRedactionMiddleware(redactor);
  const parts = [
    { type: "text-start", id: "t" },
    ...chunks.map((delta) => ({ type: "text-delta", id: "t", delta })),
    { type: "text-end", id: "t" },
  ];
  const result = await middleware.wrapStream!({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          for (const part of parts) controller.enqueue(part);
          controller.close();
        },
      }),
    }),
  } as never);
  const out: { type: string; delta?: string }[] = [];
  const reader = result.stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out.push(value as never);
  }
  return out;
}

describe("secret redaction middleware", () => {
  test("catches a secret split across stream chunks", async () => {
    const out = await collect([
      "The key is sk-pr",
      "oj-SECRET",
      "VALUE123, done",
    ]);
    const text = out.map((part) => part.delta ?? "").join("");
    expect(text).toBe("The key is [secret OPENAI_API_KEY], done");
    expect(out.some((part) => part.delta?.includes("sk-pr"))).toBe(false);
    expect(out.at(-1)).toEqual({ type: "text-end", id: "t" });
  });

  test("still streams text before the hold-back window", () => {
    const window = createWindow(redactor);
    const first = window.push("t", "x".repeat(200));
    expect(first.length).toBeGreaterThan(100);
    expect(first + window.flush("t")).toBe("x".repeat(200));
  });

  test("redacts generated text and reasoning", async () => {
    const middleware = secretRedactionMiddleware(redactor);
    const result = await middleware.wrapGenerate!({
      doGenerate: async () => ({
        content: [
          { type: "text", text: `use ${secret}` },
          { type: "reasoning", text: secret },
          { type: "tool-call", toolCallId: "c", toolName: "x", input: "{}" },
        ],
      }),
    } as never);
    expect(result.content).toEqual([
      { type: "text", text: "use [secret OPENAI_API_KEY]" },
      { type: "reasoning", text: "[secret OPENAI_API_KEY]" },
      { type: "tool-call", toolCallId: "c", toolName: "x", input: "{}" },
    ]);
  });
});
