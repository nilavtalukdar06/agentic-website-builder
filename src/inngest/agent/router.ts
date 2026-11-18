import { routeOf } from "./repo-map";

export const intents = [
  "create",
  "edit",
  "fix",
  "large-change",
  "question",
  "remember",
  "forget",
] as const;

export type Intent = (typeof intents)[number];

export type Route = { intent: Intent; confident: boolean };

export const MAX_TARGET_FILES = 6;

const ERROR_TEXT =
  /\b(error|exception|typeerror|referenceerror|syntaxerror|failed to compile|is not defined|cannot read propert|hydration|unhandled|stack trace|module not found|500|404|not working|doesn'?t work|isn'?t working|broken|crash(es|ed)?|blank (page|screen)|bug)\b/i;
const STACK_LINE = /^\s+at\s+\S+.*\(.*:\d+:\d+\)/m;
const LARGE =
  /\b(new|another|separate|add(ing)? (an?|the)?\s*(\w+\s){0,2}(page|route|screen|blog|dashboard|store|shop)s?|(redesign|rebuild|rewrite|restyle|revamp|overhaul)\b|whole (site|website|app)|every page|all (the )?pages|multi-?page|from scratch|(add|build) (a |an )?(blog|dashboard|admin|checkout|cart|auth|login|sign[- ]?up))/i;
const EDIT_VERBS =
  /\b(change|make|update|replace|rename|move|remove|delete|hide|show|increase|decrease|reduce|enlarge|shrink|swap|switch|set|align|center|centre|tweak|adjust|fix the (text|copy|spacing|color|colour|font)|add (a |an |the )?(button|link|icon|image|line|word|label|badge|shadow|border|section|field|column|row|item|footer|header))\b/i;
const QUESTION_START =
  /^\s*(what|why|how|where|which|who|when|does|do|is|are|can you (explain|tell)|could you (explain|tell)|explain)\b/i;

const REMEMBER =
  /^\s*(please\s+)?(remember|keep in mind|note that|make a note)\b/i;
const FORGET = /^\s*(please\s+)?forget\b/i;

export function memoryCommand(message: string): "remember" | "forget" | null {
  const text = message.trim();
  if (text.length > 600) return null;
  if (FORGET.test(text)) return "forget";
  if (REMEMBER.test(text)) return "remember";
  return null;
}

export function routeIntent(
  message: string,
  { hasVersion }: { hasVersion: boolean },
): Route {
  const text = message.trim();
  const command = memoryCommand(text);
  if (command) return { intent: command, confident: true };
  if (!hasVersion) return { intent: "create", confident: true };
  if (!text) return { intent: "edit", confident: false };

  const asksToChange = EDIT_VERBS.test(text) || LARGE.test(text);
  if (
    QUESTION_START.test(text) &&
    text.endsWith("?") &&
    !asksToChange &&
    !ERROR_TEXT.test(text)
  ) {
    return { intent: "question", confident: false };
  }
  if (STACK_LINE.test(text)) return { intent: "fix", confident: true };
  if (LARGE.test(text)) return { intent: "large-change", confident: true };
  if (ERROR_TEXT.test(text)) {
    return { intent: "fix", confident: text.length < 600 };
  }
  if (EDIT_VERBS.test(text)) {
    return { intent: "edit", confident: text.length < 400 };
  }
  return {
    intent: text.length < 300 ? "edit" : "large-change",
    confident: false,
  };
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "it",
  "make",
  "change",
  "add",
  "with",
  "for",
  "page",
  "this",
  "that",
  "my",
  "please",
  "color",
  "colour",
  "text",
  "button",
]);

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function guessTargets(message: string, paths: string[]) {
  const wanted = words(message);
  const singular = wanted.map((word) => word.replace(/s$/, ""));
  const scored = paths
    .filter(
      (path) =>
        /\.(tsx|ts|css)$/.test(path) && !path.startsWith("components/ui/"),
    )
    .map((path) => {
      const name = path.toLowerCase();
      const route = routeOf(path);
      let score = 0;
      for (const word of [...new Set([...wanted, ...singular])]) {
        if (name.split(/[^a-z0-9]+/).includes(word)) score += 3;
        else if (name.includes(word)) score += 1;
        if (route && route !== "/" && route.slice(1).split("/").includes(word))
          score += 3;
      }
      if (
        /\b(colou?r|theme|palette|font|dark mode|light mode)\b/i.test(message)
      ) {
        if (path === "app/globals.css") score += 4;
        if (path === "app/layout.tsx") score += 2;
      }
      if (
        /\b(home|landing|hero|homepage)\b/i.test(message) &&
        path === "app/page.tsx"
      )
        score += 3;
      return { path, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return scored.slice(0, MAX_TARGET_FILES).map((entry) => entry.path);
}

export function knownTargets(targets: string[], paths: string[]) {
  const existing = new Set(paths);
  return [
    ...new Set(
      targets
        .map((target) =>
          target
            .trim()
            .replace(/^\.\/+/, "")
            .replace(/^\/+/, ""),
        )
        .filter((target) => existing.has(target)),
    ),
  ].slice(0, MAX_TARGET_FILES);
}
