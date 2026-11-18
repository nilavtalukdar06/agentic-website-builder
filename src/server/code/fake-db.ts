import type { Files } from "./draft";

type Row = {
  id: string;
  projectId: string;
  status: "READY" | "DRAFT";
  number: number | null;
  title: string;
  files: Files;
  runId: string | null;
  creditCost: number;
};

export function fakeEditDb(initial: Row[] = []) {
  const versions = new Map<string, Row>(initial.map((row) => [row.id, row]));
  const messages: Record<string, unknown>[] = [];
  let sequence = 0;
  const db = {
    version: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        versions.get(where.id) ?? null,
      findFirst: async ({
        where,
      }: {
        where: { projectId: string; status: string };
      }) =>
        [...versions.values()]
          .filter(
            (row) =>
              row.projectId === where.projectId && row.status === where.status,
          )
          .sort((a, b) => (b.number ?? 0) - (a.number ?? 0))[0] ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { id: string };
        create: Row;
        update: Partial<Row>;
      }) => {
        const existing = versions.get(where.id);
        const next = existing ? { ...existing, ...update } : { ...create };
        versions.set(where.id, next);
        return next;
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        const had = versions.delete(where.id);
        return { count: had ? 1 : 0 };
      },
      create: async ({
        data,
      }: {
        data: Partial<Row> & { projectId: string };
      }) => {
        const row = {
          id: data.id ?? `v${++sequence}`,
          status: "READY",
          runId: null,
          creditCost: 0,
          title: "",
          files: {},
          number: null,
          ...data,
        } as Row;
        versions.set(row.id, row);
        return row;
      },
    },
    message: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        messages.push(data);
        return data;
      },
    },
  };
  return { db, versions, messages };
}

export const readyVersion = (
  projectId: string,
  number: number,
  files: Files,
): Row => ({
  id: `ready_${projectId}_${number}`,
  projectId,
  status: "READY",
  number,
  title: `Version ${number}`,
  files,
  runId: `run${number}`,
  creditCost: 5,
});
