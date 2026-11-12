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
      updatedAt?: Date;
    }) => {
      const id = randomUUID();
      await sql`
        INSERT INTO "Project" (id, slug, name, description, "userId", "githubRepo", "previewUrl", "updatedAt")
        VALUES (${id}, ${project.slug}, ${project.name}, ${project.description ?? null}, ${userId}, ${project.githubRepo ?? null}, ${project.previewUrl ?? null}, ${(project.updatedAt ?? new Date()).toISOString()})`;
      return id;
    },
    addMessage: async (message: {
      projectId: string;
      role: "USER" | "ASSISTANT";
      content: string;
      parts?: unknown;
      createdAt?: Date;
    }) => {
      await sql`
        INSERT INTO "Message" (id, "projectId", role, content, parts, "createdAt")
        VALUES (${randomUUID()}, ${message.projectId}, ${message.role}, ${message.content}, ${message.parts === undefined ? null : JSON.stringify(message.parts)}::jsonb, ${(message.createdAt ?? new Date()).toISOString()})`;
    },
    addInputRequest: async (request: {
      projectId: string;
      kind: "CHOICE" | "TEXT" | "SECRET" | "CONFIRM";
      payload: unknown;
      status?: "PENDING" | "PAUSED" | "ANSWERED";
    }) => {
      const id = `input_e2e_${randomUUID()}`;
      await sql`
        INSERT INTO "InputRequest" (id, "projectId", "userId", "runId", "chainId", "messageId", agent, kind, payload, status, "questionHash")
        VALUES (${id}, ${request.projectId}, ${userId}, 'e2e-run', 'e2e-run', 'e2e-message', 'builder', ${request.kind}::"InputKind", ${JSON.stringify(request.payload)}::jsonb, ${request.status ?? "PAUSED"}::"InputStatus", ${randomUUID()})`;
      return id;
    },
    cookie: {
      name: "better-auth.session_token",
      value: await sign(token, process.env.BETTER_AUTH_SECRET!),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    },
    cleanup: () => sql`DELETE FROM "user" WHERE id = ${userId}`,
  };
}
