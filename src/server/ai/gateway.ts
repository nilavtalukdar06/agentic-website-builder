import "server-only";
import { createGateway } from "ai";
import { env } from "@/config/env";
import { type AgentModel, toAgentModels } from "@/lib/ai/models";

export const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });

const CATALOG_TTL_MS = 60 * 60_000;
let catalog: { at: number; models: AgentModel[] } | null = null;

export async function getAgentModels() {
  if (catalog && Date.now() - catalog.at < CATALOG_TTL_MS) {
    return catalog.models;
  }
  const { models } = await gateway.getAvailableModels();
  const agentModels = toAgentModels(models);
  catalog = { at: Date.now(), models: agentModels };
  return agentModels;
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
