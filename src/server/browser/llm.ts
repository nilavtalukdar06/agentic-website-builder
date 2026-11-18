import "server-only";
import type { ClientLLM } from "@browserbasehq/stagehand";
import {
  type FilePart,
  generateText,
  jsonSchema,
  type ModelMessage,
  Output,
  type TextPart,
  tool,
  type ToolCallPart,
  type ToolResultPart,
  type ToolSet,
  wrapLanguageModel,
} from "ai";
import { secretRedactionMiddleware } from "@/inngest/agent/guardrails/middleware";
import { patternRedactor } from "@/inngest/agent/guardrails/redact";
import type { AgentModel } from "@/lib/ai/models";
import { gateway } from "@/server/ai/gateway";
import { estimateCostUsd, toTokenUsage } from "@/server/billing/pricing";
import type { BrowserModelCall } from "./types";

type GenerateParams = Parameters<ClientLLM["generate"]>[0];
type GenerateResult = Awaited<ReturnType<ClientLLM["generate"]>>;
type Block = Extract<
  GenerateParams["messages"][number]["content"],
  { type: string }
>;

export const BROWSER_MAX_OUTPUT_TOKENS = 4000;

function blocksOf(content: GenerateParams["messages"][number]["content"]) {
  return (Array.isArray(content) ? content : [content]) as Block[];
}

function resultText(block: Extract<Block, { type: "tool_result" }>) {
  return block.content
    .map((part) => (part.type === "text" ? part.text : "[image]"))
    .join("\n");
}

export function toModelMessages(params: GenerateParams): ModelMessage[] {
  const toolNames = new Map<string, string>();
  const out: ModelMessage[] = [];
  for (const message of params.messages) {
    const blocks = blocksOf(message.content);
    if (message.role === "assistant") {
      const content: (TextPart | ToolCallPart)[] = [];
      for (const block of blocks) {
        if (block.type === "text") {
          content.push({ type: "text", text: block.text });
        } else if (block.type === "tool_use") {
          toolNames.set(block.id, block.name);
          content.push({
            type: "tool-call",
            toolCallId: block.id,
            toolName: block.name,
            input: block.input,
          });
        }
      }
      out.push({ role: "assistant", content });
      continue;
    }
    const results: ToolResultPart[] = [];
    const content: (TextPart | FilePart)[] = [];
    for (const block of blocks) {
      if (block.type === "tool_result") {
        results.push({
          type: "tool-result",
          toolCallId: block.toolUseId,
          toolName: toolNames.get(block.toolUseId) ?? "tool",
          output: block.structuredContent
            ? { type: "json", value: block.structuredContent }
            : { type: "text", value: resultText(block) },
        });
      } else if (block.type === "text") {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "image") {
        content.push({
          type: "file",
          data: block.data,
          mediaType: block.mimeType,
        });
      }
    }
    if (results.length > 0) out.push({ role: "tool", content: results });
    if (content.length > 0) out.push({ role: "user", content });
  }
  return out;
}

export function toToolSet(params: GenerateParams): ToolSet | undefined {
  if (!("tools" in params) || !params.tools?.length) return undefined;
  return Object.fromEntries(
    params.tools.map((definition) => [
      definition.name,
      tool({
        description:
          definition.description ?? definition.title ?? definition.name,
        inputSchema: jsonSchema(
          definition.inputSchema as Parameters<typeof jsonSchema>[0],
        ),
      }),
    ]),
  );
}

function generationIdOf(metadata: unknown) {
  const id = (metadata as { gateway?: { generationId?: unknown } } | undefined)
    ?.gateway?.generationId;
  return typeof id === "string" ? id : null;
}

export function createGenerate(
  model: AgentModel,
  onCall: (call: BrowserModelCall) => void,
  beforeCall?: () => Promise<void>,
  signal?: AbortSignal,
): ClientLLM["generate"] {
  return async (params) => {
    await beforeCall?.();
    signal?.throwIfAborted();
    const structured =
      params.responseFormat?.type === "json_schema"
        ? params.responseFormat
        : null;
    const tools = structured ? undefined : toToolSet(params);
    const toolChoice =
      !structured && "toolChoice" in params
        ? params.toolChoice?.mode
        : undefined;
    const result = await generateText({
      model: wrapLanguageModel({
        model: gateway(model.id),
        middleware: secretRedactionMiddleware(patternRedactor),
      }),
      ...(params.systemPrompt ? { instructions: params.systemPrompt } : {}),
      messages: toModelMessages(params),
      ...(tools ? { tools } : {}),
      ...(toolChoice ? { toolChoice } : {}),
      ...(structured
        ? {
            output: Output.object({
              schema: jsonSchema(
                structured.schema as Parameters<typeof jsonSchema>[0],
              ),
              name: structured.name,
            }),
          }
        : {}),
      ...(params.temperature !== undefined
        ? { temperature: params.temperature }
        : {}),
      ...(params.stopSequences ? { stopSequences: params.stopSequences } : {}),
      maxOutputTokens: BROWSER_MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      abortSignal: signal,
    });

    const usage = toTokenUsage(result.totalUsage);
    const generationId = generationIdOf(result.providerMetadata);
    onCall({
      usage,
      estimatedUsd: model.pricing ? estimateCostUsd(usage, model.pricing) : 0,
      generationIds: generationId ? [generationId] : [],
    });
    const stagehandUsage = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
    };

    if (structured) {
      const value = result.output as GenerateResult extends infer R
        ? R extends { structuredContent: infer S }
          ? S
          : never
        : never;
      return {
        role: "assistant",
        outputFormat: "json_schema",
        content: { type: "text", text: JSON.stringify(value) },
        structuredContent: value,
        stopReason: result.finishReason,
        usage: stagehandUsage,
      };
    }

    const content: Block[] = [];
    if (result.text) content.push({ type: "text", text: result.text });
    for (const call of result.toolCalls) {
      content.push({
        type: "tool_use",
        id: call.toolCallId,
        name: call.toolName,
        input: (call.input ?? {}) as Record<string, never>,
      });
    }
    return {
      role: "assistant",
      outputFormat: "text",
      content: content.length > 0 ? content : { type: "text", text: "" },
      stopReason: result.finishReason,
      usage: stagehandUsage,
    };
  };
}
