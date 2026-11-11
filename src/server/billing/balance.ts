import type { PrismaClient } from "@/generated/prisma/client";

export async function getCreditBalance(
  db: Pick<PrismaClient, "creditLedger">,
  userId: string,
) {
  const [balance, granted] = await Promise.all([
    db.creditLedger.aggregate({ where: { userId }, _sum: { delta: true } }),
    db.creditLedger.aggregate({
      where: { userId, delta: { gt: 0 } },
      _sum: { delta: true },
    }),
  ]);
  return {
    balance: balance._sum.delta ?? 0,
    granted: granted._sum.delta ?? 0,
  };
}
