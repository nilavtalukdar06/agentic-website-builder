import { nanoid } from "nanoid";
import type { PrismaClient } from "@/generated/prisma/client";
import { scanFiles } from "@/inngest/agent/guardrails/scan";
import { replyId } from "@/inngest/agent/persist";
import type { AgentPart } from "@/lib/agent/parts";
import { isBinaryPath, isBinarySnapshot } from "@/lib/snapshot-files";
import { resolveAppPath } from "@/server/sandbox/guards";
import { draftId } from "./ids";

export const MAX_EDIT_CHARS = 300_000;

export type Files = Record<string, string>;

export class EditError extends Error {}

export { draftId };

type EditDb = Pick<PrismaClient, "version" | "message">;

export async function checkEdit(path: string, content: string) {
  const { relative } = resolveAppPath(path, "write");
  if (isBinaryPath(relative)) {
    throw new EditError("Images and other binary files can't be edited here.");
  }
  if (content.length > MAX_EDIT_CHARS) {
    throw new EditError("That file is too large to edit here.");
  }
  if (relative === "package.json") {
    try {
      JSON.parse(content);
    } catch {
      throw new EditError("package.json must be valid JSON.");
    }
  }
  if ((await scanFiles({ [relative]: content })).length > 0) {
    throw new EditError(
      "This looks like it contains a secret or API key. Remove it before saving.",
    );
  }
  return relative;
}

export function sameFiles(a: Files, b: Files) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => b[key] === a[key])
  );
}

export function changedPaths(next: Files, previous: Files) {
  const paths = new Set([...Object.keys(next), ...Object.keys(previous)]);
  return [...paths].filter((path) => next[path] !== previous[path]).sort();
}

export async function workingCopy(
  db: Pick<PrismaClient, "version">,
  projectId: string,
) {
  const [draft, latest] = await Promise.all([
    db.version.findUnique({
      where: { id: draftId(projectId) },
      select: { files: true },
    }),
    db.version.findFirst({
      where: { projectId, status: "READY" },
      orderBy: { number: "desc" },
      select: { number: true, files: true },
    }),
  ]);
  if (!latest || latest.number === null) return null;
  const latestFiles = (latest.files ?? {}) as Files;
  return {
    latest: latest.number,
    latestFiles,
    files: draft ? ((draft.files ?? {}) as Files) : latestFiles,
    dirty: Boolean(draft),
  };
}

async function saveWorkingFiles(
  tx: EditDb,
  projectId: string,
  files: Files,
  latestFiles: Files,
) {
  if (sameFiles(files, latestFiles)) {
    await tx.version.deleteMany({ where: { id: draftId(projectId) } });
    return;
  }
  await tx.version.upsert({
    where: { id: draftId(projectId) },
    create: {
      id: draftId(projectId),
      projectId,
      status: "DRAFT",
      number: null,
      runId: null,
      title: "Your edits",
      files,
      creditCost: 0,
    },
    update: { files },
  });
}

export async function writeDraftFile(
  tx: EditDb,
  projectId: string,
  relative: string,
  content: string,
) {
  const base = await workingCopy(tx, projectId);
  if (!base) {
    throw new EditError(
      "There's nothing to edit yet. Wait for the first build to finish.",
    );
  }
  const current = base.files[relative];
  if (current !== undefined && isBinarySnapshot(current)) {
    throw new EditError("Images and other binary files can't be edited here.");
  }
  if (current === content) return { changed: false };
  await saveWorkingFiles(
    tx,
    projectId,
    { ...base.files, [relative]: content },
    base.latestFiles,
  );
  return { changed: true };
}

export async function removeDraftFile(
  tx: EditDb,
  projectId: string,
  relative: string,
) {
  const base = await workingCopy(tx, projectId);
  if (!base || !(relative in base.files)) return { changed: false };
  const files = { ...base.files };
  delete files[relative];
  await saveWorkingFiles(tx, projectId, files, base.latestFiles);
  return { changed: true };
}

export async function replaceDraftFiles(
  tx: EditDb,
  projectId: string,
  files: Files,
) {
  const base = await workingCopy(tx, projectId);
  if (!base) return { changed: false };
  if (sameFiles(files, base.files)) return { changed: false };
  await saveWorkingFiles(tx, projectId, files, base.latestFiles);
  return { changed: true };
}

export const editReply = (number: number, paths: readonly string[]) =>
  paths.length === 1
    ? `Saved your edit to ${paths[0]} as version ${number}.`
    : `Saved your edits to ${paths.length} files as version ${number}.`;

export async function promoteDraft(tx: EditDb, projectId: string) {
  const draft = await tx.version.findUnique({
    where: { id: draftId(projectId) },
    select: { files: true },
  });
  if (!draft) return null;
  const latest = await tx.version.findFirst({
    where: { projectId, status: "READY" },
    orderBy: { number: "desc" },
    select: { number: true, files: true },
  });
  await tx.version.deleteMany({ where: { id: draftId(projectId) } });
  const files = (draft.files ?? {}) as Files;
  const previous = (latest?.files ?? {}) as Files;
  if (!latest || sameFiles(files, previous)) return null;

  const paths = changedPaths(files, previous);
  const number = (latest.number ?? 0) + 1;
  const runId = `edit-${nanoid(12)}`;
  const content = editReply(number, paths);
  const parts: AgentPart[] = [{ type: "text", text: content }];
  await tx.version.create({
    data: {
      projectId,
      number,
      title:
        paths.length === 1
          ? `Edited ${paths[0]}`
          : `Edited ${paths.length} files`,
      files,
      creditCost: 0,
      runId,
    },
  });
  await tx.message.create({
    data: {
      id: replyId(runId),
      projectId,
      role: "ASSISTANT",
      content,
      parts,
    },
  });
  return { number, paths };
}

export async function discardDraft(
  tx: Pick<PrismaClient, "version">,
  projectId: string,
) {
  const removed = await tx.version.deleteMany({
    where: { id: draftId(projectId) },
  });
  return removed.count > 0;
}

export async function hasDraft(
  tx: Pick<PrismaClient, "version">,
  projectId: string,
) {
  const draft = await tx.version.findUnique({
    where: { id: draftId(projectId) },
    select: { id: true },
  });
  return draft !== null;
}
