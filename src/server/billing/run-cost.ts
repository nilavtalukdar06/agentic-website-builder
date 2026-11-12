export const SEARCH_FEE_USD = 0.005;

export type BilledCall = {
  generationIds: string[];
  estimatedUsd: number;
  agent?: string;
  model?: string;
  searches?: number;
};

export type AgentCost = {
  name: string;
  model: string;
  usd: number;
  searches: number;
};

export type RunCost = {
  costUsd: number;
  exactCalls: number;
  estimatedCalls: number;
  generationIds: string[];
  agents: AgentCost[];
};

export function estimateCallUsd(call: BilledCall) {
  return call.estimatedUsd + (call.searches ?? 0) * SEARCH_FEE_USD;
}

function round(usd: number) {
  return Number(usd.toFixed(6));
}

export async function resolveRunCost(
  calls: BilledCall[],
  lookup: (id: string) => Promise<{ costUsd: number } | null>,
): Promise<RunCost> {
  const resolved = await Promise.all(
    calls.map(async (call) => {
      if (call.generationIds.length === 0) return null;
      const costs = await Promise.all(call.generationIds.map(lookup));
      if (costs.some((cost) => cost === null)) return null;
      return costs.reduce((sum, cost) => sum + (cost?.costUsd ?? 0), 0);
    }),
  );
  const agents = new Map<string, AgentCost>();
  const total = resolved.reduce<Omit<RunCost, "agents">>(
    (sum, exact, index) => {
      const call = calls[index];
      const usd = exact ?? estimateCallUsd(call);
      if (call.agent) {
        const entry = agents.get(call.agent) ?? {
          name: call.agent,
          model: call.model ?? "",
          usd: 0,
          searches: 0,
        };
        entry.usd += usd;
        entry.searches += call.searches ?? 0;
        agents.set(call.agent, entry);
      }
      return {
        costUsd: sum.costUsd + usd,
        exactCalls: sum.exactCalls + (exact === null ? 0 : 1),
        estimatedCalls: sum.estimatedCalls + (exact === null ? 1 : 0),
        generationIds: [...sum.generationIds, ...call.generationIds],
      };
    },
    { costUsd: 0, exactCalls: 0, estimatedCalls: 0, generationIds: [] },
  );
  return {
    ...total,
    agents: [...agents.values()].map((agent) => ({
      ...agent,
      usd: round(agent.usd),
    })),
  };
}
