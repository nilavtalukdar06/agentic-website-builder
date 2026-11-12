import { eventType } from "inngest";
import { z } from "zod";

export const agentRun = eventType("agent/run", {
  schema: z.object({
    projectId: z.string().min(1),
    userId: z.string().min(1),
    messageId: z.string().min(1),
    resume: z
      .object({
        chainId: z.string().min(1),
        requestId: z.string().min(1).optional(),
        handoff: z
          .object({
            note: z.string().max(8000),
            written: z.array(z.string()).max(400),
            readAgentsMd: z.boolean(),
            loadedSkills: z.array(z.string()).max(20),
            installs: z.number().int().nonnegative(),
          })
          .optional(),
      })
      .optional(),
  }),
});

export const agentInputProvided = eventType("agent/input.provided", {
  schema: z.object({
    requestId: z.string().min(1),
    ok: z.boolean(),
    answer: z.string().max(4000).optional(),
  }),
});
