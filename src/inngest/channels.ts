import { realtime } from "inngest";
import { z } from "zod";
import { fileVerbs, sourceSchema, taskItemSchema } from "@/lib/agent/parts";

export const agentStatuses = [
  "thinking",
  "building",
  "compiling",
  "done",
  "error",
] as const;

export const projectTopics = [
  "status",
  "reasoning",
  "text",
  "task",
  "file",
  "tool",
  "credits",
  "preview",
  "search",
  "guard",
] as const;

export const projectChannel = realtime.channel({
  name: ({ projectId }: { projectId: string }) => `project:${projectId}`,
  topics: {
    status: {
      schema: z.object({
        state: z.enum(agentStatuses),
        message: z.string().optional(),
      }),
    },
    reasoning: {
      schema: z.object({
        turn: z.number(),
        delta: z.string(),
      }),
    },
    text: {
      schema: z.object({
        turn: z.number(),
        delta: z.string(),
      }),
    },
    task: { schema: taskItemSchema },
    file: {
      schema: z.object({
        phase: z.enum(["started", "written"]),
        path: z.string(),
        verb: z.enum(fileVerbs),
        lines: z.number().int().nonnegative().optional(),
      }),
    },
    tool: {
      schema: z.object({
        phase: z.enum(["call", "output", "result"]),
        callId: z.string(),
        name: z.string(),
        command: z.string().optional(),
        chunk: z.string().optional(),
        exitCode: z.number().int().nullable().optional(),
      }),
    },
    credits: { schema: z.object({ used: z.number().int().nonnegative() }) },
    preview: { schema: z.object({ url: z.url() }) },
    search: {
      schema: z.object({
        query: z.string(),
        sources: z.array(sourceSchema),
      }),
    },
    guard: {
      schema: z.object({
        stage: z.enum(["input", "output", "tool", "save"]),
        verdict: z.string(),
      }),
    },
  },
});
