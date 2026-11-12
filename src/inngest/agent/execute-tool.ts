import { CommandExitError, type Sandbox } from "e2b";
import {
  type AgentName,
  type InputPayload,
  inputPayloadSchema,
  packagesFromInstall,
  type TaskItem,
} from "@/lib/agent/parts";
import { isSandboxGone } from "@/server/sandbox/errors";
import { noRedaction, type Redactor } from "@/server/secrets/redact";
import {
  APP_DIR,
  checkCommand,
  checkReviewerCommand,
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
  npqCommand,
  parseNpqReport,
  planInstall,
  summarizeNpq,
  unknownDependencies,
} from "./guardrails/packages";
import { detectSecrets } from "./guardrails/secret-patterns";
import { codeTripwire } from "./guardrails/tripwire";
import { wrapUntrusted } from "./guardrails/untrusted";
import { MAX_SKILL_CHARS, parseSkill, SKILLS_DIR } from "./skills";
import {
  askUserInput,
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

export const MAX_QUESTIONS_PER_RUN = 5;
export const MAX_FILES_BEFORE_CONFIRM = 10;

export type SkillProgress = {
  readAgentsMd: boolean;
  loadedSkills: string[];
  installs?: number;
};

export type PendingInput = {
  payload: InputPayload;
  resume: boolean;
  packages?: string[];
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
  pending?: PendingInput | null;
  guard?: GuardHit | null;
};

export type ToolContext = {
  sandbox: Pick<Sandbox, "commands" | "files">;
  publish: Publish;
  writtenPaths: readonly string[];
  agent: AgentName;
  tools: readonly string[];
  skills: { allowed: readonly string[]; installed: readonly string[] };
  progress: SkillProgress;
  redactor?: Redactor;
  envs?: Record<string, string>;
  approved?: boolean;
  approvedPackages?: readonly string[];
  restricted?: boolean;
  questionsLeft?: number;
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

function confirmOutcome(
  ctx: ToolContext,
  payload: Extract<InputPayload, { kind: "confirm" }>,
  packages?: string[],
) {
  if ((ctx.questionsLeft ?? MAX_QUESTIONS_PER_RUN) <= 0) {
    return outcome(
      ctx,
      `Not run: this needs the user's approval (${payload.action}), but you have used all ${MAX_QUESTIONS_PER_RUN} questions for this request. Find another way, or explain in your summary that the user has to approve it.`,
    );
  }
  return outcome(ctx, `Waiting for the user to approve: ${payload.action}`, {
    pending: { payload, resume: true, packages },
  });
}

function shortCommand(command: string) {
  return command.length > 160 ? `${command.slice(0, 159)}…` : command;
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
  return summarizeNpq(names, parseNpqReport(result));
}

async function preflight(
  command: string,
  ctx: ToolContext,
): Promise<{ command: string; installs: number } | ToolOutcome> {
  const destructive = destructiveAction(command);
  if (destructive && !ctx.approved) {
    return confirmOutcome(ctx, {
      kind: "confirm",
      action: `Run: ${shortCommand(command)}`,
      risk: "high",
      summary: destructive,
    });
  }

  const targets = removalTargets(command);
  if (targets && !ctx.approved) {
    const counted = await ctx.sandbox.commands
      .run(countFilesCommand(targets), { cwd: APP_DIR, timeoutMs: 30_000 })
      .then((res) => Number.parseInt(res.stdout.trim(), 10))
      .catch(() => 0);
    if (counted > MAX_FILES_BEFORE_CONFIRM) {
      return confirmOutcome(ctx, {
        kind: "confirm",
        action: `Delete ${counted} files: ${shortCommand(command)}`,
        risk: "high",
        summary: `This removes ${counted} files from the project (${targets.join(", ")}). They come back only by restoring an earlier version.`,
      });
    }
  }

  const approvedPackages = ctx.approvedPackages ?? [];
  const plan = planInstall(command, approvedPackages);
  if (plan.action === "none") return { command, installs: 0 };
  if (plan.action === "refuse") {
    return outcome(ctx, `Command blocked: ${plan.reason}.`, {
      terminal: { command, output: plan.reason, exitCode: null },
    });
  }
  const used = ctx.progress.installs ?? 0;
  if (used + plan.installs > MAX_INSTALLS_PER_RUN) {
    const message = `Command blocked: this request already installed ${used} packages and the limit is ${MAX_INSTALLS_PER_RUN}. Use what is installed.`;
    return outcome(ctx, message, {
      terminal: { command, output: message, exitCode: null },
    });
  }
  let unknown = plan.unknown;
  if (plan.bare) {
    const manifest = await ctx.sandbox.files
      .read(`${APP_DIR}/package.json`)
      .catch(() => "{}");
    const deps = unknownDependencies(manifest, approvedPackages);
    if (deps.refused) {
      const message = `Command blocked: package.json has a dependency that isn't from the npm registry (${deps.refused}). Use a registry package instead.`;
      return outcome(ctx, message, {
        terminal: { command, output: message, exitCode: null },
      });
    }
    unknown = [...new Set([...unknown, ...deps.unknown])].sort();
  }
  if (unknown.length > 0 && !ctx.approved) {
    return confirmOutcome(
      ctx,
      {
        kind: "confirm",
        action: `Install ${unknown.join(", ")}`,
        risk: "medium",
        summary: await vetPackages(ctx, unknown),
      },
      unknown,
    );
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
  const blocked =
    ctx.agent === "reviewer"
      ? checkReviewerCommand(requested)
      : checkCommand(requested);
  if (blocked) {
    return outcome(ctx, blocked, {
      terminal: { command: requested, output: blocked, exitCode: null },
    });
  }
  const checked =
    ctx.agent === "reviewer"
      ? { command: requested, installs: 0 }
      : await preflight(requested, ctx);
  if ("output" in checked) return checked;
  const { command } = checked;
  const redactor = ctx.redactor ?? noRedaction;

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
      chunk: redactor.redact(chunk),
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
      ...(ctx.envs && Object.keys(ctx.envs).length > 0
        ? { envs: ctx.envs }
        : {}),
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
    agent: ctx.agent,
  });

  const tasks: TaskItem[] = [];
  const packages = exitCode === 0 ? packagesFromInstall(command) : null;
  if (packages) {
    const task: TaskItem = { kind: "install", packages, agent: ctx.agent };
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

async function writeContentCheck(
  path: string,
  content: string,
  ctx: ToolContext,
) {
  const named = (ctx.redactor ?? noRedaction).contains(content);
  if (named) {
    return {
      message: `Skipped ${path}: it contains the value of ${named}. Never write secret values into files; read it in code with process.env.${named}.`,
      guard: null,
    };
  }
  const found = await detectSecrets(content);
  if (found.length > 0) {
    return {
      message: `Skipped ${path}: it contains what looks like a secret (${found[0].ruleId}). Never write keys, passwords or tokens into files; read them with process.env.NAME and ask for missing ones with askUser (kind secret).`,
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
    const rejected = await writeContentCheck(
      target.relative,
      file.content,
      ctx,
    );
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
            (ctx.redactor ?? noRedaction).redact(content),
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

function askUser(call: ToolCall, ctx: ToolContext) {
  const parsed = askUserInput.safeParse(call.input);
  if (!parsed.success) {
    return outcome(ctx, `Invalid input: ${parsed.error.message}`);
  }
  const { kind, ...fields } = parsed.data;
  const payload = inputPayloadSchema.safeParse({
    kind,
    ...Object.fromEntries(
      Object.entries(fields).filter(
        ([, value]) => value !== undefined && value !== "",
      ),
    ),
  });
  if (!payload.success) {
    const needs = {
      choice: "question and 2 to 6 options",
      text: "question",
      secret: "name (like OPENAI_API_KEY), label and reason",
      confirm: "action, risk and summary",
    }[kind];
    return outcome(
      ctx,
      `Not asked: a ${kind} question needs ${needs}. ${payload.error.issues[0]?.message ?? ""}`.trim(),
    );
  }
  if (payload.data.kind === "secret" && ctx.restricted) {
    return outcome(
      ctx,
      "Not asked: secrets can't be requested for this request. Build without the key and explain in your summary what the user needs to add.",
    );
  }
  if ((ctx.questionsLeft ?? MAX_QUESTIONS_PER_RUN) <= 0) {
    return outcome(
      ctx,
      `Not asked: you have used all ${MAX_QUESTIONS_PER_RUN} questions for this request. Decide yourself with a sensible default and mention it in your summary.`,
    );
  }
  return outcome(ctx, "Waiting for the user's answer.", {
    pending: { payload: payload.data, resume: false },
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
  if (call.toolName === "askUser") return askUser(call, ctx);
  return readFiles(call, ctx);
}
