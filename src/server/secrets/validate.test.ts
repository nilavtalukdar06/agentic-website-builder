import { describe, expect, test } from "vitest";
import { checkSecret, checkSecretName } from "./validate";

describe("checkSecretName", () => {
  test.each(["OPENAI_API_KEY", "DATABASE_URL", "A1"])("accepts %s", (name) => {
    expect(checkSecretName(name)).toBeNull();
  });

  test.each(["openai_key", "1KEY", "A", "KEY-NAME", `K${"A".repeat(64)}`])(
    "rejects %s",
    (name) => {
      expect(checkSecretName(name)).toMatch(/capital letters/);
    },
  );

  test.each(["PATH", "NODE_OPTIONS", "LD_PRELOAD", "NODE_ENV"])(
    "rejects reserved %s",
    (name) => {
      expect(checkSecretName(name)).toMatch(/reserved/);
    },
  );
});

describe("checkSecret", () => {
  test("limits the value to 8 KB and rejects empty values", () => {
    expect(checkSecret("API_KEY", " ")).toEqual({
      ok: false,
      error: "The value is empty.",
    });
    expect(checkSecret("API_KEY", "x".repeat(8193))).toMatchObject({
      ok: false,
    });
  });

  test("requires a Neon postgres URL for database URLs", () => {
    expect(
      checkSecret(
        "DATABASE_URL",
        "postgresql://u:p@ep-cool-1.us-east-2.aws.neon.tech/db?sslmode=require",
      ),
    ).toEqual({ ok: true, warnings: [] });
    expect(checkSecret("DATABASE_URL", "mysql://u:p@host/db")).toMatchObject({
      ok: false,
    });
    expect(
      checkSecret("DATABASE_URL", "postgres://u:p@db.example.com/db"),
    ).toMatchObject({ ok: false });
  });

  test("provider formats are soft warnings", () => {
    expect(checkSecret("GOOGLE_GENERATIVE_AI_API_KEY", "nope")).toEqual({
      ok: true,
      warnings: ["Google AI keys usually start with AIza."],
    });
    expect(checkSecret("OPENAI_API_KEY", "sk-abc")).toEqual({
      ok: true,
      warnings: [],
    });
  });
});
