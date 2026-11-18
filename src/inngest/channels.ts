import { realtime } from "inngest";
import { z } from "zod";
import {
  browserCheckSchema,
  fileVerbs,
  sourceSchema,
  taskItemSchema,
} from "@/lib/agent/parts";
import { projectChannelName } from "@/lib/agent/realtime-topics";
import { exportEventSchema } from "@/lib/github-export";

export const agentStatuses = [
  "thinking",
  "building",
  "compiling",
  "done",
  "stopped",
  "error",
] as const;

export { projectTopics } from "@/lib/agent/realtime-topics";

export const projectChannel = realtime.channel({
  name: ({ projectId }: { projectId: string }) => projectChannelName(projectId),
  topics: {
    export: { schema: exportEventSchema },
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
    browser: {
      schema: z.discriminatedUnion("phase", [
        z.object({
          phase: z.literal("session"),
          liveUrl: z.url().nullable(),
          round: z.number().int().nonnegative(),
        }),
        z.object({ phase: z.literal("check"), check: browserCheckSchema }),
        z.object({
          phase: z.literal("closed"),
          status: z.enum(["passed", "failed", "skipped"]),
          summary: z.string(),
        }),
      ]),
    },
  },
});
