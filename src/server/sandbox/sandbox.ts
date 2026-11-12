import "server-only";
import { Sandbox } from "e2b";
import { env } from "@/config/env";
import { withAgentRules } from "./agent-rules";
import { withDevOrigins } from "./dev-origins";
import { APP_DIR } from "./guards";

export const SANDBOX_TIMEOUT_MS = 30 * 60_000;
export const PREVIEW_PORT = 3000;

const SNAPSHOT_MAX_FILES = 400;
const SNAPSHOT_MAX_FILE_BYTES = 200_000;
const SNAPSHOT_MAX_TOTAL_BYTES = 4_000_000;
const SNAPSHOT_EXCLUDED_DIRS = [
  "node_modules",
  ".next",
  ".git",
  ".agents",
  ".claude",
];
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
const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|woff2?|ttf|otf|eot|mp[34]|webm|mov|wav|ogg|pdf|zip|gz|tar|wasm)$/i;

export type SnapshotFiles = Record<string, string>;

const connectionOpts = { apiKey: env.E2B_API_KEY };

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

export function extendSandbox(sandboxId: string, timeoutMs: number) {
  return Sandbox.setTimeout(sandboxId, timeoutMs, connectionOpts);
}

export async function createSandbox(restore?: SnapshotFiles) {
  const sandbox = await Sandbox.create(env.E2B_TEMPLATE_ID, {
    ...connectionOpts,
    timeoutMs: SANDBOX_TIMEOUT_MS,
  });
  const entries = Object.entries(restore ?? {});
  if (entries.length > 0) {
    await sandbox.files.write(
      entries.map(([path, data]) => ({ path: `${APP_DIR}/${path}`, data })),
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

export async function getOrCreateSandbox(
  sandboxId: string | null,
  loadRestore: () => Promise<SnapshotFiles | undefined>,
) {
  if (sandboxId) {
    const existing = await connectSandbox(sandboxId).catch(() => null);
    if (existing) return { sandbox: existing, created: false, restored: 0 };
  }
  const restore = await loadRestore();
  return {
    sandbox: await createSandbox(restore),
    created: true,
    restored: Object.keys(restore ?? {}).length,
  };
}

function quote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function snapshotListCommand() {
  const prune = SNAPSHOT_EXCLUDED_DIRS.map((dir) => `-name ${quote(dir)}`).join(
    " -o ",
  );
  const skip = SNAPSHOT_EXCLUDED_FILES.map(
    (name) => `! -name ${quote(name)}`,
  ).join(" ");
  return `find . \\( ${prune} \\) -prune -o -type f ${skip} -size -${SNAPSHOT_MAX_FILE_BYTES}c -print`;
}

export function pickSnapshotPaths(listing: string) {
  return listing
    .split("\n")
    .map((line) => line.trim().replace(/^\.\//, ""))
    .filter((path) => path && !BINARY_EXTENSIONS.test(path))
    .sort()
    .slice(0, SNAPSHOT_MAX_FILES);
}

export async function snapshotSandbox(sandbox: Sandbox) {
  const listing = await sandbox.commands.run(snapshotListCommand(), {
    cwd: APP_DIR,
    timeoutMs: 60_000,
  });
  const paths = pickSnapshotPaths(listing.stdout);
  const files: SnapshotFiles = {};
  let total = 0;
  for (let index = 0; index < paths.length; index += 16) {
    const batch = paths.slice(index, index + 16);
    const contents = await Promise.all(
      batch.map((path) => sandbox.files.read(`${APP_DIR}/${path}`)),
    );
    for (const [offset, content] of contents.entries()) {
      total += content.length;
      if (total > SNAPSHOT_MAX_TOTAL_BYTES) return files;
      files[batch[offset]] = content;
    }
  }
  return files;
}
