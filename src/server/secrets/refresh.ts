import "server-only";
import { db } from "@/server/db";
import { connectSandbox } from "@/server/sandbox/sandbox";
import { ENV_FILE, prepareSandboxSecrets } from "./inject";
import { loadSecretValues } from "./store";

export async function refreshSandboxSecrets(projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { sandboxId: true },
  });
  if (!project?.sandboxId) return;
  const sandbox = await connectSandbox(project.sandboxId).catch(() => null);
  if (!sandbox) return;
  const secrets = await loadSecretValues(db, projectId);
  if (secrets.length === 0) {
    await sandbox.files.remove(ENV_FILE).catch(() => null);
    await sandbox.updateNetwork({}).catch(() => null);
    return;
  }
  await prepareSandboxSecrets(sandbox, secrets, { restart: true });
}
