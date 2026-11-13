export type FileChange = "A" | "M";

export function diffVersions(
  current: Record<string, string>,
  previous: Record<string, string> | null,
): Record<string, FileChange> {
  if (!previous) return {};
  const changes: Record<string, FileChange> = {};
  for (const [path, content] of Object.entries(current)) {
    if (!(path in previous)) changes[path] = "A";
    else if (previous[path] !== content) changes[path] = "M";
  }
  return changes;
}
