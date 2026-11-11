import "server-only";
import type { ModelMessage, ToolResultPart } from "ai";
import { NonRetriableError, RetryAfterError } from "inngest";
import type { AgentPart, TaskItem } from "@/lib/agent/parts";
import { findAgentModel, lookupGenerationCost } from "@/server/ai/gateway";
import { getCreditBalance } from "@/server/billing/balance";
import { creditRate } from "@/server/billing/credit-rate";
import { addUsage, creditsForCost, emptyUsage } from "@/server/billing/pricing";
import { type BilledCall, resolveRunCost } from "@/server/billing/run-cost";
import { db } from "@/server/db";
import { APP_DIR } from "@/server/sandbox/guards";
import {
  connectSandbox,
  ensureDevOrigins,
  getOrCreateSandbox,
  PREVIEW_PORT,
  previewUrlFor,
  type SnapshotFiles,
  snapshotSandbox,
} from "@/server/sandbox/sandbox";
import {
  cleanTitle,
  compactHistory,
  extractSummary,
  historyToMessages,
  toolCallsFrom,
} from "../agent/conversation";
import { executeTool } from "../agent/execute-tool";
import { generateVersionTitle, runModelTurn } from "../agent/model";
import { classifyModelError, MODEL_UNAVAILABLE } from "../agent/model-errors";
import {
  debitCredits,
  recordAssistantError,
  saveRunResult,
} from "../agent/persist";
import { inngest } from "../client";
import { agentRun } from "../events";
import { createPublisher } from "../publisher";

export const MAX_TURNS = 60;

const OUT_OF_CREDITS =
  "You're out of credits. Top up on the Usage & credits page to keep building.";
const STOPPED_FOR_CREDITS =
  "I stopped early because your credits ran out. Top up to continue from here.";
const OUTPUT_LIMIT_NOTE =
  "(Your previous reply hit the output limit and was discarded. Take smaller steps: write at most a few files per createOrUpdateFiles call and keep replies short.)";
const FAILED =
  "Something went wrong while building, so this run wasn't charged. Try sending your message again.";

