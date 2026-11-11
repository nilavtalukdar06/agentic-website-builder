import type { PrismaClient } from "@/generated/prisma/client";

export async function grantWelcomeCredits(
  db: Pick<PrismaClient, "creditLedger">,
  userId: string,
  amount: number,
) {
  if (amount <= 0) {
    return null;
  }
  return db.creditLedger.create({
    data: {
      userId,
      delta: amount,
      reason: "ADJUSTMENT",
      meta: { kind: "welcome" },
    },
  });
}
