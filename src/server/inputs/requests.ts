import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  type InputKindName,
  type InputPayload,
  inputPayloadSchema,
  inputQuestion,
} from "@/lib/agent/parts";

export const INPUT_TIMEOUT = "30m";

export const storedPayloadSchema = z.object({
  request: inputPayloadSchema,
  packages: z.array(z.string()).optional(),
});

export type StoredPayload = z.infer<typeof storedPayloadSchema>;

export const storedAnswerSchema = z.object({
  ok: z.boolean(),
  answer: z.string().optional(),
});

export type StoredAnswer = z.infer<typeof storedAnswerSchema>;

export const toDbKind = (kind: InputKindName) =>
  kind.toUpperCase() as "CHOICE" | "TEXT" | "SECRET" | "CONFIRM";

export const fromDbKind = (kind: string) => kind.toLowerCase() as InputKindName;

export function questionHash(payload: InputPayload) {
  const key =
    payload.kind === "secret"
      ? `secret:${payload.name}`
      : `${payload.kind}:${inputQuestion(payload).trim().toLowerCase().replace(/\s+/g, " ")}`;
  return createHash("sha256").update(key).digest("hex");
}

export function inputRequestId(
  runId: string,
  prefix: string,
  turn: number,
  index: number,
) {
  return `input_${runId}_${prefix}_${turn}_${index}`;
}

type Db = Pick<PrismaClient, "inputRequest" | "projectSecret">;

export async function findPriorAnswer(
  db: Db,
  {
    projectId,
    payload,
    excludeId,
  }: { projectId: string; payload: InputPayload; excludeId: string },
): Promise<StoredAnswer | null> {
  if (payload.kind === "secret") {
    const set = await db.projectSecret.count({
      where: { projectId, name: payload.name },
    });
    return set > 0 ? { ok: true, answer: "set" } : null;
  }
  if (payload.kind === "confirm") return null;
  const prior = await db.inputRequest.findFirst({
    where: {
      projectId,
      questionHash: questionHash(payload),
      status: "ANSWERED",
      id: { not: excludeId },
    },
    orderBy: { answeredAt: "desc" },
    select: { answer: true },
  });
  const parsed = storedAnswerSchema.safeParse(prior?.answer);
  return parsed.success && parsed.data.ok ? parsed.data : null;
}

export async function createInputRequest(
  db: Pick<PrismaClient, "inputRequest">,
  input: {
    id: string;
    projectId: string;
    userId: string;
    runId: string;
    chainId: string;
    messageId: string;
    agent: string;
    payload: InputPayload;
    packages?: string[];
    status?: "PENDING" | "PAUSED";
  },
) {
  const stored: StoredPayload = {
    request: input.payload,
    ...(input.packages?.length ? { packages: input.packages } : {}),
  };
  await db.inputRequest.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      projectId: input.projectId,
      userId: input.userId,
      runId: input.runId,
      chainId: input.chainId,
      messageId: input.messageId,
      agent: input.agent,
      kind: toDbKind(input.payload.kind),
      payload: stored,
      status: input.status ?? "PENDING",
      questionHash: questionHash(input.payload),
    },
    update: {},
  });
}

export async function readAnswer(
  db: Pick<PrismaClient, "inputRequest">,
  id: string,
) {
  const row = await db.inputRequest.findUnique({
    where: { id },
    select: { status: true, answer: true },
  });
  if (row?.status !== "ANSWERED") return null;
  const parsed = storedAnswerSchema.safeParse(row.answer);
  return parsed.success ? parsed.data : { ok: false };
}

export async function pauseInputRequest(
  db: Pick<PrismaClient, "inputRequest">,
  id: string,
) {
  const { count } = await db.inputRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "PAUSED" },
  });
  return count > 0;
}

export async function loadApprovals(
  db: Pick<PrismaClient, "inputRequest">,
  projectId: string,
) {
  const rows = await db.inputRequest.findMany({
    where: { projectId, kind: "CONFIRM", status: "ANSWERED" },
    select: { payload: true, answer: true },
  });
  const packages = new Set<string>();
  const actions = new Set<string>();
  for (const row of rows) {
    const answer = storedAnswerSchema.safeParse(row.answer);
    const payload = storedPayloadSchema.safeParse(row.payload);
    if (!answer.success || !payload.success) continue;
    if (!answer.data.ok || answer.data.answer !== "approved") continue;
    payload.data.packages?.forEach((name) => packages.add(name));
    if (payload.data.request.kind === "confirm") {
      actions.add(payload.data.request.action);
    }
  }
  return { packages: [...packages], actions: [...actions] };
}

export async function loadAnsweredInputs(
  db: Pick<PrismaClient, "inputRequest">,
  projectId: string,
) {
  const rows = await db.inputRequest.findMany({
    where: { projectId, status: "ANSWERED" },
    orderBy: { answeredAt: "asc" },
    take: 30,
    select: { id: true, payload: true, answer: true },
  });
  return rows.flatMap((row) => {
    const payload = storedPayloadSchema.safeParse(row.payload);
    const answer = storedAnswerSchema.safeParse(row.answer);
    if (!payload.success || !answer.success) return [];
    return [{ id: row.id, payload: payload.data.request, answer: answer.data }];
  });
}

export function describeAnswer(payload: InputPayload, answer: StoredAnswer) {
  if (!answer.ok) {
    return `The user dismissed the question "${inputQuestion(payload)}". Decide yourself with a sensible default and mention it in your summary.`;
  }
  if (payload.kind === "secret") {
    return `${JSON.stringify({ name: payload.name, status: "set" })}\nThe user stored ${payload.name}. You never see its value: read it in code with process.env.${payload.name}. The server wrote it to .env.local and restarted the dev server.`;
  }
  if (payload.kind === "confirm") {
    return answer.answer === "approved"
      ? `The user approved: ${payload.action}.`
      : `The user declined: ${payload.action}. Don't do it; find another way or explain in your summary.`;
  }
  return `The user answered "${inputQuestion(payload)}": ${answer.answer ?? ""}`;
}
