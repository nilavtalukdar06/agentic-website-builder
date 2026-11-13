import { isBinarySnapshot } from "@/lib/snapshot-files";
import type { Redactor } from "@/server/secrets/redact";
import { detectSecrets } from "./secret-patterns";

export type ScanHit = { path: string; rule: string };

export async function scanFiles(
  files: Record<string, string>,
  redactor: Redactor,
): Promise<ScanHit[]> {
  const hits: ScanHit[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (isBinarySnapshot(content)) continue;
    const named = redactor.contains(content);
    if (named) {
      hits.push({ path, rule: `value of ${named}` });
      continue;
    }
    const found = await detectSecrets(content);
    if (found.length > 0) hits.push({ path, rule: found[0].ruleId });
  }
  return hits;
}

export function scanFixPrompt(hits: readonly ScanHit[]) {
  const list = hits
    .slice(0, 20)
    .map((hit) => `- ${hit.path} (${hit.rule})`)
    .join("\n");
  return `The project can't be saved: these files contain secret values or what looks like keys, passwords or tokens:\n${list}\n\nRemove them now. Read keys in code with process.env.NAME, and if one is missing ask for it with askUser (kind secret). Then reply with a new summary of the whole request in the task_summary tags.`;
}
