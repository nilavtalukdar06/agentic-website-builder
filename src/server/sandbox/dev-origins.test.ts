import { describe, expect, test } from "vitest";
import { ALLOWED_DEV_ORIGIN, withDevOrigins } from "./dev-origins";

const shadcnConfig = `import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default nextConfig
`;

describe("withDevOrigins", () => {
  test("adds the origin to the shadcn template's empty config", () => {
    expect(withDevOrigins(shadcnConfig))
      .toBe(`import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
}

export default nextConfig
`);
  });

  test("keeps the agent's other options", () => {
    const source = `import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: { remotePatterns: [] },
}

export default nextConfig
`;
    expect(withDevOrigins(source)).toBe(`import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
  images: { remotePatterns: [] },
}

export default nextConfig
`);
  });

  test("leaves a config that already sets it alone", () => {
    const source = shadcnConfig.replace(
      "{}",
      '{ allowedDevOrigins: ["*.example.com"] }',
    );
    expect(withDevOrigins(source)).toBeNull();
  });

  test("does nothing for a config it doesn't recognise", () => {
    expect(withDevOrigins("export default {}")).toBeNull();
    expect(withDevOrigins("")).toBeNull();
  });

  test("the pattern matches one label, like the sandbox host", () => {
    expect(ALLOWED_DEV_ORIGIN).toBe("*.e2b.app");
    expect("3000-iqru6kbmzp12m93y516v7.e2b.app".split(".").slice(1)).toEqual([
      "e2b",
      "app",
    ]);
  });
});
