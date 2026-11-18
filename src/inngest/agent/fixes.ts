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
