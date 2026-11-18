import { CommandExitError, type Sandbox } from "e2b";
import {
  deletedPaths,
  packagesFromInstall,
  type TaskItem,
} from "@/lib/agent/parts";
import { isSandboxGone } from "@/server/sandbox/errors";
import {
  APP_DIR,
  checkCommand,
  countFilesCommand,
  countLines,
  destructiveAction,
  GuardError,
  removalTargets,
  resolveAppPath,
  truncateOutput,
} from "@/server/sandbox/guards";
import type { Publish } from "../publisher";
import {
  MAX_INSTALLS_PER_RUN,
  npqClean,
  npqCommand,
  parseNpqReport,
  planInstall,
  summarizeNpq,
  unknownDependencies,
} from "./guardrails/packages";
import { patternRedactor, type Redactor } from "./guardrails/redact";
import { detectSecrets } from "./guardrails/secret-patterns";
import { codeTripwire } from "./guardrails/tripwire";
import { wrapUntrusted } from "./guardrails/untrusted";
import { applyEdits } from "./edits";
import { matchesGlob, shellQuote } from "./glob";
import {
  editFileInput,
  isAgentTool,
  listFilesInput,
  readFilesInput,
  searchCodeInput,
  terminalInput,
  writeFilesInput,
} from "./tools";

export const MAX_FILES_PER_RUN = 80;
export const COMMAND_TIMEOUT_MS = 3 * 60_000;
const READ_LIMIT = 20_000;
const READ_TOTAL_LIMIT = 60_000;
const LIST_LIMIT = 400;
const SEARCH_LIMIT = 12_000;
export const IGNORED_DIRS = [
  "node_modules",
  ".next",
  ".git",
  ".agents",
  ".claude",
  ".vibe",
];

export type ToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type TerminalRecord = {
  command: string;
  output: string;
  exitCode: number | null;
};

export const MAX_FILES_PER_REMOVAL = 10;

export type RunProgress = {
  installs?: number;
};

export type GuardHit = {
  stage: "tool";
  verdict: "block";
  categories: string[];
  text: string;
};

export const emptyProgress: RunProgress = {};

export type WrittenFile = { path: string; content: string };

export type ToolOutcome = {
  output: string;
  tasks: TaskItem[];
  writtenPaths: string[];
  terminal: TerminalRecord | null;
  progress: RunProgress;
  guard?: GuardHit | null;
  edited?: WrittenFile[];
};

export type ToolContext = {
  sandbox: Pick<Sandbox, "commands" | "files">;
  publish: Publish;
  writtenPaths: readonly string[];
  tools: readonly string[];
  progress: RunProgress;
  redactor?: Redactor;
  restricted?: boolean;
};

function outcome(
  ctx: ToolContext,
  output: string,
  extra: Partial<ToolOutcome> = {},
): ToolOutcome {
  return {
    output,
    tasks: [],
    writtenPaths: [],
    terminal: null,
    progress: ctx.progress,
    ...extra,
  };
}

function blockedOutcome(ctx: ToolContext, command: string, message: string) {
  return outcome(ctx, message, {
    terminal: { command, output: message, exitCode: null },
  });
}

async function vetPackages(ctx: ToolContext, names: string[]) {
  const result = await ctx.sandbox.commands
    .run(npqCommand(names), {
      cwd: APP_DIR,
      timeoutMs: 120_000,
      envs: { MARSHALL_DISABLE_SNYK: "1", NPQ_DISABLE_AUTO_CONTINUE: "true" },
    })
    .then((res) => res.stdout)
    .catch((error: unknown) =>
      error instanceof CommandExitError ? error.stdout : "",
    );
  return parseNpqReport(result);
}

