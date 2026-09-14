/**
 * Idempotent хүсэлтийн санамсаргүй id (checkout оролдлого, POS борлуулалт).
 *
 * `crypto.randomUUID()` зөвхөн secure context-д (https эсвэл localhost) байдаг.
 * 2026-09-12-нд Tom утаснаасаа LAN-аар (http://192.168.88.6) сайт нээхэд /checkout
 * render дээр "crypto.randomUUID is not a function" гэж унасан: localhost secure-д
 * тооцогддог тул локал бүх туршилтад ажиллаж байв. Production https тул тэнд
 * хэзээ ч гарахгүй байсан ч checkout хуудас аль хаягаар нээгдсэнээс хамаарах ёсгүй.
 *
 * `getRandomValues` insecure context-д ч байдаг тул v4 UUID түүгээр үүсгэнэ;
 * Math.random fallback нь WebCrypto огт байхгүй орчинд. Үр дүн үргэлж серверийн
 * clientRequestId-ийн /^[A-Za-z0-9_-]{8,64}$/ дүрэмд таарна.
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
