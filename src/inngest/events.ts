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
        handoff: z
          .object({
            note: z.string().max(8000),
            written: z.array(z.string()).max(400),
            readAgentsMd: z.boolean(),
            loadedSkills: z.array(z.string()).max(20),
            installs: z.number().int().nonnegative(),
            searches: z.number().int().nonnegative().optional(),
            restricted: z.boolean().optional(),
          })
          .optional(),
      })
      .optional(),
  }),
});

export const githubExport = eventType("github/export", {
  schema: z.object({
    exportId: z.string().min(1),
    projectId: z.string().min(1),
    userId: z.string().min(1),
    attempt: z.number().int().positive(),
    requestId: z.string().min(1),
  }),
});
