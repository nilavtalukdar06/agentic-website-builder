import "server-only";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@/generated/prisma/client";
import { pendingPromptWhere } from "@/inngest/agent/prompt-state";
import { raiseAlert } from "@/server/ops/alert";
import { assertProjectAvailable, projectTransaction } from "./operations";

export type ProjectResources = {
  sandboxId: string | null;
  attachmentKeys: string[];
};

export type ResourceRemovers = {
  killSandbox: (sandboxId: string) => Promise<unknown>;
  deleteObject: (key: string) => Promise<unknown>;
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
      const attachments = await tx.attachment.findMany({
        where: { message: { projectId: project.id } },
        select: { key: true },
      });
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
        attachmentKeys: attachments.map((attachment) => attachment.key),
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
  { sandboxId, attachmentKeys }: ProjectResources,
  { killSandbox, deleteObject }: ResourceRemovers,
) {
  const [sandbox, objects] = await Promise.all([
    sandboxId ? failed(() => killSandbox(sandboxId)) : 0,
    Promise.all(attachmentKeys.map((key) => failed(() => deleteObject(key)))),
  ]);
  const failedObjects = objects.reduce<number>((sum, count) => sum + count, 0);
  if (sandbox === 0 && failedObjects === 0) return;
  await raiseAlert({
    kind: "project-delete-cleanup",
    message:
      "A deleted project left resources behind. The orphan sandbox sweep retries the sandbox; uploaded images need a manual delete.",
    details: { sandboxFailed: sandbox === 1, failedObjects },
  });
}
