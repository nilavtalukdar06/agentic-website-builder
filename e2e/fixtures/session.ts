import { randomUUID, webcrypto } from "node:crypto";
import { neon } from "@neondatabase/serverless";

async function sign(value: string, secret: string) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await webcrypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return encodeURIComponent(
    `${value}.${Buffer.from(signature).toString("base64")}`,
  );
}

export async function createTestSession(name: string) {
  const sql = neon(process.env.DATABASE_URL!);
  const userId = `e2e-${randomUUID()}`;
  const token = randomUUID().replaceAll("-", "");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await sql`
    INSERT INTO "user" (id, name, email, "emailVerified", "updatedAt")
    VALUES (${userId}, ${name}, ${`${userId}@e2e.local`}, true, now())`;
  await sql`
    INSERT INTO "session" (id, token, "userId", "expiresAt", "updatedAt")
    VALUES (${randomUUID()}, ${token}, ${userId}, ${expiresAt}, now())`;

  return {
    userId,
    addProject: async (project: {
      slug: string;
      name: string;
      description?: string;
      githubRepo?: string | null;
      previewUrl?: string | null;
      sandboxId?: string | null;
      updatedAt?: Date;
    }) => {
      const id = randomUUID();
      await sql`
        INSERT INTO "Project" (id, slug, name, description, "userId", "githubRepo", "previewUrl", "sandboxId", "updatedAt")
        VALUES (${id}, ${project.slug}, ${project.name}, ${project.description ?? null}, ${userId}, ${project.githubRepo ?? null}, ${project.previewUrl ?? null}, ${project.sandboxId ?? null}, ${(project.updatedAt ?? new Date()).toISOString()})`;
      return id;
    },
    addMessage: async (message: {
      id?: string;
      projectId: string;
      role: "USER" | "ASSISTANT";
      content: string;
      parts?: unknown;
      replyToId?: string | null;
      startedAt?: Date | null;
      createdAt?: Date;
    }) => {
      const id = message.id ?? randomUUID();
      await sql`
        INSERT INTO "Message" (id, "projectId", role, content, parts, "replyToId", "startedAt", "createdAt")
        VALUES (${id}, ${message.projectId}, ${message.role}, ${message.content}, ${message.parts === undefined ? null : JSON.stringify(message.parts)}::jsonb, ${message.replyToId ?? null}, ${message.startedAt ? message.startedAt.toISOString() : null}, ${(message.createdAt ?? new Date()).toISOString()})`;
      return id;
    },
    addVersion: async (version: {
      projectId: string;
      number: number;
      title: string;
      files: Record<string, string>;
      creditCost?: number;
      runId?: string;
      createdAt?: Date;
    }) => {
      await sql`
        INSERT INTO "Version" (id, "projectId", number, status, "runId", title, files, "creditCost", "createdAt")
        VALUES (${randomUUID()}, ${version.projectId}, ${version.number}, 'READY', ${version.runId ?? null}, ${version.title}, ${JSON.stringify(version.files)}::jsonb, ${version.creditCost ?? 0}, ${(version.createdAt ?? new Date()).toISOString()})`;
    },
    cookie: {
      name: "better-auth.session_token",
      value: await sign(token, process.env.BETTER_AUTH_SECRET!),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    },
    projectCount: async () => {
      const [row] =
        await sql`SELECT count(*)::int AS count FROM "Project" WHERE "userId" = ${userId}`;
      return row.count as number;
    },
    messageCount: async (projectId: string) => {
      const [row] =
        await sql`SELECT count(*)::int AS count FROM "Message" WHERE "projectId" = ${projectId}`;
      return row.count as number;
    },
    projectState: async (projectId: string) => {
      const [row] =
        await sql`SELECT "sandboxId", "previewUrl" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}`;
      return row as { sandboxId: string | null; previewUrl: string | null };
    },
    cleanup: async () => {
      await sql`DELETE FROM "GuardEvent" WHERE "userId" = ${userId}`;
      await sql`DELETE FROM "user" WHERE id = ${userId}`;
    },
  };
}
