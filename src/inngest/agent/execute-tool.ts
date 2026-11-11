import { CommandExitError, type Sandbox } from "e2b";
import { packagesFromInstall, type TaskItem } from "@/lib/agent/parts";
import {
  APP_DIR,
  checkCommand,
  countLines,
  GuardError,
  resolveAppPath,
  truncateOutput,
} from "@/server/sandbox/guards";
import type { Publish } from "../publisher";
import {
  isAgentTool,
  readFilesInput,
  terminalInput,
  writeFilesInput,
} from "./tools";

export const MAX_FILES_PER_RUN = 80;
export const COMMAND_TIMEOUT_MS = 3 * 60_000;
const READ_LIMIT = 20_000;
const READ_TOTAL_LIMIT = 60_000;

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

export type ToolOutcome = {
  output: string;
  tasks: TaskItem[];
  writtenPaths: string[];
  terminal: TerminalRecord | null;
};

type ToolContext = {
  sandbox: Pick<Sandbox, "commands" | "files">;
  publish: Publish;
  writtenPaths: readonly string[];
};

function outcome(
  output: string,
  extra: Partial<ToolOutcome> = {},
): ToolOutcome {
  return { output, tasks: [], writtenPaths: [], terminal: null, ...extra };
}

async function runTerminal(call: ToolCall, ctx: ToolContext) {
  const parsed = terminalInput.safeParse(call.input);
  if (!parsed.success) return outcome(`Invalid input: ${parsed.error.message}`);
  const { command } = parsed.data;
  const blocked = checkCommand(command);
  if (blocked) {
    return outcome(blocked, {
      terminal: { command, output: blocked, exitCode: null },
    });
  }

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
      chunk,
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
    } else {
      stderr = error instanceof Error ? error.message : String(error);
    }
  }

  const output = truncateOutput(
    [stdout, stderr].filter((part) => part.trim()).join("\n") || "(no output)",
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
    tasks.push({ kind: "install", packages });
    await ctx.publish("task", { kind: "install", packages });
  }

  return outcome(`Exit code: ${exitCode ?? "unknown"}\n${output}`, {
    tasks,
    terminal: { command, output, exitCode },
  });
}

async function writeFiles(call: ToolCall, ctx: ToolContext) {
  const parsed = writeFilesInput.safeParse(call.input);
  if (!parsed.success) return outcome(`Invalid input: ${parsed.error.message}`);

  const known = new Set(ctx.writtenPaths);
  const results: string[] = [];
  const tasks: TaskItem[] = [];
  const writtenPaths: string[] = [];

  for (const file of parsed.data.files) {
    let target: ReturnType<typeof resolveAppPath>;
    try {
      target = resolveAppPath(file.path);
    } catch (error) {
      if (!(error instanceof GuardError)) throw error;
      results.push(`Skipped ${file.path}: ${error.message}`);
      continue;
    }
    if (!known.has(target.relative) && known.size >= MAX_FILES_PER_RUN) {
      results.push(
        `Skipped ${target.relative}: this run already changed ${MAX_FILES_PER_RUN} files.`,
      );
      continue;
    }

    const existed = await ctx.sandbox.files.exists(target.absolute);
    const verb = existed ? "edited" : "created";
    await ctx.publish("file", {
      phase: "started",
      path: target.relative,
      verb,
    });
    await ctx.sandbox.files.write(target.absolute, file.content);
    const lines = countLines(file.content);
    await ctx.publish("file", {
      phase: "written",
      path: target.relative,
      verb,
      lines,
    });
    const task: TaskItem = { kind: "file", verb, path: target.relative, lines };
    await ctx.publish("task", task);

    known.add(target.relative);
    tasks.push(task);
    writtenPaths.push(target.relative);
    results.push(`${existed ? "Updated" : "Created"} ${target.relative}`);
  }

  return outcome(results.join("\n"), { tasks, writtenPaths });
}

async function readFiles(call: ToolCall, ctx: ToolContext) {
  const parsed = readFilesInput.safeParse(call.input);
  if (!parsed.success) return outcome(`Invalid input: ${parsed.error.message}`);

  let budget = READ_TOTAL_LIMIT;
  const contents = await Promise.all(
    parsed.data.paths.map(async (path) => {
      try {
        const target = resolveAppPath(path);
        const content = await ctx.sandbox.files.read(target.absolute);
        const limit = Math.max(0, Math.min(READ_LIMIT, budget));
        budget -= Math.min(content.length, limit);
        if (limit === 0) {
          return {
            path: target.relative,
            error:
              "Not read: this call already returned 60,000 characters. Read it in a separate call.",
          };
        }
        return {
          path: target.relative,
          content: truncateOutput(content, limit),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { path, error: message };
      }
    }),
  );
  return outcome(JSON.stringify(contents));
}

export async function executeTool(call: ToolCall, ctx: ToolContext) {
  if (!isAgentTool(call.toolName)) {
    return outcome(`Unknown tool: ${call.toolName}`);
  }
  if (call.toolName === "terminal") return runTerminal(call, ctx);
  if (call.toolName === "createOrUpdateFiles") return writeFiles(call, ctx);
  return readFiles(call, ctx);
}
