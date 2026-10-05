import { bootstrapSlice } from "./bootstrap";

/**
 * Брэндийн богино нэр (эзэн солих, 2026-10-05) — `brand-text-short-name` site_text slot. Кодонд
 * "SUGI ASAYAKE" хатуу бичихийн оронд энийг дууд (theme-hex-guard шиг brand-name-guard.test.ts хамгаална).
 *
 * Hook биш: сервер `#storefront-bootstrap`-д хадгалсан текстийг өгдөг тул хуудас ачаалах бүрт
 * тогтмол; admin нэр солиход дараагийн ачаалалтад хүрнэ. Блок байхгүй (pnpm dev) бол анхдагч.
 */
const FALLBACK = "SUGI ASAYAKE";
let cached: string | null = null;

export function brandName(): string {
  if (cached !== null) return cached;
  const rows = bootstrapSlice<Array<{ slotKey: string; textValue: string | null }>>("siteText")?.data ?? [];
  cached = rows.find(row => row.slotKey === "brand-text-short-name")?.textValue?.trim() || FALLBACK;
  return cached;
}

/** Хуудасны гарчиг: "Нэвтрэх — SUGI ASAYAKE". */
export const brandTitle = (page: string) => `${page} — ${brandName()}`;
