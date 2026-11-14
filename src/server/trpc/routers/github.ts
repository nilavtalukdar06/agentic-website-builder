import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { githubExport } from "@/inngest/events";
import { detectSecrets } from "@/inngest/agent/guardrails/secret-patterns";
import { pendingPromptWhere } from "@/inngest/agent/prompt-state";
import { hasRepositoryScope, repositoryName } from "@/lib/github-export";
import { failExport, type ExportRequest } from "@/server/github/jobs";
import {
  assertProjectAvailable,
  projectOperation,
  projectTransaction,
} from "@/server/projects/operations";
import { createTRPCRouter, protectedProcedure } from "../init";

const projectId = z.string().min(1).max(64);
const jobSelect = {
  id: true,
  status: true,
  attempt: true,
  name: true,
  private: true,
  versionNumber: true,
  repository: true,
  repositoryUrl: true,
  commitSha: true,
  error: true,
  errorCode: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function enqueue(
  db: Parameters<typeof failExport>[0],
  request: ExportRequest,
) {
  try {
    await inngest.send(githubExport.create(request));
  } catch {
    await failExport(
      db,
      request,
      { message: "Could not start the export." },
      true,
    );
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Could not start the export. Please retry.",
    });
  }
}

export const githubRouter = createTRPCRouter({
  status: protectedProcedure
    .input(z.object({ projectId }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const project = await ctx.db.project.findFirst({
        where: { id: input.projectId, userId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      const [job, account, version] = await Promise.all([
        ctx.db.githubExport.findFirst({
          where: { projectId: project.id, userId },
          orderBy: { createdAt: "desc" },
          select: jobSelect,
        }),
        ctx.db.account.findFirst({
          where: { userId, providerId: "github" },
          select: { scope: true },
        }),
        ctx.db.version.findFirst({
          where: { projectId: project.id, status: "READY" },
          select: { id: true },
        }),
      ]);
      return {
        job,
        githubRepo: project.githubRepo,
        hasVersion: !!version,
        busy: projectOperation(project),
        permissions: {
          public: hasRepositoryScope(account?.scope, false),
          private: hasRepositoryScope(account?.scope, true),
        },
      };
    }),
  start: protectedProcedure
    .input(z.object({ projectId, name: repositoryName, private: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if ((await detectSecrets(input.name)).length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Remove credentials from the repository name.",
        });
      const userId = ctx.session.user.id;
      const job = await projectTransaction(
        ctx.db,
        input.projectId,
        userId,
        async (tx, project) => {
          assertProjectAvailable(project);
          const [pending, version, account] = await Promise.all([
            tx.message.count({
              where: { projectId: project.id, ...pendingPromptWhere },
            }),
            tx.version.findFirst({
              where: { projectId: project.id, status: "READY" },
              orderBy: { number: "desc" },
              select: { id: true, number: true },
            }),
            tx.account.findFirst({
              where: { userId, providerId: "github" },
              select: { scope: true },
            }),
          ]);
          if (pending)
            throw new TRPCError({
              code: "CONFLICT",
              message: "Wait for the current build to finish.",
            });
          if (!version?.number)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Build a complete version before exporting.",
            });
          if (!hasRepositoryScope(account?.scope, input.private))
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Connect GitHub with repository access first.",
            });
          const created = await tx.githubExport.create({
            data: {
              projectId: project.id,
              userId,
              versionId: version.id,
              versionNumber: version.number,
              name: project.githubRepo?.split("/")[1] ?? input.name,
              private: input.private,
            },
          });
          await tx.project.update({
            where: { id: project.id },
            data: {
              operationId: created.id,
              operationKind: "EXPORT",
              operationStartedAt: new Date(),
            },
          });
          return created;
        },
      );
      await enqueue(ctx.db, {
        exportId: job.id,
        projectId: input.projectId,
        userId,
        attempt: job.attempt,
        requestId: `${job.id}:${job.attempt}`,
      });
      return { id: job.id };
    }),
  retry: protectedProcedure
    .input(z.object({ projectId, exportId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const job = await projectTransaction(
        ctx.db,
        input.projectId,
        userId,
        async (tx, project) => {
          assertProjectAvailable(project);
          const previous = await tx.githubExport.findFirst({
            where: { id: input.exportId, projectId: project.id, userId },
          });
          if (!previous) throw new TRPCError({ code: "NOT_FOUND" });
          if (previous.status !== "FAILED")
            throw new TRPCError({
              code: "CONFLICT",
              message: "This export cannot be retried.",
            });
          const [pending, account] = await Promise.all([
            tx.message.count({
              where: { projectId: project.id, ...pendingPromptWhere },
            }),
            tx.account.findFirst({
              where: { userId, providerId: "github" },
              select: { scope: true },
            }),
          ]);
          if (pending)
            throw new TRPCError({
              code: "CONFLICT",
              message: "Wait for the current build to finish.",
            });
          if (!hasRepositoryScope(account?.scope, previous.private))
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Connect GitHub with repository access first.",
            });
          const updated = await tx.githubExport.update({
            where: { id: previous.id },
            data: {
              attempt: { increment: 1 },
              status: "QUEUED",
              runId: null,
              error: null,
              errorCode: null,
            },
          });
          await tx.project.update({
            where: { id: project.id },
            data: {
              operationId: updated.id,
              operationKind: "EXPORT",
              operationStartedAt: new Date(),
            },
          });
          return updated;
        },
      );
      await enqueue(ctx.db, {
        exportId: job.id,
        projectId: input.projectId,
        userId,
        attempt: job.attempt,
        requestId: `${job.id}:${job.attempt}`,
      });
      return { id: job.id };
    }),
});
