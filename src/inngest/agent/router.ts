import { z } from "zod";
import type { AgentName } from "@/lib/agent/parts";

export const REVIEW_FILE_THRESHOLD = 5;
const SHORT_EDIT_WORDS = 25;

export const routeChoiceSchema = z.object({
  agents: z.array(z.enum(["researcher", "designer", "builder"])),
  reason: z.string(),
});

export type RouteChoice = z.infer<typeof routeChoiceSchema>;

export type RouteInput = {
  prompt: string;
  hasVersion: boolean;
  attachments: number;
  files: string[];
};

export type Route = {
  agents: AgentName[];
  reason: string;
  decidedBy: "rules" | "model" | "fallback";
};

const order: AgentName[] = ["researcher", "designer", "builder"];

const sitePattern =
  /\bhttps?:\/\/\S+|\b(?:[a-z0-9-]+\.)+(?:com|io|dev|app|co|org|net|ai|so|xyz|design|studio|shop|store|me|uk|in|de)\b(?:\/\S*)?/i;

export function mentionsSite(prompt: string) {
  return sitePattern.test(prompt);
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function routeByRules(input: RouteInput): Route | null {
  if (
    input.hasVersion &&
    input.attachments === 0 &&
    !mentionsSite(input.prompt) &&
    wordCount(input.prompt) <= SHORT_EDIT_WORDS
  ) {
    return {
      agents: ["builder"],
      reason: "A small edit to an existing site.",
      decidedBy: "rules",
    };
  }
  return null;
}

export function normalizeAgents(
  chosen: readonly string[],
  input: RouteInput,
): AgentName[] {
  const picked = new Set<string>(chosen);
  picked.add("builder");
  if (mentionsSite(input.prompt)) picked.add("researcher");
  if (!input.hasVersion || input.attachments > 0) picked.add("designer");
  return order.filter((agent) => picked.has(agent));
}

export function routerPrompt(input: RouteInput) {
  const files =
    input.files.length > 0
      ? `Existing files: ${input.files.slice(0, 60).join(", ")}${input.files.length > 60 ? ", …" : ""}`
      : "No files yet: this is a new site.";
  return [
    `Message:\n${input.prompt.slice(0, 4000)}`,
    `Project: ${input.hasVersion ? "has a built site" : "nothing built yet"}.`,
    files,
    `Attached images: ${input.attachments}.`,
  ].join("\n\n");
}

export async function routeAgents(
  input: RouteInput,
  classify: (prompt: string) => Promise<RouteChoice>,
): Promise<Route> {
  const byRules = routeByRules(input);
  if (byRules) return byRules;
  try {
    const choice = routeChoiceSchema.parse(await classify(routerPrompt(input)));
    return {
      agents: normalizeAgents(choice.agents, input),
      reason: choice.reason,
      decidedBy: "model",
    };
  } catch {
    return {
      agents: ["builder"],
      reason: "The router could not decide, so the builder works alone.",
      decidedBy: "fallback",
    };
  }
}

export function shouldReview({
  hasVersion,
  written,
}: {
  hasVersion: boolean;
  written: number;
}) {
  return written > 0 && (!hasVersion || written >= REVIEW_FILE_THRESHOLD);
}
