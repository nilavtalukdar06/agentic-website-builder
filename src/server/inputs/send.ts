import "server-only";
import { inngest } from "@/inngest/client";
import { agentInputProvided, agentRun } from "@/inngest/events";
import type { AnswerEvent } from "./answer";

export async function sendAnswerEvent(event: AnswerEvent) {
  if (event.type === "provided") {
    await inngest.send(agentInputProvided.create(event.data));
    return;
  }
  await inngest.send(agentRun.create(event.data));
}
