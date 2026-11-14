import "server-only";
import { loadRestoreFiles } from "@/inngest/agent/persist";
import { decodeSnapshotFile } from "@/lib/snapshot-files";
import { db } from "@/server/db";
import { recordSandboxEvent } from "@/server/ops/sandbox-events";
import { isSandboxGone } from "./errors";
import { APP_DIR } from "./guards";
import {
  connectSandbox,
  ensureAgentInstructions,
  ensureDevOrigins,
  getOrCreateSandbox,
  PREVIEW_PORT,
  previewUrlFor,
  snapshotListCommand,
  type SnapshotFiles,
} from "./sandbox";

const WAKE_WAIT_SECONDS = 60;

function quote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function wakeSandbox({
  projectId,
  sandboxId,
  operationId,
}: {
  projectId: string;
  sandboxId: string | null;
  operationId?: string;
}) {
  try {
    const { sandbox, created } = await getOrCreateSandbox(
      sandboxId,
      () => loadRestoreFiles(db, { projectId }),
      (outcome) => recordSandboxEvent(db, projectId, outcome),
    );
    await ensureDevOrigins(sandbox);
    if (created) await ensureAgentInstructions(sandbox);
    const previewUrl = previewUrlFor(sandbox);
    if (operationId) {
      const updated = await db.project.updateMany({
        where: { id: projectId, operationId },
        data: { sandboxId: sandbox.sandboxId, previewUrl },
      });
      if (!updated.count) throw new Error("The preview operation expired.");
    } else {
      await db.project.update({
        where: { id: projectId },
        data: { sandboxId: sandbox.sandboxId, previewUrl },
      });
    }
    await sandbox.commands.run(
      `curl -fsS -o /dev/null --max-time ${WAKE_WAIT_SECONDS} http://localhost:${PREVIEW_PORT}/`,
      { cwd: APP_DIR, timeoutMs: (WAKE_WAIT_SECONDS + 10) * 1000 },
    );
    return { previewUrl, created };
  } catch (error) {
    await recordSandboxEvent(db, projectId, "FAILED");
    throw error;
  }
}

export function staleFiles(listing: string, files: SnapshotFiles) {
  return listing
    .split(listing.includes("\0") ? "\0" : "\n")
    .flatMap((record) => {
      const tab = record.indexOf("\t");
      if (tab < 0) return [];
      const path = record.slice(tab + 1).replace(/^\.\//, "");
      return path && path !== "package-lock.json" && !(path in files)
        ? [path]
        : [];
    });
}

export async function writeVersionToSandbox(
  sandboxId: string,
  files: SnapshotFiles,
  { installInBackground = true } = {},
) {
  let sandbox;
  try {
    sandbox = await connectSandbox(sandboxId);
  } catch (error) {
    if (isSandboxGone(error)) return { written: false };
    throw error;
  }
  const listing = await sandbox.commands.run(
    snapshotListCommand({ complete: true }),
    {
      cwd: APP_DIR,
      timeoutMs: 60_000,
    },
  );
  const stale = staleFiles(listing.stdout, files);
  if (stale.length > 0) {
    await sandbox.commands.run(`rm -f -- ${stale.map(quote).join(" ")}`, {
      cwd: APP_DIR,
      timeoutMs: 60_000,
    });
  }
  const previousManifest = await sandbox.files
    .read(`${APP_DIR}/package.json`)
    .catch(() => null);
  const entries = Object.entries(files);
  if (entries.length > 0) {
    await sandbox.files.write(
      entries.map(([path, value]) => ({
        path: `${APP_DIR}/${path}`,
        data: decodeSnapshotFile(value),
      })),
    );
  }
  await ensureDevOrigins(sandbox);
  await ensureAgentInstructions(sandbox);
  if (files["package.json"] && files["package.json"] !== previousManifest) {
    await sandbox.commands.run("npm install --no-audit --no-fund", {
      cwd: APP_DIR,
      background: installInBackground,
      timeoutMs: 4 * 60_000,
    });
  }
  return { written: true };
}
