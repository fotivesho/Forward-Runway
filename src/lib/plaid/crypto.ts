/**
 * Bank access tokens are encrypted before they're stored (AES-256-GCM), on top of living in a
 * table only the server can read. The key (PLAID_TOKEN_KEY: any random password of 32+ characters,
 * or 32 bytes as hex/base64) is a server
 * environment variable, so a database leak alone doesn't expose a usable token.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

export function tokenKey(raw: string | undefined, mock = false): Buffer {
  if (!raw) {
    if (mock) return createHash("sha256").update("runway-mock-bank-only").digest();
    throw new Error("PLAID_TOKEN_KEY is not set");
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const b64 = /^[A-Za-z0-9+/]{43}=$/.test(raw) ? Buffer.from(raw, "base64") : null;
  if (b64?.length === 32) return b64;
  // Or any long random password (easy to make in a password manager): stretched to 32 bytes.
  if (raw.length >= 32) return createHash("sha256").update(raw, "utf8").digest();
  throw new Error("PLAID_TOKEN_KEY must be at least 32 characters");
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
