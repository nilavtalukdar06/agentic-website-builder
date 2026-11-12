import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

export type GuardStage = "input" | "output" | "tool" | "save";

export function textHash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export async function recordGuardEvent(
  db: Pick<PrismaClient, "guardEvent">,
  event: {
    userId: string;
    projectId?: string | null;
    runId?: string | null;
    stage: GuardStage;
    verdict: string;
    categories: string[];
    text: string;
  },
) {
  const { text, ...rest } = event;
  await db.guardEvent
    .create({ data: { ...rest, textHash: textHash(text) } })
    .catch((error) => console.warn("[guard] couldn't record an event", error));
}
