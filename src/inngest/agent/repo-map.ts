import { posix } from "node:path";

export type ProjectFiles = Record<string, string>;

export const REPO_MAP_CHARS = 12_000;
const SOURCE = /\.(tsx?|jsx?|mjs|css)$/;
const SKIPPED = [
  /^components\/ui\//,
  /^public\//,
  /^\.agents\//,
  /^\.claude\//,
  /^\.vibe\//,
  /(^|\/)package-lock\.json$/,
  /(^|\/)next-env\.d\.ts$/,
];

export function isTextSource(path: string, content: string) {
  return (
    SOURCE.test(path) &&
    !content.startsWith("data:") &&
    !SKIPPED.some((pattern) => pattern.test(path))
  );
}

export function routeOf(path: string) {
  const match = /^app\/(?:(.*)\/)?page\.(tsx|ts|jsx|js|mdx)$/.exec(path);
  if (!match) return null;
  const segments = (match[1] ?? "")
    .split("/")
    .filter((segment) => segment && !/^\(.*\)$/.test(segment))
    .filter((segment) => !segment.startsWith("@"));
  return `/${segments.join("/")}`;
}

export function routesOf(files: ProjectFiles) {
  return Object.keys(files)
    .map(routeOf)
    .filter((route): route is string => route !== null)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
}

function exportsOf(content: string) {
  const names = new Set<string>();
  for (const match of content.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(match[1]);
  }
  for (const match of content.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }
  if (/export\s+default\s/.test(content)) names.add("default");
  return [...names];
}

function localImportsOf(path: string, content: string) {
  const found = new Set<string>();
  for (const match of content.matchAll(
    /(?:import|export)\s[^'"]*?from\s+["']((?:@\/|\.{1,2}\/)[^"']+)["']/g,
  )) {
    const specifier = match[1];
    found.add(
      specifier.startsWith("@/")
        ? specifier.slice(2)
        : posix.join(posix.dirname(path), specifier),
    );
  }
  return [...found];
}

function lineCount(content: string) {
  return content ? content.split("\n").length : 0;
}

function describe(path: string, content: string, withImports: boolean) {
  const client = /^\s*["']use client["']/.test(content) ? " client" : "";
  const exports = exportsOf(content);
  const imports = withImports ? localImportsOf(path, content) : [];
  return [
    `- ${path} (${lineCount(content)} lines${client})`,
    exports.length > 0 ? ` exports: ${exports.join(", ")}` : "",
    imports.length > 0 ? ` uses: ${imports.join(", ")}` : "",
  ].join("");
}

export function buildRepoMap(files: ProjectFiles, maxChars = REPO_MAP_CHARS) {
  const sources = Object.entries(files)
    .filter(([path, content]) => isTextSource(path, content))
    .sort(([a], [b]) => a.localeCompare(b));
  if (sources.length === 0) return "";
  const routes = routesOf(files);
  const uiComponents = Object.keys(files)
    .filter((path) => /^components\/ui\/[^/]+\.tsx$/.test(path))
    .map((path) => path.slice("components/ui/".length, -".tsx".length))
    .sort();

  const header = [
    routes.length > 0 ? `Routes: ${routes.join(", ")}` : null,
    uiComponents.length > 0
      ? `shadcn/ui in components/ui: ${uiComponents.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  for (const withImports of [true, false]) {
    const lines = sources.map(([path, content]) =>
      describe(path, content, withImports),
    );
    const text = [header, "Files:", ...lines].filter(Boolean).join("\n");
    if (text.length <= maxChars) return text;
  }

  const lines: string[] = [];
  let size = header.length + 8;
  for (const [path, content] of sources) {
    const line = describe(path, content, false);
    if (size + line.length + 1 > maxChars - 80) break;
    lines.push(line);
    size += line.length + 1;
  }
  return [
    header,
    "Files:",
    ...lines,
    `… ${sources.length - lines.length} more files (use listFiles).`,
  ]
    .filter(Boolean)
    .join("\n");
}

function cssBlock(css: string, selector: string) {
  const start = css.search(
    new RegExp(`(^|\\n)\\s*${selector.replace(".", "\\.")}\\s*\\{`),
  );
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return close === -1 ? "" : css.slice(open + 1, close);
}

function tokens(block: string, names: string[]) {
  return names
    .map((name) => {
      const match = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(block);
      return match ? `--${name}: ${match[1].trim()}` : null;
    })
    .filter(Boolean)
    .join("; ");
}

const TOKEN_NAMES = [
  "background",
  "foreground",
  "primary",
  "primary-foreground",
  "accent",
  "muted",
  "border",
  "radius",
];

export function designNotes(files: ProjectFiles) {
  const notes: string[] = [];
  const css = files["app/globals.css"];
  if (css && !css.startsWith("data:")) {
    const light = tokens(cssBlock(css, ":root"), TOKEN_NAMES);
    const dark = tokens(cssBlock(css, ".dark"), TOKEN_NAMES);
    if (light) notes.push(`Light theme tokens: ${light}`);
    if (dark) notes.push(`Dark theme tokens: ${dark}`);
  }
  const layout = files["app/layout.tsx"];
  if (layout) {
    const fonts = [
      ...layout.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*["']next\/font\/google["']/g,
      ),
    ]
      .flatMap((match) => match[1].split(","))
      .map((name) => name.trim().replace(/_/g, " "))
      .filter(Boolean);
    if (fonts.length > 0) notes.push(`Fonts: ${fonts.join(", ")}`);
    const forced = /forcedTheme=["'](light|dark)["']/.exec(layout);
    if (forced) notes.push(`Theme is forced to ${forced[1]}.`);
    const title = /title:\s*["'`]([^"'`]+)["'`]/.exec(layout);
    if (title) notes.push(`Site title: ${title[1]}`);
  }
  return notes.join("\n");
}
