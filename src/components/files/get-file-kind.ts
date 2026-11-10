import type { FileKind } from "./file-icons.generated";

const byExtension: Record<string, FileKind> = {
  tsx: "react",
  jsx: "react",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  css: "css",
  scss: "css",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "mdx",
  html: "html",
  svg: "svg",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  ico: "image",
  yml: "yaml",
  yaml: "yaml",
};

export function getFileName(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function getFileKind(path: string): FileKind {
  const name = getFileName(path).toLowerCase();

  if (name === "package.json" || name === "package-lock.json") return "npm";
  if (name.startsWith("tailwind.config.")) return "tailwind";
  if (name === ".env" || name.startsWith(".env.")) return "env";
  if (name.startsWith(".git")) return "git";

  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "file";

  return byExtension[name.slice(dot + 1)] ?? "file";
}
