import "server-only";
import { screenshotKeys } from "@/lib/agent/parts";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isProjectScreenshotKey } from "@/server/storage/screenshot-keys";
import { purgeThrottleWindows } from "@/server/rate-limit";

const DAY = 24 * 60 * 60_000;

export const SANDBOX_IDLE_DAYS = 14;
export const ORPHAN_MIN_AGE_MS = DAY;
export const UPLOAD_ORPHAN_AGE_MS = DAY;
export const COUNTER_RETENTION_MS = DAY;
export const EVENT_RETENTION_MS = 30 * DAY;
export const MAX_SANDBOX_KILLS = 100;
export const MAX_UPLOAD_DELETES = 200;

type KillSandbox = (sandboxId: string) => Promise<unknown>;

export async function retireIdleSandboxes(
  db: Pick<PrismaClient, "project">,
  kill: KillSandbox,
  now = Date.now(),
) {
  const cutoff = new Date(now - SANDBOX_IDLE_DAYS * DAY);
  const idle = await db.project.findMany({
    where: {
      sandboxId: { not: null },
      operationId: null,
      updatedAt: { lt: cutoff },
    },
    select: { id: true, sandboxId: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: MAX_SANDBOX_KILLS,
  });
  let retired = 0;
  let failed = 0;
  for (const project of idle) {
    if (!project.sandboxId) continue;
    const detached = await db.project.updateMany({
      where: {
        id: project.id,
        sandboxId: project.sandboxId,
        operationId: null,
        updatedAt: project.updatedAt,
      },
      data: {
        sandboxId: null,
        previewUrl: null,
        updatedAt: project.updatedAt,
      },
    });
    if (detached.count === 0) continue;
    try {
      await kill(project.sandboxId);
      retired += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        "[cleanup] couldn't kill an idle sandbox; the orphan sweep retries it",
        error instanceof Error ? error.name : "unknown",
      );
    }
  }
  return { retired, failed };
}

export async function killOrphanSandboxes(
  db: Pick<PrismaClient, "project">,
  sandboxes: {
    listPaused: (before: Date) => Promise<{ id: string }[]>;
    kill: KillSandbox;
  },
  now = Date.now(),
) {
  const paused = await sandboxes.listPaused(new Date(now - ORPHAN_MIN_AGE_MS));
  if (paused.length === 0) return { killed: 0, failed: 0 };
  const referenced = await db.project.findMany({
    where: { sandboxId: { in: paused.map((sandbox) => sandbox.id) } },
    select: { sandboxId: true },
  });
  const keep = new Set(referenced.map((project) => project.sandboxId));
  const orphans = paused
    .filter((sandbox) => !keep.has(sandbox.id))
    .slice(0, MAX_SANDBOX_KILLS);
  let killed = 0;
  let failed = 0;
  for (const orphan of orphans) {
    try {
      await sandboxes.kill(orphan.id);
      killed += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        "[cleanup] couldn't kill an orphaned sandbox",
        error instanceof Error ? error.name : "unknown",
      );
    }
  }
  return { killed, failed };
}

export async function deleteOrphanUploads(
  db: Pick<PrismaClient, "attachment">,
  deleteObject: (key: string) => Promise<unknown>,
  now = Date.now(),
) {
  const stale = await db.attachment.findMany({
    where: {
      messageId: null,
      createdAt: { lt: new Date(now - UPLOAD_ORPHAN_AGE_MS) },
    },
    select: { id: true, key: true },
    orderBy: { createdAt: "asc" },
    take: MAX_UPLOAD_DELETES,
  });
  const removed: string[] = [];
  let failed = 0;
  for (const attachment of stale) {
    try {
      await deleteObject(attachment.key);
      removed.push(attachment.id);
    } catch (error) {
      failed += 1;
      console.warn(
        "[cleanup] couldn't delete an orphaned upload",
        error instanceof Error ? error.name : "unknown",
      );
    }
  }
  if (removed.length > 0) {
    await db.attachment.deleteMany({
      where: { id: { in: removed }, messageId: null },
    });
  }
  return { deleted: removed.length, failed };
}

