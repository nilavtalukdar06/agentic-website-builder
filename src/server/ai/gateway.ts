import "server-only";
import { createGateway } from "ai";
import { env } from "@/config/env";
import { type AgentModel, toAgentModels } from "@/lib/ai/models";

export const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });

const CATALOG_TTL_MS = 60 * 60_000;
type GatewayEntries = Awaited<
  ReturnType<typeof gateway.getAvailableModels>
>["models"];

let catalog: {
  at: number;
  models: AgentModel[];
  entries: GatewayEntries;
} | null = null;

async function loadCatalog() {
  if (catalog && Date.now() - catalog.at < CATALOG_TTL_MS) return catalog;
  const { models } = await gateway.getAvailableModels();
  catalog = { at: Date.now(), models: toAgentModels(models), entries: models };
  return catalog;
}

export async function getAgentModels() {
  return (await loadCatalog()).models;
}

export async function findGuardModel(): Promise<AgentModel> {
  const id = env.AI_GUARD_MODEL;
  const fallback: AgentModel = {
    id,
    name: id,
    provider: id.split("/")[0],
    providerLabel: id.split("/")[0],
    vision: false,
    pricing: null,
  };
  const loaded = await loadCatalog().catch(() => null);
  if (!loaded) return fallback;
  return toAgentModels(loaded.entries, [{ id, vision: false }])[0] ?? fallback;
}

export function pickDefaultModel(models: AgentModel[]) {
  return models.find((model) => model.id === env.AI_DEFAULT_MODEL) ?? models[0];
}

export async function findAgentModel(id: string | null | undefined) {
  const models = await getAgentModels();
  if (!id) return pickDefaultModel(models) ?? null;
  return models.find((model) => model.id === id) ?? null;
}

export type GenerationCost = { id: string; costUsd: number };

export async function lookupGenerationCost(
  id: string,
): Promise<GenerationCost | null> {
  for (const delay of [0, 2000, 5000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const info = await gateway.getGenerationInfo({ id });
      return {
        id,
        costUsd: info.isByok ? info.upstreamInferenceCost : info.totalCost,
      };
    } catch {
      continue;
    }
  }
  return null;
}
