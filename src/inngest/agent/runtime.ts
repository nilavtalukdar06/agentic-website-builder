import "server-only";
import type { AgentName, InputPayload } from "@/lib/agent/parts";
import { db } from "@/server/db";
import {
  createInputRequest,
  findPriorAnswer,
  loadApprovals,
  pauseInputRequest,
  readAnswer,
  type StoredAnswer,
} from "@/server/inputs/requests";
import {
  connectOrRecover,
  type ReplayWrite,
  recoverSandbox,
  type SandboxRef,
} from "@/server/sandbox/recover";
import { isSandboxGone } from "@/server/sandbox/errors";
import {
  connectSandbox,
  extendSandbox,
  snapshotSandbox,
} from "@/server/sandbox/sandbox";
import { prepareSandboxSecrets, secretEnvs } from "@/server/secrets/inject";
import { createRedactor } from "@/server/secrets/redact";
import { loadSecretValues } from "@/server/secrets/store";
import { createPublisher } from "../publisher";
import {
  executeTool,
  type PendingInput,
  type ToolCall,
  type ToolContext,
  type ToolOutcome,
} from "./execute-tool";
import { recordGuardEvent } from "./guardrails/events";
import { saveCheckpoint } from "./persist";

export const WAIT_SANDBOX_TIMEOUT_MS = 45 * 60_000;

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
  questions: number;
  steps: number;
  stateBytes: number;
};

export type StepToolOutcome = ToolOutcome & { sandbox: SandboxRef | null };

export async function loadRedactor(projectId: string) {
  return createRedactor(await loadSecretValues(db, projectId));
}

function replayOf(run: RunContext): ReplayWrite[] {
  return [...run.pendingWrites].map(([path, content]) => ({ path, content }));
}

export async function runToolStep({
  call,
  projectId,
  run,
  base,
  approved = false,
  replay,
}: {
  call: ToolCall;
  projectId: string;
  run: Pick<
    RunContext,
    "chainId" | "userId" | "runId" | "restricted" | "sandbox"
  >;
  base: Omit<ToolContext, "sandbox" | "publish">;
  approved?: boolean;
  replay: ReplayWrite[];
}): Promise<StepToolOutcome> {
  const secrets = await loadSecretValues(db, projectId, { touch: true });
  const redactor = createRedactor(secrets);
  const approvals = await loadApprovals(db, projectId);
  const publish = createPublisher(projectId, redactor);
  const recover = () =>
    recoverSandbox({ projectId, chainId: run.chainId, replay, secrets });
  let { sandbox, recovered } = await connectOrRecover(run.sandbox, recover);

  const ctx: ToolContext = {
    ...base,
    sandbox,
    publish,
    redactor,
    envs: secretEnvs(secrets),
    approved,
    approvedPackages: approvals.packages,
    restricted: run.restricted,
  };

  const execute = async (context: ToolContext) => {
    const first = await executeTool(call, context);
    const action =
      first.pending?.payload.kind === "confirm"
        ? first.pending.payload.action
        : null;
    if (action && !context.approved && approvals.actions.includes(action)) {
      return executeTool(call, { ...context, approved: true });
    }
    return first;
  };

  let outcome: ToolOutcome;
  try {
    outcome = await execute(ctx);
  } catch (error) {
    if (!isSandboxGone(error) || recovered) throw error;
    const result = await recover();
    sandbox = result.sandbox;
    recovered = result.ref;
    outcome = await execute({ ...ctx, sandbox });
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
    await saveCheckpoint(db, {
      projectId,
      chainId: run.chainId,
      runId: run.runId,
      files,
    });
    return true;
  } catch (error) {
    console.warn("[run-agent] checkpoint failed", error);
    return false;
  }
}

export async function openInput({
  id,
  projectId,
  agent,
  pending,
  run,
}: {
  id: string;
  projectId: string;
  agent: AgentName;
  pending: PendingInput;
  run: Pick<
    RunContext,
    "chainId" | "runId" | "userId" | "messageId" | "sandbox"
  >;
}): Promise<{ immediate: StoredAnswer | null; checkpointed: boolean }> {
  const prior = await findPriorAnswer(db, {
    projectId,
    payload: pending.payload,
    excludeId: id,
  });
  if (prior) return { immediate: prior, checkpointed: false };
  await createInputRequest(db, {
    id,
    projectId,
    userId: run.userId,
    runId: run.runId,
    chainId: run.chainId,
    messageId: run.messageId,
    agent,
    payload: pending.payload,
    packages: pending.packages,
  });
  const checkpointed = await takeCheckpoint({ projectId, run });
  await extendSandbox(run.sandbox.id, WAIT_SANDBOX_TIMEOUT_MS).catch((error) =>
    console.warn("[run-agent] couldn't extend the sandbox", error),
  );
  await createPublisher(projectId)("input", {
    requestId: id,
    kind: pending.payload.kind,
    status: "open",
  });
  return { immediate: null, checkpointed };
}

export async function resolveInput({
  id,
  projectId,
  payload,
  timedOut,
  run,
}: {
  id: string;
  projectId: string;
  payload: InputPayload;
  timedOut: boolean;
  run: Pick<RunContext, "chainId" | "sandbox">;
}): Promise<
  | { paused: true }
  | { paused: false; answer: StoredAnswer; sandbox: SandboxRef | null }
> {
  const publish = createPublisher(projectId);
  if (timedOut && (await pauseInputRequest(db, id))) {
    await publish("input", {
      requestId: id,
      kind: payload.kind,
      status: "paused",
    });
    return { paused: true };
  }
  const answer = (await readAnswer(db, id)) ?? { ok: false };
  let recovered: SandboxRef | null = null;
  if (payload.kind === "secret" && answer.ok) {
    const secrets = await loadSecretValues(db, projectId);
    const connected = await connectOrRecover(run.sandbox, () =>
      recoverSandbox({ projectId, chainId: run.chainId, replay: [], secrets }),
    );
    recovered = connected.recovered;
    await prepareSandboxSecrets(connected.sandbox, secrets, { restart: true });
  }
  await publish("input", {
    requestId: id,
    kind: payload.kind,
    status: "answered",
  });
  return { paused: false, answer, sandbox: recovered };
}

export { replayOf };
