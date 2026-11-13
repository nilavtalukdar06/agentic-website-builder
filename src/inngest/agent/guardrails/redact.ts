import { detectKnownSecrets, redactMatches } from "./secret-patterns";

export const STREAM_HOLD_CHARS = 200;

export type Redactor = {
  redact: (text: string) => string;
  redactDeep: <T>(value: T) => T;
  holdBack: number;
};

function redact(text: string) {
  if (!text) return text;
  const matches = detectKnownSecrets(text);
  return matches.length > 0 ? redactMatches(text, matches) : text;
}

function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactDeep(entry)]),
    ) as T;
  }
  return value;
}

export const patternRedactor: Redactor = {
  redact,
  redactDeep,
  holdBack: STREAM_HOLD_CHARS,
};
