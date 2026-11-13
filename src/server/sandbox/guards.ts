import { posix } from "node:path";

export const APP_DIR = "/home/user/app";

const blockedSegments = new Set(["node_modules", ".next", ".git"]);
const readOnlySegments = new Set([".agents", ".claude"]);
const readOnlyFiles = new Set(["skills-lock.json"]);

export type PathMode = "read" | "write";

export class GuardError extends Error {}

export function resolveAppPath(input: string, mode: PathMode = "write") {
  const trimmed = input.trim().replace(/^\.\/+/, "");
  if (!trimmed) throw new GuardError("Path is empty.");
  const absolute = trimmed.startsWith("/")
    ? posix.normalize(trimmed)
    : posix.join(APP_DIR, trimmed);
  if (absolute !== APP_DIR && !absolute.startsWith(`${APP_DIR}/`)) {
    throw new GuardError(`Path must stay inside the project: ${input}`);
  }
  const relative = posix.relative(APP_DIR, absolute);
  if (!relative) throw new GuardError("Path must point to a file.");
  const segments = relative.split("/");
  if (segments.some((segment) => blockedSegments.has(segment))) {
    throw new GuardError(`Path is not writable: ${relative}`);
  }
  if (segments.some((segment) => /^\.env(\.|$)/.test(segment))) {
    throw new GuardError("Environment files are not allowed.");
  }
  if (
    mode === "write" &&
    (readOnlySegments.has(segments[0]) ||
      (segments[0] === "agent" && segments[1] === "skills") ||
      readOnlyFiles.has(relative))
  ) {
    throw new GuardError(`Path is read-only (installed skills): ${relative}`);
  }
  return { absolute, relative };
}

const blockedCommands: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bsudo\b/, reason: "sudo is not available" },
  {
    pattern:
      /\b(next\s+(dev|start|build)|(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|build))\b/,
    reason:
      "the dev server is already running on port 3000 and reloads on save; don't start, stop or build it",
  },
  {
    pattern: /\b(kill|pkill|killall|reboot|shutdown)\b/,
    reason: "process control is not allowed",
  },
  {
    pattern: /\brm\s+-[a-z]*r[a-z]*\s+(\/|~|\*|\.\s*$|\.\/?\s*$)/,
    reason: "recursive deletes of the project or system are not allowed",
  },
  {
    pattern: /\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/,
    reason: "piping downloads into a shell is not allowed",
  },
  {
    pattern: /(^|\s)\.env(\.|\s|$)/,
    reason: "environment files are off limits",
  },
  {
    pattern:
      /(^|[;&|(]\s*)(printenv|env|set|export\s+-p|declare\s+-[a-z]*x[a-z]*|compgen\s+-e)\s*($|[;&|)>])|\/proc\/[^\s]*\/environ|\bnode\b[^;&|]*\s(-e|-p|--eval|--print)\b[^;&|]*\bprocess\.env\b(?!\.)/,
    reason:
      "listing environment variables is not allowed; read one named variable in code with process.env.NAME",
  },
  {
    pattern:
      /(\b(rm|mv|cp|tee|touch|chmod|ln|truncate)\b|\bsed\s+-i|>)[^;&|]*(\.agents|\.claude|(?<![\w-]\/|[\w-])agent\/skills(?![\w-])|skills-lock\.json)\b|\bskills\s+(add|remove|update|init)\b/,
    reason:
      "the installed skills in .agents/, .claude/ and agent/skills/ are read-only; read them, don't change them",
  },
];

export function checkCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed) return "Command is empty.";
  if (trimmed.length > 2000) return "Command is too long.";
  const blocked = blockedCommands.find(({ pattern }) => pattern.test(trimmed));
  return blocked ? `Command blocked: ${blocked.reason}.` : null;
}

const destructivePatterns: { pattern: RegExp; summary: string }[] = [
  {
    pattern: /\bprisma\s+migrate\s+reset\b/,
    summary: "Reset the database: every table and row is deleted.",
  },
  {
    pattern: /\bdb\s+push\b[^;&|]*--force-reset\b/,
    summary:
      "Force-reset the database before pushing the schema: all data is deleted.",
  },
  {
    pattern: /--accept-data-loss\b/,
    summary:
      "Apply a schema change that drops columns or tables with their data.",
  },
  {
    pattern: /\b(DROP\s+(TABLE|DATABASE|SCHEMA|COLUMN)|TRUNCATE)\b/i,
    summary: "Run SQL that drops or empties tables.",
  },
  {
    pattern: /\bDELETE\s+FROM\s+[\w."]+\s*(;|$|["'`)])/i,
    summary:
      "Run a DELETE without a WHERE clause: every row in the table is deleted.",
  },
];

export function destructiveAction(command: string) {
  return (
    destructivePatterns.find(({ pattern }) => pattern.test(command))?.summary ??
    null
  );
}

export function removalTargets(command: string) {
  const match = /(?:^|[;&|]\s*)rm\s+((?:-[a-zA-Z]+\s+)*)(.+?)(?=$|[;&|])/.exec(
    command.trim(),
  );
  if (!match) return null;
  const targets = match[2]
    .split(/\s+/)
    .filter((token) => token && !token.startsWith("-"));
  return targets.length > 0 ? targets : null;
}

export function countFilesCommand(targets: readonly string[]) {
  const quoted = targets
    .map((target) => `'${target.replace(/'/g, `'\\''`)}'`)
    .join(" ");
  return `find ${quoted} -type f 2>/dev/null | wc -l`;
}

export function countLines(content: string) {
  if (!content) return 0;
  return content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
}

export function truncateOutput(text: string, max = 8000) {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n… ${text.length - max} characters cut …\n${text.slice(-half)}`;
}