async function preflight(
  command: string,
  ctx: ToolContext,
): Promise<{ command: string; installs: number } | ToolOutcome> {
  const destructive = destructiveAction(command);
  if (destructive) {
    return blockedOutcome(
      ctx,
      command,
      `Command blocked: it would ${destructive.charAt(0).toLowerCase()}${destructive.slice(1)} That isn't allowed in a Vibe project.`,
    );
  }

  const targets = removalTargets(command);
  if (targets) {
    const counted = await ctx.sandbox.commands
      .run(countFilesCommand(targets), { cwd: APP_DIR, timeoutMs: 30_000 })
      .then((res) => Number.parseInt(res.stdout.trim(), 10))
      .catch(() => 0);
    if (counted > MAX_FILES_PER_REMOVAL) {
      return blockedOutcome(
        ctx,
        command,
        `Command blocked: it removes ${counted} files (${targets.join(", ")}), and at most ${MAX_FILES_PER_REMOVAL} can be removed at once. Remove only the files you mean to.`,
      );
    }
  }

  const plan = planInstall(command);
  if (plan.action === "none") return { command, installs: 0 };
  if (plan.action === "refuse") {
    return blockedOutcome(ctx, command, `Command blocked: ${plan.reason}.`);
  }
  const used = ctx.progress.installs ?? 0;
  if (used + plan.installs > MAX_INSTALLS_PER_RUN) {
    return blockedOutcome(
      ctx,
      command,
      `Command blocked: this request already installed ${used} packages and the limit is ${MAX_INSTALLS_PER_RUN}. Use what is installed.`,
    );
  }
  let unknown = plan.unknown;
  if (plan.bare) {
    const manifest = await ctx.sandbox.files
      .read(`${APP_DIR}/package.json`)
      .catch(() => "{}");
    const deps = unknownDependencies(manifest);
    if (deps.refused) {
      return blockedOutcome(
        ctx,
        command,
        `Command blocked: package.json has a dependency that isn't from the npm registry (${deps.refused}). Use a registry package instead.`,
      );
    }
    unknown = [...new Set([...unknown, ...deps.unknown])].sort();
  }
  if (unknown.length > 0) {
    if (ctx.restricted) {
      return blockedOutcome(
        ctx,
        command,
        `Command blocked: ${unknown.join(", ")} ${unknown.length === 1 ? "isn't" : "aren't"} on the vetted package list, and only vetted packages can be installed for this request. Build it with what is installed.`,
      );
    }
    const report = await vetPackages(ctx, unknown);
    if (!npqClean(report)) {
      return blockedOutcome(
        ctx,
        command,
        `Command blocked: the package check didn't pass, so nothing was installed. Pick another package or build it without one.\n${summarizeNpq(unknown, report)}`,
      );
    }
  }
  return {
    command:
      unknown.length > 0 && !/--ignore-scripts\b/.test(plan.command)
        ? plan.command.replace(
            /((?:npm|pnpm|yarn|bun)\s+(?:install|i|add|ci)\b[^;&|]*)/,
            "$1 --ignore-scripts",
          )
        : plan.command,
    installs: plan.installs,
  };
}

