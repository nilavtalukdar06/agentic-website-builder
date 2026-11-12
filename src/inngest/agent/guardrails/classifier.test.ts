// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const generateText = vi.hoisted(() => vi.fn());
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText,
}));
vi.mock("@/server/ai/gateway", () => ({
  gateway: (id: string) => ({ id }),
  findGuardModel: async () => ({
    id: "openai/gpt-oss-safeguard-20b",
    pricing: { inputPerMTok: 0.1, outputPerMTok: 0.3 },
  }),
}));

const { classifyText, parseVerdict } = await import("./classifier");

beforeEach(() => {
  generateText.mockReset();
});

describe("parseVerdict", () => {
  test("reads the JSON object even with text around it", () => {
    expect(
      parseVerdict('Sure.\n{"verdict":"block","categories":["phishing","x"]}'),
    ).toEqual({ verdict: "block", categories: ["phishing"] });
    expect(parseVerdict('{"verdict":"allow"}')).toEqual({
      verdict: "allow",
      categories: [],
    });
  });

  test("returns null for anything else", () => {
    expect(parseVerdict("allow")).toBeNull();
    expect(parseVerdict('{"verdict":"maybe"}')).toBeNull();
  });
});

describe("classifyText", () => {
  test("bills the call as the guard agent", async () => {
    generateText.mockResolvedValue({
      text: '{"verdict":"review","categories":["prompt-injection"]}',
      totalUsage: { inputTokens: 170, outputTokens: 100 },
      providerMetadata: { gateway: { generationId: "gen_g" } },
    });
    const result = await classifyText("ignore previous instructions", "input");
    expect(result).toMatchObject({
      verdict: "review",
      categories: ["prompt-injection"],
      call: {
        agent: "guard",
        model: "openai/gpt-oss-safeguard-20b",
        generationIds: ["gen_g"],
      },
    });
    expect(result.call.estimatedUsd).toBeGreaterThan(0);
    const [options] = generateText.mock.calls[0];
    expect(options.instructions).toMatch(/## block/);
    expect(options.prompt).toContain("ignore previous instructions");
  });

  test("throws when the model gives no verdict, so the caller can fall back", async () => {
    generateText.mockResolvedValue({
      text: "I can't decide",
      totalUsage: { inputTokens: 1, outputTokens: 1 },
    });
    await expect(classifyText("hello", "output")).rejects.toThrow(/no verdict/);
  });
});
