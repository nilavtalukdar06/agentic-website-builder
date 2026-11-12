import { CommandExitError, type Sandbox } from "e2b";
import {
  type AgentName,
  packagesFromInstall,
  type TaskItem,
} from "@/lib/agent/parts";
import {
  APP_DIR,
  checkCommand,
  checkReviewerCommand,
  countLines,
  GuardError,
  resolveAppPath,
  truncateOutput,
} from "@/server/sandbox/guards";
import type { Publish } from "../publisher";
import { MAX_SKILL_CHARS, parseSkill, SKILLS_DIR } from "./skills";
import {
  isAgentTool,
  loadSkillInput,
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

export type SkillProgress = { readAgentsMd: boolean; loadedSkills: string[] };

export const emptyProgress: SkillProgress = {
  readAgentsMd: false,
  loadedSkills: [],
};

export type ToolOutcome = {
  output: string;
  tasks: TaskItem[];
  writtenPaths: string[];
  terminal: TerminalRecord | null;
  progress: SkillProgress;
};

export type ToolContext = {
  sandbox: Pick<Sandbox, "commands" | "files">;
  publish: Publish;
  writtenPaths: readonly string[];
  agent: AgentName;
  tools: readonly string[];
  skills: { allowed: readonly string[]; installed: readonly string[] };
  progress: SkillProgress;
};

export function skillGate(
  progress: SkillProgress,
  skills: ToolContext["skills"],
) {
  const required = skills.allowed.filter((name) =>
    skills.installed.includes(name),
  );
  const loaded = progress.loadedSkills.some((name) => required.includes(name));
  if (progress.readAgentsMd && (required.length === 0 || loaded)) return null;
  const steps = [
    progress.readAgentsMd ? null : "read AGENTS.md with readFiles",
    required.length === 0 || loaded
      ? null
      : `load the skills that apply with loadSkill (${required.join(", ")})`,
  ].filter(Boolean);
  return `Not written. Load the skills that apply before writing code: ${steps.join(" and ")}, then send the files again. This applies to small edits too.`;
}

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

async function runTerminal(call: ToolCall, ctx: ToolContext) {
  const parsed = terminalInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }
  const { command } = parsed.data;
  const blocked =
    ctx.agent === "reviewer"
      ? checkReviewerCommand(command)
      : checkCommand(command);
  if (blocked) {
    return outcome(ctx, blocked, {
      terminal: { command, output: blocked, exitCode: null },
    });
  }

  await ctx.publish("tool", {
    phase: "call",
    callId: call.toolCallId,
    name: "terminal",
    command,
    agent: ctx.agent,
  });
  const stream = (chunk: string) =>
    ctx.publish("tool", {
      phase: "output",
      callId: call.toolCallId,
      name: "terminal",
      chunk,
      agent: ctx.agent,
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
    agent: ctx.agent,
  });

  const tasks: TaskItem[] = [];
  const packages = exitCode === 0 ? packagesFromInstall(command) : null;
  if (packages) {
    const task: TaskItem = { kind: "install", packages, agent: ctx.agent };
    tasks.push(task);
    await ctx.publish("task", task);
  }

  return outcome(ctx, `Exit code: ${exitCode ?? "unknown"}\n${output}`, {
    tasks,
    terminal: { command, output, exitCode },
  });
}

async function writeFiles(call: ToolCall, ctx: ToolContext) {
  const parsed = writeFilesInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }
  const gate = skillGate(ctx.progress, ctx.skills);
  if (gate) return outcome(ctx, gate);

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
      agent: ctx.agent,
    });
    await ctx.sandbox.files.write(target.absolute, file.content);
    const lines = countLines(file.content);
    await ctx.publish("file", {
      phase: "written",
      path: target.relative,
      verb,
      lines,
      agent: ctx.agent,
    });
    const task: TaskItem = {
      kind: "file",
      verb,
      path: target.relative,
      lines,
      agent: ctx.agent,
    };
    await ctx.publish("task", task);

    known.add(target.relative);
    tasks.push(task);
    writtenPaths.push(target.relative);
    results.push(`${existed ? "Updated" : "Created"} ${target.relative}`);
  }

  return outcome(ctx, results.join("\n"), { tasks, writtenPaths });
}

async function readFiles(call: ToolCall, ctx: ToolContext) {
  const parsed = readFilesInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }

  let budget = READ_TOTAL_LIMIT;
  const contents = await Promise.all(
    parsed.data.paths.map(async (path) => {
      try {
        const target = resolveAppPath(path, "read");
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
  const readAgentsMd = contents.some(
    (entry) => entry.path === "AGENTS.md" && "content" in entry,
  );
  return outcome(ctx, JSON.stringify(contents), {
    progress: readAgentsMd
      ? { ...ctx.progress, readAgentsMd: true }
      : ctx.progress,
  });
}

async function loadSkill(call: ToolCall, ctx: ToolContext) {
  const parsed = loadSkillInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }
  const { name } = parsed.data;
  const available = ctx.skills.allowed.filter((skill) =>
    ctx.skills.installed.includes(skill),
  );
  if (!available.includes(name)) {
    return outcome(
      ctx,
      available.length > 0
        ? `Skill "${name}" is not available to you. Load one of: ${available.join(", ")}.`
        : `Skill "${name}" is not available. No skills are installed for you; carry on with the rules in AGENTS.md.`,
    );
  }
  const dir = `${SKILLS_DIR}/${name}`;
  const markdown = await ctx.sandbox.files
    .read(`${APP_DIR}/${dir}/SKILL.md`)
    .catch(() => null);
  if (markdown === null) {
    return outcome(ctx, `Skill "${name}" could not be read.`);
  }
  const listing = await ctx.sandbox.commands
    .run(`find ${dir} -type f -not -name SKILL.md`, {
      cwd: APP_DIR,
      timeoutMs: 30_000,
    })
    .then((result) => result.stdout)
    .catch(() => "");
  const files = listing
    .split("\n")
    .map((line) => line.trim().replace(/^\.\//, ""))
    .filter(Boolean)
    .sort();
  const body = truncateOutput(parseSkill(markdown).body, MAX_SKILL_CHARS);
  const fileList =
    files.length > 0
      ? `\n\nOther files in this skill (read them with readFiles only when you need them):\n${files.map((file) => `- ${file}`).join("\n")}`
      : "";
  const loadedSkills = ctx.progress.loadedSkills.includes(name)
    ? ctx.progress.loadedSkills
    : [...ctx.progress.loadedSkills, name];
  return outcome(ctx, `# Skill: ${name}\n\n${body}${fileList}`, {
    progress: { ...ctx.progress, loadedSkills },
  });
}

export async function executeTool(
  call: ToolCall,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  if (!isAgentTool(call.toolName) || !ctx.tools.includes(call.toolName)) {
    return outcome(ctx, `Unknown tool: ${call.toolName}`);
  }
  if (call.toolName === "terminal") return runTerminal(call, ctx);
  if (call.toolName === "createOrUpdateFiles") return writeFiles(call, ctx);
  if (call.toolName === "loadSkill") return loadSkill(call, ctx);
  return readFiles(call, ctx);
}
