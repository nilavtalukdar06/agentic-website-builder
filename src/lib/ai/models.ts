export type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok: number | null;
  cacheWritePerMTok: number | null;
};

export type AgentModel = {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  vision: boolean;
  pricing: ModelPricing | null;
};

type CuratedModel = { id: string; vision: boolean };

export const providerLabels: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  moonshotai: "Moonshot AI",
  zai: "Z.ai",
  deepseek: "DeepSeek",
  alibaba: "Alibaba",
  mistral: "Mistral",
};

export const curatedModels: CuratedModel[] = [
  { id: "anthropic/claude-sonnet-5.5", vision: true },
  { id: "anthropic/claude-opus-5.5", vision: true },
  { id: "anthropic/claude-fable-5.2", vision: true },
  { id: "anthropic/claude-haiku-5.5", vision: true },
  { id: "openai/gpt-5.3-codex", vision: true },
  { id: "openai/gpt-6.1-sol", vision: true },
  { id: "openai/gpt-6.1-terra", vision: true },
  { id: "openai/gpt-5.1-codex-mini", vision: true },
  { id: "google/gemini-4-carbon", vision: true },
  { id: "google/gemini-3.8-flash", vision: true },
  { id: "moonshotai/kimi-k2.7-code", vision: true },
  { id: "moonshotai/kimi-k3", vision: true },
  { id: "zai/glm-5.3", vision: false },
  { id: "zai/glm-5.3-flash", vision: true },
  { id: "deepseek/deepseek-v4.1-flash", vision: true },
  { id: "alibaba/qwen3.8-max", vision: true },
  { id: "alibaba/qwen3-coder-next", vision: false },
  { id: "mistral/mistral-large-4", vision: true },
];

export type GatewayModelEntry = {
  id: string;
  name: string;
  modelType?: string | null;
  pricing?: {
    input: string;
    output: string;
    cachedInputTokens?: string;
    cacheCreationInputTokens?: string;
  } | null;
};

const perMillion = (value: string | undefined) => {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number((parsed * 1e6).toFixed(6)) : null;
};

export function toAgentModels(
  entries: GatewayModelEntry[],
  curated: CuratedModel[] = curatedModels,
): AgentModel[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return curated.flatMap(({ id, vision }) => {
    const entry = byId.get(id);
    if (!entry) return [];
    if (entry.modelType && entry.modelType !== "language") return [];
    const provider = id.split("/")[0];
    const input = perMillion(entry.pricing?.input);
    const output = perMillion(entry.pricing?.output);
    return [
      {
        id,
        name: entry.name,
        provider,
        providerLabel: providerLabels[provider] ?? provider,
        vision,
        pricing:
          input !== null && output !== null
            ? {
                inputPerMTok: input,
                outputPerMTok: output,
                cachedInputPerMTok: perMillion(
                  entry.pricing?.cachedInputTokens,
                ),
                cacheWritePerMTok: perMillion(
                  entry.pricing?.cacheCreationInputTokens,
                ),
              }
            : null,
      },
    ];
  });
}

export function groupByProvider(models: AgentModel[]) {
  const groups = new Map<string, AgentModel[]>();
  for (const model of models) {
    const group = groups.get(model.providerLabel) ?? [];
    group.push(model);
    groups.set(model.providerLabel, group);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

export function formatPrice(pricing: ModelPricing | null) {
  if (!pricing) return null;
  const format = (value: number) =>
    `$${value < 1 ? value.toFixed(2) : Number(value.toFixed(2)).toString()}`;
  return `${format(pricing.inputPerMTok)} / ${format(pricing.outputPerMTok)} per 1M tokens`;
}
