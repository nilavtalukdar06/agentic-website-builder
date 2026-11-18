import "server-only";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { pendingPromptWhere } from "@/inngest/agent/prompt-state";
import { screenshotKeys } from "@/lib/agent/parts";
import { raiseAlert } from "@/server/ops/alert";
import { isProjectScreenshotKey } from "@/server/storage/screenshot-keys";
import { assertProjectAvailable, projectTransaction } from "./operations";

export type ProjectResources = {
  sandboxId: string | null;
  attachmentKeys: string[];
  projectId?: string;
};

export type ResourceRemovers = {
  killSandbox: (sandboxId: string) => Promise<unknown>;
  deleteObject: (key: string) => Promise<unknown>;
  dropMemory?: (projectId: string) => Promise<unknown>;
};

export async function deleteProjectRecords(
  db: PrismaClient,
  input: { projectId: string; userId: string; name: string },
): Promise<ProjectResources> {
  return projectTransaction(
    db,
    input.projectId,
    input.userId,
    async (tx, project) => {
      if (project.name !== input.name) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The name you typed doesn't match this project.",
        });
      }
      assertProjectAvailable(project);
      const pending = await tx.message.count({
        where: { projectId: project.id, ...pendingPromptWhere },
      });
      if (pending > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Wait for the current build to finish, or stop it first.",
        });
      }
      const [attachments, replies] = await Promise.all([
        tx.attachment.findMany({
          where: { message: { projectId: project.id } },
          select: { key: true },
        }),
        tx.message.findMany({
          where: { projectId: project.id, role: "ASSISTANT" },
          select: { parts: true },
        }),
      ]);
      await Promise.all([
        tx.guardEvent.updateMany({
          where: { projectId: project.id },
          data: { projectId: null },
        }),
        tx.sandboxEvent.updateMany({
          where: { projectId: project.id },
          data: { projectId: null },
        }),
      ]);
      await tx.project.delete({ where: { id: project.id } });
      return {
        sandboxId: project.sandboxId,
        projectId: project.id,
        attachmentKeys: [
          ...attachments.map((attachment) => attachment.key),
          ...new Set(
            replies
              .flatMap((reply) => screenshotKeys(reply.parts))
              .filter((key) => isProjectScreenshotKey(key, project.id)),
          ),
        ],
      };
    },
  );
}

async function failed(remove: () => Promise<unknown> | unknown) {
  try {
    await remove();
    return 0;
  } catch {
    return 1;
  }
}

export async function removeProjectResources(
  { sandboxId, attachmentKeys, projectId }: ProjectResources,
  { killSandbox, deleteObject, dropMemory }: ResourceRemovers,
) {
  const [sandbox, objects, memory] = await Promise.all([
    sandboxId ? failed(() => killSandbox(sandboxId)) : 0,
    Promise.all(attachmentKeys.map((key) => failed(() => deleteObject(key)))),
    projectId && dropMemory ? failed(() => dropMemory(projectId)) : 0,
  ]);
  const failedObjects = objects.reduce<number>((sum, count) => sum + count, 0);
  if (sandbox === 0 && failedObjects === 0 && memory === 0) return;
  await raiseAlert({
    kind: "project-delete-cleanup",
    message:
      "A deleted project left resources behind. The orphan sandbox sweep retries the sandbox; uploaded images and project memory need a manual delete.",
    details: {
      sandboxFailed: sandbox === 1,
      failedObjects,
      memoryFailed: memory === 1,
    },
  });
}
