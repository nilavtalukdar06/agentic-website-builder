import { z } from "zod";
import {
  ajBrowserBotWithRateLimit,
  arcjetDenialResponse,
} from "@/server/arcjet";
import {
  canRunTerminal,
  checkTerminalCommand,
  missingPaths,
  streamCommand,
  syncWorkingCopy,
} from "@/server/code/terminal";
import { db } from "@/server/db";
import { consumeRateLimit, rateRules } from "@/server/rate-limit";
import { isSandboxGone } from "@/server/sandbox/errors";
import { connectSandbox, snapshotSandbox } from "@/server/sandbox/sandbox";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ajTerminal = ajBrowserBotWithRateLimit(30, 60);

const body = z.object({
  projectId: z.string().min(1).max(64),
  command: z.string().min(1).max(2000),
});

const text = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

export async function POST(request: Request) {
  const arcjetDenial = arcjetDenialResponse(await ajTerminal.protect(request));
  if (arcjetDenial) return arcjetDenial;

  const session = await getSession();
  if (!session) return text("Unauthorized", 401);

  const decision = await consumeRateLimit(
    db,
    rateRules.terminal,
    session.user.id,
  );
  if (!decision.allowed) {
    return new Response("Too many commands. Try again in a few minutes.", {
      status: 429,
      headers: { "Retry-After": String(decision.retryAfterSeconds) },
    });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return text("Send a projectId and a command.", 400);
  const { projectId, command } = parsed.data;

  const blocked = checkTerminalCommand(command);
  if (blocked) return text(blocked, 400);

  const project = await db.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) return text("Not found", 404);

  const state = await canRunTerminal(db, project.id, project);
  if (state !== "ok") {
    return text(
      state === "building"
        ? "The terminal is locked while Vibe is building. Wait or stop it."
        : "Wait for the current export, restore or preview start to finish.",
      409,
    );
  }
  if (!project.sandboxId) {
    return text(
      "The preview isn't running. Open the preview to start it, then try again.",
      409,
    );
  }
  let sandbox;
  try {
    sandbox = await connectSandbox(project.sandboxId);
  } catch (error) {
    if (isSandboxGone(error)) {
      return text(
        "The preview sandbox was shut down. Open the preview to wake it, then try again.",
        409,
      );
    }
    console.error("[terminal] couldn't connect", error);
    return text("Couldn't reach the sandbox. Try again.", 502);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      try {
        const { exitCode } = await streamCommand({
          sandbox,
          command,
          emit,
        });
        emit(exitCode === null ? "\n[stopped]\n" : `\n[exit ${exitCode}]\n`);
        try {
          const changed = await syncWorkingCopy({
            db,
            projectId: project.id,
            snapshot: await snapshotSandbox(sandbox),
            findMissing: (paths) => missingPaths(sandbox, paths),
          });
          if (changed) emit("[files changed: your edits are unsaved]\n");
        } catch (error) {
          console.warn("[terminal] couldn't sync the working copy", error);
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
