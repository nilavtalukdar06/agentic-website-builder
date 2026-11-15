import "server-only";
import { TRPCError } from "@trpc/server";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export type RateRule = {
  name: string;
  limit: number;
  windowMs: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const rateRules = {
  agent: { name: "agent", limit: 20, windowMs: 10 * MINUTE },
  projectCreate: { name: "project-create", limit: 10, windowMs: HOUR },
  projectDelete: { name: "project-delete", limit: 20, windowMs: HOUR },
  checkout: { name: "checkout", limit: 10, windowMs: HOUR },
  githubExport: { name: "github-export", limit: 10, windowMs: HOUR },
  sandbox: { name: "sandbox", limit: 30, windowMs: 10 * MINUTE },
  restore: { name: "restore", limit: 20, windowMs: 10 * MINUTE },
  upload: { name: "upload", limit: 40, windowMs: 10 * MINUTE },
  realtimeToken: { name: "realtime-token", limit: 120, windowMs: 10 * MINUTE },
} as const satisfies Record<string, RateRule>;

export type RateDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

type ThrottleDb = Pick<PrismaClient, "throttleWindow">;

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function consumeRateLimit(
  db: ThrottleDb,
  rule: RateRule,
  subject: string,
  now = Date.now(),
): Promise<RateDecision> {
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  const key = `${rule.name}:${subject}`;
  const hit = () =>
    db.throttleWindow.upsert({
      where: {
        key_windowStart: { key, windowStart: new Date(windowStart) },
      },
      create: { key, windowStart: new Date(windowStart), count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
  let row;
  try {
    row = await hit();
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    row = await hit();
  }
  if (row.count > rule.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowStart + rule.windowMs - now) / 1000),
      ),
    };
  }
  return { allowed: true, remaining: rule.limit - row.count };
}

export function retryMessage(retryAfterSeconds: number) {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return retryAfterSeconds <= 60
    ? "You're doing that too quickly. Try again in a minute."
    : `You're doing that too often. Try again in ${minutes} minutes.`;
}

export async function enforceRateLimit(
  db: ThrottleDb,
  rule: RateRule,
  subject: string,
) {
  const decision = await consumeRateLimit(db, rule, subject);
  if (!decision.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: retryMessage(decision.retryAfterSeconds),
    });
  }
}

export async function purgeThrottleWindows(
  db: ThrottleDb,
  olderThanMs: number,
  now = Date.now(),
) {
  const { count } = await db.throttleWindow.deleteMany({
    where: { windowStart: { lt: new Date(now - olderThanMs) } },
  });
  return count;
}
