import "server-only";
import type { ModelMessage } from "ai";
import { NonRetriableError } from "inngest";
import type { AgentName, AgentPart, TaskItem } from "@/lib/agent/parts";
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
import { APP_DIR } from "@/server/sandbox/guards";
import {
  connectSandbox,
  ensureAgentInstructions,
  ensureDevOrigins,
  getOrCreateSandbox,
  PREVIEW_PORT,
  previewUrlFor,
  type SnapshotFiles,
  snapshotSandbox,
} from "@/server/sandbox/sandbox";
import { agentSpecs } from "../agent/agents";
import { FIX_PASS_MAX_TURNS } from "../agent/agents/builder";
import { hasFindings } from "../agent/agents/reviewer";
import {
  type Brief,
  briefsMessage,
  capBrief,
  cleanTitle,
  historyToMessages,
} from "../agent/conversation";
import {
  type AgentRun,
  type Budget,
  publishAgentState,
  runAgentLoop,
} from "../agent/loop";
import { classifyAgents, generateVersionTitle } from "../agent/model";
import { MODEL_UNAVAILABLE } from "../agent/model-errors";
import {
  debitCredits,
  recordAssistantError,
  saveRunResult,
} from "../agent/persist";
import { routeAgents, shouldReview } from "../agent/router";
import { uniqueSources } from "../agent/search";
import { listInstalledSkills } from "../agent/skills";
import { inngest } from "../client";
import { agentRun } from "../events";
import { createPublisher } from "../publisher";

const OUT_OF_CREDITS =
  "You're out of credits. Top up on the Usage & credits page to keep building.";
const STOPPED_FOR_CREDITS =
  "I stopped early because your credits ran out. Top up to continue from here.";
const FAILED =
  "Something went wrong while building, so this run wasn't charged. Try sending your message again.";

