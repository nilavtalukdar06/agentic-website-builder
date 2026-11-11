import { getClientSubscriptionToken } from "inngest/react";
import { z } from "zod";
import { projectChannel, projectTopics } from "@/inngest/channels";
import { inngest } from "@/inngest/client";
import { db } from "@/server/db";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

const body = z.object({ projectId: z.string().min(1).max(64) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const project = await db.project.findFirst({
    where: { id: parsed.data.projectId, userId: session.user.id },
    select: { id: true },
  });
  if (!project) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const token = await getClientSubscriptionToken(inngest, {
    channel: projectChannel({ projectId: project.id }),
    topics: [...projectTopics],
  });
  return Response.json(token, { headers: { "Cache-Control": "no-store" } });
}
