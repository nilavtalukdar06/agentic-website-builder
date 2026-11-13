import type { PrismaClient } from "@/generated/prisma/client";
import type { AgentPart } from "@/lib/agent/parts";
import { STOPPED_BEFORE_START } from "./replies";

type MessageDb = Pick<PrismaClient, "message">;

export const stoppedReplyId = (messageId: string) => `stopped_${messageId}`;

export const pendingPromptWhere = {
  role: "USER" as const,
  replies: { none: {} },
};

export async function claimPrompt(db: MessageDb, messageId: string) {
  const claimed = await db.message.updateMany({
    where: { id: messageId, stopRequestedAt: null },
    data: { startedAt: new Date() },
  });
  return claimed.count > 0;
}

export async function isStopRequested(db: MessageDb, messageId: string) {
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: { stopRequestedAt: true },
  });
  return Boolean(message?.stopRequestedAt);
}

export async function recordStoppedBeforeStart(
  db: MessageDb,
  { projectId, messageId }: { projectId: string; messageId: string },
) {
  const parts: AgentPart[] = [{ type: "stopped" }];
  await db.message.upsert({
    where: { id: stoppedReplyId(messageId) },
    create: {
      id: stoppedReplyId(messageId),
      projectId,
      role: "ASSISTANT",
      content: STOPPED_BEFORE_START,
      parts,
      replyToId: messageId,
    },
    update: {},
  });
}

export async function requestStop(db: MessageDb, projectId: string) {
  const pending = await db.message.findMany({
    where: { projectId, ...pendingPromptWhere, stopRequestedAt: null },
    select: { id: true },
  });
  const now = new Date();
  let stopped = 0;
  for (const { id } of pending) {
    const notStarted = await db.message.updateMany({
      where: { id, startedAt: null, stopRequestedAt: null },
      data: { stopRequestedAt: now },
    });
    if (notStarted.count > 0) {
      await recordStoppedBeforeStart(db, { projectId, messageId: id });
    } else {
      await db.message.updateMany({
        where: { id, stopRequestedAt: null },
        data: { stopRequestedAt: now },
      });
    }
    stopped++;
  }
  return { stopped };
}
