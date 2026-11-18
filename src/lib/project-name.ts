import slugify from "@sindresorhus/slugify";

const MAX_NAME_LENGTH = 48;
const MAX_SLUG_LENGTH = 40;
const FALLBACK_NAME = "Untitled project";
const FALLBACK_SLUG = "project";

const leadingFiller =
  /^(?:(?:please|can you|could you)(?:\s+|$))?(?:(?:build|create|make|design|generate|write)(?:\s+|$)(?:(?:me|us)(?:\s+|$))?)?(?:(?:a|an|the)(?:\s+|$))?/i;

function truncateOnWord(value: string, max: number) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : value.slice(0, max))
    .replace(/[\s,;:–—-]+$/u, "")
    .trim();
}

const clauseBreak =
  /\s*[,;:–—]\s+|\s+(?:with|that|which|featuring|including|using|where)\s+(?=\S)/iu;

function headClause(value: string) {
  const [head] = value.split(clauseBreak);
  return head.trim().split(/\s+/u).length >= 2 ? head.trim() : value;
}

export function cleanProjectName(value: string) {
  const name = truncateOnWord(
    value
      .replace(/["“”`]/gu, "")
      .replace(/\s+/gu, " ")
      .replace(/^[\s\p{P}]+|[\s.,;:!?–—-]+$/gu, "")
      .trim(),
    MAX_NAME_LENGTH,
  );
  if (name.length < 2) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function projectNameFromPrompt(prompt: string) {
  const firstSentence = prompt
    .trim()
    .split(/(?<=[.!?])\s|\n/u)[0]
    .replace(/[.!?…]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  const stripped = firstSentence.replace(leadingFiller, "").trim();
  const name = truncateOnWord(
    headClause(stripped || firstSentence),
    MAX_NAME_LENGTH,
  );
  if (!name) return FALLBACK_NAME;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function slugFromName(name: string) {
  const slug = slugify(name).slice(0, MAX_SLUG_LENGTH).replace(/-+$/u, "");
  return slug || FALLBACK_SLUG;
}

export function withSlugSuffix(slug: string, suffix: string) {
  return `${slug}-${suffix}`;
}
