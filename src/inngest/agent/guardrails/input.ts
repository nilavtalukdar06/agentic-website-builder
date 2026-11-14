import { NonRetriableError } from "inngest";
import type { PrismaClient } from "@/generated/prisma/client";
import type { StoredMessage } from "../conversation";
import { recordGuardEvent } from "./events";
import {
  detectSecrets,
  redactMatches,
  redactPatterns,
} from "./secret-patterns";

export async function guardStoredPrompt(
  db: Pick<PrismaClient, "message" | "project" | "guardEvent">,
  input: {
    userId: string;
    projectId: string;
    messageId: string;
    runId: string;
  },
) {
  const { userId, projectId, messageId, runId } = input;
  const message = await db.message.findFirst({
    where: {
      id: messageId,
      projectId,
      role: "USER",
      project: { userId },
    },
    select: {
      content: true,
      project: { select: { name: true, description: true } },
    },
  });
  if (!message) throw new NonRetriableError("Project or message not found.");
  const matches = await detectSecrets(message.content);
  if (matches.length === 0) return false;
  const content = redactMatches(message.content, matches);
  await db.message.update({ where: { id: messageId }, data: { content } });
  const name = await redactPatterns(message.project.name);
  const description =
    message.project.description === null
      ? null
      : await redactPatterns(message.project.description);
  if (
    name !== message.project.name ||
    description !== message.project.description
  ) {
    await db.project.updateMany({
      where: { id: projectId, userId },
      data: { name, description },
    });
  }
  await recordGuardEvent(db, {
    userId,
    projectId,
    runId,
    stage: "input",
    verdict: "secret",
    categories: ["secret"],
    text: message.content,
  });
  return true;
}

export async function sanitizeHistory<T extends StoredMessage & { id: string }>(
  db: Pick<PrismaClient, "message">,
  history: T[],
): Promise<T[]> {
  return Promise.all(
    history.map(async (message) => {
      const content = await redactPatterns(message.content);
      if (content !== message.content) {
        await db.message.update({
          where: { id: message.id },
          data: { content },
        });
      }
      return { ...message, content };
    }),
  );
}
