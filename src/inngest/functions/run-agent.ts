import "server-only";
import type { ModelMessage } from "ai";
import { NonRetriableError } from "inngest";
import type { AgentPart, TaskItem } from "@/lib/agent/parts";
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
import { connectOrRecover, recoverSandbox } from "@/server/sandbox/recover";
import {
  ensureAgentInstructions,
  ensureDevOrigins,
  getOrCreateSandbox,
  PREVIEW_PORT,
  previewUrlFor,
  snapshotSandbox,
} from "@/server/sandbox/sandbox";
import { builderSpec } from "../agent/agents";
import { cleanTitle, historyToMessages } from "../agent/conversation";
import { classifyText } from "../agent/guardrails/classifier";
import { recordGuardEvent } from "../agent/guardrails/events";
import { patternRedactor } from "../agent/guardrails/redact";
import { scanFiles, scanFixPrompt } from "../agent/guardrails/scan";
import {
  detectSecrets,
  redactMatches,
  redactPatterns,
} from "../agent/guardrails/secret-patterns";
import {
  type AgentRun,
  type Budget,
  createRunContext,
  runAgentLoop,
} from "../agent/loop";
import { generateVersionTitle } from "../agent/model";
import { MODEL_UNAVAILABLE } from "../agent/model-errors";
import {
  debitCredits,
  loadRestoreFiles,
  READY,
  recordAssistantError,
  saveRunResult,
} from "../agent/persist";
import { BLOCKED, SECRET_IN_PROMPT } from "../agent/replies";
import { takeCheckpoint } from "../agent/runtime";
import { mentionsSite, uniqueSources } from "../agent/search";
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
    const { projectId, userId, messageId, resume } = event.data;
    const chainId = resume?.chainId ?? runId;

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
      return {
        model,
        projectName: project.name,
        sandboxId: project.sandboxId,
        prompt: trigger.content,
        history,
        balance,
        hasVersion: latest !== null,
        files: Object.keys((latest?.files ?? {}) as Record<string, string>),
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

    if (!resume) {
      const secretHit = await step.run("guard-input", async () => {
        const matches = await detectSecrets(setup.prompt);
        if (matches.length === 0) return false;
        const redacted = redactMatches(setup.prompt, matches);
        await db.message.update({
          where: { id: messageId },
          data: { content: redacted },
        });
        await db.project.updateMany({
          where: { id: projectId, description: setup.prompt },
          data: { description: redacted },
        });
        await recordGuardEvent(db, {
          userId,
          projectId,
          runId,
          stage: "input",
          verdict: "secret",
          categories: ["secret"],
          text: setup.prompt,
        });
        await recordAssistantError(db, {
          projectId,
          runId,
          message: SECRET_IN_PROMPT,
        });
        const publish = createPublisher(projectId);
        await publish("guard", { stage: "input", verdict: "secret" });
        await publish("status", { state: "error", message: SECRET_IN_PROMPT });
        return true;
      });
      if (secretHit) return { status: "secret-in-prompt" as const };
    }

    const model = setup.model;
    const guard = resume
      ? allowed
      : await step.run("guard-classify", async () => {
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
        await recordAssistantError(db, { projectId, runId, message: BLOCKED });
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

    const sandbox = await step.run("sandbox", async () => {
      const result = await getOrCreateSandbox(setup.sandboxId, () =>
        loadRestoreFiles(db, {
          projectId,
          chainId: resume ? chainId : null,
        }),
      );
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
    let budget: Budget = {
      balance: setup.balance,
      spentUsd: calls.reduce((sum, call) => sum + call.estimatedUsd, 0),
      searches: resume?.handoff?.searches ?? 0,
    };
    const runs: AgentRun[] = [];
    const spec = builderSpec({ search });
    const loopArgs = {
      step,
      projectId,
      run: runContext,
      model,
      installedSkills: sandbox.skills,
      spec,
    };

    const handoffNote: ModelMessage[] = resume?.handoff
      ? [
          {
            role: "user",
            content: `(Continuing this request in a fresh run: the previous run used up its room and handed over to you. The project files are exactly as it left them. Its handoff note:\n<handoff>\n${resume.handoff.note}\n</handoff>\nFiles changed so far: ${resume.handoff.written.join(", ") || "none"}.\nPick up from there and finish the whole request, then reply with the task_summary for the whole request.)`,
          },
        ]
      : [];
    const messages = [
      ...historyToMessages(setup.history, setup.files, {
        vision: model.vision,
      }),
      ...handoffNote,
    ];

    let summary: string | null = null;
    let outOfCredits = exhausted(budget);
    let written: string[] = resume?.handoff?.written ?? [];
    let handoff: string | null = null;

    if (!outOfCredits) {
      const build = await runAgentLoop({
        ...loopArgs,
        messages,
        budget,
        expectWrites: !resume,
        written,
        progress: resume?.handoff
          ? {
              readAgentsMd: resume.handoff.readAgentsMd,
              loadedSkills: resume.handoff.loadedSkills,
              installs: resume.handoff.installs,
            }
          : undefined,
      });
      runs.push(build);
      budget = spend(budget, build);
      outOfCredits = build.outOfCredits;
      written = build.written;
      handoff = build.handoff;
      summary = build.output;

      if (!handoff && !outOfCredits && written.length > 0) {
        const hits = await step.run("secret-scan", async () => {
          const { sandbox: box } = await connectOrRecover(
            runContext.sandbox,
            () =>
              recoverSandbox({
                projectId,
                chainId,
                replay: [...runContext.pendingWrites].map(
                  ([path, content]) => ({ path, content }),
                ),
              }),
          );
          return scanFiles(await snapshotSandbox(box));
        });
        if (hits.length > 0 && !exhausted(budget)) {
          const scanFix = await runAgentLoop({
            ...loopArgs,
            messages: [
              ...build.messages,
              { role: "user", content: scanFixPrompt(hits) },
            ],
            budget,
            stepPrefix: "builder-scan-fix",
            written,
            progress: build.progress,
          });
          runs.push(scanFix);
          budget = spend(budget, scanFix);
          outOfCredits = scanFix.outOfCredits;
          written = scanFix.written;
          handoff = scanFix.handoff;
          if (scanFix.finished && scanFix.output) summary = scanFix.output;
        }
      }
    }

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
      const progress = runs.at(-1)?.progress ?? {
        readAgentsMd: false,
        loadedSkills: [],
      };
      await step.run("handoff-checkpoint", () =>
        takeCheckpoint({ projectId, run: runContext }),
      );
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
              readAgentsMd: progress.readAgentsMd,
              loadedSkills: progress.loadedSkills.slice(0, 20),
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

    const rawReply = outOfCredits
      ? [summary, STOPPED_FOR_CREDITS].filter(Boolean).join("\n\n")
      : (summary ?? "");

    const reviewed = await step.run("guard-output", async () => {
      const text = await redactPatterns(rawReply);
      if (!text.trim()) {
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

    const parts: AgentPart[] = [
      ...reasoningParts,
      {
        type: "task",
        title: title.text,
        items: [sandbox.task, ...runs.flatMap((run) => run.tasks)],
      },
      ...toolParts,
      ...sourceParts,
      { type: "text", text: replyText },
    ];

    const saved = await step.run("persist", async () => {
      const publish = createPublisher(projectId, patternRedactor);
      await publish("status", { state: "compiling" });
      const { sandbox: box, recovered } = await connectOrRecover(
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
      await ensureDevOrigins(box);
      await box.commands
        .run(
          `curl -s -o /dev/null --max-time 90 http://localhost:${PREVIEW_PORT}/`,
          { cwd: APP_DIR, timeoutMs: 100_000 },
        )
        .catch(() => null);
      const files = await snapshotSandbox(box);
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
        title: title.text,
        content: replyText,
        parts: patternRedactor.redactDeep(parts),
        files,
        creditCost: credits,
        previewUrl,
        chainId,
      });
      return {
        ...result,
        previewUrl,
        fileCount: Object.keys(files).length,
      };
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
        guard: guardMeta,
      });
      const publish = createPublisher(projectId);
      await publish("credits", { used: credits });
      await publish("preview", { url: saved.previewUrl });
      await publish("status", { state: "done" });
    });

    return {
      status: outOfCredits
        ? ("stopped-for-credits" as const)
        : ("done" as const),
      search,
      guard: guardMeta,
      version: saved.versionNumber,
      files: saved.fileCount,
      filesChanged: written.length,
      credits,
      costUsd: cost.costUsd,
      agentCosts: cost.agents,
      model: model.id,
      previewUrl: saved.previewUrl,
    };
  },
);
