import "server-only";
import type { ModelMessage, ToolResultPart } from "ai";
import { type GetStepTools, NonRetriableError, RetryAfterError } from "inngest";
import type { AgentPart, TaskItem } from "@/lib/agent/parts";
import type { AgentModel } from "@/lib/ai/models";
import { creditRate } from "@/server/billing/credit-rate";
import {
  addUsage,
  creditsForCost,
  emptyUsage,
  type TokenUsage,
} from "@/server/billing/pricing";
import { type BilledCall, estimateCallUsd } from "@/server/billing/run-cost";
import type { inngest } from "../client";
import { createPublisher } from "../publisher";
import type { AgentSpec } from "./agents/types";
import { compactHistory, toolCallsFrom } from "./conversation";
import type { SkillProgress } from "./execute-tool";
import { patternRedactor } from "./guardrails/redact";
import { runModelTurn } from "./model";
import {
  replayOf,
  type RunContext,
  runToolStep,
  takeCheckpoint,
} from "./runtime";
import { classifyModelError, MODEL_UNAVAILABLE } from "./model-errors";
import { type InstalledSkill, allowedInstalled, skillIndex } from "./skills";
import { MAX_SEARCHES_PER_RUN, SEARCH_TOOL, type SearchRecord } from "./search";

type Step = GetStepTools<typeof inngest>;

export const OUTPUT_LIMIT_NOTE =
  "(Your previous reply hit the output limit and was discarded. Take smaller steps: write at most a few files per createOrUpdateFiles call and keep replies short.)";
const SEARCH_CAP_NOTE = `(You have used all ${MAX_SEARCHES_PER_RUN} web searches for this request. Carry on with what you found.)`;
export const NO_WRITES_NOTE =
  "(You haven't written any files yet, so nothing has changed: the project is exactly as before. If the request needs code changes, make them now with createOrUpdateFiles, check the page compiles, then reply with the summary. If it truly needs no change, say so in the summary.)";

export const HANDOFF_NOTE =
  "(This run has used most of its room, so a fresh run takes over from here with the same files. Don't call any tools. Reply now with a short handoff note for yourself: what is done, what is left to do, in order, and anything you learned that matters (commands that failed, decisions you made). Don't write the task_summary yet.)";

export const CHECKPOINT_EVERY_TURNS = 5;
export const RUN_STEP_BUDGET = 850;
export const RUN_STATE_BUDGET_BYTES = 24 * 1024 * 1024;

export function nearRunBudget(run: Pick<RunContext, "steps" | "stateBytes">) {
  return (
    run.steps >= RUN_STEP_BUDGET || run.stateBytes >= RUN_STATE_BUDGET_BYTES
  );
}

function trackSteps(step: Step, run: RunContext): Step {
  const count = (value: unknown) => {
    run.steps += 1;
    run.stateBytes +=
      value === undefined || value === null ? 0 : JSON.stringify(value).length;
    return value;
  };
  return {
    ...step,
    run: (async (id: string, fn: () => unknown) =>
      count(await step.run(id, fn))) as unknown as Step["run"],
  };
}

export type Budget = { balance: number; spentUsd: number; searches: number };

export type AgentRun = {
  output: string | null;
  finished: boolean;
  outOfCredits: boolean;
  stopped: boolean;
  messages: ModelMessage[];
  usage: TokenUsage;
  calls: BilledCall[];
  tasks: TaskItem[];
  toolParts: AgentPart[];
  reasoning: string[];
  reasoningMs: number;
  written: string[];
  searches: SearchRecord[];
  progress: SkillProgress;
  spentUsd: number;
  handoff: string | null;
};

export function createRunContext(
  input: Partial<RunContext> & { sandboxId: string; previewUrl?: string },
): RunContext {
  return {
    runId: input.runId ?? "local",
    chainId: input.chainId ?? input.runId ?? "local",
    userId: input.userId ?? "",
    messageId: input.messageId ?? "",
    restricted: input.restricted ?? false,
    sandbox: input.sandbox ?? {
      id: input.sandboxId,
      previewUrl: input.previewUrl ?? "",
    },
    pendingWrites: input.pendingWrites ?? new Map(),
    steps: input.steps ?? 0,
    stateBytes: input.stateBytes ?? 0,
  };
}

