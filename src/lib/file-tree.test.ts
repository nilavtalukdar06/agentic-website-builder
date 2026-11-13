import { describe, expect, test } from "vitest";
import {
  buildFileTree,
  languageFor,
  languageLabel,
  parentFolders,
} from "./file-tree";

describe("buildFileTree", () => {
  test("nests paths with folders first, then files, alphabetically", () => {
    expect(
      buildFileTree([
        "package.json",
        "app/page.tsx",
        "app/ui/a.tsx",
        "README.md",
      ]),
    ).toEqual([
      {
        type: "folder",
        name: "app",
        path: "app",
        children: [
          {
            type: "folder",
            name: "ui",
            path: "app/ui",
            children: [{ type: "file", name: "a.tsx", path: "app/ui/a.tsx" }],
          },
          { type: "file", name: "page.tsx", path: "app/page.tsx" },
        ],
      },
      { type: "file", name: "package.json", path: "package.json" },
      { type: "file", name: "README.md", path: "README.md" },
    ]);
  });
});

describe("helpers", () => {
  test("parentFolders lists every ancestor", () => {
    expect(parentFolders("a/b/c.ts")).toEqual(["a", "a/b"]);
    expect(parentFolders("c.ts")).toEqual([]);
  });

  test("languages", () => {
    expect(languageFor("app/page.tsx")).toBe("tsx");
    expect(languageFor("LICENSE")).toBe("text");
    expect(languageLabel("app/page.tsx")).toBe("TypeScript JSX");
  });
});