async function runTerminal(call: ToolCall, ctx: ToolContext) {
  const parsed = terminalInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }
  const requested = parsed.data.command;
  const blocked = checkCommand(requested);
  if (blocked) {
    return outcome(ctx, blocked, {
      terminal: { command: requested, output: blocked, exitCode: null },
    });
  }
  const checked = await preflight(requested, ctx);
  if ("output" in checked) return checked;
  const { command } = checked;
  const redactor = ctx.redactor ?? patternRedactor;

  await ctx.publish("tool", {
    phase: "call",
    callId: call.toolCallId,
    name: "terminal",
    command,
  });
  const stream = (chunk: string) =>
    ctx.publish("tool", {
      phase: "output",
      callId: call.toolCallId,
      name: "terminal",
      chunk: redactor.redact(chunk),
    });

  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  try {
    const result = await ctx.sandbox.commands.run(command, {
      cwd: APP_DIR,
      timeoutMs: COMMAND_TIMEOUT_MS,
      onStdout: stream,
      onStderr: stream,
    });
    stdout = result.stdout;
    stderr = result.stderr;
    exitCode = result.exitCode;
  } catch (error) {
    if (error instanceof CommandExitError) {
      stdout = error.stdout;
      stderr = error.stderr;
      exitCode = error.exitCode;
    } else if (isSandboxGone(error)) {
      throw error;
    } else {
      stderr = error instanceof Error ? error.message : String(error);
    }
  }

  const output = truncateOutput(
    redactor.redact(
      [stdout, stderr].filter((part) => part.trim()).join("\n") ||
        "(no output)",
    ),
  );
  await ctx.publish("tool", {
    phase: "result",
    callId: call.toolCallId,
    name: "terminal",
    exitCode,
  });

  const tasks: TaskItem[] = [];
  const packages = exitCode === 0 ? packagesFromInstall(command) : null;
  if (packages) {
    const task: TaskItem = { kind: "install", packages };
    tasks.push(task);
    await ctx.publish("task", task);
  }
  if (exitCode === 0) {
    for (const path of deletedPaths(command)) {
      const task: TaskItem = { kind: "file", verb: "deleted", path, lines: 0 };
      tasks.push(task);
      await ctx.publish("task", task);
    }
  }

  return outcome(
    ctx,
    `Exit code: ${exitCode ?? "unknown"}\n${wrapUntrusted("terminal", output)}`,
    {
      tasks,
      terminal: { command, output, exitCode },
      progress:
        checked.installs > 0
          ? {
              ...ctx.progress,
              installs: (ctx.progress.installs ?? 0) + checked.installs,
            }
          : ctx.progress,
    },
  );
}

async function writeContentCheck(path: string, content: string) {
  const found = await detectSecrets(content);
  if (found.length > 0) {
    return {
      message: `Skipped ${path}: it contains what looks like a secret (${found[0].ruleId}). Never write keys, passwords or tokens into files; read them with process.env.NAME and tell the user in your summary which variables to set.`,
      guard: null,
    };
  }
  const tripped = codeTripwire(content);
  if (tripped) {
    return {
      message: `Skipped ${path}: ${tripped}. That is not allowed in a Vibe project.`,
      guard: {
        stage: "tool" as const,
        verdict: "block" as const,
        categories: ["malware"],
        text: content,
      },
    };
  }
  return null;
}

type WriteResult =
  | {
      status: "written";
      path: string;
      verb: "created" | "edited";
      lines: number;
    }
  | { status: "skipped"; message: string; guard: GuardHit | null };

async function writeOne(
  ctx: ToolContext,
  known: Set<string>,
  path: string,
  content: string,
): Promise<WriteResult> {
  let target: ReturnType<typeof resolveAppPath>;
  try {
    target = resolveAppPath(path);
  } catch (error) {
    if (!(error instanceof GuardError)) throw error;
    return {
      status: "skipped",
      message: `Skipped ${path}: ${error.message}`,
      guard: null,
    };
  }
  if (!known.has(target.relative) && known.size >= MAX_FILES_PER_RUN) {
    return {
      status: "skipped",
      message: `Skipped ${target.relative}: this run already changed ${MAX_FILES_PER_RUN} files.`,
      guard: null,
    };
  }
  const rejected = await writeContentCheck(target.relative, content);
  if (rejected) {
    return {
      status: "skipped",
      message: rejected.message,
      guard: rejected.guard,
    };
  }

  const existed = await ctx.sandbox.files.exists(target.absolute);
  const verb = existed ? "edited" : "created";
  await ctx.publish("file", { phase: "started", path: target.relative, verb });
  await ctx.sandbox.files.write(target.absolute, content);
  const lines = countLines(content);
  await ctx.publish("file", {
    phase: "written",
    path: target.relative,
    verb,
    lines,
  });
  known.add(target.relative);
  return { status: "written", path: target.relative, verb, lines };
}

