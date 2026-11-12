import type { PrismaClient } from "@/generated/prisma/client";
import { decryptSecret, encryptSecret } from "./crypto";
import type { SecretValue } from "./redact";

type Db = Pick<PrismaClient, "projectSecret" | "secretEvent" | "$transaction">;

export async function setSecret(
  db: Db,
  {
    projectId,
    userId,
    name,
    value,
  }: { projectId: string; userId: string; name: string; value: string },
) {
  const encrypted = encryptSecret({ projectId, name, value });
  return db.$transaction(async (tx) => {
    const existing = await tx.projectSecret.findUnique({
      where: { projectId_name: { projectId, name } },
      select: { id: true },
    });
    await tx.projectSecret.upsert({
      where: { projectId_name: { projectId, name } },
      create: { projectId, name, ...encrypted },
      update: encrypted,
    });
    await tx.secretEvent.create({
      data: {
        projectId,
        userId,
        name,
        action: existing ? "REPLACED" : "SET",
      },
    });
    return { name, replaced: Boolean(existing) };
  });
}

export async function deleteSecret(
  db: Db,
  {
    projectId,
    userId,
    name,
  }: { projectId: string; userId: string; name: string },
) {
  return db.$transaction(async (tx) => {
    const { count } = await tx.projectSecret.deleteMany({
      where: { projectId, name },
    });
    if (count > 0) {
      await tx.secretEvent.create({
        data: { projectId, userId, name, action: "DELETED" },
      });
    }
    return count > 0;
  });
}

export function listSecretNames(
  db: Pick<PrismaClient, "projectSecret">,
  projectId: string,
) {
  return db.projectSecret.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
    select: { name: true, createdAt: true, updatedAt: true, lastUsedAt: true },
  });
}

export async function projectHoldsSecrets(
  db: Pick<PrismaClient, "projectSecret">,
  projectId: string,
) {
  return (await db.projectSecret.count({ where: { projectId } })) > 0;
}

export async function loadSecretValues(
  db: Pick<PrismaClient, "projectSecret">,
  projectId: string,
  { touch = false }: { touch?: boolean } = {},
): Promise<SecretValue[]> {
  const rows = await db.projectSecret.findMany({ where: { projectId } });
  if (touch && rows.length > 0) {
    await db.projectSecret.updateMany({
      where: { projectId },
      data: { lastUsedAt: new Date() },
    });
  }
  return rows.flatMap((row) => {
    try {
      return [{ name: row.name, value: decryptSecret(row) }];
    } catch {
      console.error(`[secrets] couldn't decrypt ${row.name} for ${projectId}`);
      return [];
    }
  });
}
