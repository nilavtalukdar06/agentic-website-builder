import { SECRET_NAME_PATTERN } from "@/lib/secret-name";

export { SECRET_NAME_PATTERN };
export const MAX_SECRET_BYTES = 8 * 1024;

const reserved = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "PWD",
  "PORT",
  "HOSTNAME",
  "NODE_ENV",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_EXTRA_CA_CERTS",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "NPM_CONFIG_REGISTRY",
  "NPM_CONFIG_USERCONFIG",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "E2B_API_KEY",
  "NEXT_RUNTIME",
]);

const providerFormats: { name: RegExp; value: RegExp; hint: string }[] = [
  {
    name: /^(GOOGLE_GENERATIVE_AI_API_KEY|GEMINI_API_KEY)$/,
    value: /^AIza[0-9A-Za-z_-]{35}$/,
    hint: "Google AI keys usually start with AIza.",
  },
  {
    name: /^OPENAI_API_KEY$/,
    value: /^sk-/,
    hint: "OpenAI keys usually start with sk-.",
  },
  {
    name: /^ANTHROPIC_API_KEY$/,
    value: /^sk-ant-/,
    hint: "Anthropic keys usually start with sk-ant-.",
  },
];

export type SecretCheck =
  { ok: true; warnings: string[] } | { ok: false; error: string };

export function checkSecretName(name: string): string | null {
  if (!SECRET_NAME_PATTERN.test(name)) {
    return "Use capital letters, digits and underscores, starting with a letter (for example OPENAI_API_KEY).";
  }
  if (reserved.has(name)) return `${name} is reserved and can't be set.`;
  return null;
}

function isNeonUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      (url.hostname === "neon.tech" || url.hostname.endsWith(".neon.tech"))
    );
  } catch {
    return false;
  }
}

export function checkSecret(name: string, value: string): SecretCheck {
  const nameError = checkSecretName(name);
  if (nameError) return { ok: false, error: nameError };
  if (!value.trim()) return { ok: false, error: "The value is empty." };
  if (Buffer.byteLength(value, "utf8") > MAX_SECRET_BYTES) {
    return { ok: false, error: "The value is larger than 8 KB." };
  }
  if (/DATABASE_URL/.test(name) && !isNeonUrl(value.trim())) {
    return {
      ok: false,
      error:
        "A database URL must be a postgres:// or postgresql:// connection string for a neon.tech host.",
    };
  }
  const warnings = providerFormats
    .filter((format) => format.name.test(name) && !format.value.test(value))
    .map((format) => format.hint);
  return { ok: true, warnings };
}
