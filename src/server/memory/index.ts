import "server-only";
import { env } from "@/config/env";
import type { PrismaClient } from "@/generated/prisma/client";
import { raiseAlert } from "@/server/ops/alert";
import { databaseTag } from "@/server/sandbox/sandbox";
import { memoryAllowance, type MemoryUse, recordMemoryUse } from "./budget";
import { projectNamespace, userNamespace } from "./scopes";
import { supermemoryProvider } from "./supermemory";
import type { MemoryProvider } from "./types";

export type MemoryAccess =
  | {
      enabled: true;
      provider: MemoryProvider;
      canRead: boolean;
      canWrite: boolean;
      userNs: string;
      projectNs: (projectId: string) => string;
    }
  | { enabled: false; reason: string };

let cached: MemoryProvider | null = null;

export function memoryProvider(): MemoryProvider | null {
  if (env.AGENT_MEMORY === "off" || !env.SUPERMEMORY_API_KEY) return null;
  cached ??= supermemoryProvider(env.SUPERMEMORY_API_KEY);
  return cached;
}

export function memoryScopes(userId: string) {
  const tag = databaseTag();
  return {
    userNs: userNamespace(userId, tag),
    projectNs: (projectId: string) => projectNamespace(projectId, tag),
  };
}

export async function memoryAccess(
  db: Pick<PrismaClient, "user" | "memoryUsage">,
  userId: string,
): Promise<MemoryAccess> {
  const provider = memoryProvider();
  if (!provider) return { enabled: false, reason: "memory is not configured" };
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { memoryEnabled: true },
  });
  if (!user?.memoryEnabled) {
    return { enabled: false, reason: "memory is turned off" };
  }
  const budget = await memoryAllowance(db, env.MEMORY_MONTHLY_USD);
  return { enabled: true, provider, ...budget, ...memoryScopes(userId) };
}

export function trackMemoryUse(
  db: Pick<PrismaClient, "memoryUsage">,
  use: MemoryUse,
) {
  return recordMemoryUse(db, use, env.MEMORY_MONTHLY_USD, (details) =>
    raiseAlert({
      kind: "memory-budget",
      message:
        "Supermemory use passed 80% of the monthly budget; memory writes are paused until next month.",
      details,
    }),
  ).catch((error: unknown) => {
    console.warn("[memory] couldn't record usage", error);
    return 0;
  });
}

export function dropProjectMemory(userId: string) {
  const provider = memoryProvider();
  if (!provider) return undefined;
  const { projectNs } = memoryScopes(userId);
  return (projectId: string) => provider.dropNamespace(projectNs(projectId));
}
