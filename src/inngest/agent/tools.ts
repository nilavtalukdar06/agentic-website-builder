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

export const loadSkillInput = z.object({
  name: z.string().min(1).describe("The skill's name from the skill list."),
});

const terminal = tool({
  description:
    "Run a shell command in the project folder of the sandbox and get its output and exit code.",
  inputSchema: terminalInput,
});

const createOrUpdateFiles = tool({
  description:
    "Create or overwrite files in the project. Send complete file contents.",
  inputSchema: writeFilesInput,
});

const readFiles = tool({
  description:
    "Read files from the project, including AGENTS.md and the installed skills in .agents/skills.",
  inputSchema: readFilesInput,
});

const loadSkill = tool({
  description:
    "Load an installed skill: returns its SKILL.md instructions and the list of its other files.",
  inputSchema: loadSkillInput,
});

export const builderTools = {
  terminal,
  createOrUpdateFiles,
  readFiles,
  loadSkill,
};

export const agentToolNames = [
  "terminal",
  "createOrUpdateFiles",
  "readFiles",
  "loadSkill",
] as const;

export type AgentToolName = (typeof agentToolNames)[number];

export function isAgentTool(name: string): name is AgentToolName {
  return (agentToolNames as readonly string[]).includes(name);
}
