import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { replyId } from "@/inngest/agent/persist";
import { pendingPromptWhere, requestStop } from "@/inngest/agent/prompt-state";
import { parseAgentParts } from "@/lib/agent/parts";
import { orderConversation } from "@/lib/agent/conversation-order";
import { attachmentUrl } from "@/server/storage/attachments";
import {
  assertProjectAvailable,
  projectTransaction,
} from "@/server/projects/operations";
import { createTRPCRouter, protectedProcedure } from "../init";
import { promptFields, resolvePrompt, startAgent } from "./prompt";

const projectId = z.string().min(1).max(64);
const messageId = z.string().min(1).max(128);

async function ownedProject(
  db: Pick<PrismaClient, "project">,
  id: string,
  userId: string,
) {
  const project = await db.project.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!project) throw new TRPCError({ code: "NOT_FOUND" });
  return project;
}

async function signedUrl(key: string) {
  try {
    return await attachmentUrl(key);
  } catch {
    return null;
  }
}

export const messageRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedProject(ctx.db, input.projectId, userId);
      const [messages, versions] = await Promise.all([
        ctx.db.message.findMany({
          where: { projectId: input.projectId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            parts: true,
            model: true,
            replyToId: true,
            stopRequestedAt: true,
            createdAt: true,
            _count: { select: { replies: true } },
            attachments: {
              orderBy: { createdAt: "asc" },
              select: { id: true, name: true, contentType: true, key: true },
            },
          },
        }),
        ctx.db.version.findMany({
          where: { projectId: input.projectId, status: "READY" },
          select: { number: true, title: true, creditCost: true, runId: true },
        }),
      ]);
      const versionByReply = new Map(
        versions.flatMap((version) =>
          version.runId && version.number !== null
            ? [
                [
                  replyId(version.runId),
                  {
                    number: version.number,
                    title: version.title,
                    creditCost: version.creditCost,
                  },
                ] as const,
              ]
            : [],
        ),
      );
      const latestVersion = Math.max(
        0,
        ...versions.map((version) => version.number ?? 0),
      );
      const items = await Promise.all(
        messages.map(async (message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          parts: parseAgentParts(message.parts) ?? [],
          model: message.model,
          replyToId: message.replyToId,
          createdAt: message.createdAt,
          pending: message.role === "USER" && message._count.replies === 0,
          stopping:
            message.role === "USER" &&
            message._count.replies === 0 &&
            message.stopRequestedAt !== null,
          version: versionByReply.get(message.id) ?? null,
          attachments: await Promise.all(
            message.attachments.map(async (attachment) => ({
              id: attachment.id,
              name: attachment.name,
              contentType: attachment.contentType,
              url: await signedUrl(attachment.key),
            })),
          ),
        })),
      );
      return {
        messages: orderConversation(items),
        latestVersion: latestVersion || null,
      };
    }),
  send: protectedProcedure
    .input(z.object({ projectId, ...promptFields }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ownedProject(ctx.db, input.projectId, userId);
      const { model, attachmentIds } = await resolvePrompt(
        ctx.db,
        userId,
        input,
      );
      const message = await projectTransaction(
        ctx.db,
        input.projectId,
        userId,
        async (tx, project) => {
          assertProjectAvailable(project);
          const message = await tx.message.create({
            data: {
              projectId: input.projectId,
              role: "USER",
              content: input.prompt,
              model: model.id,
              attachments: { connect: attachmentIds.map((id) => ({ id })) },
            },
            select: { id: true },
          });
          await tx.project.update({
            where: { id: input.projectId },
            data: { updatedAt: new Date() },
          });
          return message;
        },
      );
      await startAgent({
        projectId: input.projectId,
        userId,
        messageId: message.id,
      });
      return message;
    }),
  stop: protectedProcedure
    .input(z.object({ projectId }))
    .mutation(async ({ ctx, input }) => {
      await ownedProject(ctx.db, input.projectId, ctx.session.user.id);
      return requestStop(ctx.db, input.projectId);
    }),
  retry: protectedProcedure
    .input(z.object({ messageId }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const reply = await ctx.db.message.findFirst({
        where: {
          id: input.messageId,
          role: "ASSISTANT",
          project: { userId },
        },
        select: { projectId: true, replyToId: true, createdAt: true },
      });
      if (!reply) throw new TRPCError({ code: "NOT_FOUND" });
      const retryMessageId = reply.replyToId;
      if (!retryMessageId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only the latest reply can be retried.",
        });
      await projectTransaction(
        ctx.db,
        reply.projectId,
        userId,
        async (tx, project) => {
          assertProjectAvailable(project);
          const [newer, pending] = await Promise.all([
            tx.message.count({
              where: {
                projectId: reply.projectId,
                role: "ASSISTANT",
                createdAt: { gt: reply.createdAt },
              },
            }),
            tx.message.count({
              where: { projectId: reply.projectId, ...pendingPromptWhere },
            }),
          ]);
          if (!reply.replyToId || newer > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Only the latest reply can be retried.",
            });
          }
          if (pending > 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Wait for the current request to finish, or stop it.",
            });
          }
          await tx.message.updateMany({
            where: { replyToId: reply.replyToId },
            data: { replyToId: null },
          });
          await tx.message.update({
            where: { id: reply.replyToId },
            data: { startedAt: null, stopRequestedAt: null },
          });
        },
      );
      await startAgent({
        projectId: reply.projectId,
        userId,
        messageId: retryMessageId,
      });
      return { messageId: retryMessageId };
    }),
});
