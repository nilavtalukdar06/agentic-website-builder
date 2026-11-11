import { eventType } from "inngest";
import { z } from "zod";

export const agentRun = eventType("agent/run", {
  schema: z.object({
    projectId: z.string().min(1),
    userId: z.string().min(1),
    messageId: z.string().min(1),
  }),
});
