export type BilledCall = { generationIds: string[]; estimatedUsd: number };

export type RunCost = {
  costUsd: number;
  exactCalls: number;
  estimatedCalls: number;
  generationIds: string[];
};

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
  return resolved.reduce<RunCost>(
    (total, exact, index) => ({
      costUsd: total.costUsd + (exact ?? calls[index].estimatedUsd),
      exactCalls: total.exactCalls + (exact === null ? 0 : 1),
      estimatedCalls: total.estimatedCalls + (exact === null ? 1 : 0),
      generationIds: [...total.generationIds, ...calls[index].generationIds],
    }),
    { costUsd: 0, exactCalls: 0, estimatedCalls: 0, generationIds: [] },
  );
}
