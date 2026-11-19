import { CommandExitError, type Sandbox } from "e2b";
import {
  dedupeDiagnostics,
  type Diagnostic,
  eslintCommand,
  eslintFixCommand,
  missingPackages,
  parseEslintJson,
  parseRouteOutput,
  parseTscOutput,
  routeCommand,
  routeDiagnostic,
  tscCommand,
} from "@/server/sandbox/diagnostics";
import { isSandboxGone } from "@/server/sandbox/errors";
import { APP_DIR, PREVIEW_PORT } from "@/server/sandbox/guards";
import { routeOf } from "./repo-map";
import { sourceFixes } from "./fixes";

export const MAX_CHECKED_ROUTES = 8;
const SNAPSHOT_MAX_CHARS = 1_500_000;

type Box = Pick<Sandbox, "commands" | "files">;
type WrittenFile = { path: string; content: string };

export async function captureCommand(
  sandbox: Pick<Sandbox, "commands">,
  command: string,
  timeoutMs: number,
) {
  try {
    const result = await sandbox.commands.run(command, {
      cwd: APP_DIR,
      timeoutMs,
    });
    return `${result.stdout}\n${result.stderr}`;
  } catch (error) {
    if (error instanceof CommandExitError) {
      return `${error.stdout}\n${error.stderr}`;
    }
    if (isSandboxGone(error)) throw error;
    return "";
  }
}

export function staticRoutes(routes: string[]) {
  return [...new Set(routes)]
    .filter((route) => route.startsWith("/") && !route.includes("["))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, MAX_CHECKED_ROUTES);
}

export async function pageRoutes(sandbox: Pick<Sandbox, "commands">) {
  const listing = await captureCommand(
    sandbox,
    "find app -type f -name 'page.*' 2>/dev/null",
    30_000,
  );
  const routes = listing
    .split("\n")
    .map((line) => routeOf(line.trim().replace(/^\.\//, "")))
    .filter((route): route is string => route !== null);
  return staticRoutes(routes.length > 0 ? routes : ["/"]);
}

const SOURCE_LIST = `find app components lib hooks -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.css' -o -name '*.json' \\) -not -path 'components/ui/*' 2>/dev/null; ls package.json 2>/dev/null`;

export async function sourceSnapshot(box: Box, extra: string[] = []) {
  const listing = await captureCommand(box, SOURCE_LIST, 30_000);
  const paths = [
    ...new Set([
      ...listing
        .split("\n")
        .map((line) => line.trim().replace(/^\.\//, ""))
        .filter(Boolean),
      ...extra,
    ]),
  ].sort();
  const files: Record<string, string> = {};
  let total = 0;
  for (let index = 0; index < paths.length; index += 16) {
    const batch = paths.slice(index, index + 16);
    const contents = await Promise.all(
      batch.map((path) =>
        box.files.read(`${APP_DIR}/${path}`).catch(() => null),
      ),
    );
    for (const [offset, content] of contents.entries()) {
      if (content === null) continue;
      total += content.length;
      if (total > SNAPSHOT_MAX_CHARS) return files;
      files[batch[offset]] = content;
    }
  }
  return files;
}

export type ChecksResult = {
  diagnostics: Diagnostic[];
  fixed: WrittenFile[];
  routes: string[];
};

async function readAll(box: Box, paths: string[]) {
  const files = await Promise.all(
    paths.map(async (path) => ({
      path,
      content: await box.files.read(`${APP_DIR}/${path}`).catch(() => null),
    })),
  );
  return files.filter((file): file is WrittenFile => file.content !== null);
}

export async function runChecks(
  box: Box,
  {
    changed,
    routes,
    install,
  }: {
    changed: readonly string[];
    routes: string[];
    install?: (packages: string[]) => Promise<unknown>;
  },
): Promise<ChecksResult> {
  const sources = [...new Set(changed)].filter((path) =>
    /\.(tsx?|jsx?)$/.test(path),
  );
  const before = new Map(
    (await readAll(box, sources)).map((file) => [file.path, file.content]),
  );
  const present = [...before.keys()];
  if (present.length > 0) {
    await captureCommand(box, eslintFixCommand(present), 90_000);
  }
  const linted = await readAll(box, present);
  const repaired = new Map(
    sourceFixes(linted).map((file) => [file.path, file.content]),
  );
  for (const [path, content] of repaired) {
    await box.files.write(`${APP_DIR}/${path}`, content);
  }
  const fixed = linted
    .map((file) => ({
      path: file.path,
      content: repaired.get(file.path) ?? file.content,
    }))
    .filter((file) => before.get(file.path) !== file.content);

  const checked = staticRoutes(routes.length > 0 ? routes : ["/"]);
  const once = async () => {
    const [tsc, eslint, ...pages] = await Promise.all([
      captureCommand(box, tscCommand(), 180_000),
      present.length > 0
        ? captureCommand(box, eslintCommand(present), 90_000)
        : Promise.resolve(""),
      ...checked.map(async (route) => ({
        route,
        ...parseRouteOutput(
          await captureCommand(box, routeCommand(route, PREVIEW_PORT), 75_000),
        ),
      })),
    ]);
    return dedupeDiagnostics([
      ...parseTscOutput(tsc),
      ...parseEslintJson(eslint),
      ...(pages as { route: string; status: number; body: string }[]).flatMap(
        (page) => {
          const found = routeDiagnostic(page.route, page.status, page.body);
          return found ? [found] : [];
        },
      ),
    ]);
  };

  let diagnostics = await once();
  const packages = missingPackages(diagnostics);
  if (packages.length > 0 && install) {
    await install(packages);
    diagnostics = await once();
  }
  return { diagnostics, fixed, routes: checked };
}

export function checkLabel(diagnostics: Diagnostic[]) {
  return diagnostics.length === 0
    ? "Checked types, lint and pages: no problems"
    : `Checks found ${diagnostics.length} ${diagnostics.length === 1 ? "problem" : "problems"}`;
}
