import { CommandExitError, type Sandbox } from "e2b";
import { packagesFromInstall, type TaskItem } from "@/lib/agent/parts";
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

export const MAX_FILES_PER_REMOVAL = 10;

export type SkillProgress = {
  readAgentsMd: boolean;
  loadedSkills: string[];
  installs?: number;
};

export type GuardHit = {
  stage: "tool";
  verdict: "block";
  categories: string[];
  text: string;
};

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
  guard?: GuardHit | null;
};

export type ToolContext = {
  sandbox: Pick<Sandbox, "commands" | "files">;
  publish: Publish;
  writtenPaths: readonly string[];
  tools: readonly string[];
  skills: { allowed: readonly string[]; installed: readonly string[] };
  progress: SkillProgress;
  redactor?: Redactor;
  restricted?: boolean;
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

async function writeFiles(call: ToolCall, ctx: ToolContext) {
  const parsed = writeFilesInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }
  const gate = skillGate(ctx.progress, ctx.skills);
  if (gate) return outcome(ctx, gate);

  const known = new Set(ctx.writtenPaths);
  let guard: GuardHit | null = null;
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
    const rejected = await writeContentCheck(target.relative, file.content);
    if (rejected) {
      results.push(rejected.message);
      guard ??= rejected.guard;
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
    const task: TaskItem = {
      kind: "file",
      verb,
      path: target.relative,
      lines,
    };
    await ctx.publish("task", task);

    known.add(target.relative);
    tasks.push(task);
    writtenPaths.push(target.relative);
    results.push(`${existed ? "Updated" : "Created"} ${target.relative}`);
  }

  return outcome(ctx, results.join("\n"), { tasks, writtenPaths, guard });
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
          content: truncateOutput(
            (ctx.redactor ?? patternRedactor).redact(content),
            limit,
          ),
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
  return outcome(ctx, wrapUntrusted("files", JSON.stringify(contents)), {
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
  return outcome(
    ctx,
    wrapUntrusted(`skill:${name}`, `# Skill: ${name}\n\n${body}${fileList}`),
    {
      progress: { ...ctx.progress, loadedSkills },
    },
  );
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
