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
  const { outcomes, sandbox } = await runToolBatch({
    calls: [call],
    projectId,
    run,
    base,
    replay,
    isReadOnly: () => false,
  });
  return { ...outcomes[0], sandbox };
}

export type BatchOutcome = {
  outcomes: ToolOutcome[];
  sandbox: SandboxRef | null;
};

function readOnlyGroups(
  calls: ToolCall[],
  isReadOnly: (name: string) => boolean,
) {
  const groups: number[][] = [];
  for (const [index, call] of calls.entries()) {
    const last = groups.at(-1);
    const readOnly = isReadOnly(call.toolName);
    if (readOnly && last && isReadOnly(calls[last[0]].toolName)) {
      last.push(index);
    } else {
      groups.push([index]);
    }
  }
  return groups;
}

export async function runToolBatch({
  calls,
  projectId,
  run,
  base,
  replay,
  isReadOnly,
}: {
  calls: ToolCall[];
  projectId: string;
  run: Pick<
    RunContext,
    "chainId" | "userId" | "runId" | "restricted" | "sandbox"
  >;
  base: Omit<ToolContext, "sandbox" | "publish">;
  replay: ReplayWrite[];
  isReadOnly: (name: string) => boolean;
}): Promise<BatchOutcome> {
  const publish = createPublisher(projectId, patternRedactor);
  const recover = () =>
    recoverSandbox({ projectId, chainId: run.chainId, replay });
  let { sandbox, recovered } = await connectOrRecover(run.sandbox, recover);
  let recoveredNoted = false;
  let progress = base.progress;
  const writtenPaths = [...base.writtenPaths];
  const outcomes: ToolOutcome[] = new Array(calls.length);

  const execute = async (call: ToolCall): Promise<ToolOutcome> => {
    const ctx: ToolContext = {
      ...base,
      writtenPaths,
      progress,
      sandbox,
      publish,
      redactor: patternRedactor,
      restricted: run.restricted,
    };
    try {
      return await executeTool(call, ctx);
    } catch (error) {
      if (!isSandboxGone(error) || recovered) throw error;
      const result = await recover();
      sandbox = result.sandbox;
      recovered = result.ref;
      return executeTool(call, { ...ctx, sandbox });
    }
  };

  for (const group of readOnlyGroups(calls, isReadOnly)) {
    const results = await Promise.all(
      group.map((index) => execute(calls[index])),
    );
    for (const [offset, index] of group.entries()) {
      let outcome = results[offset];
      progress = outcome.progress;
      writtenPaths.push(...outcome.writtenPaths);
      if (recovered && !recoveredNoted) {
        recoveredNoted = true;
        await publish("preview", { url: recovered.previewUrl });
        outcome = {
          ...outcome,
          output: `${RECOVERED_NOTE}\n\n${outcome.output}`,
        };
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
      outcomes[index] = outcome;
    }
  }

  return { outcomes, sandbox: recovered };
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
