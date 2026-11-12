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
    (readOnlySegments.has(segments[0]) || readOnlyFiles.has(relative))
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
      /(\b(rm|mv|cp|tee|touch|chmod|ln|truncate)\b|\bsed\s+-i|>)[^;&|]*(\.agents|\.claude|skills-lock\.json)\b|\bskills\s+(add|remove|update|init)\b/,
    reason:
      "the installed skills in .agents/ and .claude/ are read-only; read them, don't change them",
  },
];

export function checkCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed) return "Command is empty.";
  if (trimmed.length > 2000) return "Command is too long.";
  const blocked = blockedCommands.find(({ pattern }) => pattern.test(trimmed));
  return blocked ? `Command blocked: ${blocked.reason}.` : null;
}

const reviewerCommands = [
  /^npx\s+(--no-install\s+)?tsc(\s+(--noEmit|-p\s+\S+|--pretty(\s+false)?))*$/,
  /^npx\s+(--no-install\s+)?eslint(\s+[\w./@*-]+)*$/,
  /^npm\s+run\s+lint$/,
  /^curl\s+(-[a-zA-Z]+\s+)*(--max-time\s+\d+\s+)?["']?(http:\/\/)?localhost:3000[\w./?=&%-]*["']?(\s*\|\s*head(\s+-[cn]\s*\d+)?)?$/,
  /^(ls|cat|head|tail|wc|grep|find)\b[^><;&|`$]*(\|\s*(head|tail|wc|grep|sort)\b[^><;&|`$]*)*$/,
];

export function checkReviewerCommand(command: string) {
  const blocked = checkCommand(command);
  if (blocked) return blocked;
  const trimmed = command.trim();
  if (/\bfind\b.*\s-(exec|delete|fprint)/.test(trimmed)) {
    return "Command blocked: the reviewer can only run read-only commands.";
  }
  return reviewerCommands.some((pattern) => pattern.test(trimmed))
    ? null
    : "Command blocked: the reviewer can only run read-only checks (npx tsc --noEmit, npx eslint, npm run lint, curl localhost:3000, ls, cat, grep, head, find).";
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
