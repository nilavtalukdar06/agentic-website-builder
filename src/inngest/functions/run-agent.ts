import "server-only";
import type { ModelMessage } from "ai";
import { NonRetriableError } from "inngest";
import {
  type AgentPart,
  stripSummaryTags,
  type TaskItem,
} from "@/lib/agent/parts";
import { cleanProjectName } from "@/lib/project-name";
import { findAgentModel, lookupGenerationCost } from "@/server/ai/gateway";
import { getCreditBalance } from "@/server/billing/balance";
import { creditRate } from "@/server/billing/credit-rate";
import {
  addUsage,
  creditsForCost,
  emptyUsage,
  type TokenUsage,
} from "@/server/billing/pricing";
import { type BilledCall, resolveRunCost } from "@/server/billing/run-cost";
import { db } from "@/server/db";
import { recordSandboxEvent } from "@/server/ops/sandbox-events";
import { APP_DIR } from "@/server/sandbox/guards";
import { connectOrRecover, recoverSandbox } from "@/server/sandbox/recover";
import {
  ensureAgentInstructions,
  ensureDevOrigins,
  getOrCreateSandbox,
  PREVIEW_PORT,
  previewUrlFor,
  snapshotSandbox,
} from "@/server/sandbox/sandbox";
import { detectAgentPromptInjection } from "@/server/arcjet-guard";
import { builderSpec } from "../agent/agents";
import { buildContext } from "../agent/context";
import { cleanTitle, historyToMessages } from "../agent/conversation";
import { classifyText } from "../agent/guardrails/classifier";
import { recordGuardEvent } from "../agent/guardrails/events";
import { guardStoredPrompt, sanitizeHistory } from "../agent/guardrails/input";
import { patternRedactor } from "../agent/guardrails/redact";
import { scanFiles, scanFixPrompt } from "../agent/guardrails/scan";
import { redactPatterns } from "../agent/guardrails/secret-patterns";
import {
  type AgentRun,
  type Budget,
  createRunContext,
  runAgentLoop,
} from "../agent/loop";
import { MODEL_UNAVAILABLE } from "../agent/model-errors";
import {
  type BrowserCheckResult,
  runBrowserCheck,
} from "../agent/browser-step";
import {
  addSpend,
  answerQuestion,
  checkProject,
  generateFromPlan,
  makePlan,
  noSpend,
  repairMessage,
  rollback,
  routeRequest,
  type Spend,
  spendOf,
} from "../agent/pipeline";
import type { BuildPlan } from "../agent/plan";
import type { PreloadedFile } from "../agent/context";
import {
  buildRepoMap,
  designNotes,
  routeOf,
  routesOf,
} from "../agent/repo-map";
import { type Intent, memoryCommand } from "../agent/router";
import {
  type MemoryCommandResult,
  memoryCommandReply,
  runMemoryCommand,
  writeUserWords,
} from "../agent/memory-step";
import {
  type MemoryAccess,
  memoryAccess,
  trackMemoryUse,
} from "@/server/memory";
import {
  formatDiagnostics,
  type Diagnostic,
} from "@/server/sandbox/diagnostics";
import {
  debitCredits,
  loadRestoreFiles,
  READY,
  recordAssistantError,
  saveRunResult,
} from "../agent/persist";
import {
  claimPrompt,
  isStopRequested,
  recordStoppedBeforeStart,
} from "../agent/prompt-state";
import {
  BLOCKED,
  SECRET_IN_PROMPT,
  STOPPED,
  STOPPED_NO_CHANGES,
} from "../agent/replies";
import { takeCheckpoint } from "../agent/runtime";
import { mentionsSite, uniqueSources } from "../agent/search";
import { inngest } from "../client";
import { agentRun } from "../events";
import { createPublisher } from "../publisher";

const OUT_OF_CREDITS =
  "You're out of credits. Top up on the Usage & credits page to keep building.";
const STOPPED_FOR_CREDITS =
  "I stopped early because your credits ran out. Top up to continue from here.";
const FAILED =
  "Something went wrong while building, so this run wasn't charged. Try sending your message again.";
const REPLY_BLOCKED =
  "I finished the work, but my reply didn't pass the safety check, so it isn't shown. The files are saved in this version.";

function exhausted(budget: Budget) {
  return budget.balance - creditsForCost(budget.spentUsd, creditRate) <= 0;
}

function spend(budget: Budget, run: AgentRun): Budget {
  return {
    ...budget,
    spentUsd: budget.spentUsd + run.spentUsd,
    searches: budget.searches + run.searches.length,
  };
}

