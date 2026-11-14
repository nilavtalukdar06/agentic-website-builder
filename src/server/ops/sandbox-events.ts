import "server-only";
import type { PrismaClient, SandboxOutcome } from "@/generated/prisma/client";

export const HEALTH_WINDOW_MS = 30 * 60_000;
export const HEALTH_MIN_ATTEMPTS = 3;
export const HEALTH_MAX_TROUBLE_RATIO = 0.5;

export async function recordSandboxEvent(
  db: Pick<PrismaClient, "sandboxEvent">,
  projectId: string,
  outcome: SandboxOutcome,
) {
  try {
    await db.sandboxEvent.create({ data: { projectId, outcome } });
  } catch (error) {
    console.warn(
      "[ops] couldn't record a sandbox event",
      error instanceof Error ? error.name : "unknown",
    );
  }
}

export function sandboxHealth(counts: {
  resumed: number;
  rebuilt: number;
  failed: number;
}) {
  const total = counts.resumed + counts.rebuilt + counts.failed;
  const trouble = counts.rebuilt + counts.failed;
  return {
    ...counts,
    total,
    trouble,
    unhealthy:
      total >= HEALTH_MIN_ATTEMPTS &&
      trouble / total >= HEALTH_MAX_TROUBLE_RATIO,
  };
}

export async function checkSandboxHealth(
  db: Pick<PrismaClient, "sandboxEvent">,
  now = Date.now(),
) {
  const rows = await db.sandboxEvent.groupBy({
    by: ["outcome"],
    where: { createdAt: { gte: new Date(now - HEALTH_WINDOW_MS) } },
    _count: { _all: true },
  });
  const count = (outcome: SandboxOutcome) =>
    rows.find((row) => row.outcome === outcome)?._count._all ?? 0;
  return sandboxHealth({
    resumed: count("RESUMED"),
    rebuilt: count("REBUILT"),
    failed: count("FAILED"),
  });
}
