// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  blobContent,
  exportPath,
  prepareFiles,
  validateSnapshot,
} from "./files";
import { encodeBinaryFile } from "@/lib/snapshot-files";
import {
  hasRepositoryScope,
  isExportActive,
  repositoryName,
} from "@/lib/github-export";

export const completeFiles = {
  "package.json": JSON.stringify({
    scripts: { dev: "next dev" },
    dependencies: { next: "16.4.6", react: "19.3.0", "react-dom": "19.3.0" },
  }),
  "app/page.tsx":
    "export default function Page() { return <main>Hello</main>; }",
  "app/layout.tsx":
    "export default function Layout({children}) { return <html><body>{children}</body></html>; }",
};

describe("export preparation", () => {
  test("legacy snapshots omit agent-only files before validation and recovery", async () => {
    const files = await validateSnapshot({
      ...completeFiles,
      "agent/skills/example/SKILL.md": "Agent-only instructions",
      ".agents/skills/a": "private instructions",
      ".env.local": "excluded",
    });
    expect(files).toEqual(completeFiles);
    await expect(
      validateSnapshot({ ...completeFiles, "../outside": "bad" }),
    ).rejects.toMatchObject({ code: "SNAPSHOT" });
  });
  test.each([
    ".env",
    ".env.example",
    "a/.env.local",
    "node_modules/a.js",
    ".next/server.js",
    ".git/config",
    ".agents/skills/a",
    "agent/skills/a",
    "skills-lock.json",
    "../outside",
    "a/../b",
    "/root",
    "a\\b",
    "a\nfile",
  ])("excludes %s", (path) => expect(exportPath(path)).toBe(false));
  test("keeps lockfiles and binary assets; adds runnable instructions and exclusions", async () => {
    const image = encodeBinaryFile(
      "public/a.png",
      new Uint8Array([137, 80, 78, 71]),
    );
    const files = await prepareFiles(
      {
        ...completeFiles,
        "public/a.png": image,
        "package-lock.json": "{}",
        ".env.local": "ignored",
        ".gitignore": ".DS_Store",
        "README.md": "# Demo",
      },
      "Demo",
    );
    expect(files["README.md"]).toContain("npm install");
    expect(files["README.md"]).toContain("npm run dev");
    expect(files[".gitignore"]).toContain(".env*");
    expect(files[".gitignore"]).toContain(".DS_Store");
    expect(files["package-lock.json"]).toBe("{}");
    expect(files).not.toHaveProperty(".env.local");
    expect(blobContent(image)).toEqual({
      content: "iVBORw==",
      encoding: "base64",
    });
    expect(blobContent("hello")).toEqual({
      content: "hello",
      encoding: "utf-8",
    });
  });
  test.each([
    {},
    { "app/page.tsx": "hello" },
    { ...completeFiles, "package.json": "{}" },
    { ...completeFiles, "app/layout.tsx": undefined },
  ])("refuses incomplete snapshots", async (files) => {
    const defined = Object.fromEntries(
      Object.entries(files).filter(([, value]) => value !== undefined),
    ) as Record<string, string>;
    await expect(validateSnapshot(defined)).rejects.toMatchObject({
      code: "SNAPSHOT",
    });
  });
  test("refuses secret-bearing source before pushing", async () => {
    const secret = "ghp_" + "x1Y2z3".repeat(6);
    await expect(
      prepareFiles(
        { ...completeFiles, "config.ts": `export const token = '${secret}';` },
        "Demo",
      ),
    ).rejects.toMatchObject({ code: "SECRET" });
  });
  test("refuses encoded files that would exceed durable step payload limits", async () => {
    const image = encodeBinaryFile("public/a.png", new Uint8Array(1_000_000));
    await expect(
      prepareFiles(
        {
          ...completeFiles,
          "public/a.png": image,
          "public/b.png": image,
          "public/c.png": image,
        },
        "Demo",
      ),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });
});

test("repository consent and names", () => {
  expect(hasRepositoryScope("read:user,user:email", false)).toBe(false);
  expect(hasRepositoryScope("read:user public_repo", false)).toBe(true);
  expect(hasRepositoryScope("public_repo", true)).toBe(false);
  expect(hasRepositoryScope("repo,user:email", true)).toBe(true);
  expect(repositoryName.safeParse("demo-site").success).toBe(true);
  expect(repositoryName.safeParse("../repo").success).toBe(false);
  expect(isExportActive("PUSHING")).toBe(true);
  expect(isExportActive("SUCCEEDED")).toBe(false);
  expect(isExportActive(undefined)).toBe(false);
});
