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
import {
  createInputRequest,
  describeAnswer,
  loadAnsweredInputs,
} from "@/server/inputs/requests";
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
import { prepareSandboxSecrets } from "@/server/secrets/inject";
import { createRedactor } from "@/server/secrets/redact";
import { loadSecretValues, projectHoldsSecrets } from "@/server/secrets/store";
import { agentSpecs } from "../agent/agents";
import { hasFindings } from "../agent/agents/reviewer";
import {
  type Brief,
  briefsMessage,
  capBrief,
  cleanTitle,
  historyToMessages,
} from "../agent/conversation";
import { classifyText } from "../agent/guardrails/classifier";
import { recordGuardEvent } from "../agent/guardrails/events";
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
  publishAgentState,
  runAgentLoop,
} from "../agent/loop";
import { classifyAgents, generateVersionTitle } from "../agent/model";
import { takeCheckpoint } from "../agent/runtime";
import { MODEL_UNAVAILABLE } from "../agent/model-errors";
import {
  debitCredits,
  loadRestoreFiles,
  READY,
  recordAssistantError,
  recordPausedReply,
  saveRunResult,
} from "../agent/persist";
import {
  BLOCKED,
  GUARD_UNAVAILABLE,
  SECRET_IN_PROMPT,
  WAITING,
} from "../agent/replies";
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
const REPLY_BLOCKED =
  "I finished the work, but my reply didn't pass the safety check, so it isn't shown. The files are saved in this version.";

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

