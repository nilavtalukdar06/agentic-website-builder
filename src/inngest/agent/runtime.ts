import "server-only";
import { db } from "@/server/db";
import {
  connectOrRecover,
  type ReplayWrite,
  recoverSandbox,
  type SandboxRef,
} from "@/server/sandbox/recover";
import { isSandboxGone } from "@/server/sandbox/errors";
import { connectSandbox, snapshotSandbox } from "@/server/sandbox/sandbox";
import { createPublisher } from "../publisher";
import {
  executeTool,
  type ToolCall,
  type ToolContext,
  type ToolOutcome,
} from "./execute-tool";
import { recordGuardEvent } from "./guardrails/events";
import { patternRedactor } from "./guardrails/redact";
import { saveCheckpoint } from "./persist";

export const RECOVERED_NOTE =
  "(The sandbox expired and was restored from the last checkpoint, with your file writes since then replayed. Changes made by commands since the checkpoint, such as installed packages, may be missing: check package.json and reinstall if needed.)";

export type RunContext = {
  runId: string;
  chainId: string;
  userId: string;
  messageId: string;
  restricted: boolean;
  sandbox: SandboxRef;
  pendingWrites: Map<string, string>;
  steps: number;
  stateBytes: number;
};

export type StepToolOutcome = ToolOutcome & { sandbox: SandboxRef | null };

export function replayOf(
  run: Pick<RunContext, "pendingWrites">,
): ReplayWrite[] {
  return [...run.pendingWrites].map(([path, content]) => ({ path, content }));
}

export async function runToolStep({
  call,
  projectId,
  run,
  base,
  replay,
}: {
  call: ToolCall;
  projectId: string;
  run: Pick<
    RunContext,
    "chainId" | "userId" | "runId" | "restricted" | "sandbox"
  >;
  base: Omit<ToolContext, "sandbox" | "publish">;
  replay: ReplayWrite[];
}): Promise<StepToolOutcome> {
  const publish = createPublisher(projectId, patternRedactor);
  const recover = () =>
    recoverSandbox({ projectId, chainId: run.chainId, replay });
  let { sandbox, recovered } = await connectOrRecover(run.sandbox, recover);

  const ctx: ToolContext = {
    ...base,
    sandbox,
    publish,
    redactor: patternRedactor,
    restricted: run.restricted,
  };

  let outcome: ToolOutcome;
  try {
    outcome = await executeTool(call, ctx);
  } catch (error) {
    if (!isSandboxGone(error) || recovered) throw error;
    const result = await recover();
    sandbox = result.sandbox;
    recovered = result.ref;
    outcome = await executeTool(call, { ...ctx, sandbox });
  }

  if (recovered) {
    await publish("preview", { url: recovered.previewUrl });
    outcome = { ...outcome, output: `${RECOVERED_NOTE}\n\n${outcome.output}` };
  }
  if (outcome.guard) {
    await recordGuardEvent(db, {
      userId: run.userId,
      projectId,
      runId: run.runId,
      stage: outcome.guard.stage,
      verdict: outcome.guard.verdict,
      categories: outcome.guard.categories,
      text: outcome.guard.text,
    });
    await publish("guard", { stage: "tool", verdict: "block" });
    outcome = { ...outcome, guard: { ...outcome.guard, text: "" } };
  }
  return { ...outcome, sandbox: recovered };
}

export async function takeCheckpoint({
  projectId,
  run,
}: {
  projectId: string;
  run: Pick<RunContext, "chainId" | "runId" | "sandbox">;
}) {
  try {
    const box = await connectSandbox(run.sandbox.id);
    const files = await snapshotSandbox(box);
    return await saveCheckpoint(db, {
      projectId,
      chainId: run.chainId,
      runId: run.runId,
      files,
    });
  } catch (error) {
    console.warn("[run-agent] checkpoint failed", error);
    return false;
  }
}