async function fileTask(
  ctx: ToolContext,
  written: Extract<WriteResult, { status: "written" }>,
) {
  const task: TaskItem = {
    kind: "file",
    verb: written.verb,
    path: written.path,
    lines: written.lines,
  };
  await ctx.publish("task", task);
  return task;
}

async function writeFiles(call: ToolCall, ctx: ToolContext) {
  const parsed = writeFilesInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }

  const known = new Set(ctx.writtenPaths);
  let guard: GuardHit | null = null;
  const results: string[] = [];
  const tasks: TaskItem[] = [];
  const writtenPaths: string[] = [];

  for (const file of parsed.data.files) {
    const result = await writeOne(ctx, known, file.path, file.content);
    if (result.status === "skipped") {
      results.push(result.message);
      guard ??= result.guard;
      continue;
    }
    tasks.push(await fileTask(ctx, result));
    writtenPaths.push(result.path);
    results.push(
      `${result.verb === "edited" ? "Updated" : "Created"} ${result.path}`,
    );
  }

  return outcome(ctx, results.join("\n"), { tasks, writtenPaths, guard });
}

async function editFile(call: ToolCall, ctx: ToolContext) {
  const parsed = editFileInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }
  let target: ReturnType<typeof resolveAppPath>;
  try {
    target = resolveAppPath(parsed.data.path);
  } catch (error) {
    if (!(error instanceof GuardError)) throw error;
    return outcome(ctx, `Not edited: ${error.message}`);
  }
  const current = await ctx.sandbox.files
    .read(target.absolute)
    .catch(() => null);
  if (current === null) {
    return outcome(
      ctx,
      `Not edited: ${target.relative} doesn't exist. Create it with createOrUpdateFiles.`,
    );
  }
  const applied = applyEdits(current, parsed.data.edits);
  if (!applied.ok) {
    return outcome(
      ctx,
      `Not edited ${target.relative}:\n${wrapUntrusted("files", (ctx.redactor ?? patternRedactor).redact(applied.error))}`,
    );
  }
  if (applied.content === current) {
    return outcome(
      ctx,
      `${target.relative} is unchanged: the replacements equal the search text.`,
    );
  }
  const known = new Set(ctx.writtenPaths);
  const result = await writeOne(ctx, known, target.relative, applied.content);
  if (result.status === "skipped") {
    return outcome(ctx, result.message, { guard: result.guard });
  }
  const task = await fileTask(ctx, result);
  return outcome(
    ctx,
    `Edited ${result.path} (${applied.replacements} ${applied.replacements === 1 ? "change" : "changes"}, now ${result.lines} lines).`,
    {
      tasks: [task],
      writtenPaths: [result.path],
      edited: [{ path: result.path, content: applied.content }],
    },
  );
}

function sliceLines(content: string, start?: number, end?: number) {
  if (start === undefined && end === undefined)
    return { text: content, note: "" };
  const lines = content.split("\n");
  const from = Math.max(1, start ?? 1);
  const to = Math.min(lines.length, end ?? lines.length);
  if (from > to) {
    return { text: "", note: `(file has ${lines.length} lines)` };
  }
  return {
    text: lines.slice(from - 1, to).join("\n"),
    note: `(lines ${from}-${to} of ${lines.length})`,
  };
}

async function readFiles(call: ToolCall, ctx: ToolContext) {
  const parsed = readFilesInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }

  let budget = READ_TOTAL_LIMIT;
  const contents = await Promise.all(
    parsed.data.files.map(async ({ path, startLine, endLine }) => {
      try {
        const target = resolveAppPath(path, "read");
        const raw = await ctx.sandbox.files.read(target.absolute);
        const { text, note } = sliceLines(raw, startLine, endLine);
        const limit = Math.max(0, Math.min(READ_LIMIT, budget));
        budget -= Math.min(text.length, limit);
        if (limit === 0) {
          return {
            path: target.relative,
            error:
              "Not read: this call already returned 60,000 characters. Read it in a separate call, or read a line range.",
          };
        }
        return {
          path: target.relative,
          ...(note ? { range: note } : {}),
          content: truncateOutput(
            (ctx.redactor ?? patternRedactor).redact(text),
            limit,
          ),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { path, error: message };
      }
    }),
  );
  const read = contents.flatMap((entry) =>
    "content" in entry ? [entry.path] : [],
  );
  const tasks: TaskItem[] = [];
  if (read.length > 0) {
    const task: TaskItem = { kind: "read", paths: read };
    tasks.push(task);
    await ctx.publish("task", task);
  }
  return outcome(ctx, wrapUntrusted("files", JSON.stringify(contents)), {
    tasks,
  });
}

