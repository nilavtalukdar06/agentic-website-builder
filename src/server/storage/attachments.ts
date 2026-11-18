import "server-only";
import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";
import { env } from "@/config/env";
import { ATTACHMENT_TYPES, type AttachmentType } from "@/lib/attachments";

export const ATTACHMENTS_BUCKET = "attachments";
export const ATTACHMENT_URL_TTL_SECONDS = 60 * 60;

let client: Files | null = null;

function files() {
  client ??= new Files({
    adapter: neon({
      bucket: ATTACHMENTS_BUCKET,
      endpoint: env.AWS_ENDPOINT_URL_S3,
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    }),
  });
  return client;
}

export function attachmentKey(
  userId: string,
  id: string,
  contentType: AttachmentType,
) {
  return `users/${userId}/${id}.${ATTACHMENT_TYPES[contentType]}`;
}

export async function storeAttachment(
  key: string,
  body: Blob,
  contentType: AttachmentType,
) {
  await files().upload(key, body, { contentType });
}

export function attachmentUrl(key: string) {
  return files().url(key, { expiresIn: ATTACHMENT_URL_TTL_SECONDS });
}

export function deleteAttachment(key: string) {
  return files().delete(key);
}

export function listScreenshotObjects(cursor?: string) {
  return files().list({ prefix: "qa/", limit: 200, cursor });
}
