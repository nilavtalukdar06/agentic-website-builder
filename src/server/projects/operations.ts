import "server-only";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient, Project } from "@/generated/prisma/client";

export const OPERATION_TIMEOUT_MS = 5 * 60_000;

export function projectOperation(
  project: Pick<
    Project,
    "operationId" | "operationKind" | "operationStartedAt"
  >,
  now = Date.now(),
) {
  if (!project.operationId || !project.operationKind) return null;
  if (
    project.operationKind !== "EXPORT" &&
    project.operationStartedAt &&
    now - project.operationStartedAt.getTime() > OPERATION_TIMEOUT_MS
  )
    return null;
  return project.operationKind;
}

export function assertProjectAvailable(project: Project) {
  const operation = projectOperation(project);
  if (operation)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        operation === "EXPORT"
          ? "Wait for the GitHub export to finish."
          : operation === "RESTORE"
            ? "Wait for the version restore to finish."
            : "Wait for the preview to finish waking up.",
    });
}

export async function projectTransaction<T>(
  db: PrismaClient,
  projectId: string,
  userId: string,
  action: (tx: Prisma.TransactionClient, project: Project) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
      let project = await tx.project.findFirst({
        where: { id: projectId, userId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (project.operationId && !projectOperation(project)) {
        project = await tx.project.update({
          where: { id: project.id },
          data: {
            operationId: null,
            operationKind: null,
            operationStartedAt: null,
          },
        });
      }
      return action(tx, project);
    },
    { maxWait: 15_000, timeout: 30_000 },
  );
}

export function clearOperation(
  db: Pick<PrismaClient, "project">,
  projectId: string,
  operationId: string,
) {
  return db.project.updateMany({
    where: { id: projectId, operationId },
    data: { operationId: null, operationKind: null, operationStartedAt: null },
  });
}
