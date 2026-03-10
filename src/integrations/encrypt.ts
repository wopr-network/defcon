import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { IntegrationCredentials } from "./types.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.SILO_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("SILO_ENCRYPTION_KEY is required for integration credential encryption");
  }
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error("SILO_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return buf;
}

/**
 * Encrypt credentials to a storable string: "<iv_hex>:<tag_hex>:<ciphertext_hex>"
 */
export function encryptCredentials(credentials: IntegrationCredentials): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a stored credential string back to the credentials object.
 */
export function decryptCredentials(stored: string): IntegrationCredentials {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted credential format");
  }
  const [ivHex, tagHex, ciphertextHex] = parts as [string, string, string];

  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("Invalid encrypted credential components");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as IntegrationCredentials;
}
