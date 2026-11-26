/**
 * Bank access tokens are encrypted before they're stored (AES-256-GCM), on top of living in a
 * table only the server can read. The key (PLAID_TOKEN_KEY: 32 bytes, base64 or hex) is a server
 * environment variable, so a database leak alone doesn't expose a usable token.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

export function tokenKey(raw: string | undefined, mock = false): Buffer {
  if (!raw) {
    if (mock) return createHash("sha256").update("runway-mock-bank-only").digest();
    throw new Error("PLAID_TOKEN_KEY is not set");
  }
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PLAID_TOKEN_KEY must be 32 bytes (64 hex characters or 44 base64 characters)");
  return key;
}

export function encryptToken(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join(":");
}

export function decryptToken(stored: string, key: Buffer): string {
  const [prefix, iv, tag, body] = stored.split(":");
  if (prefix !== PREFIX || !iv || !tag || !body) throw new Error("Unrecognised token format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}