const label = (name: AgentName) =>
  `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

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

export const runAgent = inngest.createFunction(
  {
    id: "run-agent",
    name: "Run coding agents",
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
          select: {
            createdAt: true,
            content: true,
            model: true,
            _count: { select: { attachments: true } },
          },
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
        attachments: trigger._count.attachments,
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
      await ensureAgentInstructions(result.sandbox);
      const skills = await listInstalledSkills(result.sandbox);
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
        skills,
      };
    });

    const model = setup.model;
    const routed = await step.run("route", async () => {
      let call: BilledCall | null = null;
      let usage: TokenUsage = emptyUsage;
      const route = await routeAgents(
        {
          prompt: setup.prompt,
          hasVersion: setup.hasVersion,
          attachments: setup.attachments,
          files: setup.files,
        },
        async (prompt) => {
          const result = await classifyAgents(model, prompt);
          call = {
            generationIds: result.generationIds,
            estimatedUsd: result.estimatedUsd,
            agent: "router",
            model: model.id,
          };
          usage = result.usage;
          return result.choice;
        },
      );
      return { route, call: call as BilledCall | null, usage };
    });

    let usage = routed.usage;
    const calls: BilledCall[] = routed.call ? [routed.call] : [];
    let budget: Budget = {
      balance: setup.balance,
      spentUsd: routed.call?.estimatedUsd ?? 0,
      searches: 0,
    };
    const runs: AgentRun[] = [];
    const agentParts: AgentPart[] = [];

    const loopArgs = {
      step,
      projectId,
      sandboxId: sandbox.sandboxId,
      model,
      installedSkills: sandbox.skills,
    };
    const visionHistory = historyToMessages(setup.history, setup.files, {
      vision: model.vision,
    });
    const textHistory = historyToMessages(setup.history, setup.files, {
      vision: false,
    });

    const readers = routed.route.agents.filter(
      (name): name is "researcher" | "designer" =>
        name === "researcher" || name === "designer",
    );
    const snapshot = budget;
    const readerResults = await Promise.all(
      readers.map(async (name): Promise<Brief & { run: AgentRun | null }> => {
        try {
          const run = await runAgentLoop({
            ...loopArgs,
            spec: agentSpecs[name],
            messages: name === "designer" ? visionHistory : textHistory,
            budget: snapshot,
          });
          const brief = run.finished ? run.output : null;
          await publishAgentState(step, projectId, `${name}-done`, {
            name,
            state: brief ? "done" : "skipped",
            summary: brief ? capBrief(brief) : `${label(name)} didn't finish.`,
          });
          return { agent: name, text: brief, failed: !brief, run };
        } catch (error) {
          console.warn(`[run-agent] ${name} failed, continuing`, error);
          await publishAgentState(step, projectId, `${name}-skipped`, {
            name,
            state: "skipped",
            summary: `${label(name)} failed, so the builder worked without it.`,
          });
          return { agent: name, text: null, failed: true, run: null };
        }
      }),
    );
    for (const result of readerResults) {
      if (result.run) {
        runs.push(result.run);
        budget = spend(budget, result.run);
      }
      agentParts.push({
        type: "agent",
        name: result.agent as AgentName,
        state: result.text ? "done" : "skipped",
        summary: result.text
          ? capBrief(result.text)
          : `${label(result.agent as AgentName)} failed, so the builder worked without it.`,
        skills: result.run?.progress.loadedSkills ?? [],
        searches: result.run?.searches.length ?? 0,
      });
    }

    let summary: string | null = null;
    let outOfCredits = exhausted(budget);
    let written: string[] = [];

    if (!outOfCredits) {
      const briefs = briefsMessage(
        readerResults.map(({ agent, text, failed }) => ({
          agent,
          text,
          failed,
        })),
      );
      const build = await runAgentLoop({
        ...loopArgs,
        spec: agentSpecs.builder,
        messages: briefs ? [...visionHistory, briefs] : visionHistory,
        budget,
        expectWrites: true,
      });
      runs.push(build);
      budget = spend(budget, build);
      outOfCredits = build.outOfCredits;
      written = build.written;
      if (!build.finished && !outOfCredits) {
        throw new NonRetriableError(
          `The agent reached its ${agentSpecs.builder.maxTurns}-step limit without finishing.`,
        );
      }
      summary = build.output;
      const builderPart: AgentPart = {
        type: "agent",
        name: "builder",
        state: "done",
        summary: `${written.length} file${written.length === 1 ? "" : "s"} changed`,
        skills: build.progress.loadedSkills,
        searches: 0,
      };
      await publishAgentState(step, projectId, "builder-done", {
        name: "builder",
        state: "done",
        summary: builderPart.summary,
      });
      agentParts.push(builderPart);

      if (
        !outOfCredits &&
        shouldReview({ hasVersion: setup.hasVersion, written: written.length })
      ) {
        const review = await runAgentLoop({
          ...loopArgs,
          spec: agentSpecs.reviewer,
          messages: [
            ...textHistory,
            {
              role: "user",
              content: `The builder has finished this request. Files it changed: ${written.join(", ")}.\n\nBuilder's summary:\n${capBrief(summary ?? "")}\n\nReview the work now.`,
            },
          ],
          budget,
        });
        runs.push(review);
        budget = spend(budget, review);
        outOfCredits = review.outOfCredits;
        const findings = review.finished ? review.output : null;
        const needsFix = hasFindings(findings);
        const reviewSummary = needsFix
          ? capBrief(findings ?? "")
          : review.finished
            ? "No problems found."
            : "The review didn't finish.";
        await publishAgentState(step, projectId, "reviewer-done", {
          name: "reviewer",
          state: "done",
          summary: reviewSummary,
        });
        agentParts.push({
          type: "agent",
          name: "reviewer",
          state: "done",
          summary: reviewSummary,
          skills: review.progress.loadedSkills,
          searches: 0,
        });

        if (needsFix && !outOfCredits && !exhausted(budget)) {
          const fixPrompt: ModelMessage = {
            role: "user",
            content: `The reviewer checked your work and found these problems. Fix them, check that the page compiles, then reply with a new summary of the whole request in the task_summary tags.\n\n<findings>\n${capBrief(findings ?? "")}\n</findings>`,
          };
          const fix = await runAgentLoop({
            ...loopArgs,
            spec: agentSpecs.builder,
            messages: [...build.messages, fixPrompt],
            budget,
            stepPrefix: "builder-fix",
            maxTurns: FIX_PASS_MAX_TURNS,
            written,
            progress: build.progress,
          });
          runs.push(fix);
          budget = spend(budget, fix);
          outOfCredits = fix.outOfCredits;
          written = fix.written;
          if (fix.finished && fix.output) summary = fix.output;
          await publishAgentState(step, projectId, "builder-fix-done", {
            name: "builder",
            state: "done",
            summary: "Fixed the reviewer's findings",
          });
          const builderIndex = agentParts.indexOf(builderPart);
          agentParts[builderIndex] = {
            ...builderPart,
            summary: `${written.length} file${written.length === 1 ? "" : "s"} changed, one fix pass`,
          };
        }
      }
    }

    for (const run of runs) {
      usage = addUsage(usage, run.usage);
      calls.push(...run.calls);
    }

    const replyText = outOfCredits
      ? [summary, STOPPED_FOR_CREDITS].filter(Boolean).join("\n\n")
      : (summary ?? "");

    const title = await step.run("title", async () => {
      const fallback = setup.hasVersion ? "Updated the site" : "First version";
      const empty = {
        text: fallback,
        usage: emptyUsage,
        estimatedUsd: 0,
        generationIds: [] as string[],
      };
      if (outOfCredits) return empty;
      const generated = await generateVersionTitle(
        model,
        setup.prompt,
        replyText,
      ).catch(() => null);
      if (!generated) return empty;
      return { ...generated, text: cleanTitle(generated.text, fallback) };
    });
    usage = addUsage(usage, title.usage);
    calls.push({
      generationIds: title.generationIds,
      estimatedUsd: title.estimatedUsd,
      agent: "builder",
      model: model.id,
    });

    const cost = await step.run("cost", () =>
      resolveRunCost(calls, lookupGenerationCost),
    );
    const credits = creditsForCost(cost.costUsd, creditRate);

    const reasoning = runs.flatMap((run) => run.reasoning);
    const reasoningMs = runs.reduce((sum, run) => sum + run.reasoningMs, 0);
    const sources = uniqueSources(runs.flatMap((run) => run.searches));
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
      ...agentParts,
      {
        type: "task",
        title: title.text,
        items: [sandbox.task, ...runs.flatMap((run) => run.tasks)],
      },
      ...runs.flatMap((run) => run.toolParts),
      ...(sources.length > 0 ? [{ type: "sources" as const, sources }] : []),
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
      agents: routed.route.agents,
      route: routed.route.decidedBy,
      version: saved.versionNumber,
      files: saved.fileCount,
      filesChanged: written.length,
      credits,
      costUsd: cost.costUsd,
      agentCosts: cost.agents,
      model: model.id,
      previewUrl: sandbox.previewUrl,
    };
  },
);
