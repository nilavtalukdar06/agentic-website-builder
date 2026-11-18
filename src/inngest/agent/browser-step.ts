import "server-only";
import type { GetStepTools } from "inngest";
import type {
  BrowserCheck,
  BrowserViewport,
  TaskItem,
} from "@/lib/agent/parts";
import type { AgentModel } from "@/lib/ai/models";
import { browserAvailability } from "@/server/browser";
import {
  interactionDiagnostic,
  pageLabel,
  pageReportToDiagnostics,
  pageSummary,
} from "@/server/browser/checks";
import {
  type BrowserModelCall,
  type BrowserProvider,
  OriginError,
  viewports,
} from "@/server/browser/types";
import type { Diagnostic } from "@/server/sandbox/diagnostics";
import { storeAttachment } from "@/server/storage/attachments";
import type { inngest } from "../client";
import { createPublisher } from "../publisher";
import { patternRedactor } from "./guardrails/redact";

type Step = GetStepTools<typeof inngest>;

export const MAX_PAGE_LOADS = 8;
export const MAX_INTERACTIONS = 5;
export const BROWSER_TIME_BUDGET_MS = 120_000;

export type BrowserInteraction = {
  route: string;
  action: string;
  expect: string;
};

export type BrowserCheckResult = {
  status: "passed" | "failed" | "skipped";
  reason: string | null;
  checks: BrowserCheck[];
  screenshots: { viewport: BrowserViewport; key: string }[];
  diagnostics: Diagnostic[];
  calls: BrowserModelCall[];
  ms: number;
};

export function planVisits(routes: string[], max = MAX_PAGE_LOADS) {
  const unique = [...new Set(["/", ...routes])].filter(
    (route) => route.startsWith("/") && !route.includes("["),
  );
  const visits: { route: string; viewport: BrowserViewport }[] = [];
  for (const route of unique) {
    for (const viewport of ["desktop", "phone"] as const) {
      if (visits.length < max) visits.push({ route, viewport });
    }
  }
  return visits;
}

export function screenshotKey(
  projectId: string,
  runId: string,
  round: number,
  viewport: BrowserViewport,
) {
  return `qa/${projectId}/${runId}/${round}-${viewport}.png`;
}

function skipped(
  reason: string,
  started: number,
  now = Date.now,
): BrowserCheckResult {
  return {
    status: "skipped",
    reason,
    checks: [],
    screenshots: [],
    diagnostics: [],
    calls: [],
    ms: now() - started,
  };
}

