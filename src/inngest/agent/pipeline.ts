import "server-only";
import { type ModelMessage, NoObjectGeneratedError } from "ai";
import { CommandExitError, type Sandbox } from "e2b";
import type { GetStepTools } from "inngest";
import { z } from "zod";
import type { TaskItem } from "@/lib/agent/parts";
import type { AgentModel } from "@/lib/ai/models";
import { creditRate } from "@/server/billing/credit-rate";
import {
  addUsage,
  creditsForCost,
  emptyUsage,
  type TokenUsage,
} from "@/server/billing/pricing";
import { type BilledCall, estimateCallUsd } from "@/server/billing/run-cost";
import { db } from "@/server/db";
import {
  dedupeDiagnostics,
  type Diagnostic,
  diagnosticPaths,
  eslintCommand,
  eslintFixCommand,
  formatDiagnostics,
  missingPackages,
  parseEslintJson,
  parseRouteOutput,
  parseTscOutput,
  routeCommand,
  routeDiagnostic,
  tscCommand,
} from "@/server/sandbox/diagnostics";
import { APP_DIR, GuardError, resolveAppPath } from "@/server/sandbox/guards";
import { isSandboxGone } from "@/server/sandbox/errors";
import {
  connectOrRecover,
  recoverSandbox,
  type SandboxRef,
} from "@/server/sandbox/recover";
import { PREVIEW_PORT } from "@/server/sandbox/sandbox";
import type { inngest } from "../client";
import { createPublisher } from "../publisher";
import { blockFiles, blockReference } from "./blocks";
import { buildContext, preloadFiles, type PreloadedFile } from "./context";
import { ATTACHMENT_SCHEME } from "./conversation";
import { wrapUntrusted } from "./guardrails/untrusted";
import type { RunProgress, WrittenFile } from "./execute-tool";
import { parseFileBlocks } from "./file-blocks";
import { clientDirectiveFixes } from "./fixes";
import { patternRedactor } from "./guardrails/redact";
import { type AgentRun, type Budget, failModelTurn } from "./loop";
import { generatePlainText, generateStructured, type ModelCall } from "./model";
import { StopRequested, withStopWatch } from "./stop-watch";
import {
  type BuildPlan,
  buildPlanSchema,
  type PlanFile,
  planWaves,
  validatePlan,
} from "./plan";
import { applyPreset } from "./presets";
import {
  PLANNER_PROMPT,
  QUESTION_PROMPT,
  ROUTER_PROMPT,
  WORKER_PROMPT,
} from "./prompts/pipeline";
import { readOnlyToolNames } from "./tools";
import {
  type MemoryAccess,
  memoryAccess,
  trackMemoryUse,
} from "@/server/memory";
import { type MemoryRead, readMemory } from "./memory-step";
import {
  guessTargets,
  type Intent,
  intents,
  knownTargets,
  routeIntent,
} from "./router";
import { replayOf, type RunContext, runToolBatch } from "./runtime";

type Step = GetStepTools<typeof inngest>;

export const MAX_CHECKED_ROUTES = 8;
const WORKER_OUTPUT_TOKENS = 24_000;
const PLAN_OUTPUT_TOKENS = 12_000;
const DEPENDENCY_CHARS = 30_000;

export type Spend = {
  calls: BilledCall[];
  usage: TokenUsage;
  spentUsd: number;
};

export const noSpend: Spend = { calls: [], usage: emptyUsage, spentUsd: 0 };

export function spendOf(
  call: ModelCall | null,
  agent: string,
  model: AgentModel,
): Spend {
  if (!call) return noSpend;
  const billed: BilledCall = {
    generationIds: call.generationIds,
    estimatedUsd: call.estimatedUsd,
    agent,
    model: model.id,
  };
  return {
    calls: [billed],
    usage: call.usage,
    spentUsd: estimateCallUsd(billed),
  };
}

