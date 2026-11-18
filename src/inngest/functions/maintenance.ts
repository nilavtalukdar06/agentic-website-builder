import "server-only";
import { db } from "@/server/db";
import {
  deleteOrphanUploads,
  expireScreenshots,
  expireScreenshotObjectsPage,
  killOrphanSandboxes,
  purgeExpiredRows,
  retireIdleSandboxes,
} from "@/server/ops/cleanup";
import { raiseAlert } from "@/server/ops/alert";
import { checkSandboxHealth } from "@/server/ops/sandbox-events";
import { killSandbox, listPausedSandboxes } from "@/server/sandbox/admin";
import {
  deleteAttachment,
  listScreenshotObjects,
} from "@/server/storage/attachments";
import { inngest } from "../client";

export const cleanupResources = inngest.createFunction(
  {
    id: "cleanup-resources",
    name: "Clean up idle sandboxes, unused uploads and expired screenshots",
    triggers: [{ cron: "0 4 * * *" }],
    concurrency: { limit: 1 },
    retries: 1,
  },
  async ({ step }) => {
    const idle = await step.run("retire-idle-sandboxes", () =>
      retireIdleSandboxes(db, killSandbox),
    );
    const orphans = await step.run("kill-orphan-sandboxes", () =>
      killOrphanSandboxes(db, {
        listPaused: listPausedSandboxes,
        kill: killSandbox,
      }),
    );
    const uploads = await step.run("delete-orphan-uploads", () =>
      deleteOrphanUploads(db, deleteAttachment),
    );
    const screenshots = await step.run("expire-screenshots", () =>
      expireScreenshots(db, deleteAttachment),
    );
    const screenshotSweepTime = await step.run("screenshot-sweep-time", () =>
      Date.now(),
    );
    const screenshotObjects = { deleted: 0, failed: 0 };
    let cursor: string | undefined;
    let page = 0;
    do {
      const result = await step.run(`expire-screenshot-objects-${page}`, () =>
        expireScreenshotObjectsPage(
          listScreenshotObjects,
          deleteAttachment,
          screenshotSweepTime,
          cursor,
        ),
      );
      screenshotObjects.deleted += result.deleted;
      screenshotObjects.failed += result.failed;
      cursor = result.cursor ?? undefined;
      page += 1;
    } while (cursor);
    const purged = await step.run("purge-expired-rows", () =>
      purgeExpiredRows(db),
    );
    const failures =
      idle.failed +
      orphans.failed +
      uploads.failed +
      screenshots.failed +
      screenshotObjects.failed;
    if (failures > 0) {
      await step.run("alert-cleanup", () =>
        raiseAlert({
          kind: "cleanup",
          message: "The nightly cleanup couldn't remove some resources.",
          details: { failures },
        }),
      );
    }
    return { idle, orphans, uploads, screenshots, screenshotObjects, purged };
  },
);

export const monitorSandboxes = inngest.createFunction(
  {
    id: "monitor-sandboxes",
    name: "Alert when sandbox resumes fail often",
    triggers: [{ cron: "*/30 * * * *" }],
    concurrency: { limit: 1 },
    retries: 0,
  },
  async ({ step }) => {
    const health = await step.run("check-health", () => checkSandboxHealth(db));
    if (health.unhealthy) {
      await step.run("alert-sandboxes", () =>
        raiseAlert({
          kind: "sandbox-resume",
          message: "Sandbox resumes are failing or falling back to rebuilds.",
          details: {
            attempts: health.total,
            rebuilt: health.rebuilt,
            failed: health.failed,
            windowMinutes: 30,
          },
        }),
      );
    }
    return health;
  },
);