export const SCREENSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SCREENSHOT_PAGE_SIZE = 200;

export async function expireScreenshotObjectsPage(
  list: (cursor?: string) => Promise<{
    items: { key: string; lastModified?: number }[];
    cursor?: string;
  }>,
  deleteObject: (key: string) => Promise<unknown>,
  now: number,
  cursor?: string,
) {
  const page = await list(cursor);
  let deleted = 0;
  let failed = 0;
  for (const object of page.items) {
    if (!object.key.startsWith("qa/")) continue;
    if (
      object.lastModified === undefined ||
      !Number.isFinite(object.lastModified)
    ) {
      failed += 1;
      continue;
    }
    if (object.lastModified >= now - SCREENSHOT_RETENTION_MS) continue;
    try {
      await deleteObject(object.key);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  if (page.cursor && page.cursor === cursor) {
    throw new Error("Screenshot listing cursor did not advance");
  }
  return { deleted, failed, cursor: page.cursor ?? null };
}

export async function expireScreenshots(
  db: Pick<PrismaClient, "message">,
  deleteObject: (key: string) => Promise<unknown>,
  now = Date.now(),
) {
  const cutoff = new Date(now - SCREENSHOT_RETENTION_MS);
  let after: string | undefined;
  let deleted = 0;
  let failed = 0;
  while (true) {
    const messages = await db.message.findMany({
      where: {
        role: "ASSISTANT",
        createdAt: { lt: cutoff },
        ...(after ? { id: { gt: after } } : {}),
      },
      select: { id: true, projectId: true, parts: true },
      orderBy: { id: "asc" },
      take: SCREENSHOT_PAGE_SIZE,
    });
    for (const message of messages) {
      const keys = [...new Set(screenshotKeys(message.parts))];
      const removed = new Set<string>();
      for (const key of keys) {
        if (!isProjectScreenshotKey(key, message.projectId)) {
          removed.add(key);
          continue;
        }
        try {
          await deleteObject(key);
          removed.add(key);
          deleted += 1;
        } catch {
          failed += 1;
        }
      }
      if (removed.size > 0 && Array.isArray(message.parts)) {
        const parts = message.parts.map((part) => {
          if (
            !part ||
            typeof part !== "object" ||
            Array.isArray(part) ||
            part.type !== "browser" ||
            !Array.isArray(part.screenshots)
          )
            return part;
          return {
            ...part,
            screenshots: part.screenshots.filter(
              (shot) =>
                !shot ||
                typeof shot !== "object" ||
                Array.isArray(shot) ||
                typeof shot.key !== "string" ||
                !removed.has(shot.key),
            ),
          };
        });
        await db.message.updateMany({
          where: {
            id: message.id,
            parts: { equals: message.parts as Prisma.InputJsonValue },
          },
          data: { parts },
        });
      }
    }
    if (messages.length < SCREENSHOT_PAGE_SIZE) break;
    after = messages[messages.length - 1].id;
  }
  return { deleted, failed };
}

export async function purgeExpiredRows(
  db: Pick<PrismaClient, "throttleWindow" | "rateLimit" | "sandboxEvent">,
  now = Date.now(),
) {
  const [throttle, authLimits, events] = await Promise.all([
    purgeThrottleWindows(db, COUNTER_RETENTION_MS, now),
    db.rateLimit.deleteMany({
      where: { lastRequest: { lt: BigInt(now - COUNTER_RETENTION_MS) } },
    }),
    db.sandboxEvent.deleteMany({
      where: { createdAt: { lt: new Date(now - EVENT_RETENTION_MS) } },
    }),
  ]);
  return {
    throttleWindows: throttle,
    authLimits: authLimits.count,
    sandboxEvents: events.count,
  };
}
