import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { pendingPromptWhere } from "@/inngest/agent/prompt-state";
import {
  checkEdit,
  discardDraft,
  EditError,
  promoteDraft,
  removeDraftFile,
  workingCopy,
  writeDraftFile,
} from "@/server/code/draft";
import { applyEditToSandbox } from "@/server/code/sandbox-edit";
import {
  assertProjectAvailable,
  projectTransaction,
} from "@/server/projects/operations";
import { rateRules } from "@/server/rate-limit";
import { GuardError, resolveAppPath } from "@/server/sandbox/guards";
import { writeVersionToSandbox } from "@/server/sandbox/workspace";
import { createTRPCRouter, rateLimitedProcedure } from "../init";

const projectId = z.string().min(1).max(64);
const path = z.string().min(1).max(300);

async function assertIdle(tx: Prisma.TransactionClient, id: string) {
  const pending = await tx.message.count({
    where: { projectId: id, ...pendingPromptWhere },
  });
  if (pending > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Editing is locked while Vibe is building. Wait or stop it.",
    });
  }
}

function asBadRequest(error: unknown): never {
  if (error instanceof EditError || error instanceof GuardError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

async function bestEffort(task: () => Promise<boolean>) {
  try {
    return await task();
  } catch (error) {
    console.warn("[code] couldn't update the sandbox", error);
    return false;
  }
}

export const codeRouter = createTRPCRouter({
  write: rateLimitedProcedure(rateRules.codeEdit)
    .input(z.object({ projectId, path, content: z.string().max(1_000_000) }))
    .mutation(async ({ ctx, input }) => {
      const relative = await checkEdit(input.path, input.content).catch(
        asBadRequest,
      );
      const { project, changed } = await projectTransaction(
        ctx.db,
        input.projectId,
        ctx.session.user.id,
        async (tx, project) => {
          assertProjectAvailable(project);
          await assertIdle(tx, project.id);
          const result = await writeDraftFile(
            tx,
            project.id,
            relative,
            input.content,
          ).catch(asBadRequest);
          return { project, changed: result.changed };
        },
      );
      const previewUpdated = changed
        ? await bestEffort(() =>
            applyEditToSandbox(project.sandboxId, {
              kind: "write",
              path: relative,
              content: input.content,
            }),
          )
        : false;
      return { changed, previewUpdated };
    }),
  remove: rateLimitedProcedure(rateRules.codeEdit)
    .input(z.object({ projectId, path }))
    .mutation(async ({ ctx, input }) => {
      const relative = (() => {
        try {
          return resolveAppPath(input.path, "write").relative;
        } catch (error) {
          return asBadRequest(error);
        }
      })();
      const { project, changed } = await projectTransaction(
        ctx.db,
        input.projectId,
        ctx.session.user.id,
        async (tx, project) => {
          assertProjectAvailable(project);
          await assertIdle(tx, project.id);
          const result = await removeDraftFile(tx, project.id, relative);
          return { project, changed: result.changed };
        },
      );
      const previewUpdated = changed
        ? await bestEffort(() =>
            applyEditToSandbox(project.sandboxId, {
              kind: "remove",
              path: relative,
            }),
          )
        : false;
      return { changed, previewUpdated };
    }),
  saveVersion: rateLimitedProcedure(rateRules.codeEdit)
    .input(z.object({ projectId }))
    .mutation(async ({ ctx, input }) =>
      projectTransaction(
        ctx.db,
        input.projectId,
        ctx.session.user.id,
        async (tx, project) => {
          assertProjectAvailable(project);
          await assertIdle(tx, project.id);
          const saved = await promoteDraft(tx, project.id);
          if (saved) {
            await tx.project.update({
              where: { id: project.id },
              data: { updatedAt: new Date() },
            });
          }
          return { number: saved?.number ?? null };
        },
      ),
    ),
  discard: rateLimitedProcedure(rateRules.codeEdit)
    .input(z.object({ projectId }))
    .mutation(async ({ ctx, input }) => {
      const { project, files, discarded } = await projectTransaction(
        ctx.db,
        input.projectId,
        ctx.session.user.id,
        async (tx, project) => {
          assertProjectAvailable(project);
          await assertIdle(tx, project.id);
          const base = await workingCopy(tx, project.id);
          const removed = await discardDraft(tx, project.id);
          return {
            project,
            files: base?.latestFiles ?? null,
            discarded: removed,
          };
        },
      );
      const previewUpdated =
        discarded && files && project.sandboxId
          ? await bestEffort(
              async () =>
                (
                  await writeVersionToSandbox(project.sandboxId!, files, {
                    installInBackground: true,
                  })
                ).written,
            )
          : false;
      return { discarded, previewUpdated };
    }),
});
