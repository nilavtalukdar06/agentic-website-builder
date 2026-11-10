import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { allColorTokens, contrastPairs } from "./tokens";

const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");

function block(selector: RegExp) {
  const match = css.match(selector);
  if (!match) throw new Error(`Missing block ${selector}`);
  return Object.fromEntries(
    [...match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [
      k,
      v.trim(),
    ]),
  );
}

const light = block(/:root,\s*\.light\s*\{([^}]*)\}/);
const dark = block(/\n\.dark\s*\{([^}]*)\}/);

describe("design tokens", () => {
  test.each(allColorTokens.map((token) => [token.name, token]))(
    "--%s on /design matches globals.css",
    (_, token) => {
      expect(light[token.name]).toBe(token.light);
      expect(dark[token.name]).toBe(token.dark);
    },
  );

  test("every contrast pair is defined in both themes", () => {
    for (const pair of contrastPairs) {
      for (const theme of [light, dark]) {
        expect(theme[pair.background]).toBeDefined();
        expect(theme[pair.foreground]).toBeDefined();
      }
    }
  });

  test("radius is 0.5rem", () => {
    expect(light.radius).toBe("0.5rem");
  });
});
