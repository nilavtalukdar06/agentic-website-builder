export type SecretValue = { name: string; value: string };

type Needle = { text: string; name: string };

const MIN_SECRET_LENGTH = 6;

function encodings(value: string) {
  const forms = new Set([
    value,
    encodeURIComponent(value),
    Buffer.from(value, "utf8").toString("base64"),
    Buffer.from(value, "utf8").toString("base64url"),
  ]);
  const base64 = Buffer.from(value, "utf8").toString("base64");
  forms.add(base64.replace(/=+$/, ""));
  return [...forms].filter((form) => form.length >= MIN_SECRET_LENGTH);
}

export type Redactor = {
  redact: (text: string) => string;
  redactDeep: <T>(value: T) => T;
  contains: (text: string) => string | null;
  maxNeedleLength: number;
  active: boolean;
};

export function createRedactor(secrets: readonly SecretValue[]): Redactor {
  const needles: Needle[] = secrets
    .filter((secret) => secret.value.length >= MIN_SECRET_LENGTH)
    .flatMap((secret) =>
      encodings(secret.value).map((text) => ({ text, name: secret.name })),
    )
    .sort((a, b) => b.text.length - a.text.length);

  const redact = (text: string) => {
    if (needles.length === 0 || !text) return text;
    let out = text;
    for (const needle of needles) {
      if (out.includes(needle.text)) {
        out = out.split(needle.text).join(`[secret ${needle.name}]`);
      }
    }
    return out;
  };

  const redactDeep = <T>(value: T): T => {
    if (needles.length === 0) return value;
    if (typeof value === "string") return redact(value) as T;
    if (Array.isArray(value)) return value.map(redactDeep) as T;
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, redactDeep(entry)]),
      ) as T;
    }
    return value;
  };

  return {
    redact,
    redactDeep,
    contains: (text) =>
      needles.find((needle) => text.includes(needle.text))?.name ?? null,
    maxNeedleLength: needles[0]?.text.length ?? 0,
    active: needles.length > 0,
  };
}

export const noRedaction = createRedactor([]);