function writtenContents(input: unknown) {
  const files = (input as { files?: unknown })?.files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((file: { path?: unknown; content?: unknown }) =>
    typeof file?.path === "string" && typeof file?.content === "string"
      ? [
          {
            path: file.path.trim().replace(/^\.\/+/, ""),
            content: file.content,
          },
        ]
      : [],
  );
}

export function failModelTurn(error: unknown): never {
  const failure = classifyModelError(error);
  if (failure.kind === "rate-limit") {
    throw new RetryAfterError(
      "The AI model is rate limited.",
      `${failure.retryAfterSeconds}s`,
      { cause: error },
    );
  }
  if (failure.kind === "unavailable") {
    throw new NonRetriableError(MODEL_UNAVAILABLE, { cause: error });
  }
  if (failure.kind === "invalid") {
    throw new NonRetriableError("The model rejected the request.", {
      cause: error,
    });
  }
  throw error;
}

export async function runAgentLoop({
  step: rawStep,
  spec,
  projectId,
  sandboxId,
  run: givenRun,
  model,
  messages: initialMessages,
  installedSkills,
  budget,
  stepPrefix = spec.name,
  written: initialWritten = [],
  progress: initialProgress = { readAgentsMd: false, loadedSkills: [] },
  expectWrites = false,
  shouldStop,
}: {
  step: Step;
  spec: AgentSpec;
  projectId: string;
  sandboxId?: string;
  run?: RunContext;
  model: AgentModel;
  messages: ModelMessage[];
  installedSkills: InstalledSkill[];
  budget: Budget;
  stepPrefix?: string;
  written?: string[];
  progress?: SkillProgress;
  expectWrites?: boolean;
  shouldStop?: () => Promise<boolean>;
}): Promise<AgentRun> {
  const instructions = spec.instructions(
    skillIndex(installedSkills, spec.skills),
  );
  const toolNames = Object.keys(spec.tools);
  const skills = {
    allowed: [...spec.skills],
    installed: allowedInstalled(installedSkills, spec.skills).map(
      (skill) => skill.name,
    ),
  };
  let messages = initialMessages;
  let usage = emptyUsage;
  let spentUsd = 0;
  let searchCount = budget.searches;
  let capNoted = false;
  let writesNudged = false;
  let progress = initialProgress;
  const calls: BilledCall[] = [];
  const written = new Set(initialWritten);
  const tasks: TaskItem[] = [];
  const toolParts: AgentPart[] = [];
  const reasoning: string[] = [];
  const searches: SearchRecord[] = [];
  let reasoningMs = 0;
  let output: string | null = null;
  let finished = false;
  let outOfCredits = false;
  let stopped = false;
  let handoff: string | null = null;
  const run = givenRun ?? createRunContext({ sandboxId: sandboxId ?? "" });
  const step = trackSteps(rawStep, run);

  for (let turn = 0; ; turn++) {
    if (
      shouldStop &&
      (await step.run(`${stepPrefix}-stop-${turn}`, () => shouldStop()))
    ) {
      stopped = true;
      break;
    }
    if (
      turn > 0 &&
      turn % CHECKPOINT_EVERY_TURNS === 0 &&
      run.pendingWrites.size > 0
    ) {
      const saved = await step.run(`${stepPrefix}-checkpoint-${turn}`, () =>
        takeCheckpoint({ projectId, run }),
      );
      if (saved) run.pendingWrites.clear();
    }
    const usdBefore = budget.spentUsd + spentUsd;
    const searchesLeft = searchCount < MAX_SEARCHES_PER_RUN;
    if (!searchesLeft && toolNames.includes(SEARCH_TOOL) && !capNoted) {
      capNoted = true;
      messages = [...messages, { role: "user", content: SEARCH_CAP_NOTE }];
    }
    const handingOff = turn > 0 && nearRunBudget(run);
    if (handingOff) {
      messages = [...messages, { role: "user", content: HANDOFF_NOTE }];
    }
    const activeTools = searchesLeft
      ? undefined
      : toolNames.filter((name) => name !== SEARCH_TOOL);

    const modelStep = handingOff
      ? `${stepPrefix}-handoff-${turn}`
      : `${stepPrefix}-model-${turn}`;
    const result = await step.run(modelStep, async () => {
      const publish = createPublisher(projectId, patternRedactor);
      if (turn > 0) await publish("status", { state: "thinking" });
      const turnOutput = await runModelTurn({
        messages: compactHistory(messages),
        turn,
        model,
        publish,
        instructions,
        tools: spec.tools,
        activeTools,
        toolChoice: handingOff ? "none" : undefined,
      }).catch(failModelTurn);
      await publish("credits", {
        used: creditsForCost(
          usdBefore +
            estimateCallUsd({
              generationIds: [],
              estimatedUsd: turnOutput.estimatedUsd,
              searches: turnOutput.searches.length,
            }),
          creditRate,
        ),
      });
      return turnOutput;
    });

    const call: BilledCall = {
      generationIds: result.generationIds,
      estimatedUsd: result.estimatedUsd,
      agent: "builder",
      model: model.id,
      searches: result.searches.length,
    };
    calls.push(call);
    usage = addUsage(usage, result.usage);
    spentUsd += estimateCallUsd(call);
    searchCount += result.searches.length;
    searches.push(...result.searches);

    if (handingOff) {
      messages = [
        ...messages,
        ...(result.messages as ModelMessage[]).filter(
          (message) => message.role === "assistant",
        ),
      ];
      handoff = result.text.trim() || "No handoff note was written.";
      break;
    }

    if (result.finishReason === "length") {
      messages = [...messages, { role: "user", content: OUTPUT_LIMIT_NOTE }];
      continue;
    }
    const turnMessages = result.messages as ModelMessage[];
    const toolCalls = toolCallsFrom(turnMessages);
    messages = [...messages, ...turnMessages];
    if (result.reasoning.trim()) reasoning.push(result.reasoning.trim());
    reasoningMs += result.reasoningMs;

    if (toolCalls.length === 0) {
      output = spec.output(result.text);
      if (expectWrites && written.size === 0 && !writesNudged) {
        writesNudged = true;
        output = null;
        messages = [...messages, { role: "user", content: NO_WRITES_NOTE }];
        continue;
      }
      output ??= result.text.trim() || null;
      finished = output !== null;
      break;
    }

    const toolResults: ToolResultPart[] = [];
    for (const [index, toolCall] of toolCalls.entries()) {
      const base = {
        writtenPaths: [...written],
        tools: toolNames,
        skills,
        progress,
      };
      const replay = replayOf(run);
      const outcome = await step.run(
        `${stepPrefix}-tool-${turn}-${index}`,
        () => runToolStep({ call: toolCall, projectId, run, base, replay }),
      );
      if (outcome.sandbox) run.sandbox = outcome.sandbox;

      progress = outcome.progress;
      for (const path of outcome.writtenPaths) written.add(path);
      if (toolCall.toolName === "createOrUpdateFiles") {
        const changed = new Set(outcome.writtenPaths);
        for (const file of writtenContents(toolCall.input)) {
          if (changed.has(file.path))
            run.pendingWrites.set(file.path, file.content);
        }
      }
      tasks.push(...outcome.tasks);
      if (outcome.terminal) {
        toolParts.push({
          type: "tool",
          callId: toolCall.toolCallId,
          name: toolCall.toolName,
          ...outcome.terminal,
        });
      }
      toolResults.push({
        type: "tool-result",
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        output: { type: "text", value: outcome.output },
      });
    }
    messages = [...messages, { role: "tool", content: toolResults }];

    if (
      budget.balance - creditsForCost(budget.spentUsd + spentUsd, creditRate) <=
      0
    ) {
      outOfCredits = true;
      break;
    }
  }

  return {
    output,
    finished,
    outOfCredits,
    stopped,
    messages,
    usage,
    calls,
    tasks,
    toolParts,
    reasoning,
    reasoningMs,
    written: [...written],
    searches,
    progress,
    spentUsd,
    handoff,
  };
}
