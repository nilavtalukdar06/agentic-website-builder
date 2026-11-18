import "server-only";
import { createHash } from "node:crypto";
import { Sandbox } from "e2b";
import { env } from "@/config/env";
import {
  decodeSnapshotFile,
  encodeBinaryFile,
  isBinaryPath,
} from "@/lib/snapshot-files";
import { withAgentRules } from "./agent-rules";
import { withDevOrigins } from "./dev-origins";
import { APP_DIR } from "./guards";

export const SANDBOX_TIMEOUT_MS = 30 * 60_000;
export const PREVIEW_PORT = 3000;

const SNAPSHOT_MAX_FILES = 400;
const SNAPSHOT_MAX_FILE_BYTES = 200_000;
export const SNAPSHOT_MAX_BINARY_BYTES = 1_048_576;
const SNAPSHOT_MAX_TOTAL_BYTES = 4_000_000;
const SNAPSHOT_EXCLUDED_DIRS = [
  "node_modules",
  ".next",
  ".git",
  ".agents",
  ".claude",
  ".vibe",
];
const SNAPSHOT_EXCLUDED_PATHS = ["./agent/skills"];
const SNAPSHOT_EXCLUDED_FILES = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "next-env.d.ts",
  "skills-lock.json",
  "*.tsbuildinfo",
  ".env*",
];
export const SANDBOX_LIFECYCLE = {
  onTimeout: "pause",
  autoResume: false,
} as const;

export type SnapshotFiles = Record<string, string>;

const connectionOpts = { apiKey: env.E2B_API_KEY };

export function databaseTag(connectionString = env.DATABASE_URL) {
  const host = new URL(connectionString).hostname.replace("-pooler", "");
  return createHash("sha256").update(host).digest("hex").slice(0, 16);
}

export function sandboxMetadata() {
  return { app: "vibe", database: databaseTag() };
}

export async function ensureDevOrigins(sandbox: Pick<Sandbox, "files">) {
  const path = `${APP_DIR}/next.config.ts`;
  const source = await sandbox.files.read(path).catch(() => null);
  if (source === null) return false;
  const patched = withDevOrigins(source);
  if (patched === null) return false;
  return sandbox.files.write(path, patched).then(
    () => true,
    () => false,
  );
}

export async function ensureAgentInstructions(sandbox: Pick<Sandbox, "files">) {
  const path = `${APP_DIR}/AGENTS.md`;
  const source = await sandbox.files.read(path).catch(() => null);
  const patched = withAgentRules(source);
  if (patched === null) return false;
  return sandbox.files.write(path, patched).then(
    () => true,
    () => false,
  );
}

export function previewUrlFor(sandbox: Sandbox) {
  return `https://${sandbox.getHost(PREVIEW_PORT)}`;
}

export function connectSandbox(sandboxId: string) {
  return Sandbox.connect(sandboxId, {
    ...connectionOpts,
    timeoutMs: SANDBOX_TIMEOUT_MS,
  });
}

export async function createSandbox(restore?: SnapshotFiles) {
  const sandbox = await Sandbox.create(env.E2B_TEMPLATE_ID, {
    ...connectionOpts,
    timeoutMs: SANDBOX_TIMEOUT_MS,
    lifecycle: SANDBOX_LIFECYCLE,
    metadata: sandboxMetadata(),
  });
  const entries = Object.entries(restore ?? {});
  if (entries.length > 0) {
    await sandbox.files.write(
      entries.map(([path, value]) => ({
        path: `${APP_DIR}/${path}`,
        data: decodeSnapshotFile(value),
      })),
    );
    const needsInstall = entries.some(([path]) => path === "package.json");
    if (needsInstall) {
      await sandbox.commands.run("npm install --no-audit --no-fund", {
        cwd: APP_DIR,
        timeoutMs: 4 * 60_000,
      });
    }
  }
  return sandbox;
}

export type ResumeOutcome = "RESUMED" | "REBUILT";

export async function getOrCreateSandbox(
  sandboxId: string | null,
  loadRestore: () => Promise<SnapshotFiles | undefined>,
  onResume?: (outcome: ResumeOutcome) => Promise<void>,
) {
  if (sandboxId) {
    const existing = await connectSandbox(sandboxId).catch(() => null);
    if (existing) {
      await onResume?.("RESUMED");
      return { sandbox: existing, created: false, restored: 0 };
    }
  }
  const restore = await loadRestore();
  const sandbox = await createSandbox(restore);
  if (sandboxId) await onResume?.("REBUILT");
  return {
    sandbox,
    created: true,
    restored: Object.keys(restore ?? {}).length,
  };
}

