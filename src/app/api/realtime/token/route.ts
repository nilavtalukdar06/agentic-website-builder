import { getClientSubscriptionToken } from "inngest/react";
import { z } from "zod";
import { projectChannel, projectTopics } from "@/inngest/channels";
import { inngest } from "@/inngest/client";
import {
  arcjetDenialResponse,
  ajBrowserBotWithRateLimit,
} from "@/server/arcjet";
import { db } from "@/server/db";
import { consumeRateLimit, rateRules } from "@/server/rate-limit";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

const body = z.object({ projectId: z.string().min(1).max(64) });

const ajRealtimeToken = ajBrowserBotWithRateLimit(60, 60);

export async function POST(request: Request) {
  const arcjetDecision = await ajRealtimeToken.protect(request);
  const arcjetDenial = arcjetDenialResponse(arcjetDecision);
  if (arcjetDenial) return arcjetDenial;

  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decision = await consumeRateLimit(
    db,
    rateRules.realtimeToken,
    session.user.id,
  );
  if (!decision.allowed) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(decision.retryAfterSeconds) },
      },
    );
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

  try {
    const token = await getClientSubscriptionToken(inngest, {
      channel: projectChannel({ projectId: project.id }),
      topics: [...projectTopics],
    });
    return Response.json(token, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.warn("[realtime] couldn't create a subscription token", error);
    return Response.json(
      { error: "Live updates are unavailable" },
      { status: 503 },
    );
  }
}
