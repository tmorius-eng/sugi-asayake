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
