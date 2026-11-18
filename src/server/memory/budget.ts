import type { PrismaClient } from "@/generated/prisma/client";

export const USD_PER_1K_TOKENS = 0.005;
export const USD_PER_1K_QUERIES = 0.005;
export const WRITE_STOP_SHARE = 0.8;

export type MemoryUse = {
  writeChars?: number;
  searches?: number;
  profiles?: number;
  instant?: number;
};

export function monthOf(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 7);
}

export function costOf(use: MemoryUse) {
  const tokens = (use.writeChars ?? 0) / 4;
  const queries =
    (use.searches ?? 0) + (use.profiles ?? 0) + (use.instant ?? 0);
  return (
    (tokens / 1000) * USD_PER_1K_TOKENS + (queries / 1000) * USD_PER_1K_QUERIES
  );
}

export function allowance(spentUsd: number, limitUsd: number) {
  return {
    canWrite: spentUsd < limitUsd * WRITE_STOP_SHARE,
    canRead: spentUsd < limitUsd,
  };
}

type UsageDb = Pick<PrismaClient, "memoryUsage">;

export async function memoryAllowance(
  db: UsageDb,
  limitUsd: number,
  now = Date.now(),
) {
  const row = await db.memoryUsage.findUnique({
    where: { month: monthOf(now) },
    select: { estimatedUsd: true },
  });
  return {
    ...allowance(row?.estimatedUsd ?? 0, limitUsd),
    spentUsd: row?.estimatedUsd ?? 0,
  };
}

export async function recordMemoryUse(
  db: UsageDb,
  use: MemoryUse,
  limitUsd: number,
  alert: (details: Record<string, number | string>) => Promise<unknown>,
  now = Date.now(),
) {
  const month = monthOf(now);
  const usd = costOf(use);
  const row = await db.memoryUsage.upsert({
    where: { month },
    create: {
      month,
      writeChars: use.writeChars ?? 0,
      searches: (use.searches ?? 0) + (use.instant ?? 0),
      profiles: use.profiles ?? 0,
      estimatedUsd: usd,
    },
    update: {
      writeChars: { increment: use.writeChars ?? 0 },
      searches: { increment: (use.searches ?? 0) + (use.instant ?? 0) },
      profiles: { increment: use.profiles ?? 0 },
      estimatedUsd: { increment: usd },
    },
    select: { estimatedUsd: true, alertedAt: true },
  });
  if (row.estimatedUsd >= limitUsd * WRITE_STOP_SHARE && !row.alertedAt) {
    const claimed = await db.memoryUsage.updateMany({
      where: { month, alertedAt: null },
      data: { alertedAt: new Date(now) },
    });
    if (claimed.count === 1) {
      await alert({
        month,
        spentUsd: Number(row.estimatedUsd.toFixed(4)),
        limitUsd,
      });
    }
  }
  return row.estimatedUsd;
}