export const runAgent = inngest.createFunction(
  {
    id: "run-agent",
    name: "Run coding agent",
    triggers: [agentRun],
    concurrency: [
      { key: "event.data.userId", limit: 2 },
      { key: "event.data.projectId", limit: 1 },
    ],
    retries: 2,
    onFailure: async ({ event, error, step }) => {
      const { projectId } = event.data.event.data;
      const runId = event.data.run_id;
      const message =
        error.message === MODEL_UNAVAILABLE ? MODEL_UNAVAILABLE : FAILED;
      await step.run("record-failure", async () => {
        console.error(`[run-agent] ${runId} failed`, error);
        await recordAssistantError(db, { projectId, runId, message });
        await createPublisher(projectId)("status", { state: "error", message });
      });
    },
  },
  async ({ event, step, runId }) => {
    const { projectId, userId, messageId } = event.data;

    const setup = await step.run("load-project", async () => {
      const [project, trigger] = await Promise.all([
        db.project.findFirst({
          where: { id: projectId, userId },
          select: { name: true, sandboxId: true },
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
        db.message.findMany({
          where: { projectId, createdAt: { lte: trigger.createdAt } },
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            content: true,
            attachments: {
              orderBy: { createdAt: "asc" },
              select: { key: true, contentType: true },
            },
          },
        }),
        db.version.findFirst({
          where: { projectId },
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
      return {
        model,
        projectName: project.name,
        sandboxId: project.sandboxId,
        prompt: trigger.content,
        history,
        balance,
        hasVersion: latest !== null,
        files: Object.keys((latest?.files ?? {}) as SnapshotFiles),
      };
    });

    if (setup.balance <= 0) {
      await step.run("out-of-credits", async () => {
        await recordAssistantError(db, {
          projectId,
          runId,
          message: OUT_OF_CREDITS,
        });
        await createPublisher(projectId)("status", {
          state: "error",
          message: OUT_OF_CREDITS,
        });
      });
      return { status: "out-of-credits" as const };
    }

    const sandbox = await step.run("sandbox", async () => {
      const result = await getOrCreateSandbox(setup.sandboxId, async () => {
        const latest = await db.version.findFirst({
          where: { projectId },
          orderBy: { number: "desc" },
          select: { files: true },
        });
        return (latest?.files ?? undefined) as SnapshotFiles | undefined;
      });
      await ensureDevOrigins(result.sandbox);
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
      return { sandboxId: result.sandbox.sandboxId, previewUrl, task };
    });

    const model = setup.model;
    let messages = historyToMessages(setup.history, setup.files, {
      vision: model.vision,
    });
    let usage = emptyUsage;
    let estimatedUsd = 0;
    const calls: BilledCall[] = [];
    const written = new Set<string>();
    const tasks: TaskItem[] = [sandbox.task];
    const toolParts: AgentPart[] = [];
    const reasoning: string[] = [];
    let reasoningMs = 0;
    let summary: string | null = null;
    let outOfCredits = false;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const usdBefore = estimatedUsd;
      const result = await step.run(`model-${turn}`, async () => {
        const publish = createPublisher(projectId);
        if (turn > 0) await publish("status", { state: "thinking" });
        const output = await runModelTurn({
          messages: compactHistory(messages),
          turn,
          model,
          publish,
        }).catch((error: unknown) => {
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
        });
        await publish("credits", {
          used: creditsForCost(usdBefore + output.estimatedUsd, creditRate),
        });
        return output;
      });

      usage = addUsage(usage, result.usage);
      estimatedUsd += result.estimatedUsd;
      calls.push({
        generationIds: result.generationIds,
        estimatedUsd: result.estimatedUsd,
      });
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
        summary = extractSummary(result.text) ?? (result.text.trim() || null);
        break;
      }

      const toolResults: ToolResultPart[] = [];
      for (const [index, call] of toolCalls.entries()) {
        const writtenPaths = [...written];
        const outcome = await step.run(`tool-${turn}-${index}`, async () =>
          executeTool(call, {
            sandbox: await connectSandbox(sandbox.sandboxId),
            publish: createPublisher(projectId),
            writtenPaths,
          }),
        );
        for (const path of outcome.writtenPaths) written.add(path);
        tasks.push(...outcome.tasks);
        if (outcome.terminal) {
          toolParts.push({
            type: "tool",
            callId: call.toolCallId,
            name: call.toolName,
            ...outcome.terminal,
          });
        }
        toolResults.push({
          type: "tool-result",
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { type: "text", value: outcome.output },
        });
      }
      messages = [...messages, { role: "tool", content: toolResults }];

      if (setup.balance - creditsForCost(estimatedUsd, creditRate) <= 0) {
        outOfCredits = true;
        break;
      }
    }

    if (!summary && !outOfCredits) {
      throw new NonRetriableError(
        `The agent reached its ${MAX_TURNS}-step limit without finishing.`,
      );
    }

    const replyText = outOfCredits
      ? [summary, STOPPED_FOR_CREDITS].filter(Boolean).join("\n\n")
      : (summary ?? "");

    const title = await step.run("title", async () => {
      const fallback = setup.hasVersion ? "Updated the site" : "First version";
      if (outOfCredits) {
        return {
          text: fallback,
          usage: emptyUsage,
          estimatedUsd: 0,
          generationIds: [],
        };
      }
      const generated = await generateVersionTitle(
        model,
        setup.prompt,
        replyText,
      ).catch(() => null);
      if (!generated) {
        return {
          text: fallback,
          usage: emptyUsage,
          estimatedUsd: 0,
          generationIds: [],
        };
      }
      return { ...generated, text: cleanTitle(generated.text, fallback) };
    });
    usage = addUsage(usage, title.usage);
    calls.push({
      generationIds: title.generationIds,
      estimatedUsd: title.estimatedUsd,
    });

    const cost = await step.run("cost", () =>
      resolveRunCost(calls, lookupGenerationCost),
    );
    const credits = creditsForCost(cost.costUsd, creditRate);

    const parts: AgentPart[] = [
      ...(reasoning.length > 0
        ? [
            {
              type: "reasoning" as const,
              text: reasoning.join("\n\n"),
              durationMs: reasoningMs,
            },
          ]
        : []),
      { type: "task", title: title.text, items: tasks },
      ...toolParts,
      { type: "text", text: replyText },
    ];

    const saved = await step.run("persist", async () => {
      const publish = createPublisher(projectId);
      await publish("status", { state: "compiling" });
      const box = await connectSandbox(sandbox.sandboxId);
      await ensureDevOrigins(box);
      await box.commands
        .run(
          `curl -s -o /dev/null --max-time 90 http://localhost:${PREVIEW_PORT}/`,
          { cwd: APP_DIR, timeoutMs: 100_000 },
        )
        .catch(() => null);
      const files = await snapshotSandbox(box);
      const result = await saveRunResult(db, {
        projectId,
        runId,
        title: title.text,
        content: replyText,
        parts,
        files,
        creditCost: credits,
        previewUrl: sandbox.previewUrl,
      });
      return { ...result, fileCount: Object.keys(files).length };
    });

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
      });
      const publish = createPublisher(projectId);
      await publish("credits", { used: credits });
      await publish("preview", { url: sandbox.previewUrl });
      await publish("status", { state: "done" });
    });

    return {
      status: outOfCredits
        ? ("stopped-for-credits" as const)
        : ("done" as const),
      version: saved.versionNumber,
      files: saved.fileCount,
      filesChanged: written.size,
      credits,
      costUsd: cost.costUsd,
      model: model.id,
      previewUrl: sandbox.previewUrl,
    };
  },
);
