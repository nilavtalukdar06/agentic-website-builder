import "server-only";
import { scanFiles } from "@/inngest/agent/guardrails/scan";
import { decodeSnapshotFile } from "@/lib/snapshot-files";
import type { SnapshotFiles } from "@/server/sandbox/sandbox";
import { ExportError } from "./errors";

const excluded =
  /(^|\/)(node_modules|\.next|\.git|\.agents|\.claude)(\/|$)|(^|\/)\.env[^/]*$|(^|\/)skills-lock\.json$|^agent\/skills(\/|$)|(^|\/)next-env\.d\.ts$|\.tsbuildinfo$/;

function safePath(path: string) {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path
      .split("/")
      .some((part) => part === ".." || part === "." || part === "") &&
    !path.includes("\\") &&
    !/[\x00-\x1f\x7f]/.test(path)
  );
}

export function exportPath(path: string) {
  return safePath(path) && !excluded.test(path);
}

function sourceFiles(input: SnapshotFiles) {
  if (Object.keys(input).some((path) => !safePath(path)))
    throw new ExportError("SNAPSHOT");
  return Object.fromEntries(
    Object.entries(input).filter(([path]) => exportPath(path)),
  );
}

export async function validateSnapshot(input: SnapshotFiles) {
  const files = sourceFiles(input);
  const manifest = files["package.json"];
  const hasPage = Object.keys(files).some((path) =>
    /^(src\/)?app\/(page\.(tsx|jsx|ts|js)|\([^/]+\)\/page\.(tsx|jsx|ts|js))$/.test(
      path,
    ),
  );
  const hasLayout = Object.keys(files).some((path) =>
    /^(src\/)?app\/layout\.(tsx|jsx|ts|js)$/.test(path),
  );
  if (!manifest || !hasPage || !hasLayout) throw new ExportError("SNAPSHOT");
  try {
    const parsed = JSON.parse(manifest) as {
      scripts?: { dev?: string };
      dependencies?: Record<string, string>;
    };
    if (
      !parsed.scripts?.dev ||
      !parsed.dependencies?.next ||
      !parsed.dependencies?.react
    )
      throw new Error();
  } catch {
    throw new ExportError("SNAPSHOT");
  }
  if ((await scanFiles(files)).length > 0) throw new ExportError("SECRET");
  return files;
}

export async function prepareFiles(
  snapshot: SnapshotFiles,
  projectName: string,
) {
  const files = sourceFiles(snapshot);
  const instructions =
    "## Run locally\n\nRequires Node.js 24 and npm.\n\n```sh\nnpm install\nnpm run dev\n```\n\nOpen http://localhost:3000.\n";
  const readme = files["README.md"] ?? `# ${projectName}\n\nBuilt with Vibe.\n`;
  files["README.md"] =
    readme.includes("Requires Node.js 24 and npm.") &&
    readme.includes("npm install") &&
    readme.includes("npm run dev")
      ? readme
      : `${readme.trim()}\n\n${instructions}`;
  const ignore = [
    "node_modules/",
    ".next/",
    "out/",
    ".env*",
    ".agents/",
    ".claude/",
    "agent/skills/",
    "skills-lock.json",
    "*.tsbuildinfo",
    "next-env.d.ts",
  ];
  files[".gitignore"] =
    `${files[".gitignore"]?.trim() ?? ""}\n${ignore.join("\n")}\n`.trimStart();
  await validateSnapshot(files);
  if (Buffer.byteLength(JSON.stringify(files), "utf8") > 3_500_000)
    throw new ExportError("TOO_LARGE");
  return files;
}

export function blobContent(value: string) {
  const decoded = decodeSnapshotFile(value);
  return typeof decoded === "string"
    ? { content: decoded, encoding: "utf-8" as const }
    : {
        content: Buffer.from(decoded).toString("base64"),
        encoding: "base64" as const,
      };
}
