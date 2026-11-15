import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPublisher } from "@/inngest/publisher";
import type { ExportStatus } from "@/lib/github-export";
import {
  clearOperation,
  projectTransaction,
} from "@/server/projects/operations";
import { ExportError, exportErrors, type ExportErrorCode } from "./errors";

export type ExportRequest = {
  exportId: string;
  projectId: string;
  userId: string;
  attempt: number;
  requestId: string;
};

export async function claimExport(
  db: PrismaClient,
  input: ExportRequest,
  runId: string,
) {
  return projectTransaction(
    db,
    input.projectId,
    input.userId,
    async (tx, project) => {
      const job = await tx.githubExport.findFirst({
        where: {
          id: input.exportId,
          projectId: project.id,
          userId: input.userId,
          attempt: input.attempt,
        },
      });
      if (
        !job ||
        job.status === "SUCCEEDED" ||
        job.status === "FAILED" ||
        (job.runId && job.runId !== runId)
      )
        return null;
      if (project.operationId !== job.id || project.operationKind !== "EXPORT")
        throw new ExportError("CONFLICT");
      if (job.runId === runId) return job;
      return tx.githubExport.update({ where: { id: job.id }, data: { runId } });
    },
  );
}

export async function exportProgress(
  db: PrismaClient,
  job: ExportRequest,
  status: ExportStatus,
) {
  await db.githubExport.updateMany({
    where: {
      id: job.exportId,
      attempt: job.attempt,
      status: { notIn: ["SUCCEEDED", "FAILED"] },
    },
    data: { status },
  });
  await createPublisher(job.projectId)("export", {
    exportId: job.exportId,
    status,
  });
}

export async function completeExport(
  db: PrismaClient,
  input: ExportRequest,
  repository: string,
  repositoryUrl: string,
  commitSha: string,
) {
  await db.$transaction(async (tx) => {
    const current = await tx.githubExport.findFirst({
      where: {
        id: input.exportId,
        projectId: input.projectId,
        userId: input.userId,
        attempt: input.attempt,
      },
    });
    if (current?.status === "SUCCEEDED") return;
    const saved = await tx.githubExport.updateMany({
      where: {
        id: input.exportId,
        attempt: input.attempt,
        projectId: input.projectId,
        userId: input.userId,
        status: { not: "FAILED" },
      },
      data: {
        status: "SUCCEEDED",
        repository,
        repositoryUrl,
        commitSha,
        error: null,
        errorCode: null,
        completedAt: new Date(),
      },
    });
    if (saved.count !== 1) throw new ExportError("CONFLICT");
    const project = await tx.project.updateMany({
      where: {
        id: input.projectId,
        userId: input.userId,
        operationId: input.exportId,
      },
      data: {
        githubRepo: repository,
        operationId: null,
        operationKind: null,
        operationStartedAt: null,
      },
    });
    if (project.count !== 1) throw new ExportError("CONFLICT");
  });
  await createPublisher(input.projectId)("export", {
    exportId: input.exportId,
    status: "SUCCEEDED",
    repositoryUrl,
    commitSha,
  });
}

export async function failExport(
  db: PrismaClient,
  input: ExportRequest,
  error: { message: string },
  onlyUnclaimed = false,
) {
  const code = (Object.entries(exportErrors).find(
    ([, message]) => message === error.message,
  )?.[0] ?? "FAILED") as ExportErrorCode;
  const changed = await db.$transaction(async (tx) => {
    const failed = await tx.githubExport.updateMany({
      where: {
        id: input.exportId,
        projectId: input.projectId,
        userId: input.userId,
        attempt: input.attempt,
        status: { not: "SUCCEEDED" },
        ...(onlyUnclaimed ? { runId: null } : {}),
      },
      data: { status: "FAILED", error: exportErrors[code], errorCode: code },
    });
    if (failed.count > 0) {
      await clearOperation(tx, input.projectId, input.exportId);
      if (code === "AUTH_REQUIRED")
        await tx.account.updateMany({
          where: { userId: input.userId, providerId: "github" },
          data: { scope: null },
        });
    }
    return failed.count;
  });
  if (changed > 0)
    await createPublisher(input.projectId)("export", {
      exportId: input.exportId,
      status: "FAILED",
      error: exportErrors[code],
    });
}
