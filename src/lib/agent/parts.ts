import { z } from "zod";

export const fileVerbs = ["created", "edited"] as const;

export const agentNames = [
  "researcher",
  "designer",
  "builder",
  "reviewer",
] as const;

export type AgentName = (typeof agentNames)[number];

export const agentNameSchema = z.enum(agentNames);

export const sourceSchema = z.object({ title: z.string(), url: z.string() });

export type Source = z.infer<typeof sourceSchema>;

export const taskItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sandbox"),
    label: z.string(),
    agent: agentNameSchema.optional(),
  }),
  z.object({
    kind: z.literal("install"),
    packages: z.array(z.string()),
    agent: agentNameSchema.optional(),
  }),
  z.object({
    kind: z.literal("file"),
    verb: z.enum(fileVerbs),
    path: z.string(),
    lines: z.number().int().nonnegative(),
    agent: agentNameSchema.optional(),
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
    agent: agentNameSchema.optional(),
  }),
  z.object({
    type: z.literal("agent"),
    name: agentNameSchema,
    state: z.enum(["done", "skipped"]),
    summary: z.string().optional(),
    skills: z.array(z.string()),
    searches: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("sources"), sources: z.array(sourceSchema) }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export const agentPartsSchema = z.array(agentPartSchema);

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
