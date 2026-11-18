import { describe, expect, test } from "vitest";
import { matchesGlob, shellQuote } from "./glob";

describe("matchesGlob", () => {
  test.each([
    ["app/page.tsx", "", true],
    ["app/page.tsx", "**", true],
    ["components/hero.tsx", "components", true],
    ["components/hero.tsx", "components/", true],
    ["componentsx/hero.tsx", "components", false],
    ["app/about/page.tsx", "app/**/page.tsx", true],
    ["app/page.tsx", "app/**/page.tsx", true],
    ["app/about/layout.tsx", "app/**/page.tsx", false],
    ["components/a.tsx", "components/*.tsx", true],
    ["components/ui/a.tsx", "components/*.tsx", false],
    ["lib/data.ts", "**/*.ts", true],
  ])("%s against %j is %s", (path, glob, expected) => {
    expect(matchesGlob(path, glob)).toBe(expected);
  });
});

describe("shellQuote", () => {
  test("wraps in single quotes and escapes embedded ones", () => {
    expect(shellQuote("it's $(rm -rf /)")).toBe("'it'\\''s $(rm -rf /)'");
  });
});
