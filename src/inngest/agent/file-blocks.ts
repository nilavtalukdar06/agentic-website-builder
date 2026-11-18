export type FileBlock = { path: string; content: string };

const FILE_BLOCK =
  /<file\s+path=["']([^"'\n]+)["']\s*>\r?\n?([\s\S]*?)<\/file>/g;
const FENCE = /^\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```\s*$/;

export function parseFileBlocks(text: string): FileBlock[] {
  const found = new Map<string, string>();
  for (const match of text.matchAll(FILE_BLOCK)) {
    const path = match[1].trim().replace(/^\.\/+/, "");
    let content = match[2];
    const fenced = FENCE.exec(content);
    if (fenced) content = fenced[1];
    content = content.replace(/\s+$/, "");
    if (!path || !content) continue;
    found.set(path, `${content}\n`);
  }
  return [...found].map(([path, content]) => ({ path, content }));
}

export function unclosedFile(text: string) {
  const opened = [...text.matchAll(/<file\s+path=["']([^"'\n]+)["']\s*>/g)];
  const closed = (text.match(/<\/file>/g) ?? []).length;
  return opened.length > closed ? (opened.at(-1)?.[1] ?? null) : null;
}
