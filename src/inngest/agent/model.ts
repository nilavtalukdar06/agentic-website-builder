import "server-only";
import {
  generateText,
  type ModelMessage,
  streamText,
  type ToolSet,
  wrapLanguageModel,
} from "ai";
import type { AgentModel } from "@/lib/ai/models";
import { gateway } from "@/server/ai/gateway";
import {
  estimateCostUsd,
  type TokenUsage,
  toTokenUsage,
} from "@/server/billing/pricing";
import { attachmentUrl } from "@/server/storage/attachments";
import { secretRedactionMiddleware } from "./guardrails/middleware";
import { patternRedactor, type Redactor } from "./guardrails/redact";
import type { Publish } from "../publisher";
import { resolveAttachments } from "./conversation";
import { REPLY_PROMPT, TITLE_PROMPT } from "./prompts/summary";
import { SEARCH_TOOL, type SearchRecord, searchRecord } from "./search";

const FLUSH_MS = 150;
export const MAX_OUTPUT_TOKENS = 32_000;

const providerOptions = { openai: { reasoningSummary: "auto" } };

export type ModelCall = {
  usage: TokenUsage;
  estimatedUsd: number;
  generationIds: string[];
};

export type ModelTurn = ModelCall & {
  messages: ModelMessage[];
  finishReason: string;
  text: string;
  reasoning: string;
  reasoningMs: number;
  searches: SearchRecord[];
};

function generationIdOf(metadata: unknown) {
  const id = (metadata as { gateway?: { generationId?: unknown } } | undefined)
    ?.gateway?.generationId;
  return typeof id === "string" ? id : null;
}

function costOf(usage: TokenUsage, model: AgentModel) {
  return model.pricing ? estimateCostUsd(usage, model.pricing) : 0;
}

function createDeltaBuffer(flush: (delta: string) => Promise<void>) {
  let pending = "";
  let lastFlush = 0;
  return {
    async push(delta: string) {
      pending += delta;
      const now = Date.now();
      if (now - lastFlush >= FLUSH_MS) {
        lastFlush = now;
        const chunk = pending;
        pending = "";
        await flush(chunk);
      }
    },
    async drain() {
      if (!pending) return;
      const chunk = pending;
      pending = "";
      await flush(chunk);
    },
  };
}

export async function runModelTurn({
  messages,
  turn,
  model,
  publish,
  instructions,
  tools,
  activeTools,
  toolChoice,
  redactor = patternRedactor,
}: {
  redactor?: Redactor;
  messages: ModelMessage[];
  turn: number;
  model: AgentModel;
  publish: Publish;
  instructions: string;
  tools: ToolSet;
  activeTools?: string[];
  toolChoice?: "none";
}): Promise<ModelTurn> {
  const generationIds: string[] = [];
  const searches: SearchRecord[] = [];
  const result = streamText({
    model: wrapLanguageModel({
      model: gateway(model.id),
      middleware: secretRedactionMiddleware(redactor),
    }),
    instructions,
    messages: await resolveAttachments(messages, attachmentUrl),
    tools,
    activeTools,
    toolChoice,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 2,
    providerOptions,
    onLanguageModelCallEnd({ providerMetadata }) {
      const id = generationIdOf(providerMetadata);
      if (id) generationIds.push(id);
    },
  });

  const reasoning = createDeltaBuffer((delta) =>
    publish("reasoning", { turn, delta }),
  );
  const text = createDeltaBuffer((delta) => publish("text", { turn, delta }));
  let reasoningStart: number | null = null;
  let reasoningEnd: number | null = null;
  let announcedBuild = false;

  for await (const part of result.fullStream) {
    if (part.type === "reasoning-delta") {
      reasoningStart ??= Date.now();
      reasoningEnd = Date.now();
      await reasoning.push(part.text);
    } else if (part.type === "text-delta") {
      await text.push(part.text);
    } else if (part.type === "tool-input-start" && !announcedBuild) {
      announcedBuild = true;
      await publish("status", { state: "building" });
    } else if (part.type === "tool-result" && part.toolName === SEARCH_TOOL) {
      const record = searchRecord(part.input, part.output);
      searches.push(record);
      await publish("search", record);
    } else if (part.type === "error") {
      throw part.error instanceof Error
        ? part.error
        : new Error(String(part.error));
    }
  }
  await Promise.all([reasoning.drain(), text.drain()]);

  const [responseMessages, totalUsage, finalText, reasoningText, finish] =
    await Promise.all([
      result.responseMessages,
      result.totalUsage,
      result.text,
      result.reasoningText,
      result.finishReason,
    ]);
  const usage = toTokenUsage(totalUsage);

  return {
    messages: responseMessages,
    finishReason: finish,
    text: finalText,
    reasoning: reasoningText ?? "",
    reasoningMs:
      reasoningStart !== null && reasoningEnd !== null
        ? reasoningEnd - reasoningStart
        : 0,
    usage,
    estimatedUsd: costOf(usage, model),
    generationIds,
    searches,
  };
}

export async function generateVersionTitle(
  model: AgentModel,
  prompt: string,
  summary: string,
): Promise<ModelCall & { text: string }> {
  const result = await generateText({
    model: gateway(model.id),
    instructions: TITLE_PROMPT,
    prompt: `Request:\n${prompt.slice(0, 2000)}\n\nSummary:\n${summary.slice(0, 2000)}`,
    maxRetries: 2,
  });
  const usage = toTokenUsage(result.totalUsage);
  const generationId = generationIdOf(result.providerMetadata);
  return {
    text: result.text,
    usage,
    estimatedUsd: costOf(usage, model),
    generationIds: generationId ? [generationId] : [],
  };
}

export async function generateReply(
  model: AgentModel,
  input: { prompt: string; notes: string; files: string[] },
): Promise<ModelCall & { text: string }> {
  const result = await generateText({
    model: gateway(model.id),
    instructions: REPLY_PROMPT,
    prompt: `Request:\n${input.prompt.slice(0, 2000)}\n\nAgent notes:\n${input.notes.slice(0, 4000)}\n\nFiles changed:\n${input.files.slice(0, 40).join("\n") || "none"}`,
    maxOutputTokens: 800,
    maxRetries: 2,
  });
  const usage = toTokenUsage(result.totalUsage);
  const generationId = generationIdOf(result.providerMetadata);
  return {
    text: result.text,
    usage,
    estimatedUsd: costOf(usage, model),
    generationIds: generationId ? [generationId] : [],
  };
}
