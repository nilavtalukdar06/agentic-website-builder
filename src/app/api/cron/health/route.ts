import { timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { RETENTION_DAYS } from "@/lib/status";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = performance.now();
  let ok = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    ok = false;
  }
  const latencyMs = Math.round(performance.now() - startedAt);

  try {
    await db.healthCheck.create({ data: { ok, latencyMs } });
    await db.healthCheck.deleteMany({
      where: {
        checkedAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) },
      },
    });
  } catch {
    return Response.json({ ok: false, recorded: false }, { status: 503 });
  }

  return Response.json({ ok, latencyMs, recorded: true });
}