const prunedFind = `find . \\( ${IGNORED_DIRS.map((dir) => `-name ${dir}`).join(" -o ")} \\) -prune -o -type f -print`;

async function listFiles(call: ToolCall, ctx: ToolContext) {
  const parsed = listFilesInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }
  const listing = await ctx.sandbox.commands
    .run(prunedFind, { cwd: APP_DIR, timeoutMs: 30_000 })
    .then((result) => result.stdout)
    .catch(() => "");
  const pattern = parsed.data.pattern ?? "";
  const paths = listing
    .split("\n")
    .map((line) => line.trim().replace(/^\.\//, ""))
    .filter((path) => path && !/(^|\/)\.env(\.|$)/.test(path))
    .filter((path) => matchesGlob(path, pattern))
    .sort();
  const shown = paths.slice(0, LIST_LIMIT);
  const more =
    paths.length > shown.length
      ? `\n… ${paths.length - shown.length} more files; narrow the pattern.`
      : "";
  return outcome(
    ctx,
    wrapUntrusted(
      "files",
      shown.length > 0
        ? `${shown.join("\n")}${more}`
        : `No files match ${pattern || "the project"}.`,
    ),
  );
}

async function searchCode(call: ToolCall, ctx: ToolContext) {
  const parsed = searchCodeInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }
  let scope = ".";
  if (parsed.data.path?.trim()) {
    try {
      scope = resolveAppPath(parsed.data.path, "read").relative;
    } catch (error) {
      if (!(error instanceof GuardError)) throw error;
      return outcome(ctx, `Not searched: ${error.message}`);
    }
  }
  const excludes = IGNORED_DIRS.map((dir) => `--exclude-dir=${dir}`).join(" ");
  const command = `grep -rnIE ${excludes} --exclude='.env*' -m 20 -e ${shellQuote(parsed.data.pattern)} -- ${shellQuote(scope)}`;
  let output = "";
  try {
    const result = await ctx.sandbox.commands.run(command, {
      cwd: APP_DIR,
      timeoutMs: 30_000,
    });
    output = result.stdout;
  } catch (error) {
    if (error instanceof CommandExitError) {
      output = error.exitCode === 1 ? "" : error.stderr || error.stdout;
    } else if (isSandboxGone(error)) {
      throw error;
    } else {
      output = error instanceof Error ? error.message : String(error);
    }
  }
  const cleaned = output
    .split("\n")
    .map((line) => line.replace(/^\.\//, ""))
    .join("\n")
    .trim();
  return outcome(
    ctx,
    wrapUntrusted(
      "search",
      truncateOutput(
        (ctx.redactor ?? patternRedactor).redact(cleaned || "No matches."),
        SEARCH_LIMIT,
      ),
    ),
  );
}

export async function executeTool(
  call: ToolCall,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  if (!isAgentTool(call.toolName) || !ctx.tools.includes(call.toolName)) {
    return outcome(ctx, `Unknown tool: ${call.toolName}`);
  }
  switch (call.toolName) {
    case "terminal":
      return runTerminal(call, ctx);
    case "createOrUpdateFiles":
      return writeFiles(call, ctx);
    case "editFile":
      return editFile(call, ctx);
    case "listFiles":
      return listFiles(call, ctx);
    case "searchCode":
      return searchCode(call, ctx);
    case "readFiles":
      return readFiles(call, ctx);
  }
}
