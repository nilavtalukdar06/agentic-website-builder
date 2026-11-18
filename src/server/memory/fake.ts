import type { MemoryItem, MemoryProvider, RememberInput } from "./types";

export function fakeMemoryProvider(
  seed: Record<string, { static?: string[]; dynamic?: string[] }> = {},
) {
  const store = new Map<string, MemoryItem[]>();
  const documents = new Map<string, Map<string, RememberInput>>();
  let counter = 0;
  for (const [namespace, profile] of Object.entries(seed)) {
    store.set(namespace, [
      ...(profile.static ?? []).map((memory) => ({
        id: `m${counter++}`,
        memory,
        kind: "static" as const,
      })),
      ...(profile.dynamic ?? []).map((memory) => ({
        id: `m${counter++}`,
        memory,
        kind: "dynamic" as const,
      })),
    ]);
  }
  const words = (text: string) =>
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2);
  const match = (namespace: string, query: string) => {
    const wanted = new Set(words(query));
    return (store.get(namespace) ?? []).filter((item) =>
      words(item.memory).some((word) => wanted.has(word)),
    );
  };
  const calls: { method: string; namespace: string }[] = [];

  const provider: MemoryProvider = {
    async profile(namespace) {
      calls.push({ method: "profile", namespace });
      const items = store.get(namespace) ?? [];
      return {
        static: items.filter((item) => item.kind === "static"),
        dynamic: items.filter((item) => item.kind === "dynamic"),
      };
    },
    async search(namespace, query, { limit }) {
      calls.push({ method: "search", namespace });
      return match(namespace, query)
        .slice(0, limit)
        .map((item) => ({ ...item, kind: "match" as const, similarity: 0.8 }));
    },
    async remember(namespace, input) {
      calls.push({ method: "remember", namespace });
      const docs = documents.get(namespace) ?? new Map();
      docs.set(input.id, input);
      documents.set(namespace, docs);
      const items = (store.get(namespace) ?? []).filter(
        (item) => item.id !== `doc:${input.id}`,
      );
      items.push({
        id: `doc:${input.id}`,
        memory: input.content,
        kind: "static",
      });
      store.set(namespace, items);
    },
    async previewForget(namespace, query) {
      calls.push({ method: "previewForget", namespace });
      return match(namespace, query).map((item) => ({
        ...item,
        kind: "match" as const,
      }));
    },
    async forget(namespace, ids) {
      calls.push({ method: "forget", namespace });
      store.set(
        namespace,
        (store.get(namespace) ?? []).filter((item) => !ids.includes(item.id)),
      );
    },
    async dropNamespace(namespace) {
      calls.push({ method: "dropNamespace", namespace });
      store.delete(namespace);
      documents.delete(namespace);
    },
  };
  return { provider, store, documents, calls };
}
