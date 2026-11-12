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
import { connectSandbox } from "@/server/sandbox/sandbox";
import type { inngest } from "../client";
import { createPublisher } from "../publisher";
import type { AgentSpec } from "./agents/types";
import { compactHistory, toolCallsFrom } from "./conversation";
import { executeTool, type SkillProgress } from "./execute-tool";
import { runModelTurn } from "./model";
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
};

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
  step,
  spec,
  projectId,
  sandboxId,
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
  sandboxId: string;
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

  for (let turn = 0; turn < maxTurns; turn++) {
    const usdBefore = budget.spentUsd + spentUsd;
    const searchesLeft = searchCount < MAX_SEARCHES_PER_RUN;
    if (!searchesLeft && toolNames.includes(SEARCH_TOOL) && !capNoted) {
      capNoted = true;
      messages = [...messages, { role: "user", content: SEARCH_CAP_NOTE }];
    }
    const wrapUp = spec.name !== "builder" && turn === maxTurns - 1;
    if (wrapUp) {
      messages = [...messages, { role: "user", content: WRAP_UP_NOTE }];
    }
    const activeTools = searchesLeft
      ? undefined
      : toolNames.filter((name) => name !== SEARCH_TOOL);

    const result = await step.run(`${stepPrefix}-model-${turn}`, async () => {
      const publish = createPublisher(projectId);
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
      const writtenPaths = [...written];
      const before = progress;
      const outcome = await step.run(
        `${stepPrefix}-tool-${turn}-${index}`,
        async () =>
          executeTool(toolCall, {
            sandbox: await connectSandbox(sandboxId),
            publish: createPublisher(projectId),
            writtenPaths,
            agent: spec.name,
            tools: toolNames,
            skills,
            progress: before,
          }),
      );
      progress = outcome.progress;
      for (const path of outcome.writtenPaths) written.add(path);
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
