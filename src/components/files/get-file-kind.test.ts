import { describe, expect, test } from "vitest";
import { fileIconData } from "./file-icons.generated";
import { getFileKind, getFileName } from "./get-file-kind";

describe("getFileKind", () => {
  test.each([
    ["app/page.tsx", "react"],
    ["components/hero.jsx", "react"],
    ["lib/utils.ts", "typescript"],
    ["next.config.ts", "typescript"],
    ["app/globals.css", "css"],
    ["tsconfig.json", "json"],
    ["package.json", "npm"],
    ["tailwind.config.ts", "tailwind"],
    [".env.local", "env"],
    [".gitignore", "git"],
    ["README.md", "markdown"],
    ["public/logo.svg", "svg"],
    ["public/hero.webp", "image"],
    ["Dockerfile", "file"],
    ["notes.unknown", "file"],
  ])("%s → %s", (path, kind) => {
    expect(getFileKind(path)).toBe(kind);
  });

  test("every kind has icon data", () => {
    for (const path of ["a.tsx", "a.ts", "a.css", "a.json", "x"]) {
      expect(fileIconData[getFileKind(path)].body.length).toBeGreaterThan(0);
    }
  });

  test("getFileName returns the last segment", () => {
    expect(getFileName("app/(app)/page.tsx")).toBe("page.tsx");
    expect(getFileName("folder/")).toBe("folder");
  });
});
