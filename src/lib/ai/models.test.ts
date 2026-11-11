import { describe, expect, test } from "vitest";
import {
  type AgentModel,
  formatPrice,
  groupByProvider,
  toAgentModels,
} from "./models";

const curated = [
  { id: "anthropic/claude-sonnet-5.5", vision: true },
  { id: "zai/glm-5.3", vision: false },
  { id: "openai/retired-model", vision: true },
];

describe("toAgentModels", () => {
  test("keeps curated order, live names and per-million prices", () => {
    const models = toAgentModels(
      [
        {
          id: "zai/glm-5.3",
          name: "GLM 5.3",
          modelType: "language",
          pricing: { input: "0.0000014", output: "0.0000044" },
        },
        {
          id: "anthropic/claude-sonnet-5.5",
          name: "Claude Sonnet 5.5",
          pricing: {
            input: "0.000002",
            output: "0.00001",
            cachedInputTokens: "0.0000002",
            cacheCreationInputTokens: "0.0000025",
          },
        },
        { id: "openai/not-curated", name: "Nope" },
      ],
      curated,
    );
    expect(models).toEqual([
      {
        id: "anthropic/claude-sonnet-5.5",
        name: "Claude Sonnet 5.5",
        provider: "anthropic",
        providerLabel: "Anthropic",
        vision: true,
        pricing: {
          inputPerMTok: 2,
          outputPerMTok: 10,
          cachedInputPerMTok: 0.2,
          cacheWritePerMTok: 2.5,
        },
      },
      {
        id: "zai/glm-5.3",
        name: "GLM 5.3",
        provider: "zai",
        providerLabel: "Z.ai",
        vision: false,
        pricing: {
          inputPerMTok: 1.4,
          outputPerMTok: 4.4,
          cachedInputPerMTok: null,
          cacheWritePerMTok: null,
        },
      },
    ]);
  });

  test("drops non-language entries and keeps models without prices", () => {
    expect(
      toAgentModels(
        [
          {
            id: "anthropic/claude-sonnet-5.5",
            name: "Sonnet",
            modelType: "embedding",
          },
          { id: "zai/glm-5.3", name: "GLM", pricing: null },
        ],
        curated,
      ).map((model) => [model.id, model.pricing]),
    ).toEqual([["zai/glm-5.3", null]]);
  });
});

describe("groupByProvider", () => {
  test("groups in first-seen order", () => {
    const model = (id: string, providerLabel: string) =>
      ({ id, providerLabel }) as AgentModel;
    expect(
      groupByProvider([
        model("a/1", "A"),
        model("b/1", "B"),
        model("a/2", "A"),
      ]).map(({ label, items }) => [label, items.map((item) => item.id)]),
    ).toEqual([
      ["A", ["a/1", "a/2"]],
      ["B", ["b/1"]],
    ]);
  });
});

describe("formatPrice", () => {
  test("formats input and output per million tokens", () => {
    expect(
      formatPrice({
        inputPerMTok: 2,
        outputPerMTok: 10,
        cachedInputPerMTok: null,
        cacheWritePerMTok: null,
      }),
    ).toBe("$2 / $10 per 1M tokens");
    expect(
      formatPrice({
        inputPerMTok: 0.15,
        outputPerMTok: 0.5,
        cachedInputPerMTok: null,
        cacheWritePerMTok: null,
      }),
    ).toBe("$0.15 / $0.50 per 1M tokens");
    expect(formatPrice(null)).toBeNull();
  });
});