export function addSpend(a: Spend, b: Spend): Spend {
  return {
    calls: [...a.calls, ...b.calls],
    usage: addUsage(a.usage, b.usage),
    spentUsd: a.spentUsd + b.spentUsd,
  };
}

export function exhausted(budget: Budget, spentUsd = 0) {
  return (
    budget.balance - creditsForCost(budget.spentUsd + spentUsd, creditRate) <= 0
  );
}

async function connect(projectId: string, run: RunContext) {
  return connectOrRecover(run.sandbox, () =>
    recoverSandbox({
      projectId,
      chainId: run.chainId,
      replay: replayOf(run),
    }),
  );
}

async function captureCommand(
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

function toolBase(written: string[], progress: RunProgress) {
  return {
    writtenPaths: written,
    tools: ["createOrUpdateFiles", "terminal"],
    progress,
  };
}

async function writeThroughGuards({
  projectId,
  run,
  files,
  written,
  label,
}: {
  projectId: string;
  run: RunContext;
  files: WrittenFile[];
  written: string[];
  label: string;
}): Promise<{
  written: WrittenFile[];
  tasks: TaskItem[];
  sandbox: SandboxRef | null;
}> {
  if (files.length === 0) return { written: [], tasks: [], sandbox: null };
  const calls = [];
  for (let index = 0; index < files.length; index += 20) {
    calls.push({
      toolCallId: `${label}-${index / 20}`,
      toolName: "createOrUpdateFiles",
      input: { files: files.slice(index, index + 20) },
    });
  }
  const batch = await runToolBatch({
    calls,
    projectId,
    run,
    base: toolBase(written, {}),
    replay: replayOf(run),
    isReadOnly: (name) =>
      (readOnlyToolNames as readonly string[]).includes(name),
  });
  const done = new Set(
    batch.outcomes.flatMap((outcome) => outcome.writtenPaths),
  );
  return {
    written: files.filter((file) => done.has(file.path)),
    tasks: batch.outcomes.flatMap((outcome) => outcome.tasks),
    sandbox: batch.sandbox,
  };
}

export function rememberWrites(run: RunContext, files: WrittenFile[]) {
  for (const file of files) run.pendingWrites.set(file.path, file.content);
}

const routerSchema = z.object({
  intent: z.enum(intents),
  targetFiles: z.array(z.string()),
});

export type RouteResult = {
  intent: Intent;
  targets: string[];
  preloaded: PreloadedFile[];
  spend: Spend;
  memory: Omit<MemoryRead, "use">;
  ms: number;
};

export async function routeRequest({
  step,
  projectId,
  userId,
  model,
  prompt,
  hasVersion,
  repoMap,
  paths,
  forced,
}: {
  step: Step;
  projectId: string;
  userId: string;
  model: AgentModel;
  prompt: string;
  hasVersion: boolean;
  repoMap: string;
  paths: string[];
  forced?: Intent;
}): Promise<RouteResult> {
  return step.run("route", async () => {
    const started = Date.now();
    const heuristic = forced
      ? { intent: forced, confident: true }
      : routeIntent(prompt, { hasVersion });
    let intent = heuristic.intent;
    let targets = guessTargets(prompt, paths);
    let spend = noSpend;

    if (!heuristic.confident && hasVersion) {
      const result = await generateStructured({
        model,
        instructions: ROUTER_PROMPT,
        messages: [
          {
            role: "user",
            content: `Repo map:\n${repoMap || "(empty)"}\n\nLatest message:\n${prompt.slice(0, 4000)}`,
          },
        ],
        schema: routerSchema,
        maxOutputTokens: 600,
      }).catch((error: unknown) => {
        console.warn("[run-agent] router call failed", error);
        return null;
      });
      if (result) {
        intent = result.output.intent;
        targets = knownTargets(
          [...result.output.targetFiles, ...targets],
          paths,
        );
        spend = spendOf(result, "router", model);
      }
    }

    let preloaded: PreloadedFile[] = [];
    if (hasVersion && intent !== "create" && targets.length > 0) {
      const latest = await db.version.findFirst({
        where: { projectId, status: "READY" },
        orderBy: { number: "desc" },
        select: { files: true },
      });
      preloaded = preloadFiles(
        (latest?.files ?? {}) as Record<string, string>,
        targets,
      );
    }
    const { use, ...memory } = await readMemory({
      access: await memoryAccess(db, userId).catch((): MemoryAccess => ({
        enabled: false,
        reason: "memory is unavailable",
      })),
      intent,
      prompt,
      projectId,
    });
    if (Object.keys(use).length > 0) await trackMemoryUse(db, use);
    return {
      intent,
      targets,
      preloaded,
      spend,
      memory,
      ms: Date.now() - started,
    };
  });
}

export type PlanResult = {
  plan: BuildPlan | null;
  warnings: string[];
  spend: Spend;
  ms: number;
  stopped?: boolean;
};

export async function makePlan({
  step,
  projectId,
  model,
  messages,
  shouldStop,
}: {
  step: Step;
  projectId: string;
  model: AgentModel;
  messages: ModelMessage[];
  shouldStop?: () => Promise<boolean>;
}): Promise<PlanResult> {
  return step.run("plan", async () => {
    const started = Date.now();
    const publish = createPublisher(projectId, patternRedactor);
    await publish("status", { state: "thinking" });
    let result;
    try {
      result = await withStopWatch(shouldStop, (abortSignal) =>
        generateStructured({
          model,
          instructions: PLANNER_PROMPT,
          messages,
          schema: buildPlanSchema,
          maxOutputTokens: PLAN_OUTPUT_TOKENS,
          abortSignal,
        }),
      );
    } catch (error) {
      if (error instanceof StopRequested) {
        return {
          plan: null,
          warnings: [] as string[],
          spend: noSpend,
          ms: Date.now() - started,
          stopped: true,
        };
      }
      if (NoObjectGeneratedError.isInstance(error)) {
        console.warn("[run-agent] the planner returned no valid plan", error);
        return {
          plan: null,
          warnings: ["no valid plan"],
          spend: noSpend,
          ms: Date.now() - started,
        };
      }
      return failModelTurn(error);
    }
    const { plan, warnings } = validatePlan(result.output);
    const spend = spendOf(result, "planner", model);
    if (plan.files.length === 0) {
      return { plan: null, warnings, spend, ms: Date.now() - started };
    }
    const task: TaskItem = {
      kind: "note",
      label: `Planned ${plan.title}: ${plan.pages.length} ${plan.pages.length === 1 ? "page" : "pages"}, ${plan.files.length} files${plan.blocks.length > 0 ? `, ${plan.blocks.length} ready-made blocks` : ""}`,
    };
    await publish("task", task);
    await publish("status", { state: "building" });
    return { plan, warnings, spend, ms: Date.now() - started };
  });
}

function planOutline(plan: BuildPlan) {
  return [
    `Title: ${plan.title}`,
    `Summary: ${plan.summary}`,
    `Design: preset ${plan.design.preset}, headings in ${plan.design.headingFont}, body in ${plan.design.bodyFont}, theme ${plan.design.theme}. ${plan.design.direction}`,
    `Pages:\n${plan.pages.map((page) => `- ${page.route} (${page.title}): ${page.sections.join(" → ")}`).join("\n")}`,
    `All planned files:\n${plan.files.map((file) => `- ${file.path}: ${file.purpose}`).join("\n")}`,
    plan.packages.length > 0 ? `Packages: ${plan.packages.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function workerBrief({
  request,
  plan,
  assigned,
  dependencies,
  existing,
  designNotes,
}: {
  request: string;
  plan: BuildPlan;
  assigned: PlanFile[];
  dependencies: WrittenFile[];
  existing: WrittenFile[];
  designNotes: string;
}) {
  const blocks = blockReference(plan.blocks);
  return [
    `## The user's request\n${request.slice(0, 6000)}`,
    `## Build plan\n${planOutline(plan)}`,
    designNotes ? `## Current design tokens\n${designNotes}` : null,
    blocks ? `## Blocks you can import\n${blocks}` : null,
    dependencies.length > 0
      ? `## Files you import from (already written)\n${dependencies.map((file) => `<file path="${file.path}">\n${file.content}</file>`).join("\n")}`
      : null,
    existing.length > 0
      ? `## Current contents of files you are rewriting\n${existing.map((file) => `<file path="${file.path}">\n${file.content}</file>`).join("\n")}`
      : null,
    `## Your files\nWrite exactly these files, complete:\n${assigned.map((file) => `- ${file.path}: ${file.purpose}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeWorkerPath(path: string) {
  try {
    return resolveAppPath(path).relative;
  } catch (error) {
    if (error instanceof GuardError) return null;
    throw error;
  }
}

export type GenerateResult = {
  files: WrittenFile[];
  tasks: TaskItem[];
  missing: string[];
  spend: Spend;
  stopped: boolean;
  outOfCredits: boolean;
  ms: number;
};

export async function generateFromPlan({
  step,
  projectId,
  run,
  model,
  plan,
  request,
  designNotes,
  budget,
  shouldStop,
}: {
  step: Step;
  projectId: string;
  run: RunContext;
  model: AgentModel;
  plan: BuildPlan;
  request: string;
  designNotes: string;
  budget: Budget;
  shouldStop: () => Promise<boolean>;
}): Promise<GenerateResult> {
  const foundation = await step.run("gen-foundation", async () => {
    const started = Date.now();
    const { sandbox } = await connect(projectId, run);
    const css = await sandbox.files
      .read(`${APP_DIR}/app/globals.css`)
      .catch(() => null);
    const files: WrittenFile[] = [...blockFiles(plan.blocks)];
    if (css) {
      const themed = applyPreset(css, plan.design.preset);
      if (themed !== css)
        files.push({ path: "app/globals.css", content: themed });
    }
    const existing: WrittenFile[] = [];
    for (const file of plan.files) {
      const content = await sandbox.files
        .read(`${APP_DIR}/${file.path}`)
        .catch(() => null);
      if (content !== null && content.length <= 16_000) {
        existing.push({ path: file.path, content });
      }
    }
    const result = await writeThroughGuards({
      projectId,
      run,
      files,
      written: [...run.pendingWrites.keys()],
      label: "foundation",
    });
    return {
      written: result.written,
      tasks: result.tasks,
      existing,
      sandbox: result.sandbox ?? null,
      ms: Date.now() - started,
    };
  });
  if (foundation.sandbox) run.sandbox = foundation.sandbox;
  rememberWrites(run, foundation.written);

  const generated = new Map<string, string>(
    foundation.written.map((file) => [file.path, file.content]),
  );
  const existing = new Map(
    foundation.existing.map((file) => [file.path, file.content]),
  );
  const tasks: TaskItem[] = [...(foundation.tasks as TaskItem[])];
  let spend = noSpend;
  let stopped = false;
  let outOfCredits = false;
  let ms = foundation.ms;
  const missing: string[] = [];

  const install =
    plan.packages.length > 0
      ? step.run("gen-packages", async () => {
          const batch = await runToolBatch({
            calls: [
              {
                toolCallId: "plan-packages",
                toolName: "terminal",
                input: { command: `npm install ${plan.packages.join(" ")}` },
              },
            ],
            projectId,
            run,
            base: toolBase([], {}),
            replay: replayOf(run),
            isReadOnly: () => false,
          });
          return { tasks: batch.outcomes.flatMap((outcome) => outcome.tasks) };
        })
      : null;

  const waves = planWaves(plan.files);
  for (const [waveIndex, groups] of waves.entries()) {
    const results = await Promise.all(
      groups.map((assigned, groupIndex) =>
        step.run(`gen-${waveIndex}-${groupIndex}`, async () => {
          if (await shouldStop()) return { stopped: true as const };
          const started = Date.now();
          const wanted = assigned.map((file) => file.path);
          const dependencies: WrittenFile[] = [];
          let budgetLeft = DEPENDENCY_CHARS;
          for (const dep of new Set(
            assigned.flatMap((file) => file.dependsOn),
          )) {
            const content = generated.get(dep);
            if (!content || content.length > budgetLeft) continue;
            dependencies.push({ path: dep, content });
            budgetLeft -= content.length;
          }
          const brief = (files: PlanFile[]) =>
            workerBrief({
              request,
              plan,
              assigned: files,
              dependencies,
              existing: files.flatMap((file) =>
                existing.has(file.path)
                  ? [{ path: file.path, content: existing.get(file.path)! }]
                  : [],
              ),
              designNotes,
            });
          const produced = new Map<string, string>();
          const calls: ModelCall[] = [];
          for (let attempt = 0; attempt < 2; attempt++) {
            const todo = assigned.filter((file) => !produced.has(file.path));
            if (todo.length === 0) break;
            let result;
            try {
              result = await withStopWatch(shouldStop, (abortSignal) =>
                generatePlainText({
                  model,
                  instructions: WORKER_PROMPT,
                  messages: [{ role: "user", content: brief(todo) }],
                  maxOutputTokens: WORKER_OUTPUT_TOKENS,
                  abortSignal,
                }).catch(failModelTurn),
              );
            } catch (error) {
              if (error instanceof StopRequested)
                return { stopped: true as const };
              throw error;
            }
            calls.push(result);
            for (const block of parseFileBlocks(result.text)) {
              const path = normalizeWorkerPath(block.path);
              if (path && wanted.includes(path) && !produced.has(path)) {
                produced.set(path, block.content);
              }
            }
          }
          const written = await writeThroughGuards({
            projectId,
            run,
            files: [...produced].map(([path, content]) => ({ path, content })),
            written: [...run.pendingWrites.keys()],
            label: `gen-${waveIndex}-${groupIndex}`,
          });
          return {
            stopped: false as const,
            written: written.written,
            tasks: written.tasks,
            sandbox: written.sandbox ?? null,
            missing: wanted.filter(
              (path) => !written.written.some((file) => file.path === path),
            ),
            calls,
            ms: Date.now() - started,
          };
        }),
      ),
    );
    let waveMs = 0;
    for (const result of results) {
      if (result.stopped) {
        stopped = true;
        continue;
      }
      if (result.sandbox) run.sandbox = result.sandbox;
      rememberWrites(run, result.written);
      for (const file of result.written) generated.set(file.path, file.content);
      tasks.push(...(result.tasks as TaskItem[]));
      missing.push(...result.missing);
      for (const call of result.calls) {
        spend = addSpend(spend, spendOf(call, "generator", model));
      }
      waveMs = Math.max(waveMs, result.ms);
    }
    ms += waveMs;
    if (stopped) break;
    if (exhausted(budget, spend.spentUsd)) {
      outOfCredits = true;
      break;
    }
  }
  if (install) tasks.push(...(await install).tasks);

  return {
    files: [...generated].map(([path, content]) => ({ path, content })),
    tasks,
    missing,
    spend,
    stopped,
    outOfCredits,
    ms,
  };
}

export type CheckResult = {
  diagnostics: Diagnostic[];
  affected: PreloadedFile[];
  fixed: WrittenFile[];
  tasks: TaskItem[];
  ms: number;
};

function staticRoutes(routes: string[]) {
  return [...new Set(routes)]
    .filter((route) => !route.includes("["))
    .slice(0, MAX_CHECKED_ROUTES);
}

export async function checkProject({
  step,
  stepId,
  projectId,
  run,
  routes,
  changed,
}: {
  step: Step;
  stepId: string;
  projectId: string;
  run: RunContext;
  routes: string[];
  changed: string[];
}): Promise<CheckResult> {
  const result = await step.run(stepId, async () => {
    const started = Date.now();
    const publish = createPublisher(projectId, patternRedactor);
    const { sandbox, recovered } = await connect(projectId, run);
    const sources = changed.filter((path) => /\.(tsx?|jsx?)$/.test(path));
    const tasks: TaskItem[] = [];

    if (sources.length > 0) {
      await captureCommand(sandbox, eslintFixCommand(sources), 90_000);
    }
    const current = await Promise.all(
      sources.map(async (path) => ({
        path,
        content: await sandbox.files
          .read(`${APP_DIR}/${path}`)
          .catch(() => null),
      })),
    );
    const readable = current.filter(
      (file): file is WrittenFile => file.content !== null,
    );
    const directives = clientDirectiveFixes(readable);
    for (const file of directives) {
      await sandbox.files.write(`${APP_DIR}/${file.path}`, file.content);
    }
    const directiveMap = new Map(
      directives.map((file) => [file.path, file.content]),
    );
    const fixed = readable
      .map((file) => ({
        path: file.path,
        content: directiveMap.get(file.path) ?? file.content,
      }))
      .filter((file) => run.pendingWrites.get(file.path) !== file.content);

    const runChecks = async () => {
      const [tsc, eslint, ...pages] = await Promise.all([
        captureCommand(sandbox, tscCommand(), 180_000),
        sources.length > 0
          ? captureCommand(sandbox, eslintCommand(sources), 90_000)
          : Promise.resolve(""),
        ...staticRoutes(routes).map(async (route) => ({
          route,
          ...parseRouteOutput(
            await captureCommand(
              sandbox,
              routeCommand(route, PREVIEW_PORT),
              75_000,
            ),
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

    let diagnostics = await runChecks();
    const packages = missingPackages(diagnostics);
    if (packages.length > 0) {
      const batch = await runToolBatch({
        calls: [
          {
            toolCallId: `${stepId}-install`,
            toolName: "terminal",
            input: { command: `npm install ${packages.join(" ")}` },
          },
        ],
        projectId,
        run: { ...run, sandbox: recovered ?? run.sandbox },
        base: toolBase([], {}),
        replay: replayOf(run),
        isReadOnly: () => false,
      });
      tasks.push(...batch.outcomes.flatMap((outcome) => outcome.tasks));
      diagnostics = await runChecks();
    }

    const affected: PreloadedFile[] = [];
    const paths = diagnosticPaths(diagnostics);
    const contents = await Promise.all(
      paths.map(async (path) => ({
        path,
        content: await sandbox.files
          .read(`${APP_DIR}/${path}`)
          .catch(() => null),
      })),
    );
    affected.push(
      ...preloadFiles(
        Object.fromEntries(
          contents.flatMap((file) =>
            file.content === null ? [] : [[file.path, file.content]],
          ),
        ),
        paths,
      ),
    );

    const task: TaskItem = {
      kind: "note",
      label:
        diagnostics.length === 0
          ? "Checked types, lint and pages: no problems"
          : `Checks found ${diagnostics.length} ${diagnostics.length === 1 ? "problem" : "problems"}`,
    };
    await publish("task", task);
    tasks.push(task);
    return {
      diagnostics,
      affected,
      fixed,
      tasks,
      sandbox: recovered,
      ms: Date.now() - started,
    };
  });
  if (result.sandbox) run.sandbox = result.sandbox;
  rememberWrites(run, result.fixed);
  return result;
}

export function repairMessage({
  request,
  diagnostics,
  affected,
  designNotes,
  repoMap,
  screenshots = [],
}: {
  request: string;
  diagnostics: Diagnostic[];
  affected: PreloadedFile[];
  designNotes: string;
  repoMap: string;
  screenshots?: { label: string; key: string }[];
}): ModelMessage {
  const fromBrowser = diagnostics.some((item) => item.source === "browser");
  const text = `The user's request was:\n${request.slice(0, 4000)}\n\n(Automatic checks found problems in the project${fromBrowser ? ", some of them by opening the site in a real browser at desktop and phone width" : ""}. Fix every one of them with editFile, changing as little as possible and keeping the design and behaviour.${fromBrowser ? " A page that scrolls sideways at phone width needs a responsive fix (wrapping, smaller fixed widths, overflow handling), not a hidden overflow on the body." : ""} When everything is fixed, reply with a short task_summary of what you fixed.)\n\nProblems:\n${wrapUntrusted("checks", formatDiagnostics(diagnostics))}\n\n${buildContext(
    {
      intent: "fix",
      designNotes,
      repoMap,
      preloaded: affected,
    },
  )}`;
  if (screenshots.length === 0) return { role: "user", content: text };
  return {
    role: "user",
    content: [
      { type: "text", text },
      ...screenshots.flatMap((shot) => [
        { type: "text" as const, text: `Screenshot: ${shot.label}` },
        {
          type: "file" as const,
          mediaType: "image/png",
          data: new URL(`${ATTACHMENT_SCHEME}${shot.key}`),
        },
      ]),
    ],
  };
}

export async function rollback({
  step,
  stepId,
  projectId,
  run,
  restore,
  remove,
}: {
  step: Step;
  stepId: string;
  projectId: string;
  run: RunContext;
  restore: WrittenFile[];
  remove: string[];
}) {
  const result = await step.run(stepId, async () => {
    const { sandbox, recovered } = await connect(projectId, run);
    for (const file of restore) {
      await sandbox.files.write(`${APP_DIR}/${file.path}`, file.content);
    }
    for (const path of remove) {
      await sandbox.files.remove(`${APP_DIR}/${path}`).catch(() => null);
    }
    const task: TaskItem = {
      kind: "note",
      label: "Undid a repair attempt that made things worse",
    };
    await createPublisher(projectId)("task", task);
    return { sandbox: recovered, task };
  });
  if (result.sandbox) run.sandbox = result.sandbox;
  rememberWrites(run, restore);
  for (const path of remove) run.pendingWrites.delete(path);
  return result.task;
}

export async function answerQuestion({
  step,
  projectId,
  model,
  messages,
  shouldStop,
}: {
  step: Step;
  projectId: string;
  model: AgentModel;
  messages: ModelMessage[];
  shouldStop?: () => Promise<boolean>;
}) {
  return step.run("answer", async () => {
    const started = Date.now();
    let result;
    try {
      result = await withStopWatch(shouldStop, (abortSignal) =>
        generatePlainText({
          model,
          instructions: QUESTION_PROMPT,
          messages,
          maxOutputTokens: 2000,
          abortSignal,
        }).catch(failModelTurn),
      );
    } catch (error) {
      if (error instanceof StopRequested) {
        return {
          text: "",
          spend: noSpend,
          ms: Date.now() - started,
          stopped: true as const,
        };
      }
      throw error;
    }
    await createPublisher(projectId, patternRedactor)("text", {
      turn: 0,
      delta: result.text,
    });
    return {
      text: result.text.trim(),
      spend: spendOf(result, "answer", model),
      ms: Date.now() - started,
      stopped: false as const,
    };
  });
}

export function runSpend(runs: AgentRun[]): Spend {
  return runs.reduce<Spend>(
    (total, run) => ({
      calls: [...total.calls, ...run.calls],
      usage: addUsage(total.usage, run.usage),
      spentUsd: total.spentUsd + run.spentUsd,
    }),
    noSpend,
  );
}
