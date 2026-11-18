import { CommandExitError } from "e2b";
import type { PrismaClient } from "@/generated/prisma/client";
import { scanFiles } from "@/inngest/agent/guardrails/scan";
import { pendingPromptWhere } from "@/inngest/agent/prompt-state";
import { projectOperation } from "@/server/projects/operations";
import { APP_DIR, checkCommand } from "@/server/sandbox/guards";
import { replaceDraftFiles, sameFiles, workingCopy } from "./draft";

export const TERMINAL_TIMEOUT_MS = 100_000;
export const MAX_OUTPUT_CHARS = 200_000;

export { checkCommand as checkTerminalCommand };

type RunnableSandbox = {
  commands: {
    run: (
      command: string,
      options: {
        cwd: string;
        timeoutMs: number;
        onStdout: (chunk: string) => void;
        onStderr: (chunk: string) => void;
      },
    ) => Promise<{ exitCode: number }>;
  };
};

export async function streamCommand({
  sandbox,
  command,
  emit,
  timeoutMs = TERMINAL_TIMEOUT_MS,
  maxChars = MAX_OUTPUT_CHARS,
}: {
  sandbox: RunnableSandbox;
  command: string;
  emit: (text: string) => void;
  timeoutMs?: number;
  maxChars?: number;
}) {
  let sent = 0;
  let truncated = false;
  const forward = (chunk: string) => {
    if (truncated) return;
    const room = maxChars - sent;
    if (chunk.length <= room) {
      sent += chunk.length;
      emit(chunk);
      return;
    }
    truncated = true;
    if (room > 0) emit(chunk.slice(0, room));
    emit("\n… output cut: too long to show …\n");
  };
  let exitCode: number | null = null;
  try {
    const result = await sandbox.commands.run(command, {
      cwd: APP_DIR,
      timeoutMs,
      onStdout: forward,
      onStderr: forward,
    });
    exitCode = result.exitCode;
  } catch (error) {
    if (error instanceof CommandExitError) {
      exitCode = error.exitCode;
    } else {
      forward(
        `\n${error instanceof Error ? error.message : "The command failed."}\n`,
      );
    }
  }
  return { exitCode, truncated };
}

type SyncDb = Pick<PrismaClient, "version" | "message" | "project">;

export async function canRunTerminal(
  db: SyncDb,
  projectId: string,
  project: Parameters<typeof projectOperation>[0],
) {
  if (projectOperation(project)) return "busy" as const;
  const pending = await db.message.count({
    where: { projectId, ...pendingPromptWhere },
  });
  return pending > 0 ? ("building" as const) : ("ok" as const);
}

const MANAGED_FILES = new Set(["AGENTS.md"]);
const MAX_EXISTENCE_CHECKS = 400;

const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export async function missingPaths(
  sandbox: {
    commands: {
      run: (
        command: string,
        options: { cwd: string; timeoutMs: number },
      ) => Promise<{ stdout: string }>;
    };
  },
  paths: readonly string[],
) {
  if (paths.length === 0) return [];
  const list = paths.map(quote).join(" ");
  const result = await sandbox.commands.run(
    `for f in ${list}; do [ -e "$f" ] || printf '%s\\n' "$f"; done`,
    { cwd: APP_DIR, timeoutMs: 30_000 },
  );
  return result.stdout.split("\n").filter(Boolean);
}

export function mergeSnapshot(
  base: Record<string, string>,
  snapshot: Record<string, string>,
  missing: ReadonlySet<string>,
) {
  const next = { ...base };
  for (const [path, value] of Object.entries(snapshot)) {
    if (MANAGED_FILES.has(path)) continue;
    if (base[path] !== value) next[path] = value;
  }
  for (const path of missing) delete next[path];
  return next;
}

export async function syncWorkingCopy({
  db,
  projectId,
  snapshot,
  findMissing,
}: {
  db: SyncDb;
  projectId: string;
  snapshot: Record<string, string>;
  findMissing: (paths: string[]) => Promise<string[]>;
}) {
  const base = await workingCopy(db, projectId);
  if (!base) return false;
  const candidates = Object.keys(base.files).filter(
    (path) => !(path in snapshot) && !MANAGED_FILES.has(path),
  );
  const missing =
    candidates.length > 0 && candidates.length <= MAX_EXISTENCE_CHECKS
      ? new Set(await findMissing(candidates))
      : new Set<string>();
  const next = mergeSnapshot(base.files, snapshot, missing);
  if (sameFiles(next, base.files)) return false;
  if ((await scanFiles(next)).length > 0) return false;
  const pending = await db.message.count({
    where: { projectId, ...pendingPromptWhere },
  });
  if (pending > 0) return false;
  return (await replaceDraftFiles(db, projectId, next)).changed;
}