function quote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function snapshotListCommand({ complete = false } = {}) {
  const prune = [
    ...SNAPSHOT_EXCLUDED_DIRS.map((dir) => `-name ${quote(dir)}`),
    ...SNAPSHOT_EXCLUDED_PATHS.map((path) => `-path ${quote(path)}`),
  ].join(" -o ");
  const skip = SNAPSHOT_EXCLUDED_FILES.filter(
    (name) => !complete || name !== "package-lock.json",
  )
    .map((name) => `! -name ${quote(name)}`)
    .join(" ");
  const size = complete ? "" : ` -size -${SNAPSHOT_MAX_BINARY_BYTES + 1}c`;
  return `find . \\( ${prune} \\) -prune -o -type f ${skip}${size} -printf '%s\\t%p${complete ? "\\0" : "\\n"}'`;
}

export class SnapshotLimitError extends Error {}

export async function snapshotForExport(
  sandbox: Pick<Sandbox, "commands" | "files">,
) {
  const listing = await sandbox.commands.run(
    snapshotListCommand({ complete: true }),
    { cwd: APP_DIR, timeoutMs: 60_000 },
  );
  const records = listing.stdout.split("\0").filter(Boolean);
  if (records.length > SNAPSHOT_MAX_FILES) throw new SnapshotLimitError();
  const entries = records
    .map((record) => {
      const tab = record.indexOf("\t");
      const size = Number(record.slice(0, tab));
      const path = record.slice(tab + 1).replace(/^\.\//, "");
      const binary = isBinaryPath(path);
      const limit =
        binary || path === "package-lock.json"
          ? SNAPSHOT_MAX_BINARY_BYTES
          : SNAPSHOT_MAX_FILE_BYTES;
      if (
        tab < 0 ||
        !path ||
        !Number.isSafeInteger(size) ||
        size < 0 ||
        size > limit
      )
        throw new SnapshotLimitError();
      return { path, size, binary };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  if (
    entries.reduce((sum, entry) => sum + entry.size, 0) >
    SNAPSHOT_MAX_TOTAL_BYTES
  )
    throw new SnapshotLimitError();
  const files: SnapshotFiles = {};
  for (let index = 0; index < entries.length; index += 16) {
    await Promise.all(
      entries.slice(index, index + 16).map(async ({ path, binary }) => {
        const absolute = `${APP_DIR}/${path}`;
        files[path] = binary
          ? encodeBinaryFile(
              path,
              await sandbox.files.read(absolute, { format: "bytes" }),
            )
          : await sandbox.files.read(absolute);
      }),
    );
  }
  return files;
}

export type SnapshotEntry = { path: string; size: number; binary: boolean };

export function pickSnapshotEntries(listing: string): SnapshotEntry[] {
  return listing
    .split("\n")
    .flatMap((line) => {
      const tab = line.indexOf("\t");
      if (tab === -1) return [];
      const size = Number(line.slice(0, tab));
      const path = line
        .slice(tab + 1)
        .trim()
        .replace(/^\.\//, "");
      if (!path || !Number.isFinite(size)) return [];
      const binary = isBinaryPath(path);
      const limit = binary
        ? SNAPSHOT_MAX_BINARY_BYTES
        : SNAPSHOT_MAX_FILE_BYTES;
      return size < limit || (binary && size === limit)
        ? [{ path, size, binary }]
        : [];
    })
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, SNAPSHOT_MAX_FILES);
}

export async function snapshotSandbox(
  sandbox: Pick<Sandbox, "commands" | "files">,
) {
  const listing = await sandbox.commands.run(snapshotListCommand(), {
    cwd: APP_DIR,
    timeoutMs: 60_000,
  });
  const entries = pickSnapshotEntries(listing.stdout);
  const files: SnapshotFiles = {};
  let total = 0;
  for (let index = 0; index < entries.length; index += 16) {
    const batch = entries.slice(index, index + 16);
    const contents = await Promise.all(
      batch.map(async ({ path, binary }) => {
        const absolute = `${APP_DIR}/${path}`;
        if (!binary) {
          const text = await sandbox.files.read(absolute);
          return { size: text.length, value: text };
        }
        const bytes = await sandbox.files.read(absolute, { format: "bytes" });
        return { size: bytes.byteLength, value: encodeBinaryFile(path, bytes) };
      }),
    );
    for (const [offset, content] of contents.entries()) {
      if (total + content.size > SNAPSHOT_MAX_TOTAL_BYTES) {
        if (batch[offset].binary) continue;
        return files;
      }
      total += content.size;
      files[batch[offset].path] = content.value;
    }
  }
  return files;
}
