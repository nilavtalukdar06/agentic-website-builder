import type { Diagnostic } from "@/server/sandbox/diagnostics";

export type Severity = { blockers: number; errors: number; browser: number };

const BLOCKING_MESSAGE =
  /^TS(2307|2305|2614|2724|1\d{3}):|Module not found|Cannot find module|Failed to compile|Build Error|SyntaxError/;

export function isBlocker(diagnostic: Diagnostic) {
  if (diagnostic.source === "route") return true;
  if (diagnostic.source === "browser") return false;
  return BLOCKING_MESSAGE.test(diagnostic.message);
}

export function severityOf(diagnostics: Diagnostic[]): Severity {
  let blockers = 0;
  let errors = 0;
  let browser = 0;
  for (const diagnostic of diagnostics) {
    if (isBlocker(diagnostic)) blockers += 1;
    else if (diagnostic.source === "browser") browser += 1;
    else errors += 1;
  }
  return { blockers, errors, browser };
}

export function compareSeverity(a: Severity, b: Severity) {
  return (
    a.blockers - b.blockers || a.errors - b.errors || a.browser - b.browser
  );
}

export function routesLoad(diagnostics: Diagnostic[]) {
  return !diagnostics.some((diagnostic) => diagnostic.source === "route");
}

export function restorePlan({
  snapshot,
  current,
  versionFiles,
}: {
  snapshot: Record<string, string>;
  current: Record<string, string>;
  versionFiles: string[];
}) {
  const restore: { path: string; content: string }[] = [];
  const remove: string[] = [];
  let restorable = true;
  for (const [path, content] of Object.entries(current)) {
    const before = snapshot[path];
    if (before !== undefined) {
      if (before !== content) restore.push({ path, content: before });
    } else if (!versionFiles.includes(path)) {
      remove.push(path);
    } else {
      restorable = false;
    }
  }
  return { restore, remove, restorable };
}

const INTERACTION_SPLIT = " didn't work as expected";

export function problemKey(diagnostic: Diagnostic) {
  if (diagnostic.source === "browser") {
    const at = diagnostic.message.indexOf(INTERACTION_SPLIT);
    return `browser|${at === -1 ? diagnostic.message : diagnostic.message.slice(0, at)}`;
  }
  return `${diagnostic.source}|${diagnostic.path}|${diagnostic.line}|${diagnostic.message}`;
}

export function sameProblems(a: Diagnostic[], b: Diagnostic[]) {
  const left = new Set(a.map(problemKey));
  const right = new Set(b.map(problemKey));
  return left.size === right.size && [...left].every((key) => right.has(key));
}

export function onlyBrowser(diagnostics: Diagnostic[]) {
  return (
    diagnostics.length > 0 &&
    diagnostics.every((diagnostic) => diagnostic.source === "browser")
  );
}
