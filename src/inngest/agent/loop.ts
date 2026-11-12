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
import {
  describeAnswer,
  INPUT_TIMEOUT,
  inputRequestId,
} from "@/server/inputs/requests";
import type { inngest } from "../client";
import { agentInputProvided } from "../events";
import { createPublisher } from "../publisher";
import type { AgentSpec } from "./agents/types";
import { compactHistory, toolCallsFrom } from "./conversation";
import {
  MAX_QUESTIONS_PER_RUN,
  type SkillProgress,
  type ToolOutcome,
} from "./execute-tool";
import { runModelTurn } from "./model";
import {
  loadRedactor,
  openInput,
  replayOf,
  resolveInput,
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
const SEARCH_CAP_NOTE = `(You have used all ${MAX_SEARCHES_PER_RUN} web searches for this request. Write your brief from what you found.)`;
const WRAP_UP_NOTE =
  "(This is your last step, so don't call any tools. Reply now with your final answer in the tags your instructions describe, based on what you have found so far.)";
export const NO_WRITES_NOTE =
  "(You haven't written any files yet, so nothing has changed: the project is exactly as before. If the request needs code changes, make them now with createOrUpdateFiles, check the page compiles, then reply with the summary. If it truly needs no change, say so in the summary.)";
const CONTINUE_NOTE =
  "(Continue. When you have what you need, reply with your final answer in the tags your instructions describe.)";

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
    waitForEvent: (async (id: string, options: never) =>
      count(
        await step.waitForEvent(id, options),
      )) as unknown as Step["waitForEvent"],
  };
}

export type Budget = { balance: number; spentUsd: number; searches: number };

