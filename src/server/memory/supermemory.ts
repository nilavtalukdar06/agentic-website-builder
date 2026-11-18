import "server-only";
import { Supermemory, SupermemoryError } from "supermemory";
import type { MemoryItem, MemoryProvider } from "./types";

export const READ_TIMEOUT_SECONDS = 1.5;
const WRITE_TIMEOUT_SECONDS = 10;

function notFound(error: unknown) {
  return error instanceof SupermemoryError && error.statusCode === 404;
}

export function supermemoryProvider(apiKey: string): MemoryProvider {
  const client = new Supermemory({ apiKey, maxRetries: 1 });
  const read = { timeoutInSeconds: READ_TIMEOUT_SECONDS, maxRetries: 0 };
  const write = { timeoutInSeconds: WRITE_TIMEOUT_SECONDS, maxRetries: 1 };

  return {
    async profile(namespace) {
      try {
        const { profile } = await client.profile(namespace, {}, read);
        return {
          static: profile.static.map((item) => ({ ...item, kind: "static" })),
          dynamic: profile.dynamic.map((item) => ({
            ...item,
            kind: "dynamic",
          })),
        };
      } catch (error) {
        if (notFound(error)) return { static: [], dynamic: [] };
        throw error;
      }
    },
    async search(namespace, query, { limit, threshold }) {
      try {
        const { results } = await client.search(
          namespace,
          {
            query: query.slice(0, 1000),
            searchMode: "memories",
            limit,
            ...(threshold !== undefined ? { threshold } : {}),
          },
          read,
        );
        return results.flatMap((result): MemoryItem[] =>
          result.memory
            ? [
                {
                  id: result.id,
                  memory: result.memory,
                  kind: "match",
                  similarity: result.similarity,
                },
              ]
            : [],
        );
      } catch (error) {
        if (notFound(error)) return [];
        throw error;
      }
    },
    async remember(namespace, input) {
      await client.add(
        namespace,
        {
          id: input.id,
          content: input.content,
          metadata: input.metadata,
          dreaming: input.instant ? "instant" : "dynamic",
        },
        write,
      );
    },
    async previewForget(namespace, query) {
      try {
        const { matches } = await client.memories.forgetMatching(
          namespace,
          { query: query.slice(0, 1000), dryRun: true },
          write,
        );
        return matches.map((match) => ({ ...match, kind: "match" as const }));
      } catch (error) {
        if (notFound(error)) return [];
        throw error;
      }
    },
    async forget(namespace, ids) {
      if (ids.length === 0) return;
      await client.memories.forget(namespace, { ids }, write);
    },
    async dropNamespace(namespace) {
      try {
        await client.namespaces.delete(namespace, {}, write);
      } catch (error) {
        if (!notFound(error)) throw error;
      }
    },
  };
}
