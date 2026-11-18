import { eventType } from "inngest";
import { z } from "zod";
import { notificationKinds } from "@/server/email/notify";

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
            readAgentsMd: z.boolean().optional(),
            loadedSkills: z.array(z.string()).max(20).optional(),
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

export const notifyUser = eventType("notify/send", {
  schema: z.object({
    kind: z.enum(notificationKinds),
    userId: z.string().min(1),
    projectId: z.string().min(1),
    messageId: z.string().min(1).optional(),
    exportId: z.string().min(1).optional(),
    key: z.string().min(1).max(200),
  }),
});
