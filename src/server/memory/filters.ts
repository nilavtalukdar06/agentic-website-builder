import type { MemoryItem, MemoryProfile } from "./types";

export const MAX_MEMORY_WORDS_CHARS = 2000;
export const MEMORY_BLOCK_CHARS = 3200;
const MAX_ITEM_CHARS = 300;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(?<!\w)(\+?\d[\d\s().-]{7,}\d)(?!\w)/g;
const INSTRUCTION =
  /\b(ignore (all |any |the )?(previous|prior|above)|system prompt|you are now|act as|disregard)\b/i;

export function cleanUserWords(text: string) {
  return text
    .replace(EMAIL, "[email removed]")
    .replace(PHONE, "[number removed]")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, MAX_MEMORY_WORDS_CHARS);
}

export function rememberedText(prompt: string) {
  return prompt
    .replace(
      /^\s*(please\s+)?(remember|note|keep in mind)\s*(that|this)?\s*[:,-]?\s*/i,
      "",
    )
    .trim();
}

export function forgetQuery(prompt: string) {
  return prompt
    .replace(
      /^\s*(please\s+)?forget\s*(that|about|the fact that)?\s*[:,-]?\s*/i,
      "",
    )
    .trim();
}

function usable(item: MemoryItem) {
  const text = item.memory.trim();
  return text.length > 0 && !INSTRUCTION.test(text);
}

function line(item: MemoryItem) {
  const text = item.memory.replace(/\s+/g, " ").trim();
  return `- ${text.length > MAX_ITEM_CHARS ? `${text.slice(0, MAX_ITEM_CHARS - 1)}…` : text}`;
}

export function memoryBlock({
  profile,
  userMatches = [],
  projectMatches = [],
  maxChars = MEMORY_BLOCK_CHARS,
}: {
  profile?: MemoryProfile | null;
  userMatches?: MemoryItem[];
  projectMatches?: MemoryItem[];
  maxChars?: number;
}) {
  const seen = new Set<string>();
  const take = (items: MemoryItem[]) =>
    items.filter((item) => {
      const key = item.memory.trim().toLowerCase();
      if (!usable(item) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const project = take(projectMatches);
  const user = take([
    ...(profile?.static ?? []),
    ...userMatches,
    ...(profile?.dynamic ?? []),
  ]);
  const sections: [string, MemoryItem[]][] = [
    ["This project (earlier corrections and decisions)", project],
    ["The user's preferences (from earlier projects)", user],
  ];
  let budget = maxChars;
  const out: string[] = [];
  for (const [title, items] of sections) {
    const lines: string[] = [];
    for (const item of items) {
      const text = line(item);
      if (text.length + 1 > budget) break;
      lines.push(text);
      budget -= text.length + 1;
    }
    if (lines.length > 0) out.push(`${title}:\n${lines.join("\n")}`);
  }
  return out.join("\n\n");
}

export const MEMORY_PRECEDENCE =
  "Notes Vibe remembered from the user's earlier messages. They may be out of date. The user's current message and the current files always win; project notes win over general preferences.";
