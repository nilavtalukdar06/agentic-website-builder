import { TRPCError } from "@trpc/server";
import { after } from "next/server";
import { z } from "zod";
import { SECRET_NAME_PATTERN } from "@/lib/secret-name";
import { refreshSandboxSecrets } from "@/server/secrets/refresh";
import { deleteSecret, listSecretNames } from "@/server/secrets/store";
import { createTRPCRouter, protectedProcedure } from "../init";

const projectInput = z.object({ projectId: z.string().min(1).max(64) });

async function ownProject(
  db: {
    project: { findFirst: (args: object) => Promise<{ id: string } | null> };
  },
  projectId: string,
  userId: string,
) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) throw new TRPCError({ code: "NOT_FOUND" });
  return project;
}

export const secretRouter = createTRPCRouter({
  list: protectedProcedure.input(projectInput).query(async ({ ctx, input }) => {
    await ownProject(ctx.db, input.projectId, ctx.session.user.id);
    return listSecretNames(ctx.db, input.projectId);
  }),
  delete: protectedProcedure
    .input(projectInput.extend({ name: z.string().regex(SECRET_NAME_PATTERN) }))
    .mutation(async ({ ctx, input }) => {
      await ownProject(ctx.db, input.projectId, ctx.session.user.id);
      const deleted = await deleteSecret(ctx.db, {
        projectId: input.projectId,
        userId: ctx.session.user.id,
        name: input.name,
      });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
      after(() =>
        refreshSandboxSecrets(input.projectId).catch((error) =>
          console.warn("[secrets] couldn't refresh the sandbox", error),
        ),
      );
      return { name: input.name };
    }),
});
