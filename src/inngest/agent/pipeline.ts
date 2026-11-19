import "server-only";
import type { ModelMessage } from "ai";
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
import type { Diagnostic } from "@/server/sandbox/diagnostics";
import { APP_DIR } from "@/server/sandbox/guards";
import { connectOrRecover, recoverSandbox } from "@/server/sandbox/recover";
import type { inngest } from "../client";
import { createPublisher } from "../publisher";
import { checkLabel, pageRoutes, runChecks, sourceSnapshot } from "./checks";
import { preloadFiles, type PreloadedFile } from "./context";
import type { RunProgress, WrittenFile } from "./execute-tool";
import { patternRedactor } from "./guardrails/redact";
import { type AgentRun, type Budget, failModelTurn } from "./loop";
import { generatePlainText, generateStructured, type ModelCall } from "./model";
import { StopRequested, withStopWatch } from "./stop-watch";
import { QUESTION_PROMPT, ROUTER_PROMPT } from "./prompts/pipeline";
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

function toolBase(written: string[], progress: RunProgress) {
  return {
    writtenPaths: written,
    tools: ["createOrUpdateFiles", "terminal"],
    progress,
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

export type CheckResult = {
  diagnostics: Diagnostic[];
  routes: string[];
  fixed: WrittenFile[];
  files: Record<string, string> | null;
  tasks: TaskItem[];
  ms: number;
};

export async function checkProject({
  step,
  stepId,
  projectId,
  run,
  changed,
  snapshot = false,
}: {
  step: Step;
  stepId: string;
  projectId: string;
  run: RunContext;
  changed: string[];
  snapshot?: boolean;
}): Promise<CheckResult> {
  const result = await step.run(stepId, async () => {
    const started = Date.now();
    const publish = createPublisher(projectId, patternRedactor);
    const { sandbox, recovered } = await connect(projectId, run);
    const tasks: TaskItem[] = [];
    const checked = await runChecks(sandbox, {
      changed,
      routes: await pageRoutes(sandbox),
      install: async (packages) => {
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
      },
    });
    const task: TaskItem = {
      kind: "note",
      label: checkLabel(checked.diagnostics),
    };
    await publish("task", task);
    tasks.push(task);
    return {
      diagnostics: checked.diagnostics,
      routes: checked.routes,
      fixed: checked.fixed,
      files: snapshot ? await sourceSnapshot(sandbox, changed) : null,
      tasks,
      sandbox: recovered,
      ms: Date.now() - started,
    };
  });
  if (result.sandbox) run.sandbox = result.sandbox;
  rememberWrites(run, result.fixed);
  return result;
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
      label: "Restored the earlier state, which had fewer blocking problems",
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
