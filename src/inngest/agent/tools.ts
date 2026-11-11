import { tool } from "ai";
import { z } from "zod";

export const MAX_FILES_PER_CALL = 20;
export const MAX_FILE_CHARS = 60_000;

export const terminalInput = z.object({
  command: z.string().min(1).describe("The shell command to run."),
});

export const writeFilesInput = z.object({
  files: z
    .array(
      z.object({
        path: z
          .string()
          .min(1)
          .describe("Path relative to the project root, e.g. app/page.tsx"),
        content: z.string().max(MAX_FILE_CHARS).describe("The whole file."),
      }),
    )
    .min(1)
    .max(MAX_FILES_PER_CALL),
});

export const readFilesInput = z.object({
  paths: z.array(z.string().min(1)).min(1).max(MAX_FILES_PER_CALL),
});

export const agentTools = {
  terminal: tool({
    description:
      "Run a shell command in the project folder of the sandbox and get its output and exit code.",
    inputSchema: terminalInput,
  }),
  createOrUpdateFiles: tool({
    description:
      "Create or overwrite files in the project. Send complete file contents.",
    inputSchema: writeFilesInput,
  }),
  readFiles: tool({
    description: "Read files from the project.",
    inputSchema: readFilesInput,
  }),
};

export type AgentToolName = keyof typeof agentTools;

export function isAgentTool(name: string): name is AgentToolName {
  return Object.hasOwn(agentTools, name);
}
