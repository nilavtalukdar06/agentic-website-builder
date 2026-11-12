// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  detectSecrets,
  redactPatterns,
  suggestSecretName,
} from "./secret-patterns";

const google = `AIzaSy${"A1b2C3d4E5".repeat(3)}xyz`;
const neon =
  "postgresql://neondb_owner:npg_AbCdEf123456@ep-cool-1.us-east-2.aws.neon.tech/neondb?sslmode=require";
const github = `ghp_${"x1Y2z3".repeat(6)}`;

describe("detectSecrets", () => {
  test("finds provider keys, connection strings and tokens", async () => {
    const text = `key ${google} and db ${neon} and ${github}`;
    const found = await detectSecrets(text);
    const names = found.map((match) => match.suggestedName);
    expect(names).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
    expect(names).toContain("DATABASE_URL");
    expect(names).toContain("GITHUB_TOKEN");
    for (const match of found) {
      expect(match.end).toBeGreaterThan(match.start);
    }
  });

  test("ignores ordinary prompts and example placeholders", async () => {
    await expect(
      detectSecrets("A landing page for a coffee shop with a menu"),
    ).resolves.toEqual([]);
    await expect(
      detectSecrets(
        'DATABASE_URL="postgresql://user:password@localhost:5432/mydb"',
      ),
    ).resolves.toEqual([]);
    await expect(
      detectSecrets("const url = `postgres://${user}:${pass}@${host}/db`"),
    ).resolves.toEqual([]);
  });

  test("redacts every match", async () => {
    const out = await redactPatterns(`use ${neon} please`);
    expect(out).toBe("use [secret removed] please");
  });

  test("suggests a name from the key or the rule", () => {
    expect(suggestSecretName("vibe/provider-key", "sk-ant-api03-x")).toBe(
      "ANTHROPIC_API_KEY",
    );
    expect(suggestSecretName("@secretlint/secretlint-rule-stripe")).toBe(
      "STRIPE_SECRET_KEY",
    );
    expect(suggestSecretName("unknown")).toBe("API_KEY");
  });
});
