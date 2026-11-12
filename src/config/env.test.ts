// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const valid = {
  DATABASE_URL: "postgresql://user:pass@host-pooler.neon.tech/db",
  DIRECT_URL: "postgresql://user:pass@host.neon.tech/db",
};

async function loadEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...valid, ...overrides })) {
    vi.stubEnv(key, value);
  }
  return import("./env");
}

describe("env", () => {
  beforeEach(() => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("parses a valid environment", async () => {
    const { env } = await loadEnv();
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.DIRECT_URL).toBe(valid.DIRECT_URL);
  });

  test("defaults the app URL when it is empty", async () => {
    const { env } = await loadEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  test("throws when DATABASE_URL is missing", async () => {
    await expect(loadEnv({ DATABASE_URL: undefined })).rejects.toThrow(
      /Invalid environment variables/,
    );
  });

  test("treats an empty string as unset", async () => {
    await expect(loadEnv({ DIRECT_URL: "" })).rejects.toThrow(
      /Invalid environment variables/,
    );
  });

  test("rejects a non-postgres URL", async () => {
    await expect(
      loadEnv({ DATABASE_URL: "mysql://user:pass@host/db" }),
    ).rejects.toThrow(/Invalid environment variables/);
  });

  test("rejects an invalid app URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not a url");
    await expect(loadEnv()).rejects.toThrow(/Invalid environment variables/);
  });

  test("requires a 32-byte secrets encryption key", async () => {
    await expect(
      loadEnv({
        SECRETS_ENCRYPTION_KEY: Buffer.from("short").toString("base64"),
      }),
    ).rejects.toThrow(/Invalid environment variables/);
    await expect(
      loadEnv({ SECRETS_ENCRYPTION_KEY: undefined }),
    ).rejects.toThrow(/Invalid environment variables/);
  });

  test("defaults the guard model", async () => {
    const { env } = await loadEnv();
    expect(env.AI_GUARD_MODEL).toBe("openai/gpt-oss-safeguard-20b");
  });

  test("skips validation when SKIP_ENV_VALIDATION is set", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
    await expect(loadEnv({ DATABASE_URL: undefined })).resolves.toBeDefined();
  });
});
