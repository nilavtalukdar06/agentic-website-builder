const DIRECTIVE =
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["']use (client|server)["']/;
const CLIENT_ONLY =
  /\b(useState|useEffect|useLayoutEffect|useReducer|useRef|useContext|useTransition|useOptimistic|useActionState|useRouter|usePathname|useSearchParams|useTheme)\s*[(<]|\son(Click|Change|Submit|Input|KeyDown|KeyUp|MouseEnter|MouseLeave|Focus|Blur)=\{|\b(window|localStorage|sessionStorage)\./;
const SERVER_ONLY_EXPORT =
  /export\s+(const|async function|function)\s+(metadata|generateMetadata|generateStaticParams|revalidate|dynamic)\b/;

export function needsUseClient(path: string, content: string) {
  if (!/\.(tsx|jsx)$/.test(path)) return false;
  if (path.startsWith("components/ui/")) return false;
  if (DIRECTIVE.test(content)) return false;
  if (SERVER_ONLY_EXPORT.test(content)) return false;
  return CLIENT_ONLY.test(content);
}

export function addUseClient(content: string) {
  return `"use client";\n\n${content}`;
}

export function clientDirectiveFixes(
  files: { path: string; content: string }[],
) {
  return files
    .filter((file) => needsUseClient(file.path, file.content))
    .map((file) => ({ path: file.path, content: addUseClient(file.content) }));
}

const LUCIDE_IMPORT = /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g;

function lucideNames(content: string) {
  const names = new Set<string>();
  for (const match of content.matchAll(LUCIDE_IMPORT)) {
    for (const entry of match[1].split(",")) {
      const local = entry
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .at(-1)
        ?.trim();
      if (local && /^[A-Z][\w$]*$/.test(local)) names.add(local);
    }
  }
  return names;
}

export function fixLucideTitles(content: string) {
  const names = lucideNames(content);
  if (names.size === 0) return content;
  const tags = [...names].join("|");
  const element = new RegExp(`<(${tags})\\b[^<>]*?/?>`, "g");
  return content.replace(element, (tag) =>
    tag.replace(/(\s)title=/g, "$1aria-label="),
  );
}

export function sourceFixes(files: { path: string; content: string }[]) {
  return files.flatMap((file) => {
    if (!/\.(tsx|jsx)$/.test(file.path)) return [];
    let content = fixLucideTitles(file.content);
    if (needsUseClient(file.path, content)) content = addUseClient(content);
    return content === file.content ? [] : [{ path: file.path, content }];
  });
}
