import "server-only";
import { Inngest } from "inngest";
import { env } from "@/config/env";

export const inngest = new Inngest({
  id: "vibe",
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
  checkpointing: { maxRuntime: "240s" },
});
