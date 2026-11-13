import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inngest } from "@/inngest/client";
import { agentRun } from "@/inngest/events";
import { MAX_ATTACHMENTS } from "@/lib/attachments";
import { findAgentModel } from "@/server/ai/gateway";

export const MAX_PROMPT_LENGTH = 4000;

export const promptFields = {
  prompt: z.string().trim().min(1).max(MAX_PROMPT_LENGTH),
  model: z.string().min(1).max(120).optional(),
  attachmentIds: z
    .array(z.string().min(1).max(64))
    .max(MAX_ATTACHMENTS)
    .default([]),
};

export async function resolvePrompt(
  db: Pick<PrismaClient, "attachment">,
  userId: string,
  input: { model?: string; attachmentIds: string[] },
) {
  const attachmentIds = [...new Set(input.attachmentIds)];
  const [model, attachments] = await Promise.all([
    findAgentModel(input.model).catch(() => {
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "Couldn't load the model list. Try again in a moment.",
      });
    }),
    attachmentIds.length
      ? db.attachment.findMany({
          where: { id: { in: attachmentIds }, userId, messageId: null },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);
  if (!model) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That model isn't available. Pick another one.",
    });
  }
  if (attachments.length !== attachmentIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Some images are missing. Attach them again.",
    });
  }
  if (attachmentIds.length > 0 && !model.vision) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${model.name} can't read images. Pick a model that supports images.`,
    });
  }
  return { model, attachmentIds };
}

export async function startAgent(data: {
  projectId: string;
  userId: string;
  messageId: string;
}) {
  try {
    await inngest.send(agentRun.create(data));
  } catch (error) {
    console.error("[agent] couldn't start the agent", error);
  }
}
