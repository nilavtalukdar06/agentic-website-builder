import { lintSource } from "@secretlint/core";
import { creator as recommended } from "@secretlint/secretlint-rule-preset-recommend";

export type SecretMatch = {
  ruleId: string;
  start: number;
  end: number;
  suggestedName: string;
};

const ownPatterns: { ruleId: string; pattern: RegExp }[] = [
  { ruleId: "vibe/google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { ruleId: "vibe/aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    ruleId: "vibe/provider-key",
    pattern: /\bsk-(?:ant-|proj-|or-)?[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    ruleId: "vibe/postgres-url",
    pattern:
      /\bpostgres(?:ql)?:\/\/[^\s:@/'"`]+:[^\s@/'"`]+@[^\s/'"`]+[^\s'"`]*/g,
  },
  {
    ruleId: "vibe/private-key",
    pattern:
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g,
  },
];

const names: [RegExp, string][] = [
  [/anthropic|sk-ant-/i, "ANTHROPIC_API_KEY"],
  [/openai|provider-key/i, "OPENAI_API_KEY"],
  [/google|gcp|AIza/i, "GOOGLE_GENERATIVE_AI_API_KEY"],
  [/database|postgres/i, "DATABASE_URL"],
  [/github/i, "GITHUB_TOKEN"],
  [/stripe/i, "STRIPE_SECRET_KEY"],
  [/aws/i, "AWS_ACCESS_KEY_ID"],
  [/slack/i, "SLACK_TOKEN"],
  [/sendgrid/i, "SENDGRID_API_KEY"],
  [/groq/i, "GROQ_API_KEY"],
  [/huggingface/i, "HF_TOKEN"],
  [/vercel/i, "VERCEL_TOKEN"],
];

const placeholder =
  /(\$\{|<[a-z_ -]+>|\*{3,}|x{6,}|your[_-]?|example|placeholder|changeme|:(password|pass|secret|postgres|user)@|@(localhost|127\.0\.0\.1|host|db)[:/])/i;

export function suggestSecretName(ruleId: string, text = "") {
  const prefix = text.slice(0, 8);
  return (
    names.find(([pattern]) => pattern.test(prefix))?.[1] ??
    names.find(([pattern]) => pattern.test(ruleId))?.[1] ??
    "API_KEY"
  );
}

function ownMatches(text: string): SecretMatch[] {
  return ownPatterns.flatMap(({ ruleId, pattern }) =>
    [...text.matchAll(pattern)].map((match) => ({
      ruleId,
      start: match.index,
      end: match.index + match[0].length,
      suggestedName: suggestSecretName(ruleId, match[0]),
    })),
  );
}

async function secretlintMatches(text: string): Promise<SecretMatch[]> {
  const result = await lintSource({
    source: {
      content: text,
      filePath: "/input.txt",
      ext: ".txt",
      contentType: "text",
    },
    options: {
      config: {
        rules: [
          {
            id: "@secretlint/secretlint-rule-preset-recommend",
            rule: recommended,
          },
        ],
      },
      maskSecrets: false,
    },
  });
  return result.messages
    .filter((message) => message.type === "message")
    .map((message) => ({
      ruleId: message.ruleId,
      start: message.range[0],
      end: message.range[1],
      suggestedName: suggestSecretName(
        message.ruleId,
        text.slice(message.range[0], message.range[1]),
      ),
    }));
}

function merge(matches: SecretMatch[]) {
  const sorted = [...matches].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const merged: SecretMatch[] = [];
  for (const match of sorted) {
    const last = merged.at(-1);
    if (last && match.start < last.end) {
      last.end = Math.max(last.end, match.end);
      continue;
    }
    merged.push({ ...match });
  }
  return merged;
}

export function detectKnownSecrets(text: string): SecretMatch[] {
  if (!text) return [];
  return merge(
    ownMatches(text).filter(
      (match) => !placeholder.test(text.slice(match.start, match.end)),
    ),
  );
}

export async function detectSecrets(text: string): Promise<SecretMatch[]> {
  if (!text) return [];
  const found = [
    ...ownMatches(text),
    ...(await secretlintMatches(text).catch((error) => {
      console.warn("[guard] secretlint failed, using own patterns", error);
      return [];
    })),
  ].filter((match) => !placeholder.test(text.slice(match.start, match.end)));
  return merge(found);
}

export function redactMatches(text: string, matches: readonly SecretMatch[]) {
  let out = text;
  for (const match of [...matches].sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, match.start)}[secret removed]${out.slice(match.end)}`;
  }
  return out;
}

export async function redactPatterns(text: string) {
  const matches = await detectSecrets(text);
  return matches.length > 0 ? redactMatches(text, matches) : text;
}
