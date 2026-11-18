import type { PrismaClient } from "@/generated/prisma/client";

export const ROUTINE_STOP_SHARE = 0.8;

export function dayOf(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

type UsageDb = Pick<PrismaClient, "emailUsage">;

export function allowanceFor(sent: number, limit: number) {
  return {
    canSendRoutine: sent < limit * ROUTINE_STOP_SHARE,
    canSendImportant: sent < limit,
  };
}

export async function emailAllowance(
  db: UsageDb,
  limit: number,
  now = Date.now(),
) {
  const row = await db.emailUsage.findUnique({
    where: { day: dayOf(now) },
    select: { sent: true },
  });
  const sent = row?.sent ?? 0;
  return { sent, ...allowanceFor(sent, limit) };
}

export async function recordEmailSent(
  db: UsageDb,
  limit: number,
  alert: (details: Record<string, number | string>) => Promise<unknown>,
  now = Date.now(),
) {
  const day = dayOf(now);
  const row = await db.emailUsage.upsert({
    where: { day },
    create: { day, sent: 1 },
    update: { sent: { increment: 1 } },
    select: { sent: true, alertedAt: true },
  });
  if (row.sent < limit * ROUTINE_STOP_SHARE || row.alertedAt) return;
  const claimed = await db.emailUsage.updateMany({
    where: { day, alertedAt: null },
    data: { alertedAt: new Date(now) },
  });
  if (claimed.count > 0) {
    await alert({ day, sent: row.sent, limit });
  }
}
