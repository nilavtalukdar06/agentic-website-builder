import "server-only";
import { isSandboxGone } from "@/server/sandbox/errors";
import { APP_DIR } from "@/server/sandbox/guards";
import { connectSandbox } from "@/server/sandbox/sandbox";

const INSTALL = "npm install --no-audit --no-fund";

function quote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export type SandboxEdit =
  | { kind: "write"; path: string; content: string }
  | { kind: "remove"; path: string };

export async function applyEditToSandbox(
  sandboxId: string | null,
  edit: SandboxEdit,
) {
  if (!sandboxId) return false;
  let sandbox;
  try {
    sandbox = await connectSandbox(sandboxId);
  } catch (error) {
    if (isSandboxGone(error)) return false;
    throw error;
  }
  if (edit.kind === "write") {
    await sandbox.files.write([
      { path: `${APP_DIR}/${edit.path}`, data: edit.content },
    ]);
    if (edit.path === "package.json") {
      await sandbox.commands.run(INSTALL, {
        cwd: APP_DIR,
        background: true,
        timeoutMs: 4 * 60_000,
      });
    }
  } else {
    await sandbox.commands.run(`rm -f -- ${quote(edit.path)}`, {
      cwd: APP_DIR,
      timeoutMs: 60_000,
    });
  }
  return true;
}
