// At-rest encryption for admin-entered third-party provider credentials
// (integration_configs.encryptedConfig — see server/db.ts). AES-256-GCM via
// Node's built-in crypto, no external dependency, matching this project's
// established preference (see password.ts's scrypt) for keeping the
// dependency footprint small for security-sensitive primitives.
//
// The key never lives in the database — only ENV.integrationsEncryptionKey
// (INTEGRATIONS_ENCRYPTION_KEY) does. This means a leaked DB backup alone
// does not expose stored provider credentials, only a leak of both the DB
// AND the server's env would.
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
