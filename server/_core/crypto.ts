// Admin-ийн оруулсан гуравдагч талын нууц үгсийн at-rest шифрлэлт
// (integration_configs.encryptedConfig — server/db.ts). Node-ийн built-in crypto-
// оор AES-256-GCM, гадны dependency-гүй — аюулгүй байдлын primitive-д dependency
// багатай байх энэ төслийн тогтсон зарчим (password.ts-ийн scrypt).
//
// Түлхүүр DB-д хэзээ ч байхгүй — зөвхөн ENV.integrationsEncryptionKey
// (INTEGRATIONS_ENCRYPTION_KEY). Алдагдсан DB backup дангаараа хадгалсан
// credential-ийг ил гаргахгүй, DB БА серверийн env хоёулаа алдагдвал л.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ENV } from "./env";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = ENV.integrationsEncryptionKey;
  if (!hex || hex.length !== 64) {
    throw new Error("INTEGRATIONS_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  }
  return Buffer.from(hex, "hex");
}

/** Encrypts a plain key-value record into an opaque "iv:authTag:ciphertext"
 *  hex-encoded blob, safe to store in a text column. */
export function encryptJson(value: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(":");
}

/** Prefix that marks a value written by encryptText, so a column that used to
 *  hold plaintext can be read transparently during the switch-over. */
export const ENCRYPTED_TEXT_PREFIX = "enc1:";

/** Whether the at-rest key is configured (encryptText would not throw). */
export function hasEncryptionKey(): boolean {
  const hex = ENV.integrationsEncryptionKey;
  return Boolean(hex && hex.length === 64);
}

/**
 * Encrypts an arbitrary string into "enc1:<iv>:<tag>:<ciphertext>", BASE64
 * (2026-09-22, face templates). Base64 rather than encryptJson's hex because
 * the face template's twelve poses are ~32 KB of JSON: hex would double that
 * past a MySQL TEXT column's 65,535 bytes, base64 keeps it near 43 KB.
 */
export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${ENCRYPTED_TEXT_PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Reverses encryptText. Throws when the blob is malformed, tampered with, or
 *  was encrypted under a different key. */
export function decryptText(blob: string): string {
  if (!blob.startsWith(ENCRYPTED_TEXT_PREFIX)) throw new Error("Not an encrypted text blob.");
  const [ivB64, tagB64, ctB64] = blob.slice(ENCRYPTED_TEXT_PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || ctB64 === undefined) throw new Error("Malformed encrypted text blob.");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/** Reverses encryptJson. Throws if the blob is malformed or the key/authTag
 *  don't match (tampered or encrypted under a different key). */
export function decryptJson(blob: string): Record<string, string> {
  const [ivHex, authTagHex, ciphertextHex] = blob.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error("Malformed encrypted config blob.");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}
