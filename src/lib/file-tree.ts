export type TreeNode =
  | { type: "folder"; name: string; path: string; children: TreeNode[] }
  | { type: "file"; name: string; path: string };

type Folder = Extract<TreeNode, { type: "folder" }>;

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((node) =>
      node.type === "folder"
        ? { ...node, children: sortNodes(node.children) }
        : node,
    )
    .sort((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name)
        : a.type === "folder"
          ? -1
          : 1,
    );
}

export function buildFileTree(paths: string[]): TreeNode[] {
  const root: Folder = { type: "folder", name: "", path: "", children: [] };
  for (const path of paths) {
    const segments = path.split("/").filter(Boolean);
    let folder = root;
    segments.forEach((segment, index) => {
      const nodePath = segments.slice(0, index + 1).join("/");
      if (index === segments.length - 1) {
        folder.children.push({ type: "file", name: segment, path: nodePath });
        return;
      }
      let next = folder.children.find(
        (child): child is Folder =>
          child.type === "folder" && child.name === segment,
      );
      if (!next) {
        next = { type: "folder", name: segment, path: nodePath, children: [] };
        folder.children.push(next);
      }
      folder = next;
    });
  }
  return sortNodes(root.children);
}

export function parentFolders(path: string) {
  const segments = path.split("/");
  return segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join("/"));
}

const languages: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  md: "markdown",
  mdx: "mdx",
  yml: "yaml",
  yaml: "yaml",
  svg: "xml",
  xml: "xml",
  sh: "bash",
  prisma: "prisma",
  sql: "sql",
};

export function languageFor(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return languages[extension] ?? "text";
}

const languageLabels: Record<string, string> = {
  typescript: "TypeScript",
  tsx: "TypeScript JSX",
  javascript: "JavaScript",
  jsx: "JavaScript JSX",
  json: "JSON",
  css: "CSS",
  markdown: "Markdown",
  text: "Plain text",
};

export function languageLabel(path: string) {
  const language = languageFor(path);
  return languageLabels[language] ?? language.toUpperCase();
}
