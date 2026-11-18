import { tool } from "ai";
import { z } from "zod";

export const MAX_FILES_PER_CALL = 20;
export const MAX_FILE_CHARS = 60_000;
export const MAX_EDITS_PER_CALL = 20;

const projectPath = z
  .string()
  .min(1)
  .describe("Path relative to the project root, e.g. app/page.tsx");

export const terminalInput = z.object({
  command: z.string().min(1).describe("The shell command to run."),
});

export const writeFilesInput = z.object({
  files: z
    .array(
      z.object({
        path: projectPath,
        content: z.string().max(MAX_FILE_CHARS).describe("The whole file."),
      }),
    )
    .min(1)
    .max(MAX_FILES_PER_CALL),
});

export const editFileInput = z.object({
  path: projectPath,
  edits: z
    .array(
      z.object({
        search: z
          .string()
          .min(1)
          .describe(
            "Exact lines copied from the file, with enough context to match exactly once.",
          ),
        replace: z.string().describe("The lines that replace them."),
      }),
    )
    .min(1)
    .max(MAX_EDITS_PER_CALL),
});

export const readFilesInput = z.object({
  files: z
    .array(
      z.object({
        path: projectPath,
        startLine: z.number().int().positive().optional(),
        endLine: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(MAX_FILES_PER_CALL),
});

export const listFilesInput = z.object({
  pattern: z
    .string()
    .optional()
    .describe(
      'A folder or glob, e.g. "components" or "app/**/page.tsx". Leave out for the whole project.',
    ),
});

export const searchCodeInput = z.object({
  pattern: z
    .string()
    .min(1)
    .max(200)
    .describe("An extended regular expression, as for grep -E."),
  path: z
    .string()
    .optional()
    .describe('Limit the search to a folder or file, e.g. "components".'),
});

const terminal = tool({
  description:
    "Run a shell command in the project folder of the sandbox and get its output and exit code. Use it to install packages and to run checks.",
  inputSchema: terminalInput,
});

const createOrUpdateFiles = tool({
  description:
    "Create new files, or replace a file completely. Send whole file contents. To change part of an existing file, use editFile instead.",
  inputSchema: writeFilesInput,
});

const editFile = tool({
  description:
    "Change part of an existing file with search-and-replace blocks. Each search must match the file exactly once. All blocks apply, or none do.",
  inputSchema: editFileInput,
});

const readFiles = tool({
  description:
    "Read project files. Give startLine and endLine to read part of a long file.",
  inputSchema: readFilesInput,
});

const listFiles = tool({
  description:
    "List the project's files, optionally only those in a folder or matching a glob.",
  inputSchema: listFilesInput,
});

const searchCode = tool({
  description:
    "Search the project's source files with a regular expression. Returns matching lines with their paths and line numbers.",
  inputSchema: searchCodeInput,
});

export const builderTools = {
  terminal,
  createOrUpdateFiles,
  editFile,
  readFiles,
  listFiles,
  searchCode,
};

export const agentToolNames = [
  "terminal",
  "createOrUpdateFiles",
  "editFile",
  "readFiles",
  "listFiles",
  "searchCode",
] as const;

export type AgentToolName = (typeof agentToolNames)[number];

export const readOnlyToolNames: readonly AgentToolName[] = [
  "readFiles",
  "listFiles",
  "searchCode",
];

export function isAgentTool(name: string): name is AgentToolName {
  return (agentToolNames as readonly string[]).includes(name);
}