type GuardMeta = { input: string; output?: string };

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
        await db.inputRequest.updateMany({
          where: { runId, status: { in: ["PENDING", "PAUSED"] } },
          data: { status: "CANCELLED" },
        });
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
      const [model, history, latest, { balance }, holdsSecrets, answered] =
        await Promise.all([
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
          projectHoldsSecrets(db, projectId),
          loadAnsweredInputs(db, projectId),
        ]);
      if (balance > 0) {
        await createPublisher(projectId)("status", { state: "thinking" });
      }
      if (!model) {
        throw new NonRetriableError("No AI model is available.");
      }
      const resumed = resume
        ? answered.find((entry) => entry.id === resume.requestId)
        : undefined;
      return {
        model,
        projectName: project.name,
        sandboxId: project.sandboxId,
        prompt: trigger.content,
        attachments: trigger._count.attachments,
        history: history.filter(
          (message) =>
            !(
              resume &&
              message.role === "ASSISTANT" &&
              (message.content === WAITING ||
                message.content === SECRET_IN_PROMPT)
            ),
        ),
        balance,
        holdsSecrets,
        hasVersion: latest !== null,
        files: Object.keys((latest?.files ?? {}) as Record<string, string>),
        answered: answered
          .filter((entry) => entry.id !== resume?.requestId)
          .map((entry) => describeAnswer(entry.payload, entry.answer)),
        resumed: resumed
          ? describeAnswer(resumed.payload, resumed.answer)
          : null,
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
        if (matches.length === 0) return null;
        const redacted = redactMatches(setup.prompt, matches);
        await db.message.update({
          where: { id: messageId },
          data: { content: redacted },
        });
        await db.project.updateMany({
          where: { id: projectId, description: setup.prompt },
          data: { description: redacted },
        });
        const name = matches[0].suggestedName;
        const requestId = `input_${runId}_guard`;
        const payload = {
          kind: "secret" as const,
          name,
          label: name.replace(/_/g, " ").toLowerCase(),
          reason:
            "You pasted it in your message. Store it here instead and I'll use it without ever seeing it.",
        };
        await createInputRequest(db, {
          id: requestId,
          projectId,
          userId,
          runId,
          chainId,
          messageId,
          agent: "builder",
          payload,
          status: "PAUSED",
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
        const parts: AgentPart[] = [
          { type: "input-request", requestId, agent: "builder", payload },
          { type: "text", text: SECRET_IN_PROMPT },
        ];
        await recordPausedReply(db, {
          projectId,
          runId,
          content: SECRET_IN_PROMPT,
          parts,
        });
        const publish = createPublisher(projectId);
        await publish("guard", { stage: "input", verdict: "secret" });
        await publish("input", {
          requestId,
          kind: "secret",
          status: "paused",
        });
        await publish("status", { state: "paused", message: SECRET_IN_PROMPT });
        return { requestId };
      });
      if (secretHit) {
        return { status: "secret-in-prompt" as const, ...secretHit };
      }
    }

    const model = setup.model;
    const [guard, routed] = await Promise.all([
      resume
        ? Promise.resolve({
            verdict: "allow" as const,
            categories: [] as string[],
            skipped: false,
            call: null as BilledCall | null,
            usage: emptyUsage as TokenUsage,
          })
        : step.run("guard-classify", async () => {
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
              return {
                verdict: "allow" as const,
                categories: [] as string[],
                skipped: true,
                call: null as BilledCall | null,
                usage: emptyUsage as TokenUsage,
              };
            }
          }),
      step.run("route", async () => {
        if (resume) {
          return {
            route: {
              agents: ["builder"] as AgentName[],
              reason: "Continuing a request that is already underway.",
              decidedBy: "rules" as const,
            },
            call: null as BilledCall | null,
            usage: emptyUsage as TokenUsage,
          };
        }
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
      }),
    ]);

    const failClosed = guard.skipped && setup.holdsSecrets;
    if (guard.verdict === "block" || failClosed) {
      const message = failClosed ? GUARD_UNAVAILABLE : BLOCKED;
      await step.run("guard-blocked", async () => {
        if (!failClosed) {
          await recordGuardEvent(db, {
            userId,
            projectId,
            runId,
            stage: "input",
            verdict: "block",
            categories: guard.categories,
            text: setup.prompt,
          });
        }
        await recordAssistantError(db, { projectId, runId, message });
        const publish = createPublisher(projectId);
        if (!failClosed) {
          await publish("guard", { stage: "input", verdict: "block" });
        }
        await publish("status", { state: "error", message });
      });
      return {
        status: failClosed
          ? ("guard-unavailable" as const)
          : ("blocked" as const),
        categories: guard.categories,
      };
    }

    const restricted = guard.verdict === "review";
    if (restricted) {
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
      input: guard.skipped ? "skipped" : guard.verdict,
    };

    const sandbox = await step.run("sandbox", async () => {
      const result = await getOrCreateSandbox(setup.sandboxId, () =>
        loadRestoreFiles(db, {
          projectId,
          chainId: resume ? chainId : null,
        }),
      );
      await ensureDevOrigins(result.sandbox);
      await ensureAgentInstructions(result.sandbox);
      const secrets = await loadSecretValues(db, projectId);
      await prepareSandboxSecrets(result.sandbox, secrets, {
        restart: result.created,
      });
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

    let usage = addUsage(routed.usage, guard.usage);
    const calls: BilledCall[] = [routed.call, guard.call].filter(
      (call): call is BilledCall => call !== null,
    );
    let budget: Budget = {
      balance: setup.balance,
      spentUsd: calls.reduce((sum, call) => sum + call.estimatedUsd, 0),
      searches: 0,
    };
    const runs: AgentRun[] = [];
    const agentParts: AgentPart[] = [];

    const loopArgs = {
      step,
      projectId,
      run: runContext,
      model,
      installedSkills: sandbox.skills,
    };
    const notes: ModelMessage[] = [
      ...(setup.answered.length > 0
        ? [
            {
              role: "user" as const,
              content: `(Answers the user already gave in this project. Don't ask these again.)\n${setup.answered.map((line) => `- ${line}`).join("\n")}`,
            },
          ]
        : []),
      ...(resume?.handoff
        ? [
            {
              role: "user" as const,
              content: `(Continuing this request in a fresh run: the previous run used up its room and handed over to you. The project files are exactly as it left them. Its handoff note:\n<handoff>\n${resume.handoff.note}\n</handoff>\nFiles changed so far: ${resume.handoff.written.join(", ") || "none"}.\nPick up from there and finish the whole request, then reply with the task_summary for the whole request.)`,
            },
          ]
        : []),
      ...(setup.resumed
        ? [
            {
              role: "user" as const,
              content: `(Continuing this request. You paused to ask the user a question. ${setup.resumed}\nThe project files are as you left them. Continue from where you stopped and finish the request.)`,
            },
          ]
        : []),
    ];
    const visionHistory = [
      ...historyToMessages(setup.history, setup.files, {
        vision: model.vision,
      }),
      ...notes,
    ];
    const textHistory = [
      ...historyToMessages(setup.history, setup.files, { vision: false }),
      ...notes,
    ];

    const readers = routed.route.agents.filter(
      (name): name is "researcher" | "designer" =>
        (name === "researcher" && !restricted && !resume) ||
        (name === "designer" && !resume),
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
    let written: string[] = resume?.handoff?.written ?? [];
    let paused: { requestId: string } | null = null;
    let handoff: string | null = null;
    const handoffProgress = resume?.handoff
      ? {
          readAgentsMd: resume.handoff.readAgentsMd,
          loadedSkills: resume.handoff.loadedSkills,
          installs: resume.handoff.installs,
        }
      : undefined;

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
        expectWrites: !resume,
        written,
        progress: handoffProgress,
      });
      runs.push(build);
      budget = spend(budget, build);
      outOfCredits = build.outOfCredits;
      written = build.written;
      paused = build.paused;
      handoff = build.handoff;
      summary = build.output;
      const builderPart: AgentPart = {
        type: "agent",
        name: "builder",
        state: "done",
        summary: `${written.length} file${written.length === 1 ? "" : "s"} changed`,
        skills: build.progress.loadedSkills,
        searches: 0,
      };
      if (!paused && !handoff) {
        await publishAgentState(step, projectId, "builder-done", {
          name: "builder",
          state: "done",
          summary: builderPart.summary,
        });
      }
      agentParts.push(builderPart);
      let builderMessages = build.messages;
      let builderProgress = build.progress;

      if (
        !paused &&
        !handoff &&
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
            messages: [...builderMessages, fixPrompt],
            budget,
            stepPrefix: "builder-fix",
            written,
            progress: builderProgress,
          });
          runs.push(fix);
          budget = spend(budget, fix);
          outOfCredits = fix.outOfCredits;
          written = fix.written;
          paused = fix.paused;
          handoff = fix.handoff;
          builderMessages = fix.messages;
          builderProgress = fix.progress;
          if (fix.finished && fix.output) summary = fix.output;
          if (!paused && !handoff) {
            await publishAgentState(step, projectId, "builder-fix-done", {
              name: "builder",
              state: "done",
              summary: "Fixed the reviewer's findings",
            });
          }
          const builderIndex = agentParts.indexOf(builderPart);
          agentParts[builderIndex] = {
            ...builderPart,
            summary: `${written.length} file${written.length === 1 ? "" : "s"} changed, one fix pass`,
          };
        }
      }

      if (!paused && !handoff && !outOfCredits && written.length > 0) {
        const hits = await step.run("secret-scan", async () => {
          const secrets = await loadSecretValues(db, projectId);
          const { sandbox: box } = await connectOrRecover(
            runContext.sandbox,
            () =>
              recoverSandbox({
                projectId,
                chainId,
                replay: [...runContext.pendingWrites].map(
                  ([path, content]) => ({ path, content }),
                ),
                secrets,
              }),
          );
          return scanFiles(await snapshotSandbox(box), createRedactor(secrets));
        });
        if (hits.length > 0 && !exhausted(budget)) {
          const scanFix = await runAgentLoop({
            ...loopArgs,
            spec: agentSpecs.builder,
            messages: [
              ...builderMessages,
              { role: "user", content: scanFixPrompt(hits) },
            ],
            budget,
            stepPrefix: "builder-scan-fix",
            written,
            progress: builderProgress,
          });
          runs.push(scanFix);
          budget = spend(budget, scanFix);
          outOfCredits = scanFix.outOfCredits;
          written = scanFix.written;
          paused = scanFix.paused;
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

    if (handoff && !paused) {
      const note = handoff;
      const lastBuilder = [...runs]
        .reverse()
        .find((run) => run.agent === "builder");
      const progress = lastBuilder?.progress ?? {
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

    if (paused) {
      const pausedAt = paused;
      const cost = await step.run("cost", () =>
        resolveRunCost(calls, lookupGenerationCost),
      );
      const credits = creditsForCost(cost.costUsd, creditRate);
      await step.run("persist-paused", async () => {
        const parts: AgentPart[] = [
          ...reasoningParts,
          ...agentParts,
          {
            type: "task",
            title: "Waiting for your answer",
            items: [sandbox.task, ...runs.flatMap((run) => run.tasks)],
          },
          ...toolParts,
          ...sourceParts,
          { type: "text", text: WAITING },
        ];
        const redactor = createRedactor(await loadSecretValues(db, projectId));
        await recordPausedReply(db, {
          projectId,
          runId,
          content: WAITING,
          parts: redactor.redactDeep(parts),
        });
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
          versionNumber: null,
          paused: true,
          guard: guardMeta,
        });
        const publish = createPublisher(projectId);
        await publish("credits", { used: credits });
        await publish("status", { state: "paused", message: WAITING });
      });
      return {
        status: "paused" as const,
        requestId: pausedAt.requestId,
        credits,
        filesChanged: written.length,
      };
    }

    const rawReply = outOfCredits
      ? [summary, STOPPED_FOR_CREDITS].filter(Boolean).join("\n\n")
      : (summary ?? "");

    const reviewed = await step.run("guard-output", async () => {
      const secrets = await loadSecretValues(db, projectId);
      const text = await redactPatterns(
        createRedactor(secrets).redact(rawReply),
      );
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
      ...agentParts,
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
      const secrets = await loadSecretValues(db, projectId);
      const redactor = createRedactor(secrets);
      const publish = createPublisher(projectId, redactor);
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
            secrets,
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
      const hits = await scanFiles(files, redactor);
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
        parts: redactor.redactDeep(parts),
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
      agents: routed.route.agents,
      route: routed.route.decidedBy,
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
