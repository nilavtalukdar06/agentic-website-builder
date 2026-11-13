import { z } from "zod";

export const fileVerbs = ["created", "edited", "deleted"] as const;

export const sourceSchema = z.object({ title: z.string(), url: z.string() });

export type Source = z.infer<typeof sourceSchema>;

export const taskItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sandbox"),
    label: z.string(),
  }),
  z.object({
    kind: z.literal("install"),
    packages: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("read"),
    paths: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("skill"),
    name: z.string(),
  }),
  z.object({
    kind: z.literal("file"),
    verb: z.enum(fileVerbs),
    path: z.string(),
    lines: z.number().int().nonnegative(),
  }),
]);

export const agentPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("reasoning"),
    text: z.string(),
    durationMs: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("task"),
    title: z.string(),
    items: z.array(taskItemSchema),
  }),
  z.object({
    type: z.literal("tool"),
    callId: z.string(),
    name: z.string(),
    command: z.string(),
    output: z.string(),
    exitCode: z.number().int().nullable(),
  }),
  z.object({ type: z.literal("sources"), sources: z.array(sourceSchema) }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({
    type: z.literal("guard"),
    stage: z.enum(["input", "output"]),
    verdict: z.enum(["review", "block"]),
  }),
  z.object({ type: z.literal("stopped") }),
]);

export const agentPartsSchema = z.array(agentPartSchema);

const partTypes = new Set<string>(
  agentPartSchema.options.map((option) => option.shape.type.value),
);

export function parseAgentParts(raw: unknown): AgentPart[] | null {
  if (!Array.isArray(raw)) return null;
  const known = raw.filter(
    (part) =>
      part !== null &&
      typeof part === "object" &&
      partTypes.has(String((part as { type?: unknown }).type)),
  );
  const parsed = agentPartsSchema.safeParse(known);
  return parsed.success ? parsed.data : null;
}

export type TaskItem = z.infer<typeof taskItemSchema>;
export type AgentPart = z.infer<typeof agentPartSchema>;

const installPattern =
  /^\s*(?:npm\s+(?:install|i|add)|pnpm\s+add|yarn\s+add|bun\s+add)\s+(.+)$/;

export function packagesFromInstall(command: string) {
  const match = installPattern.exec(command);
  if (!match) return null;
  const packages = match[1]
    .split(/\s+/)
    .filter((token) => token && !token.startsWith("-"));
  return packages.length > 0 ? packages : null;
}

const SUMMARY_TAG = /<\/?task_summary>/g;

export function stripSummaryTags(text: string) {
  return text.replace(SUMMARY_TAG, "").trim();
}

const GLOB = /[*?[\]{}$`~]/;

export function deletedPaths(command: string) {
  return command.split(/&&|\|\||;/).flatMap((segment) => {
    const tokens = segment.trim().split(/\s+/);
    if (tokens[0] !== "rm") return [];
    return tokens
      .slice(1)
      .filter((token) => token && !token.startsWith("-"))
      .filter((token) => !GLOB.test(token))
      .map((token) => token.replace(/^\.\//, "").replace(/^['"]|['"]$/g, ""))
      .filter(
        (token) => token && !token.startsWith("/") && !token.includes(".."),
      );
  });
}
