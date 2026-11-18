import { posix } from "node:path";
import { APP_DIR } from "./guards";

export const MAX_DIAGNOSTICS = 30;
const MESSAGE_CHARS = 400;

export const SERIOUS_LINT_RULES = new Set([
  "react-hooks/rules-of-hooks",
  "react/jsx-key",
  "react/jsx-no-undef",
  "react/no-children-prop",
  "@next/next/no-assign-module-variable",
  "@next/next/no-html-link-for-pages",
  "no-undef",
]);

export type Diagnostic = {
  source: "tsc" | "eslint" | "route" | "browser";
  path: string | null;
  line: number | null;
  message: string;
};

function relativePath(path: string) {
  const clean = path.trim();
  if (clean.startsWith(`${APP_DIR}/`)) return posix.relative(APP_DIR, clean);
  return clean.replace(/^\.\/+/, "");
}

function clip(message: string) {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > MESSAGE_CHARS
    ? `${flat.slice(0, MESSAGE_CHARS - 1)}…`
    : flat;
}

const TSC_LINE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;

export function parseTscOutput(output: string): Diagnostic[] {
  const found: Diagnostic[] = [];
  const lines = output.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const match = TSC_LINE.exec(lines[index].trimEnd());
    if (!match) continue;
    let message = `${match[4]}: ${match[5]}`;
    while (index + 1 < lines.length && /^\s{2,}\S/.test(lines[index + 1])) {
      message += ` ${lines[++index].trim()}`;
    }
    const path = relativePath(match[1]);
    if (path.startsWith("node_modules/") || path.startsWith(".next/")) continue;
    found.push({
      source: "tsc",
      path,
      line: Number(match[2]),
      message: clip(message),
    });
  }
  return found;
}

type EslintFile = {
  filePath?: string;
  messages?: {
    ruleId?: string | null;
    severity?: number;
    message?: string;
    line?: number;
  }[];
};

export function parseEslintJson(output: string): Diagnostic[] {
  const start = output.indexOf("[");
  if (start === -1) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.slice(start));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return (parsed as EslintFile[]).flatMap((file) =>
    (file.messages ?? [])
      .filter(
        (message) =>
          message.severity === 2 &&
          message.message &&
          (!message.ruleId || SERIOUS_LINT_RULES.has(message.ruleId)),
      )
      .map((message) => ({
        source: "eslint" as const,
        path: file.filePath ? relativePath(file.filePath) : null,
        line: message.line ?? null,
        message: clip(
          message.ruleId
            ? `${message.message} (${message.ruleId})`
            : String(message.message),
        ),
      })),
  );
}

const ERROR_SNIPPET =
  /(Build Error|Failed to compile|Module not found[^<"]*|Unhandled Runtime Error|(?:Type|Reference|Syntax)Error:[^<"\\]*|Error:[^<"\\]{8,}|You're importing a component that needs[^<"\\]*|Event handlers cannot be passed[^<"\\]*)/;

function textOf(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function routeDiagnostic(
  route: string,
  status: number,
  body: string,
): Diagnostic | null {
  if (status >= 200 && status < 400) return null;
  const snippet =
    ERROR_SNIPPET.exec(body)?.[0] ?? textOf(body).trim().slice(0, 300);
  return {
    source: "route",
    path: null,
    line: null,
    message: clip(
      status === 0
        ? `GET ${route} didn't answer within the time limit.`
        : `GET ${route} returned ${status}${snippet ? `: ${snippet}` : ""}`,
    ),
  };
}

export function dedupeDiagnostics(
  diagnostics: Diagnostic[],
  max = MAX_DIAGNOSTICS,
) {
  const seen = new Set<string>();
  const unique: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.source}|${diagnostic.path}|${diagnostic.line}|${diagnostic.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(diagnostic);
  }
  return unique.slice(0, max);
}

export function formatDiagnostics(diagnostics: Diagnostic[]) {
  return diagnostics
    .map((diagnostic) => {
      const where = diagnostic.path
        ? `${diagnostic.path}${diagnostic.line ? `:${diagnostic.line}` : ""}`
        : "page";
      return `- [${diagnostic.source}] ${where}: ${diagnostic.message}`;
    })
    .join("\n");
}

export function diagnosticPaths(diagnostics: Diagnostic[]) {
  return [
    ...new Set(
      diagnostics.flatMap((diagnostic) =>
        diagnostic.path ? [diagnostic.path] : [],
      ),
    ),
  ];
}

const MISSING_MODULE =
  /TS2307: Cannot find module '([^']+)'|Module not found: Can't resolve '([^']+)'/;

export function missingPackages(diagnostics: Diagnostic[]) {
  const names = new Set<string>();
  for (const diagnostic of diagnostics) {
    const match = MISSING_MODULE.exec(diagnostic.message);
    const specifier = match?.[1] ?? match?.[2];
    if (!specifier || /^(\.|@\/|~\/|\/)/.test(specifier)) continue;
    const parts = specifier.split("/");
    names.add(
      specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0],
    );
  }
  return [...names];
}

export function tscCommand() {
  return "./node_modules/.bin/tsc --noEmit --pretty false --incremental --tsBuildInfoFile /tmp/vibe-tsc.tsbuildinfo";
}

export function eslintCommand(paths: string[]) {
  const quoted = paths.map((path) => `'${path.replace(/'/g, `'\\''`)}'`);
  return `./node_modules/.bin/eslint --format json ${quoted.join(" ")}`;
}

export function eslintFixCommand(paths: string[]) {
  const quoted = paths.map((path) => `'${path.replace(/'/g, `'\\''`)}'`);
  return `./node_modules/.bin/eslint --fix ${quoted.join(" ")}`;
}

export function routeCommand(route: string, port: number) {
  const safe = route.replace(/[^\w\-/.]/g, "");
  return `code=$(curl -s -o /tmp/vibe-route.html -w '%{http_code}' --max-time 60 'http://localhost:${port}${safe}'); echo "$code"; head -c 60000 /tmp/vibe-route.html`;
}

export function parseRouteOutput(output: string) {
  const newline = output.indexOf("\n");
  const head = newline === -1 ? output : output.slice(0, newline);
  const status = Number.parseInt(head.trim(), 10);
  return {
    status: Number.isFinite(status) ? status : 0,
    body: newline === -1 ? "" : output.slice(newline + 1),
  };
}
