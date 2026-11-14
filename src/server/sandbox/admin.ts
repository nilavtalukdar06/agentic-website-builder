import "server-only";
import { Sandbox } from "e2b";
import { env } from "@/config/env";
import { sandboxMetadata } from "./sandbox";

const MAX_PAGES = 50;

export type PausedSandbox = { id: string; startedAt: Date };

export async function listPausedSandboxes(before: Date) {
  const paginator = Sandbox.list({
    apiKey: env.E2B_API_KEY,
    query: {
      state: ["paused"],
      template: env.E2B_TEMPLATE_ID,
      metadata: sandboxMetadata(),
    },
  });
  const found: PausedSandbox[] = [];
  for (let page = 0; paginator.hasNext && page < MAX_PAGES; page++) {
    for (const info of await paginator.nextItems()) {
      if (info.startedAt < before) {
        found.push({ id: info.sandboxId, startedAt: info.startedAt });
      }
    }
  }
  return found;
}

export function killSandbox(sandboxId: string) {
  return Sandbox.kill(sandboxId, { apiKey: env.E2B_API_KEY });
}
