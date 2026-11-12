import { tool } from "ai";
import { z } from "zod";
import { inputKinds, riskLevels } from "@/lib/agent/parts";

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

export const askUserInput = z.object({
  kind: z
    .enum(inputKinds)
    .describe(
      "choice: pick from options; text: a short free answer; secret: an API key or connection string, stored encrypted and never shown to you; confirm: approve or decline an action.",
    ),
  question: z
    .string()
    .optional()
    .describe("For choice and text: the question, in one sentence."),
  options: z
    .array(z.string())
    .optional()
    .describe(
      "For choice: 2 to 6 short options. The user can also type their own.",
    ),
  multiple: z
    .boolean()
    .optional()
    .describe("For choice: allow several options."),
  hint: z.string().optional().describe("For text: an example answer."),
  name: z
    .string()
    .optional()
    .describe(
      "For secret: the environment variable name, e.g. OPENAI_API_KEY.",
    ),
  label: z
    .string()
    .optional()
    .describe("For secret: a short label, e.g. OpenAI API key."),
  url: z
    .string()
    .optional()
    .describe("For secret: where the user creates the key."),
  reason: z.string().optional().describe("For secret: why the site needs it."),
  action: z
    .string()
    .optional()
    .describe("For confirm: what you are about to do."),
  risk: z
    .enum(riskLevels)
    .optional()
    .describe("For confirm: low, medium or high."),
  summary: z
    .string()
    .optional()
    .describe("For confirm: the consequences, in plain words."),
});

const terminal = tool({
  description:
    "Run a shell command in the project folder of the sandbox and get its output and exit code.",
  inputSchema: terminalInput,
});

const readOnlyTerminal = tool({
  description:
    "Run a read-only check in the project folder: npx tsc --noEmit, npx eslint, npm run lint, curl localhost:3000, ls, cat, grep, head or find. Anything that changes files is blocked.",
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

const askUser = tool({
  description:
    "Ask the user and wait for the answer: a choice, a short text, a secret (API key or database URL, which you never see: you get its name and status) or a confirmation. Ask only when you can't decide yourself, never twice for the same thing, at most 5 times per request.",
  inputSchema: askUserInput,
});

export const builderTools = {
  terminal,
  createOrUpdateFiles,
  readFiles,
  loadSkill,
  askUser,
};

export const designerTools = { readFiles, loadSkill };

export const reviewerTools = {
  terminal: readOnlyTerminal,
  readFiles,
  loadSkill,
};

export const researcherTools = { readFiles };

export const agentToolNames = [
  "terminal",
  "createOrUpdateFiles",
  "readFiles",
  "loadSkill",
  "askUser",
] as const;

export type AgentToolName = (typeof agentToolNames)[number];

export function isAgentTool(name: string): name is AgentToolName {
  return (agentToolNames as readonly string[]).includes(name);
}
