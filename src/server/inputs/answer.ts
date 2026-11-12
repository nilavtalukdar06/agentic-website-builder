import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { InputPayload } from "@/lib/agent/parts";
import { checkSecret } from "@/server/secrets/validate";
import { setSecret } from "@/server/secrets/store";
import { type StoredAnswer, storedPayloadSchema } from "./requests";

const dismissBody = z.object({ dismiss: z.literal(true) });
const choiceBody = z.object({
  selected: z.array(z.string().max(200)).max(6).default([]),
  other: z.string().trim().max(500).optional(),
});
const textBody = z.object({ text: z.string().trim().min(1).max(2000) });
const secretBody = z.object({ value: z.string().min(1).max(16_384) });
const confirmBody = z.object({ approve: z.boolean() });

export type AnswerResult =
  | { status: 200; body: { status: "answered"; warnings?: string[] } }
  | { status: 400 | 404 | 409 | 503; body: { error: string } };

export type AnswerEvent =
  | {
      type: "provided";
      data: { requestId: string; ok: boolean; answer?: string };
    }
  | {
      type: "resume";
      data: {
        projectId: string;
        userId: string;
        messageId: string;
        resume: { requestId: string; chainId: string };
      };
    };

type Db = Pick<
  PrismaClient,
  "inputRequest" | "projectSecret" | "secretEvent" | "$transaction"
>;

function invalid(error: string): AnswerResult {
  return { status: 400, body: { error } };
}

function parseAnswer(
  payload: InputPayload,
  body: unknown,
): { answer: StoredAnswer; secret?: string; warnings?: string[] } | string {
  if (dismissBody.safeParse(body).success) return { answer: { ok: false } };
  if (payload.kind === "choice") {
    const parsed = choiceBody.safeParse(body);
    if (!parsed.success) return "Pick an option or type an answer.";
    const { selected, other } = parsed.data;
    if (selected.some((option) => !payload.options.includes(option))) {
      return "That option isn't one of the choices.";
    }
    if (!payload.multiple && selected.length + (other ? 1 : 0) > 1) {
      return "Pick one option.";
    }
    const values = [...selected, ...(other ? [other] : [])];
    if (values.length === 0) return "Pick an option or type an answer.";
    return { answer: { ok: true, answer: values.join(", ") } };
  }
  if (payload.kind === "text") {
    const parsed = textBody.safeParse(body);
    return parsed.success
      ? { answer: { ok: true, answer: parsed.data.text } }
      : "Type an answer of up to 2,000 characters.";
  }
  if (payload.kind === "secret") {
    const parsed = secretBody.safeParse(body);
    if (!parsed.success) return "Paste the value.";
    const checked = checkSecret(payload.name, parsed.data.value.trim());
    if (!checked.ok) return checked.error;
    return {
      answer: { ok: true, answer: "set" },
      secret: parsed.data.value.trim(),
      warnings: checked.warnings,
    };
  }
  const parsed = confirmBody.safeParse(body);
  return parsed.success
    ? {
        answer: {
          ok: true,
          answer: parsed.data.approve ? "approved" : "declined",
        },
      }
    : "Approve or decline.";
}

export async function answerInputRequest(
  deps: { db: Db; send: (event: AnswerEvent) => Promise<unknown> },
  {
    userId,
    requestId,
    body,
  }: { userId: string; requestId: string; body: unknown },
): Promise<AnswerResult> {
  const { db, send } = deps;
  const request = await db.inputRequest.findFirst({
    where: { id: requestId, userId },
    select: {
      id: true,
      projectId: true,
      messageId: true,
      chainId: true,
      status: true,
      payload: true,
    },
  });
  if (!request) return { status: 404, body: { error: "Not found" } };
  if (request.status !== "PENDING" && request.status !== "PAUSED") {
    return {
      status: 409,
      body: { error: "This question was already answered." },
    };
  }
  const stored = storedPayloadSchema.safeParse(request.payload);
  if (!stored.success)
    return { status: 409, body: { error: "This question can't be answered." } };

  const parsed = parseAnswer(stored.data.request, body);
  if (typeof parsed === "string") return invalid(parsed);

  if (parsed.secret !== undefined && stored.data.request.kind === "secret") {
    await setSecret(db, {
      projectId: request.projectId,
      userId,
      name: stored.data.request.name,
      value: parsed.secret,
    });
  }

  let previous: "PENDING" | "PAUSED" | null = null;
  for (const status of [
    request.status,
    request.status === "PENDING" ? "PAUSED" : "PENDING",
  ] as const) {
    const { count } = await db.inputRequest.updateMany({
      where: { id: request.id, status },
      data: {
        status: "ANSWERED",
        answer: parsed.answer,
        answeredAt: new Date(),
      },
    });
    if (count > 0) {
      previous = status;
      break;
    }
  }
  if (!previous) {
    return {
      status: 409,
      body: { error: "This question was already answered." },
    };
  }

  const isSecret = stored.data.request.kind === "secret";
  const event: AnswerEvent =
    previous === "PENDING"
      ? {
          type: "provided",
          data: {
            requestId: request.id,
            ok: parsed.answer.ok,
            ...(isSecret || parsed.answer.answer === undefined
              ? {}
              : { answer: parsed.answer.answer }),
          },
        }
      : {
          type: "resume",
          data: {
            projectId: request.projectId,
            userId,
            messageId: request.messageId,
            resume: { requestId: request.id, chainId: request.chainId },
          },
        };
  try {
    await send(event);
  } catch {
    await db.inputRequest
      .updateMany({
        where: { id: request.id, status: "ANSWERED" },
        data: { status: previous, answer: undefined, answeredAt: null },
      })
      .catch(() => null);
    return {
      status: 503,
      body: { error: "Couldn't reach the agent. Try again in a moment." },
    };
  }
  return {
    status: 200,
    body: {
      status: "answered",
      ...(parsed.warnings?.length ? { warnings: parsed.warnings } : {}),
    },
  };
}
