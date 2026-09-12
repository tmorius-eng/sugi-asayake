/**
 * A random id for an idempotent request (checkout attempt, register sale).
 *
 * `crypto.randomUUID()` exists only in a secure context -- https, or
 * localhost. On 2026-09-12 Tom opened the site from his phone over the LAN
 * (http://192.168.88.6) and /checkout crashed at render with "crypto.randomUUID
 * is not a function": the page had worked in every local test because
 * localhost counts as secure. Production is https, so this would never have
 * shown there, but a checkout page must not depend on which address it was
 * opened from.
 *
 * `getRandomValues` is available in insecure contexts too, so a v4 UUID is
 * built from it; the Math.random fallback is for environments with no
 * WebCrypto at all. The result always matches the server's
 * /^[A-Za-z0-9_-]{8,64}$/ rule for clientRequestId.
 */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
