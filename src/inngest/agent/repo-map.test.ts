import { describe, expect, test } from "vitest";
import { buildRepoMap, designNotes, routeOf, routesOf } from "./repo-map";

const files = {
  "app/page.tsx":
    'import { Hero } from "@/components/hero";\nexport default function Home() { return <Hero />; }\n',
  "app/(marketing)/about/page.tsx": "export default function About() {}\n",
  "app/blog/[slug]/page.tsx": "export default function Post() {}\n",
  "app/layout.tsx":
    'import { Geist, Playfair_Display } from "next/font/google";\nexport const metadata = { title: "Ember & Oak" };\nexport default function Layout() {}\n<ThemeProvider forcedTheme="dark">',
  "app/globals.css":
    ":root {\n  --radius: 0.75rem;\n  --primary: oklch(0.5 0.2 250);\n}\n.dark {\n  --primary: oklch(0.7 0.2 250);\n}\n",
  "components/hero.tsx":
    '"use client";\nimport { useState } from "react";\nimport { cn } from "../lib/utils";\nexport function Hero() {}\nexport type HeroProps = {};\n',
  "components/ui/button.tsx": "export function Button() {}\n",
  "lib/utils.ts": "export function cn() {}\nexport { a as b, c };\n",
  "public/logo.png": "data:image/png;base64,AAAA",
  "package-lock.json": "{}",
};

describe("routes", () => {
  test("turns page files into routes, dropping route groups", () => {
    expect(routeOf("app/page.tsx")).toBe("/");
    expect(routeOf("app/(marketing)/about/page.tsx")).toBe("/about");
    expect(routeOf("app/blog/[slug]/page.tsx")).toBe("/blog/[slug]");
    expect(routeOf("app/layout.tsx")).toBeNull();
    expect(routesOf(files)).toEqual(["/", "/about", "/blog/[slug]"]);
  });
});

describe("buildRepoMap", () => {
  test("lists routes, ui components and source files with exports and client markers", () => {
    const map = buildRepoMap(files);
    expect(map).toContain("Routes: /, /about, /blog/[slug]");
    expect(map).toContain("shadcn/ui in components/ui: button");
    expect(map).toContain(
      "- components/hero.tsx (6 lines client) exports: Hero, HeroProps uses: lib/utils",
    );
    expect(map).toContain("- lib/utils.ts (3 lines) exports: cn, b, c");
    expect(map).not.toContain("public/logo.png");
    expect(map).not.toContain("package-lock.json");
    expect(map).not.toContain("- components/ui/button.tsx");
  });

  test("drops imports, then truncates, to stay under the budget", () => {
    const many = Object.fromEntries(
      Array.from({ length: 300 }, (_, index) => [
        `components/section-${index}.tsx`,
        `import { x } from "@/lib/x";\nexport function Section${index}() {}\n`,
      ]),
    );
    const map = buildRepoMap(many, 4000);
    expect(map.length).toBeLessThanOrEqual(4000);
    expect(map).toMatch(/more files \(use listFiles\)\.$/);
    expect(map).not.toContain("uses:");
  });

  test("is empty for a project without sources", () => {
    expect(buildRepoMap({})).toBe("");
  });
});

describe("designNotes", () => {
  test("reads tokens, fonts, a forced theme and the title", () => {
    const notes = designNotes(files);
    expect(notes).toContain(
      "Light theme tokens: --primary: oklch(0.5 0.2 250); --radius: 0.75rem",
    );
    expect(notes).toContain("Dark theme tokens: --primary: oklch(0.7 0.2 250)");
    expect(notes).toContain("Fonts: Geist, Playfair Display");
    expect(notes).toContain("Theme is forced to dark.");
    expect(notes).toContain("Site title: Ember & Oak");
  });
});