export type AgentRun = {
  agent: AgentSpec["name"];
  output: string | null;
  finished: boolean;
  outOfCredits: boolean;
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
  paused: { requestId: string } | null;
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
    questions: input.questions ?? 0,
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
  maxTurns = spec.maxTurns,
  written: initialWritten = [],
  progress: initialProgress = { readAgentsMd: false, loadedSkills: [] },
  expectWrites = false,
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
  maxTurns?: number;
  written?: string[];
  progress?: SkillProgress;
  expectWrites?: boolean;
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
  let paused: { requestId: string } | null = null;
  let handoff: string | null = null;
  const run = givenRun ?? createRunContext({ sandboxId: sandboxId ?? "" });
  const step = trackSteps(rawStep, run);
  const writer = toolNames.includes("createOrUpdateFiles");

  for (let turn = 0; turn < maxTurns; turn++) {
    if (
      writer &&
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
    const handingOff = writer && turn > 0 && nearRunBudget(run);
    const wrapUp =
      handingOff || (spec.name !== "builder" && turn === maxTurns - 1);
    if (handingOff) {
      messages = [...messages, { role: "user", content: HANDOFF_NOTE }];
    } else if (wrapUp) {
      messages = [...messages, { role: "user", content: WRAP_UP_NOTE }];
    }
    const activeTools = searchesLeft
      ? undefined
      : toolNames.filter((name) => name !== SEARCH_TOOL);

    const modelStep = handingOff
      ? `${stepPrefix}-handoff-${turn}`
      : `${stepPrefix}-model-${turn}`;
    const result = await step.run(modelStep, async () => {
      const redactor = await loadRedactor(projectId);
      const publish = createPublisher(projectId, redactor);
      if (turn === 0 && stepPrefix === spec.name) {
        await publish("agent", { name: spec.name, state: "started" });
      }
      if (turn > 0) await publish("status", { state: "thinking" });
      const turnOutput = await runModelTurn({
        messages: compactHistory(messages),
        turn,
        model,
        publish,
        agent: spec.name,
        instructions,
        tools: spec.tools,
        activeTools,
        toolChoice: wrapUp ? "none" : undefined,
        redactor,
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
      agent: spec.name,
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
      if (
        expectWrites &&
        written.size === 0 &&
        !writesNudged &&
        turn + 1 < maxTurns
      ) {
        writesNudged = true;
        output = null;
        messages = [...messages, { role: "user", content: NO_WRITES_NOTE }];
        continue;
      }
      if (output === null && !spec.textFallback && turn + 1 < maxTurns) {
        messages = [...messages, { role: "user", content: CONTINUE_NOTE }];
        continue;
      }
      if (output === null && spec.textFallback) {
        output = result.text.trim() || null;
      }
      finished = output !== null;
      break;
    }

    const toolResults: ToolResultPart[] = [];
    for (const [index, toolCall] of toolCalls.entries()) {
      if (paused) {
        toolResults.push({
          type: "tool-result",
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output: {
            type: "text",
            value: "Not run: the request paused for the user's answer.",
          },
        });
        continue;
      }
      const writtenPaths = [...written];
      const before = progress;
      const base = {
        writtenPaths,
        agent: spec.name,
        tools: toolNames,
        skills,
        progress: before,
        questionsLeft: MAX_QUESTIONS_PER_RUN - run.questions,
      };
      const replay = replayOf(run);
      const stepped = await step.run(
        `${stepPrefix}-tool-${turn}-${index}`,
        () => runToolStep({ call: toolCall, projectId, run, base, replay }),
      );
      if (stepped.sandbox) run.sandbox = stepped.sandbox;
      let outcome: ToolOutcome = stepped;

      if (stepped.pending) {
        const pending = stepped.pending;
        const requestId = inputRequestId(run.runId, stepPrefix, turn, index);
        toolParts.push({
          type: "input-request",
          requestId,
          agent: spec.name,
          payload: pending.payload,
        });
        const opened = await step.run(
          `${stepPrefix}-ask-${turn}-${index}`,
          () =>
            openInput({
              id: requestId,
              projectId,
              agent: spec.name,
              pending,
              run,
            }),
        );
        if (opened.checkpointed) run.pendingWrites.clear();
        let answer = opened.immediate;
        if (!answer) {
          run.questions += 1;
          const event = await step.waitForEvent(
            `${stepPrefix}-wait-${turn}-${index}`,
            {
              event: agentInputProvided,
              timeout: INPUT_TIMEOUT,
              if: `async.data.requestId == "${requestId}"`,
            },
          );
          const resolved = await step.run(
            `${stepPrefix}-answer-${turn}-${index}`,
            () =>
              resolveInput({
                id: requestId,
                projectId,
                payload: pending.payload,
                timedOut: !event,
                run,
              }),
          );
          if (resolved.paused) {
            paused = { requestId };
            toolResults.push({
              type: "tool-result",
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              output: { type: "text", value: "Waiting for the user's answer." },
            });
            continue;
          }
          if (resolved.sandbox) run.sandbox = resolved.sandbox;
          answer = resolved.answer;
        }
        toolParts.push({
          type: "input-answer",
          requestId,
          kind: pending.payload.kind,
          answer: !answer.ok
            ? "dismissed"
            : pending.payload.kind === "secret"
              ? "set"
              : (answer.answer ?? ""),
        });
        const approved =
          pending.resume &&
          pending.payload.kind === "confirm" &&
          answer.ok &&
          answer.answer === "approved";
        if (approved) {
          const rerun = await step.run(
            `${stepPrefix}-tool-${turn}-${index}-approved`,
            () =>
              runToolStep({
                call: toolCall,
                projectId,
                run,
                base,
                approved: true,
                replay: replayOf(run),
              }),
          );
          if (rerun.sandbox) run.sandbox = rerun.sandbox;
          outcome = {
            ...rerun,
            output: `${describeAnswer(pending.payload, answer)}\n${rerun.output}`,
          };
        } else {
          outcome = {
            ...stepped,
            output: describeAnswer(pending.payload, answer),
          };
        }
      }

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
          agent: spec.name,
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
    if (paused) break;

    if (
      budget.balance - creditsForCost(budget.spentUsd + spentUsd, creditRate) <=
      0
    ) {
      outOfCredits = true;
      break;
    }
  }

  return {
    agent: spec.name,
    output,
    finished,
    outOfCredits,
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
    paused,
    handoff,
  };
}

export async function publishAgentState(
  step: Step,
  projectId: string,
  id: string,
  data: {
    name: AgentSpec["name"];
    state: "done" | "skipped";
    summary?: string;
  },
) {
  await step.run(id, async () => {
    await createPublisher(projectId)("agent", data);
  });
}
