import { after } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { refreshSandboxSecrets } from "@/server/secrets/refresh";
import { setSecret } from "@/server/secrets/store";
import { checkSecret } from "@/server/secrets/validate";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const body = z.object({
  name: z.string().min(1).max(64),
  value: z.string().min(1).max(16_384),
});

function reply(data: object, status: number) {
  return Response.json(data, { status, headers: noStore });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await getSession();
  if (!session) return reply({ error: "Unauthorized" }, 401);
  const { projectId } = await params;
  const project = await db.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: { id: true },
  });
  if (!project) return reply({ error: "Not found" }, 404);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Invalid request" }, 400);
  const name = parsed.data.name;
  const value = parsed.data.value.trim();
  const checked = checkSecret(name, value);
  if (!checked.ok) return reply({ error: checked.error }, 400);

  const saved = await setSecret(db, {
    projectId: project.id,
    userId: session.user.id,
    name,
    value,
  });
  after(() =>
    refreshSandboxSecrets(project.id).catch((error) =>
      console.warn("[secrets] couldn't refresh the sandbox", error),
    ),
  );
  return reply(
    {
      name,
      replaced: saved.replaced,
      ...(checked.warnings.length ? { warnings: checked.warnings } : {}),
    },
    200,
  );
}
