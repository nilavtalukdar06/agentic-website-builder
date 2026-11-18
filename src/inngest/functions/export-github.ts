import "server-only";
import { db } from "@/server/db";
import { recordSandboxEvent } from "@/server/ops/sandbox-events";
import { githubClient } from "@/server/github/client";
import { ExportError, githubRequest } from "@/server/github/errors";
import {
  blobContent,
  prepareFiles,
  validateSnapshot,
} from "@/server/github/files";
import {
  claimExport,
  completeExport,
  exportProgress,
  failExport,
} from "@/server/github/jobs";
import {
  ensureRepository,
  pushCommit,
  splitRepository,
} from "@/server/github/repository";
import {
  getOrCreateSandbox,
  previewUrlFor,
  snapshotForExport,
  SnapshotLimitError,
} from "@/server/sandbox/sandbox";
import { writeVersionToSandbox } from "@/server/sandbox/workspace";
import { inngest } from "../client";
import { githubExport } from "../events";
import { queueNotification } from "../notify";

export const exportGithub = inngest.createFunction(
  {
    id: "export-github",
    name: "Export a project to GitHub",
    triggers: [githubExport],
    concurrency: { key: "event.data.projectId", limit: 1, scope: "env" },
    idempotency: "event.data.requestId",
    retries: 2,
    onFailure: async ({ event, error, step }) => {
      await step.run("record-export-failure", () =>
        failExport(db, event.data.event.data, error),
      );
      const failed = event.data.event.data;
      await queueNotification(step, {
        kind: "export-failed",
        userId: failed.userId,
        projectId: failed.projectId,
        exportId: failed.exportId,
        key: failed.requestId,
      });
    },
  },
  async ({ event, step, runId }) => {
    const request = event.data;
    const job = await step.run("claim-export", () =>
      claimExport(db, request, runId),
    );
    if (!job) return { status: "duplicate" };

    const sandboxId = await step.run("recover-sandbox", async () => {
      await exportProgress(db, request, "RECOVERING");
      const [project, version] = await Promise.all([
        db.project.findFirst({
          where: { id: job.projectId, userId: job.userId, operationId: job.id },
          select: { sandboxId: true },
        }),
        db.version.findFirst({
          where: {
            id: job.versionId,
            projectId: job.projectId,
            status: "READY",
          },
          select: { files: true },
        }),
      ]);
      if (!project || !version) throw new ExportError("SNAPSHOT");
      const files = await validateSnapshot(
        version.files as Record<string, string>,
      );
      try {
        const { sandbox } = await getOrCreateSandbox(
          project.sandboxId,
          async () => files,
          (outcome) => recordSandboxEvent(db, job.projectId, outcome),
        );
        const restored = await writeVersionToSandbox(sandbox.sandboxId, files, {
          installInBackground: false,
        });
        if (!restored.written) throw new ExportError("RECOVERY");
        await db.project.updateMany({
          where: { id: job.projectId, operationId: job.id },
          data: {
            sandboxId: sandbox.sandboxId,
            previewUrl: previewUrlFor(sandbox),
          },
        });
        return sandbox.sandboxId;
      } catch (error) {
        if (error instanceof ExportError) throw error;
        throw new ExportError("RECOVERY");
      }
    });

    const files = await step.run("prepare-files", async () => {
      await exportProgress(db, request, "PREPARING");
      const project = await db.project.findFirst({
        where: { id: job.projectId, operationId: job.id },
        select: { name: true },
      });
      if (!project) throw new ExportError("CONFLICT");
      try {
        let recoveredFiles: Record<string, string> | undefined;
        const { sandbox, created } = await getOrCreateSandbox(
          sandboxId,
          async () => {
            const version = await db.version.findFirst({
              where: {
                id: job.versionId,
                projectId: job.projectId,
                status: "READY",
              },
              select: { files: true },
            });
            if (!version) throw new ExportError("SNAPSHOT");
            recoveredFiles = await validateSnapshot(
              version.files as Record<string, string>,
            );
            return recoveredFiles;
          },
        );
        if (created && recoveredFiles) {
          const restored = await writeVersionToSandbox(
            sandbox.sandboxId,
            recoveredFiles,
            { installInBackground: false },
          );
          if (!restored.written) throw new ExportError("RECOVERY");
        }
        await db.project.updateMany({
          where: { id: job.projectId, operationId: job.id },
          data: {
            sandboxId: sandbox.sandboxId,
            previewUrl: previewUrlFor(sandbox),
          },
        });
        return await prepareFiles(
          await snapshotForExport(sandbox),
          project.name,
        );
      } catch (error) {
        if (error instanceof ExportError) throw error;
        if (error instanceof SnapshotLimitError)
          throw new ExportError("TOO_LARGE");
        throw new ExportError("RECOVERY");
      }
    });

    const repository = await step.run("repository", async () => {
      if (job.repository && job.repositoryUrl && job.branch && job.baseCommit)
        return {
          repository: job.repository,
          repositoryUrl: job.repositoryUrl,
          branch: job.branch,
          baseCommit: job.baseCommit,
        };
      const project = await db.project.findUniqueOrThrow({
        where: { id: job.projectId },
        select: { githubRepo: true },
      });
      const result = await githubRequest(async () =>
        ensureRepository(await githubClient(job.userId, job.private), {
          id: job.id,
          name: job.name,
          private: job.private,
          existing: project.githubRepo,
        }),
      );
      await db.githubExport.update({ where: { id: job.id }, data: result });
      return result;
    });

    await step.run("pushing", () => exportProgress(db, request, "PUSHING"));
    const target = splitRepository(repository.repository);
    const blobs: { path: string; mode: "100644"; type: "blob"; sha: string }[] =
      [];
    for (const [index, [path, content]] of Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .entries()) {
      const sha = await step.run(`blob-${index}`, () =>
        githubRequest(async () => {
          const client = await githubClient(job.userId, job.private);
          return (
            await client.rest.git.createBlob({
              ...target,
              ...blobContent(content),
            })
          ).data.sha;
        }),
      );
      blobs.push({ path, mode: "100644", type: "blob", sha });
    }
    const tree = await step.run("tree", () =>
      githubRequest(async () => {
        const client = await githubClient(job.userId, job.private);
        return (await client.rest.git.createTree({ ...target, tree: blobs }))
          .data.sha;
      }),
    );
    const commitSha = await step.run("commit", async () => {
      if (job.commitSha) return job.commitSha;
      const sha = await githubRequest(async () => {
        const client = await githubClient(job.userId, job.private);
        const author = {
          name: "Vibe",
          email: "noreply@vibe.local",
          date: new Date(job.createdAt).toISOString(),
        };
        return (
          await client.rest.git.createCommit({
            ...target,
            message: `Export version ${job.versionNumber}\n\nVibe-Export: ${job.id}`,
            tree,
            parents: [repository.baseCommit],
            author,
            committer: author,
          })
        ).data.sha;
      });
      await db.githubExport.update({
        where: { id: job.id },
        data: { commitSha: sha },
      });
      return sha;
    });
    await step.run("push", () =>
      githubRequest(async () =>
        pushCommit(await githubClient(job.userId, job.private), {
          ...repository,
          commitSha,
        }),
      ),
    );
    await step.run("persist-export", () =>
      completeExport(
        db,
        request,
        repository.repository,
        repository.repositoryUrl,
        commitSha,
      ),
    );
    await queueNotification(step, {
      kind: "export-finished",
      userId: request.userId,
      projectId: request.projectId,
      exportId: request.exportId,
      key: request.requestId,
    });
    return {
      status: "succeeded",
      repository: repository.repository,
      commitSha,
    };
  },
);
