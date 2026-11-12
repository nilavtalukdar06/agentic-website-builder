import "server-only";
import type { Sandbox } from "e2b";
import { db } from "@/server/db";
import { prepareSandboxSecrets } from "@/server/secrets/inject";
import type { SecretValue } from "@/server/secrets/redact";
import { loadRestoreFiles } from "@/inngest/agent/persist";
import { isSandboxGone } from "./errors";
import { APP_DIR } from "./guards";
import {
  connectSandbox,
  createSandbox,
  ensureAgentInstructions,
  ensureDevOrigins,
  previewUrlFor,
} from "./sandbox";

export { isSandboxGone };

export type SandboxRef = { id: string; previewUrl: string };

export type ReplayWrite = { path: string; content: string };

export async function recoverSandbox({
  projectId,
  chainId,
  replay,
  secrets,
}: {
  projectId: string;
  chainId: string;
  replay: readonly ReplayWrite[];
  secrets: readonly SecretValue[];
}) {
  const restore = await loadRestoreFiles(db, { projectId, chainId });
  const sandbox = await createSandbox(restore);
  if (replay.length > 0) {
    await sandbox.files.write(
      replay.map(({ path, content }) => ({
        path: `${APP_DIR}/${path}`,
        data: content,
      })),
    );
  }
  await ensureDevOrigins(sandbox);
  await ensureAgentInstructions(sandbox);
  await prepareSandboxSecrets(sandbox, secrets, { restart: true });
  const previewUrl = previewUrlFor(sandbox);
  await db.project.update({
    where: { id: projectId },
    data: { sandboxId: sandbox.sandboxId, previewUrl },
  });
  return {
    sandbox,
    ref: { id: sandbox.sandboxId, previewUrl },
    restored: Object.keys(restore ?? {}).length,
  };
}

export async function connectOrRecover(
  ref: SandboxRef,
  recover: () => ReturnType<typeof recoverSandbox>,
): Promise<{ sandbox: Sandbox; recovered: SandboxRef | null }> {
  try {
    return { sandbox: await connectSandbox(ref.id), recovered: null };
  } catch (error) {
    if (!isSandboxGone(error)) throw error;
    const result = await recover();
    return { sandbox: result.sandbox, recovered: result.ref };
  }
}
