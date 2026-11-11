// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

async function load(nodeEnv: string, flag?: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("DEV_ROUTES_ENABLED", flag ?? "");
  const { areDevRoutesEnabled } = await import("./dev-routes");
  return areDevRoutesEnabled();
}

describe("areDevRoutesEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("is on outside production", async () => {
    expect(await load("development")).toBe(true);
    expect(await load("test")).toBe(true);
  });

  test("is off in production by default", async () => {
    expect(await load("production")).toBe(false);
  });

  test("can be enabled explicitly in production", async () => {
    expect(await load("production", "true")).toBe(true);
  });
});
