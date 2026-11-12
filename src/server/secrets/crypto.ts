import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/config/env";

export const CURRENT_KEY_VERSION = 1;

const keyring: Record<number, () => Buffer> = {
  1: () => Buffer.from(env.SECRETS_ENCRYPTION_KEY, "base64"),
};

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
};

function keyFor(version: number) {
  const key = keyring[version];
  if (!key) throw new Error(`Unknown secrets key version ${version}`);
  return key();
}

function aad(projectId: string, name: string) {
  return Buffer.from(`${projectId}:${name}`, "utf8");
}

export function encryptSecret({
  projectId,
  name,
  value,
}: {
  projectId: string;
  name: string;
  value: string;
}): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(CURRENT_KEY_VERSION), iv);
  cipher.setAAD(aad(projectId, name));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export function decryptSecret(
  row: EncryptedSecret & { projectId: string; name: string },
) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFor(row.keyVersion),
    Buffer.from(row.iv, "base64"),
  );
  decipher.setAAD(aad(row.projectId, row.name));
  decipher.setAuthTag(Buffer.from(row.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