function spendPhase(budget: Budget, phase: Spend): Budget {
  return { ...budget, spentUsd: budget.spentUsd + phase.spentUsd };
}

type Mode = "pipeline" | "builder" | "editor" | "answer" | "memory";

function modeFor(intent: Intent, search: boolean, resumed: boolean): Mode {
  if (resumed) return "builder";
  if (intent === "remember" || intent === "forget") return "memory";
  if (intent === "question") return "answer";
  if (intent === "create" || intent === "large-change") {
    return search ? "builder" : "pipeline";
  }
  return "editor";
}

export const EDITOR_MAX_TURNS = 8;
export const REPAIR_MAX_TURNS = 6;
const REPAIR_ROUNDS: Record<Mode, number> = {
  pipeline: 3,
  builder: 3,
  editor: 2,
  answer: 0,
  memory: 0,
};

function firstSentence(text: string) {
  const line = text.split("\n").find((entry) => entry.trim()) ?? "";
  const match = /^(.+?[.!?])(\s|$)/.exec(line.trim());
  return (match ? match[1] : line).replace(/^[-*#\s]+/, "");
}

export function pipelineSummary(plan: BuildPlan) {
  const pages = plan.pages
    .map(
      (page) =>
        `- **${page.title}** (${page.route}): ${page.sections.join(", ")}`,
    )
    .join("\n");
  return `${plan.summary}\n\n${pages}`;
}

export function routesToCheck({
  mode,
  known,
  written,
  planned,
}: {
  mode: Mode;
  known: string[];
  written: string[];
  planned: string[];
}) {
  const changed = written.flatMap((path) => {
    const found = routeOf(path);
    return found ? [found] : [];
  });
  return [
    ...new Set(
      mode === "editor"
        ? ["/", ...changed]
        : [...known, ...changed, ...planned],
    ),
  ];
}

export function pageFiles(
  routes: string[],
  written: Map<string, string>,
): PreloadedFile[] {
  const paths = routes.map((route) =>
    route === "/" ? "app/page.tsx" : `app${route}/page.tsx`,
  );
  return paths.flatMap((path) => {
    const content = written.get(path);
    return content && content.length <= 16_000 ? [{ path, content }] : [];
  });
}

export function browserPart(result: BrowserCheckResult): AgentPart {
  return {
    type: "browser",
    status: result.status,
    reason: result.reason,
    checks: result.checks.slice(-40),
    screenshots: result.screenshots,
  };
}

export function rollbackPlan({
  roundPaths,
  preRound,
  writtenBefore,
  versionFiles,
}: {
  roundPaths: string[];
  preRound: Map<string, string>;
  writtenBefore: string[];
  versionFiles: string[];
}) {
  const restore: { path: string; content: string }[] = [];
  const remove: string[] = [];
  let restorable = true;
  for (const path of new Set(roundPaths)) {
    const content = preRound.get(path);
    if (content !== undefined) restore.push({ path, content });
    else if (!versionFiles.includes(path) && !writtenBefore.includes(path))
      remove.push(path);
    else restorable = false;
  }
  return { restore, remove, restorable };
}

export function issuesNote(diagnostics: Diagnostic[]) {
  if (diagnostics.length === 0) return "";
  const shown = diagnostics.slice(0, 5);
  const more = diagnostics.length - shown.length;
  return `\n\n**Heads-up:** the automatic checks still report ${diagnostics.length} ${diagnostics.length === 1 ? "problem" : "problems"}. Ask me to fix ${diagnostics.length === 1 ? "it" : "them"}:\n${formatDiagnostics(shown)}${more > 0 ? `\n- …and ${more} more` : ""}`;
}

type GuardMeta = { input: string; output?: string };

const allowed = {
  verdict: "allow" as const,
  categories: [] as string[],
  skipped: false,
  call: null as BilledCall | null,
  usage: emptyUsage as TokenUsage,
};

export const runAgent = inngest.createFunction(
  {
    id: "run-agent",
    name: "Run the builder",
    triggers: [agentRun],
    concurrency: [
      { key: "event.data.userId", limit: 1 },
      { key: "event.data.projectId", limit: 1, scope: "env" },
    ],
    retries: 2,
    onFailure: async ({ event, error, step }) => {
      const { projectId, messageId } = event.data.event.data;
      const runId = event.data.run_id;
      const message =
        error.message === MODEL_UNAVAILABLE ? MODEL_UNAVAILABLE : FAILED;
      await step.run("record-failure", async () => {
        console.error(`[run-agent] ${runId} failed`, error);
        await recordAssistantError(db, {
          projectId,
          runId,
          message,
          replyToId: messageId,
        });
        await createPublisher(projectId)("status", { state: "error", message });
      });
    },
  },
  async ({ event, step, runId }) => {
    const { projectId, userId, messageId, resume } = event.data;
    const chainId = resume?.chainId ?? runId;

    const secretHit = await step.run("guard-input", async () => {
      if (
        !(await guardStoredPrompt(db, { userId, projectId, messageId, runId }))
      )
        return false;
      await recordAssistantError(db, {
        projectId,
        runId,
        message: SECRET_IN_PROMPT,
        replyToId: messageId,
      });
      const publish = createPublisher(projectId);
      await publish("guard", { stage: "input", verdict: "secret" });
      await publish("status", { state: "error", message: SECRET_IN_PROMPT });
      return true;
    });
    if (secretHit) return { status: "secret-in-prompt" as const };

    if (!resume) {
      const claimed = await step.run("claim", async () => {
        if (await claimPrompt(db, messageId)) return true;
        await recordStoppedBeforeStart(db, { projectId, messageId });
        await createPublisher(projectId)("status", { state: "stopped" });
        return false;
      });
      if (!claimed) return { status: "stopped-before-start" as const };
    }

    const setup = await step.run("load-project", async () => {
      const [project, trigger] = await Promise.all([
        db.project.findFirst({
          where: { id: projectId, userId },
          select: { sandboxId: true },
        }),
        db.message.findFirst({
          where: { id: messageId, projectId, role: "USER" },
          select: { createdAt: true, content: true, model: true },
        }),
      ]);
      if (!project || !trigger) {
        throw new NonRetriableError("Project or message not found.");
      }
      const [model, history, latest, { balance }] = await Promise.all([
        findAgentModel(trigger.model).then(
          async (found) => found ?? (await findAgentModel(null)),
        ),
        db.message
          .findMany({
            where: { projectId, createdAt: { lte: trigger.createdAt } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              attachments: {
                orderBy: { createdAt: "asc" },
                select: { key: true, contentType: true },
              },
            },
          })
          .then((messages) => sanitizeHistory(db, messages)),
        db.version.findFirst({
          where: { projectId, ...READY },
          orderBy: { number: "desc" },
          select: { number: true, files: true },
        }),
        getCreditBalance(db, userId),
      ]);
      if (balance > 0) {
        await createPublisher(projectId)("status", { state: "thinking" });
      }
      if (!model) {
        throw new NonRetriableError("No AI model is available.");
      }
      const files = (latest?.files ?? {}) as Record<string, string>;
      return {
        model,
        sandboxId: project.sandboxId,
        prompt: await redactPatterns(trigger.content),
        history,
        balance,
        hasVersion: latest !== null,
        files: Object.keys(files),
        repoMap: buildRepoMap(files),
        designNotes: designNotes(files),
        routes: routesOf(files),
      };
    });

    if (setup.balance <= 0) {
      await step.run("out-of-credits", async () => {
        await recordAssistantError(db, {
          projectId,
          runId,
          message: OUT_OF_CREDITS,
          replyToId: messageId,
        });
        await createPublisher(projectId)("status", {
          state: "error",
          message: OUT_OF_CREDITS,
        });
      });
      return { status: "out-of-credits" as const };
    }

    const model = setup.model;
    const guardStep = resume
      ? Promise.resolve(allowed)
      : step.run("guard-classify", async () => {
          const arcjetPi = await detectAgentPromptInjection(setup.prompt).catch(
            (error: unknown) => {
              console.warn(
                "[run-agent] arcjet prompt-injection guard failed",
                error,
              );
              return { blocked: false, skipped: true };
            },
          );
          if (arcjetPi.blocked) {
            return {
              verdict: "block" as const,
              categories: ["prompt-injection"],
              skipped: false,
              call: null as BilledCall | null,
              usage: emptyUsage as TokenUsage,
            };
          }
          try {
            const result = await classifyText(setup.prompt, "input");
            return {
              verdict: result.verdict,
              categories: result.categories,
              skipped: false,
              call: result.call as BilledCall | null,
              usage: result.usage,
            };
          } catch (error) {
            console.warn("[run-agent] guard classifier failed", error);
            return { ...allowed, skipped: true };
          }
        });

    const command = resume ? null : memoryCommand(setup.prompt);
    const sandboxStep = command
      ? Promise.resolve({
          sandboxId: setup.sandboxId ?? "",
          previewUrl: "",
          task: {
            kind: "note",
            label:
              command === "remember"
                ? "Saving to memory"
                : "Looking through memory",
          } as TaskItem,
          ms: 0,
        })
      : step.run("sandbox", async () => {
          const started = Date.now();
          const result = await getOrCreateSandbox(
            setup.sandboxId,
            () =>
              loadRestoreFiles(db, {
                projectId,
                chainId: resume ? chainId : null,
              }),
            (outcome) => recordSandboxEvent(db, projectId, outcome),
          ).catch(async (error: unknown) => {
            await recordSandboxEvent(db, projectId, "FAILED");
            throw error;
          });
          await ensureDevOrigins(result.sandbox);
          await ensureAgentInstructions(result.sandbox);
          const previewUrl = previewUrlFor(result.sandbox);
          await db.project.update({
            where: { id: projectId },
            data: { sandboxId: result.sandbox.sandboxId, previewUrl },
          });
          const label = !result.created
            ? "Connected to the project sandbox"
            : result.restored > 0
              ? `Restored ${result.restored} files into a new sandbox`
              : "Created sandbox from the Next.js template";
          const task: TaskItem = { kind: "sandbox", label };
          await createPublisher(projectId)("task", task);
          return {
            sandboxId: result.sandbox.sandboxId,
            previewUrl,
            task,
            ms: Date.now() - started,
          };
        });

    const routeStep = resume
      ? Promise.resolve(null)
      : routeRequest({
          step,
          projectId,
          userId,
          model,
          forced: command ?? undefined,
          prompt: setup.prompt,
          hasVersion: setup.hasVersion,
          repoMap: setup.repoMap,
          paths: setup.files,
        });

    const [guard, sandbox, route] = await Promise.all([
      guardStep,
      sandboxStep,
      routeStep,
    ]);

    if (guard.verdict === "block") {
      await step.run("guard-blocked", async () => {
        await recordGuardEvent(db, {
          userId,
          projectId,
          runId,
          stage: "input",
          verdict: "block",
          categories: guard.categories,
          text: setup.prompt,
        });
        await recordAssistantError(db, {
          projectId,
          runId,
          message: BLOCKED,
          replyToId: messageId,
        });
        const publish = createPublisher(projectId);
        await publish("guard", { stage: "input", verdict: "block" });
        await publish("status", { state: "error", message: BLOCKED });
      });
      return { status: "blocked" as const, categories: guard.categories };
    }

    const restricted = resume
      ? (resume.handoff?.restricted ?? false)
      : guard.verdict === "review";
    if (restricted && !resume) {
      await step.run("guard-review", async () => {
        await recordGuardEvent(db, {
          userId,
          projectId,
          runId,
          stage: "input",
          verdict: "review",
          categories: guard.categories,
          text: setup.prompt,
        });
        await createPublisher(projectId)("guard", {
          stage: "input",
          verdict: "review",
        });
      });
    }
    const guardMeta: GuardMeta = {
      input: guard.skipped ? "skipped" : restricted ? "review" : guard.verdict,
    };
    const search = !restricted && mentionsSite(setup.prompt);
    const intent: Intent = route?.intent ?? "large-change";
    let mode = modeFor(intent, search, Boolean(resume));
    const timings: Record<string, number> = { sandbox: sandbox.ms };
    if (route) timings.route = route.ms;

    const runContext = createRunContext({
      runId,
      chainId,
      userId,
      messageId,
      restricted,
      sandboxId: sandbox.sandboxId,
      previewUrl: sandbox.previewUrl,
    });

    let usage = guard.usage;
    const calls: BilledCall[] = guard.call ? [guard.call] : [];
    let phases: Spend = route?.spend ?? noSpend;
    let budget: Budget = {
      balance: setup.balance,
      spentUsd:
        calls.reduce((sum, call) => sum + call.estimatedUsd, 0) +
        phases.spentUsd,
      searches: resume?.handoff?.searches ?? 0,
    };
    const runs: AgentRun[] = [];
    const shouldStop = () => isStopRequested(db, messageId);
    const loopArgs = {
      step,
      projectId,
      run: runContext,
      model,
      shouldStop,
    };

    const handoffNote: ModelMessage[] = resume?.handoff
      ? [
          {
            role: "user",
            content: `(Continuing this request in a fresh run: the previous run used up its room and handed over to you. The project files are exactly as it left them. Its handoff note:\n<handoff>\n${resume.handoff.note}\n</handoff>\nFiles changed so far: ${resume.handoff.written.join(", ") || "none"}.\nPick up from there and finish the whole request, then reply with the task_summary for the whole request.)`,
          },
        ]
      : [];
    const context = buildContext({
      intent,
      designNotes: setup.designNotes,
      repoMap: setup.repoMap,
      preloaded: route?.preloaded ?? [],
      memory: route?.memory.block ?? "",
    });
    const messages = [
      ...historyToMessages(setup.history, context, {
        vision: model.vision,
      }),
      ...handoffNote,
    ];

    let summary: string | null = null;
    let outOfCredits = exhausted(budget);
    let stopped = false;
    let written: string[] = resume?.handoff?.written ?? [];
    let handoff: string | null = null;
    let plan: BuildPlan | null = null;
    let answer: string | null = null;
    const taskLog: TaskItem[] = [];
    let diagnostics: Diagnostic[] = [];
    let browserResult: BrowserCheckResult | null = null;

    let memoryResult: MemoryCommandResult | null = null;
    if (mode === "memory" && (intent === "remember" || intent === "forget")) {
      memoryResult = await step.run("memory-command", async () => {
        const result = await runMemoryCommand({
          access: await memoryAccess(db, userId).catch((): MemoryAccess => ({
            enabled: false,
            reason: "memory is unavailable",
          })),
          action: intent,
          prompt: setup.prompt,
          projectId,
          runId,
        });
        if (Object.keys(result.use).length > 0) {
          await trackMemoryUse(db, result.use);
        }
        return result;
      });
      answer = memoryCommandReply(memoryResult);
    }

    if (!outOfCredits && mode === "answer") {
      const answered = await answerQuestion({
        step,
        projectId,
        model,
        messages,
        shouldStop,
      });
      phases = addSpend(phases, answered.spend);
      timings.answer = answered.ms;
      answer = answered.text;
      stopped = answered.stopped === true;
    }

    if (!outOfCredits && mode === "pipeline") {
      const planned = await makePlan({
        step,
        projectId,
        model,
        messages,
        shouldStop,
      });
      phases = addSpend(phases, planned.spend);
      budget = spendPhase(budget, planned.spend);
      timings.plan = planned.ms;
      plan = planned.plan;
      stopped = planned.stopped === true;
      const projectName = plan ? cleanProjectName(plan.projectName) : null;
      if (projectName && !setup.hasVersion) {
        await step.run("name-project", async () => {
          await db.project.updateMany({
            where: { id: projectId, userId },
            data: { name: projectName },
          });
        });
      }
      if (stopped) {
        plan = null;
      } else if (!plan) {
        mode = "builder";
      } else if (!exhausted(budget)) {
        const generated = await generateFromPlan({
          step,
          projectId,
          run: runContext,
          model,
          plan,
          request: setup.prompt,
          designNotes: setup.designNotes,
          budget,
          shouldStop,
        });
        phases = addSpend(phases, generated.spend);
        budget = spendPhase(budget, generated.spend);
        timings.generate = generated.ms;
        taskLog.push(...generated.tasks);
        written = [
          ...new Set([...written, ...generated.files.map((file) => file.path)]),
        ];
        stopped = generated.stopped;
        outOfCredits = generated.outOfCredits || exhausted(budget);
        summary = pipelineSummary(plan);
      } else {
        outOfCredits = true;
      }
    }

    if (!outOfCredits && (mode === "builder" || mode === "editor")) {
      const editing = mode === "editor";
      const build = await runAgentLoop({
        ...loopArgs,
        spec: builderSpec({ search, name: editing ? "editor" : "builder" }),
        messages,
        budget,
        expectWrites: !resume,
        written,
        maxTurns: editing ? EDITOR_MAX_TURNS : undefined,
        progress: resume?.handoff
          ? { installs: resume.handoff.installs }
          : undefined,
      });
      runs.push(build);
      taskLog.push(...build.tasks);
      budget = spend(budget, build);
      outOfCredits = build.outOfCredits;
      stopped = build.stopped;
      written = build.written;
      handoff = build.handoff;
      summary = build.output;
      timings[mode] = build.modelMs + build.toolMs;
    }

    const rounds = REPAIR_ROUNDS[mode];
    if (
      rounds > 0 &&
      !handoff &&
      !stopped &&
      !outOfCredits &&
      written.length > 0
    ) {
      const routes = routesToCheck({
        mode,
        known: setup.routes,
        written,
        planned: plan?.pages.map((page) => page.route) ?? [],
      });
      let previous: number | null = null;
      let previousProblems: Diagnostic[] = [];
      let preRound: Map<string, string> | null = null;
      let writtenBefore: string[] = [];
      timings.verify = 0;
      timings.repair = 0;
      for (let round = 0; ; round++) {
        const check = await checkProject({
          step,
          stepId: `verify-${round}`,
          projectId,
          run: runContext,
          routes,
          changed: written,
        });
        timings.verify += check.ms;
        taskLog.push(...check.tasks);
        let problems = check.diagnostics;
        let affected = check.affected;
        let screenshots: { label: string; key: string }[] = [];

        if (problems.length === 0 && runContext.sandbox.previewUrl) {
          const browsed = await runBrowserCheck({
            step,
            stepId: `browse-${round}`,
            projectId,
            runId,
            round,
            previewUrl: runContext.sandbox.previewUrl,
            model,
            routes,
            interactions: plan?.checks ?? [],
            shouldStop,
            canSpend: (calls) =>
              !exhausted(
                spendPhase(
                  budget,
                  calls.reduce<Spend>(
                    (total, call) =>
                      addSpend(total, spendOf(call, "browser", model)),
                    noSpend,
                  ),
                ),
              ),
          });
          timings.browse = (timings.browse ?? 0) + browsed.ms;
          taskLog.push(browsed.task);
          const browserSpend = browsed.calls.reduce<Spend>(
            (total, call) => addSpend(total, spendOf(call, "browser", model)),
            noSpend,
          );
          phases = addSpend(phases, browserSpend);
          budget = spendPhase(budget, browserSpend);
          browserResult = browsed;
          problems = browsed.diagnostics;
          affected = pageFiles(routes, runContext.pendingWrites);
          screenshots = model.vision
            ? browsed.screenshots.map((shot) => ({
                label:
                  shot.viewport === "phone"
                    ? "home page at phone width"
                    : "home page at desktop width",
                key: shot.key,
              }))
            : [];
        }
        diagnostics = problems;

        if (previous !== null && preRound && problems.length > previous) {
          const undo = rollbackPlan({
            roundPaths: (runs.at(-1)?.tasks ?? []).flatMap((item) =>
              item.kind === "file" && item.verb !== "deleted"
                ? [item.path]
                : [],
            ),
            preRound,
            writtenBefore,
            versionFiles: setup.files,
          });
          const { restore, remove, restorable } = undo;
          if (restorable && (restore.length > 0 || remove.length > 0)) {
            taskLog.push(
              await rollback({
                step,
                stepId: `repair-rollback-${round}`,
                projectId,
                run: runContext,
                restore,
                remove,
              }),
            );
            written = written.filter((path) => !remove.includes(path));
            diagnostics = previousProblems;
          }
          break;
        }
        if (problems.length === 0) break;
        if (previous !== null && problems.length >= previous) break;
        if (round >= rounds || exhausted(budget)) break;

        preRound = new Map(runContext.pendingWrites);
        for (const file of affected) {
          if (!preRound.has(file.path)) preRound.set(file.path, file.content);
        }
        writtenBefore = [...written];
        const repair = await runAgentLoop({
          ...loopArgs,
          spec: builderSpec({ search: false, name: "repair" }),
          stepPrefix: `repair-${round}`,
          messages: [
            repairMessage({
              request: setup.prompt,
              diagnostics: problems,
              affected,
              designNotes: setup.designNotes,
              repoMap: setup.repoMap,
              screenshots,
            }),
          ],
          budget,
          written,
          maxTurns: REPAIR_MAX_TURNS,
        });
        runs.push(repair);
        taskLog.push(...repair.tasks);
        budget = spend(budget, repair);
        written = repair.written;
        timings.repair += repair.modelMs + repair.toolMs;
        previous = problems.length;
        previousProblems = problems;
        if (repair.stopped || repair.outOfCredits || repair.handoff) {
          stopped = repair.stopped;
          outOfCredits = repair.outOfCredits;
          break;
        }
      }
    }

    if (!handoff && !outOfCredits && written.length > 0) {
      const hits = await step.run("secret-scan", async () => {
        const { sandbox: box } = await connectOrRecover(
          runContext.sandbox,
          () =>
            recoverSandbox({
              projectId,
              chainId,
              replay: [...runContext.pendingWrites].map(([path, content]) => ({
                path,
                content,
              })),
            }),
        );
        return scanFiles(await snapshotSandbox(box));
      });
      if (hits.length > 0 && !stopped && !exhausted(budget)) {
        const scanFix = await runAgentLoop({
          ...loopArgs,
          spec: builderSpec({ search: false, name: "repair" }),
          messages: [
            ...messages,
            { role: "user", content: scanFixPrompt(hits) },
          ],
          budget,
          stepPrefix: "builder-scan-fix",
          written,
        });
        runs.push(scanFix);
        taskLog.push(...scanFix.tasks);
        budget = spend(budget, scanFix);
        outOfCredits = scanFix.outOfCredits;
        stopped = scanFix.stopped;
        written = scanFix.written;
        handoff = scanFix.handoff;
        if (scanFix.finished && scanFix.output && !plan)
          summary = scanFix.output;
      }
    }

    usage = addUsage(usage, phases.usage);
    calls.push(...phases.calls);
    for (const run of runs) {
      usage = addUsage(usage, run.usage);
      calls.push(...run.calls);
    }

    const reasoning = runs.flatMap((run) => run.reasoning);
    const reasoningMs = runs.reduce((sum, run) => sum + run.reasoningMs, 0);
    const sources = uniqueSources(runs.flatMap((run) => run.searches));
    const reasoningParts: AgentPart[] =
      reasoning.length > 0
        ? [
            {
              type: "reasoning",
              text: reasoning.join("\n\n"),
              durationMs: reasoningMs,
            },
          ]
        : [];
    const toolParts = runs.flatMap((run) => run.toolParts);
    const sourceParts: AgentPart[] =
      sources.length > 0 ? [{ type: "sources", sources }] : [];

    if (handoff) {
      const note = handoff;
      const progress = runs.at(-1)?.progress ?? {};
      const checkpointSaved = await step.run("handoff-checkpoint", () =>
        takeCheckpoint({ projectId, run: runContext }),
      );
      if (!checkpointSaved) {
        throw new NonRetriableError(
          "Couldn't save a safe checkpoint, so this request wasn't continued.",
        );
      }
      const cost = await step.run("cost", () =>
        resolveRunCost(calls, lookupGenerationCost),
      );
      const credits = creditsForCost(cost.costUsd, creditRate);
      await step.run("meter", async () => {
        await debitCredits(db, {
          userId,
          projectId,
          runId,
          credits,
          firstVersion: !setup.hasVersion,
          usage,
          model: model.id,
          cost,
          versionNumber: null,
          handoff: true,
          guard: guardMeta,
          run: { intent, timings },
        });
        const publish = createPublisher(projectId);
        await publish("credits", { used: credits });
        await publish("status", { state: "thinking" });
      });
      await step.sendEvent(
        "continue",
        agentRun.create({
          projectId,
          userId,
          messageId,
          resume: {
            chainId,
            handoff: {
              note: note.slice(0, 8000),
              written: written.slice(0, 400),
              installs: progress.installs ?? 0,
              searches: budget.searches,
              restricted,
            },
          },
        }),
      );
      return {
        status: "continued" as const,
        credits,
        filesChanged: written.length,
      };
    }

    const notes = summary ? stripSummaryTags(summary) : null;
    const answered = mode === "answer" || mode === "memory";
    const saveVersion = !answered && (!stopped || written.length > 0);
    const rawReply =
      answered && !stopped
        ? (answer ?? "")
        : stopped
          ? saveVersion
            ? STOPPED
            : STOPPED_NO_CHANGES
          : outOfCredits
            ? [notes, STOPPED_FOR_CREDITS].filter(Boolean).join("\n\n")
            : `${notes ?? ""}${issuesNote(diagnostics)}`;

    const reviewed = await step.run("guard-output", async () => {
      const text = await redactPatterns(rawReply);
      if (!text.trim() || stopped) {
        return {
          text,
          verdict: "allow",
          call: null as BilledCall | null,
          usage: emptyUsage as TokenUsage,
        };
      }
      try {
        const result = await classifyText(text, "output");
        if (result.verdict === "block") {
          await recordGuardEvent(db, {
            userId,
            projectId,
            runId,
            stage: "output",
            verdict: "block",
            categories: result.categories,
            text,
          });
          await createPublisher(projectId)("guard", {
            stage: "output",
            verdict: "block",
          });
        }
        return {
          text: result.verdict === "block" ? REPLY_BLOCKED : text,
          verdict: result.verdict as string,
          call: result.call as BilledCall | null,
          usage: result.usage,
        };
      } catch (error) {
        console.warn("[run-agent] output classifier failed", error);
        return {
          text,
          verdict: "skipped",
          call: null as BilledCall | null,
          usage: emptyUsage as TokenUsage,
        };
      }
    });
    guardMeta.output = reviewed.verdict;
    usage = addUsage(usage, reviewed.usage);
    if (reviewed.call) calls.push(reviewed.call);
    const replyText = reviewed.text;

    const fallbackTitle =
      mode === "memory"
        ? "Memory"
        : answered
          ? "Answered a question"
          : setup.hasVersion
            ? "Updated the site"
            : "First version";
    const title =
      outOfCredits || stopped
        ? fallbackTitle
        : (plan?.title ??
          cleanTitle(firstSentence(notes ?? ""), fallbackTitle));

    const cost = await step.run("cost", () =>
      resolveRunCost(calls, lookupGenerationCost),
    );
    const credits = creditsForCost(cost.costUsd, creditRate);

    const parts: AgentPart[] = [
      ...reasoningParts,
      {
        type: "task",
        title,
        items: [sandbox.task, ...taskLog],
      },
      ...toolParts,
      ...sourceParts,
      ...(restricted
        ? [{ type: "guard", stage: "input", verdict: "review" } as const]
        : []),
      ...(browserResult ? [browserPart(browserResult)] : []),
      ...(memoryResult
        ? [
            {
              type: "memory",
              action: memoryResult.action,
              status: memoryResult.status,
              text: memoryResult.text,
              reason: memoryResult.reason,
              matches: memoryResult.matches,
            } as const,
          ]
        : []),
      { type: "text", text: replyText },
      ...(stopped ? [{ type: "stopped" } as const] : []),
    ];

    const saved = await step.run("persist", async () => {
      const started = Date.now();
      const publish = createPublisher(projectId, patternRedactor);
      await publish("status", { state: "compiling" });
      const connected = saveVersion
        ? await connectOrRecover(runContext.sandbox, () =>
            recoverSandbox({
              projectId,
              chainId,
              replay: [...runContext.pendingWrites].map(([path, content]) => ({
                path,
                content,
              })),
            }),
          )
        : null;
      const box = connected?.sandbox ?? null;
      const recovered = connected?.recovered ?? null;
      if (box) {
        await ensureDevOrigins(box);
        await box.commands
          .run(
            `curl -s -o /dev/null --max-time 90 http://localhost:${PREVIEW_PORT}/`,
            { cwd: APP_DIR, timeoutMs: 100_000 },
          )
          .catch(() => null);
      }
      const files = box ? await snapshotSandbox(box) : {};
      const hits = await scanFiles(files);
      if (hits.length > 0) {
        await recordGuardEvent(db, {
          userId,
          projectId,
          runId,
          stage: "save",
          verdict: "block",
          categories: ["secret"],
          text: hits.map((hit) => hit.path).join("\n"),
        });
        throw new NonRetriableError(
          `The project still contains secret values (${hits.map((hit) => hit.path).join(", ")}), so it wasn't saved.`,
        );
      }
      const previewUrl = recovered?.previewUrl ?? runContext.sandbox.previewUrl;
      const result = await saveRunResult(db, {
        projectId,
        runId,
        title,
        content: replyText,
        parts: patternRedactor.redactDeep(parts),
        files,
        creditCost: credits,
        previewUrl,
        chainId,
        replyToId: messageId,
        saveVersion,
      });
      return {
        ...result,
        previewUrl,
        fileCount: Object.keys(files).length,
        ms: Date.now() - started,
      };
    });
    timings.persist = saved.ms;
    if (route) timings.memory = route.memory.ms;

    const memoryWrite =
      mode === "pipeline" || mode === "builder" || mode === "editor"
        ? !stopped && !outOfCredits && !restricted && !resume
          ? await step.run("remember", async () => {
              const access = await memoryAccess(db, userId).catch(
                (): MemoryAccess => ({
                  enabled: false,
                  reason: "memory is unavailable",
                }),
              );
              const result = await writeUserWords({
                access,
                projectId,
                runId,
                prompt: setup.prompt,
              });
              if (Object.keys(result.use).length > 0) {
                await trackMemoryUse(db, result.use);
              }
              return result;
            })
          : null
        : null;

    await step.run("meter", async () => {
      await debitCredits(db, {
        userId,
        projectId,
        runId,
        credits,
        firstVersion: !setup.hasVersion,
        usage,
        model: model.id,
        cost,
        versionNumber: saved.versionNumber,
        guard: guardMeta,
        run: {
          intent,
          timings,
          issues: diagnostics.length,
          memory: {
            read: route?.memory.status ?? "off",
            reads: route?.memory.reads ?? 0,
            write:
              memoryWrite?.status ??
              (memoryResult ? memoryResult.status : "off"),
          },
        },
      });
      const publish = createPublisher(projectId);
      await publish("credits", { used: credits });
      if (saved.previewUrl) {
        await publish("preview", { url: saved.previewUrl });
      }
      await publish("status", { state: stopped ? "stopped" : "done" });
    });

    return {
      status: stopped
        ? ("stopped" as const)
        : outOfCredits
          ? ("stopped-for-credits" as const)
          : ("done" as const),
      intent,
      mode,
      search,
      guard: guardMeta,
      version: saved.versionNumber,
      files: saved.fileCount,
      filesChanged: written.length,
      issues: diagnostics.length,
      timings,
      credits,
      costUsd: cost.costUsd,
      agentCosts: cost.agents,
      model: model.id,
      previewUrl: saved.previewUrl,
    };
  },
);
