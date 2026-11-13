import type { Source } from "@/lib/agent/parts";

export const SEARCH_TOOL = "parallel_search";
export const MAX_SEARCHES_PER_RUN = 6;
const MAX_QUERY_CHARS = 300;

const sitePattern =
  /\bhttps?:\/\/\S+|\b(?:[a-z0-9-]+\.)+(?:com|io|dev|app|co|org|net|ai|so|xyz|design|studio|shop|store|me|uk|in|de)\b(?:\/\S*)?/i;

export function mentionsSite(prompt: string) {
  return sitePattern.test(prompt);
}

export type SearchRecord = { query: string; sources: Source[] };

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function searchQuery(input: unknown) {
  const { objective, search_queries: queries } = asRecord(input);
  const text =
    typeof objective === "string" && objective.trim()
      ? objective.trim()
      : Array.isArray(queries)
        ? queries.filter((query) => typeof query === "string").join("; ")
        : "";
  return text.length > MAX_QUERY_CHARS
    ? `${text.slice(0, MAX_QUERY_CHARS - 1)}…`
    : text;
}

export function searchSources(output: unknown): Source[] {
  const { results } = asRecord(output);
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  return results.flatMap((result) => {
    const { url, title } = asRecord(result);
    if (typeof url !== "string" || !/^https?:\/\//.test(url) || seen.has(url)) {
      return [];
    }
    seen.add(url);
    return [{ url, title: typeof title === "string" && title ? title : url }];
  });
}

export function searchRecord(input: unknown, output: unknown): SearchRecord {
  return { query: searchQuery(input), sources: searchSources(output) };
}

export function uniqueSources(records: readonly SearchRecord[]): Source[] {
  const seen = new Set<string>();
  return records.flatMap((record) =>
    record.sources.filter((source) => {
      if (seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    }),
  );
}
