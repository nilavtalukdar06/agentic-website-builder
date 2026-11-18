import type { PrismaClient } from "@/generated/prisma/client";
import type { AgentPart } from "@/lib/agent/parts";
import type { TokenUsage } from "@/server/billing/pricing";
import type { RunCost } from "@/server/billing/run-cost";
import type { SnapshotFiles } from "@/server/sandbox/sandbox";
import { scanFiles } from "./guardrails/scan";

export const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 };

export const replyId = (runId: string) => `run_${runId}_reply`;
export const versionId = (runId: string) => `run_${runId}_version`;
export const debitId = (runId: string) => `run_${runId}_debit`;
export const checkpointId = (chainId: string) => `checkpoint_${chainId}`;
export const READY = { status: "READY" } as const;

type Db = Pick<
  PrismaClient,
  "message" | "version" | "project" | "creditLedger" | "$transaction"
>;

export async function recordAssistantError(
  db: Pick<PrismaClient, "message">,
  {
    projectId,
    runId,
    message,
    replyToId,
  }: {
    projectId: string;
    runId: string;
    message: string;
    replyToId?: string | null;
  },
) {
  const parts: AgentPart[] = [{ type: "error", message }];
  return db.message.upsert({
    where: { id: replyId(runId) },
    create: {
      id: replyId(runId),
      projectId,
      role: "ASSISTANT",
      content: message,
      parts,
      replyToId: replyToId ?? null,
    },
    update: {},
  });
}

export async function saveCheckpoint(
  db: Pick<PrismaClient, "version">,
  input: {
    projectId: string;
    chainId: string;
    runId: string;
    files: SnapshotFiles;
  },
) {
  if ((await scanFiles(input.files)).length > 0) return false;
  const data = {
    runId: input.runId,
    files: input.files,
    title: "Checkpoint",
  };
  await db.version.upsert({
    where: { id: checkpointId(input.chainId) },
    create: {
      id: checkpointId(input.chainId),
      projectId: input.projectId,
      status: "DRAFT",
      number: null,
      creditCost: 0,
      ...data,
    },
    update: data,
  });
  return true;
}

export async function loadRestoreFiles(
  db: Pick<PrismaClient, "version">,
  { projectId, chainId }: { projectId: string; chainId?: string | null },
) {
  const draft = chainId
    ? await db.version.findFirst({
        where: { id: checkpointId(chainId), projectId },
        select: { files: true },
      })
    : null;
  const latest =
    draft ??
    (await db.version.findFirst({
      where: { projectId, ...READY },
      orderBy: { number: "desc" },
      select: { files: true },
    }));
  return (latest?.files ?? undefined) as SnapshotFiles | undefined;
}

export async function saveRunResult(
  db: Db,
  input: {
    projectId: string;
    runId: string;
    title: string;
    content: string;
    parts: AgentPart[];
    files: SnapshotFiles;
    creditCost: number;
    previewUrl: string;
    chainId?: string;
    replyToId?: string | null;
    saveVersion?: boolean;
  },
) {
  const saveVersion = input.saveVersion ?? true;
  return db.$transaction(async (tx) => {
    const reply = {
      where: { id: replyId(input.runId) },
      create: {
        id: replyId(input.runId),
        projectId: input.projectId,
        role: "ASSISTANT" as const,
        content: input.content,
        parts: input.parts,
        replyToId: input.replyToId ?? null,
      },
      update: {},
    };
    const dropCheckpoint = () =>
      input.chainId
        ? tx.version.deleteMany({
            where: {
              id: checkpointId(input.chainId),
              projectId: input.projectId,
            },
          })
        : null;

    if (!saveVersion) {
      await dropCheckpoint();
      await tx.message.upsert(reply);
      return { versionNumber: null };
    }

    const existing = await tx.version.findUnique({
      where: { id: versionId(input.runId) },
      select: { number: true },
    });
    if (existing?.number != null) {
      return { versionNumber: existing.number };
    }

    const latest = await tx.version.findFirst({
      where: { projectId: input.projectId, ...READY },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const number = (latest?.number ?? 0) + 1;

    await tx.version.create({
      data: {
        id: versionId(input.runId),
        projectId: input.projectId,
        number,
        title: input.title,
        files: input.files,
        creditCost: input.creditCost,
        runId: input.runId,
      },
    });
    await dropCheckpoint();
    await tx.message.upsert(reply);
    await tx.project.update({
      where: { id: input.projectId },
      data: { previewUrl: input.previewUrl },
    });
    return { versionNumber: number };
  }, TRANSACTION_OPTIONS);
}

export async function debitCredits(
  db: Pick<PrismaClient, "creditLedger">,
  input: {
    userId: string;
    projectId: string;
    runId: string;
    credits: number;
    firstVersion: boolean;
    usage: TokenUsage;
    model: string;
    cost: RunCost;
    versionNumber: number | null;
    handoff?: boolean;
    guard?: { input: string; output?: string };
    run?: {
      intent: string;
      timings: Record<string, number>;
      issues?: number;
      memory?: { read: string; reads: number; write: string };
    };
  },
) {
  if (input.credits <= 0) return null;
  return db.creditLedger.upsert({
    where: { id: debitId(input.runId) },
    create: {
      id: debitId(input.runId),
      userId: input.userId,
      projectId: input.projectId,
      delta: -input.credits,
      reason: input.firstVersion ? "GENERATION" : "EDIT",
      meta: {
        runId: input.runId,
        model: input.model,
        version: input.versionNumber,
        costUsd: input.cost.costUsd,
        exactCalls: input.cost.exactCalls,
        estimatedCalls: input.cost.estimatedCalls,
        generationIds: input.cost.generationIds,
        agents: input.cost.agents,
        ...(input.handoff ? { handoff: true } : {}),
        ...(input.guard ? { guard: input.guard } : {}),
        ...(input.run ? { run: input.run } : {}),
        ...input.usage,
      },
    },
    update: {},
  });
}
