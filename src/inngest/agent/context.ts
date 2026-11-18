import { MEMORY_PRECEDENCE } from "@/server/memory/filters";
import { wrapUntrusted } from "./guardrails/untrusted";
import type { Intent } from "./router";

export const PRELOAD_CHARS = 40_000;
const FILE_CHARS = 16_000;

export type PreloadedFile = { path: string; content: string };

const INTENT_NOTES: Record<Intent, string> = {
  create:
    "This is a new site. Build the whole request in as few replies as you can.",
  edit: "This is a focused change. The files you most likely need are included below with their current contents: make the change with editFile in your first reply, keep everything else exactly as it is, then finish.",
  fix: "The user reports a problem. Find the cause in the files below (read others only if needed), fix it with editFile, check it compiles, then finish.",
  "large-change":
    "This change spans several files. Plan it once against the repo map, then write new files with createOrUpdateFiles and change existing ones with editFile.",
  question:
    "Answer the question from the project context. Don't change any files.",
  remember:
    "The user asked Vibe to remember something. Don't change any files.",
  forget: "The user asked Vibe to forget something. Don't change any files.",
};

export function preloadFiles(
  files: Record<string, string>,
  targets: string[],
  budget = PRELOAD_CHARS,
): PreloadedFile[] {
  const picked: PreloadedFile[] = [];
  let left = budget;
  for (const path of targets) {
    const content = files[path];
    if (typeof content !== "string" || content.startsWith("data:")) continue;
    if (content.length > FILE_CHARS || content.length > left) continue;
    picked.push({ path, content });
    left -= content.length;
  }
  return picked;
}

export function buildContext({
  intent,
  designNotes,
  repoMap,
  catalog,
  preloaded = [],
  memory = "",
}: {
  intent: Intent;
  designNotes: string;
  repoMap: string;
  catalog?: string;
  preloaded?: PreloadedFile[];
  memory?: string;
}) {
  const sections = [
    designNotes ? `## Design notes\n${designNotes}` : null,
    repoMap ? `## Repo map\n${repoMap}` : null,
    memory
      ? `## What Vibe remembers\n${MEMORY_PRECEDENCE}\n${wrapUntrusted("memory", memory)}`
      : null,
    catalog ? `## Ready-made blocks and components\n${catalog}` : null,
    preloaded.length > 0
      ? `## Current contents of the files you most likely need\n${preloaded
          .map((file) =>
            wrapUntrusted(`file:${file.path}`, `${file.path}\n${file.content}`),
          )
          .join("\n")}`
      : null,
  ].filter(Boolean);
  const body = sections.length > 0 ? `\n${sections.join("\n\n")}\n` : "\n";
  return `<project_context>${body}</project_context>\n${INTENT_NOTES[intent]}`;
}
