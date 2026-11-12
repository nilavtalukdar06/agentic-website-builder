import { realtime } from "inngest";
import { z } from "zod";
import {
  agentNameSchema,
  fileVerbs,
  sourceSchema,
  taskItemSchema,
} from "@/lib/agent/parts";

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
  "agent",
  "search",
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
        agent: agentNameSchema.optional(),
      }),
    },
    text: {
      schema: z.object({
        turn: z.number(),
        delta: z.string(),
        agent: agentNameSchema.optional(),
      }),
    },
    task: { schema: taskItemSchema },
    file: {
      schema: z.object({
        phase: z.enum(["started", "written"]),
        path: z.string(),
        verb: z.enum(fileVerbs),
        lines: z.number().int().nonnegative().optional(),
        agent: agentNameSchema.optional(),
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
        agent: agentNameSchema.optional(),
      }),
    },
    credits: { schema: z.object({ used: z.number().int().nonnegative() }) },
    preview: { schema: z.object({ url: z.url() }) },
    agent: {
      schema: z.object({
        name: agentNameSchema,
        state: z.enum(["started", "done", "skipped"]),
        summary: z.string().optional(),
      }),
    },
    search: {
      schema: z.object({
        agent: agentNameSchema,
        query: z.string(),
        sources: z.array(sourceSchema),
      }),
    },
  },
});
