import "server-only";
import { loadRestoreFiles } from "@/inngest/agent/persist";
import { decodeSnapshotFile } from "@/lib/snapshot-files";
import { db } from "@/server/db";
import { isSandboxGone } from "./errors";
import { APP_DIR } from "./guards";
import {
  connectSandbox,
  ensureAgentInstructions,
  ensureDevOrigins,
  getOrCreateSandbox,
  pickSnapshotEntries,
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
}: {
  projectId: string;
  sandboxId: string | null;
}) {
  const { sandbox, created } = await getOrCreateSandbox(sandboxId, () =>
    loadRestoreFiles(db, { projectId }),
  );
  await ensureDevOrigins(sandbox);
  if (created) await ensureAgentInstructions(sandbox);
  const previewUrl = previewUrlFor(sandbox);
  await db.project.update({
    where: { id: projectId },
    data: { sandboxId: sandbox.sandboxId, previewUrl },
  });
  await sandbox.commands
    .run(
      `curl -s -o /dev/null --max-time ${WAKE_WAIT_SECONDS} http://localhost:${PREVIEW_PORT}/`,
      { cwd: APP_DIR, timeoutMs: (WAKE_WAIT_SECONDS + 10) * 1000 },
    )
    .catch(() => null);
  return { previewUrl, created };
}

export function staleFiles(listing: string, files: SnapshotFiles) {
  return pickSnapshotEntries(listing)
    .map((entry) => entry.path)
    .filter((path) => !(path in files));
}

export async function writeVersionToSandbox(
  sandboxId: string,
  files: SnapshotFiles,
) {
  let sandbox;
  try {
    sandbox = await connectSandbox(sandboxId);
  } catch (error) {
    if (isSandboxGone(error)) return { written: false };
    throw error;
  }
  const listing = await sandbox.commands.run(snapshotListCommand(), {
    cwd: APP_DIR,
    timeoutMs: 60_000,
  });
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
      background: true,
    });
  }
  return { written: true };
}