export async function checkInBrowser({
  projectId,
  runId,
  round,
  previewUrl,
  model,
  routes,
  interactions,
  provider,
  store = (key, bytes) =>
    storeAttachment(
      key,
      new Blob([bytes.slice().buffer as ArrayBuffer], { type: "image/png" }),
      "image/png",
    ),
  now = Date.now,
  shouldStop = async () => false,
  canSpend = () => true,
}: {
  projectId: string;
  runId: string;
  round: number;
  previewUrl: string;
  model: AgentModel;
  routes: string[];
  interactions: BrowserInteraction[];
  provider: BrowserProvider | { disabled: string };
  store?: (key: string, bytes: Uint8Array) => Promise<unknown>;
  now?: () => number;
  shouldStop?: () => Promise<boolean>;
  canSpend?: (calls: BrowserModelCall[]) => boolean;
}): Promise<BrowserCheckResult> {
  const started = now();
  const publish = createPublisher(projectId, patternRedactor);
  const close = async (status: BrowserCheckResult["status"], summary: string) =>
    publish("browser", { phase: "closed", status, summary });

  if ("disabled" in provider) {
    await close("skipped", `Browser check skipped: ${provider.disabled}.`);
    return skipped(provider.disabled, started, now);
  }

  const calls: BrowserModelCall[] = [];
  let stoppedReason: string | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    stoppedReason = "the browser time budget ran out";
    controller.abort();
  }, BROWSER_TIME_BUDGET_MS);
  const guard = async () => {
    if (await shouldStop()) stoppedReason = "the run was stopped";
    else if (!canSpend(calls)) stoppedReason = "the credits ran out";
    else if (now() - started >= BROWSER_TIME_BUDGET_MS)
      stoppedReason = "the browser time budget ran out";
    if (stoppedReason) throw new Error(stoppedReason);
  };
  let session;
  try {
    await guard();
    session = await provider.open({
      previewUrl,
      model,
      onModelCall: (call) => calls.push(call),
      beforeModelCall: guard,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    void error;
    await close(
      "skipped",
      `Browser check skipped: ${stoppedReason ?? "the browser couldn't start"}.`,
    );
    return {
      ...skipped(stoppedReason ?? "the browser couldn't start", started, now),
      calls,
    };
  }

  const checks: BrowserCheck[] = [];
  const diagnostics: Diagnostic[] = [];
  const screenshots: BrowserCheckResult["screenshots"] = [];
  const emit = async (check: BrowserCheck) => {
    const clean = patternRedactor.redactDeep(check);
    const index = checks.findIndex((item) => item.id === clean.id);
    if (index === -1) checks.push(clean);
    else checks[index] = clean;
    await publish("browser", { phase: "check", check: clean });
  };

  try {
    await publish("browser", {
      phase: "session",
      liveUrl: session.liveUrl,
      round,
    });

    for (const { route, viewport } of planVisits(routes)) {
      await guard();
      const check: BrowserCheck = {
        id: `${round}-page-${viewport}-${route}`,
        kind: "page",
        label: `Open ${route} at ${viewports[viewport].label.toLowerCase()} width`,
        route,
        viewport,
        status: "running",
        detail: null,
      };
      await emit(check);
      try {
        const report = await session.visit(route, viewport);
        const found = pageReportToDiagnostics(report, route, viewport);
        diagnostics.push(...found);
        await emit({
          ...check,
          status: found.length > 0 ? "failed" : "passed",
          detail: pageSummary(found),
        });
        if (route === "/") {
          const key = screenshotKey(projectId, runId, round, viewport);
          try {
            await store(key, await session.screenshot());
            screenshots.push({ viewport, key });
          } catch (error) {
            console.warn("[browser] screenshot failed", error);
          }
        }
      } catch (error) {
        if (stoppedReason) break;
        if (error instanceof OriginError) {
          stoppedReason = "the page tried to leave the preview";
          await emit({ ...check, status: "failed", detail: error.message });
          break;
        }
        const message = error instanceof Error ? error.message : String(error);
        diagnostics.push({
          source: "browser",
          path: null,
          line: null,
          message: `${pageLabel(route, viewport)}: the page didn't load in the browser (${message.slice(0, 200)}).`,
        });
        await emit({
          ...check,
          status: "failed",
          detail: "The page didn't load",
        });
      }
    }

    for (const [index, interaction] of interactions
      .slice(0, MAX_INTERACTIONS)
      .entries()) {
      if (stoppedReason) break;
      await guard();
      const check: BrowserCheck = {
        id: `${round}-act-${index}`,
        kind: "interaction",
        label: interaction.action,
        route: interaction.route,
        viewport: "desktop",
        status: "running",
        detail: null,
      };
      await emit(check);
      try {
        await session.visit(interaction.route, "desktop");
        const result = await session.interact(
          interaction.action,
          interaction.expect,
        );
        if (!result.passed) {
          diagnostics.push(
            interactionDiagnostic(
              interaction.route,
              interaction.action,
              interaction.expect,
              result.detail,
            ),
          );
        }
        await emit({
          ...check,
          status: result.passed ? "passed" : "failed",
          detail: result.detail,
        });
      } catch (error) {
        if (stoppedReason) break;
        if (error instanceof OriginError) {
          stoppedReason = "the page tried to leave the preview";
          await emit({ ...check, status: "failed", detail: error.message });
          break;
        }
        const message = error instanceof Error ? error.message : String(error);
        diagnostics.push(
          interactionDiagnostic(
            interaction.route,
            interaction.action,
            interaction.expect,
            `the step couldn't be completed (${message.slice(0, 160)})`,
          ),
        );
        await emit({
          ...check,
          status: "failed",
          detail: "Couldn't complete this step",
        });
      }
    }
    await guard();
  } catch {
    stoppedReason ??= "the browser check couldn't finish";
  } finally {
    clearTimeout(timer);
    controller.abort();
    await session.close().catch(() => undefined);
  }

  const status =
    diagnostics.length > 0 ? "failed" : stoppedReason ? "skipped" : "passed";
  const pages = checks.filter((check) => check.kind === "page").length;
  const acts = checks.filter((check) => check.kind === "interaction").length;
  const summary =
    status === "skipped"
      ? `Browser check incomplete: ${stoppedReason}.`
      : status === "passed"
        ? `Checked ${pages} page views${acts > 0 ? ` and ${acts} interactions` : ""} in the browser: all good${stoppedReason ? ` (stopped early: ${stoppedReason})` : ""}.`
        : `The browser found ${diagnostics.length} ${diagnostics.length === 1 ? "problem" : "problems"}.`;
  await close(status, summary);
  return {
    status,
    reason: stoppedReason,
    checks,
    screenshots,
    diagnostics: patternRedactor.redactDeep(diagnostics),
    calls,
    ms: now() - started,
  };
}

export async function runBrowserCheck({
  step,
  stepId,
  ...input
}: Omit<Parameters<typeof checkInBrowser>[0], "provider"> & {
  step: Step;
  stepId: string;
}): Promise<BrowserCheckResult & { task: TaskItem }> {
  return step.run(stepId, async () => {
    const availability = browserAvailability();
    const result = await checkInBrowser({
      ...input,
      provider: availability.enabled
        ? availability.provider
        : { disabled: availability.reason },
    });
    const task: TaskItem = {
      kind: "note",
      label:
        result.status === "skipped"
          ? `Browser check skipped: ${result.reason}`
          : result.status === "passed"
            ? "Checked the site in the browser on desktop and phone: no problems"
            : `The browser found ${result.diagnostics.length} ${result.diagnostics.length === 1 ? "problem" : "problems"}`,
    };
    await createPublisher(input.projectId)("task", task);
    return { ...result, task };
  }) as Promise<BrowserCheckResult & { task: TaskItem }>;
}
