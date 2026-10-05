/**
 * WCAG 2.x контрастын харьцаа — `e2e/storefront-contrast.spec.ts`-ийн томьёотой ЯГ ижил
 * (0.03928 босго, 0.2126/0.7152/0.0722 жин), тиймээс Брэнд студийн "AA хамгаалалт" нь e2e-ийн
 * хэмждэгтэй нэг тоо гаргана. Hex оролт (`normalizeHex`-ээр баталгаажсан).
 */
import type { ThemeLook } from "../theme-tokens";

const channel = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = hex.replace("#", "");
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const [a, b] = [relativeLuminance(fg), relativeLuminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** AA: энгийн текст 4.5, том текст (≥24px эсвэл ≥18.66px bold) 3. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;


/**
 * Брэнд студийн "AA хамгаалалт"-ын хосууд (2026-10-05): текст ↔ түүний дэвсгэр. Үндсэн загварт бүгд
 * ≥4.5 (server/theme-contrast.test.ts батална), тиймээс админ өнгө сольж унших боломжгүй хослол
 * үүсгэвэл хадгалуулахгүй. `mode: "dark"` хос нь харанхуй горимын утгыг гэрлийнх дээр давхарлаж уншина.
 */
export const CONTRAST_PAIRS: ReadonlyArray<{ fg: string; bg: string; mode: "light" | "dark"; label: string }> = [
  { fg: "foreground", bg: "background", mode: "light", label: "Үндсэн текст / дэвсгэр" },
  { fg: "card-foreground", bg: "card", mode: "light", label: "Картын текст / карт" },
  { fg: "popover-foreground", bg: "popover", mode: "light", label: "Цонхны текст / цонх" },
  { fg: "primary-foreground", bg: "primary", mode: "light", label: "Товчны текст / товч" },
  { fg: "primary-foreground", bg: "primary-hover", mode: "light", label: "Товчны текст / товч (hover)" },
  { fg: "primary-text", bg: "background", mode: "light", label: "Брэнд текст / дэвсгэр" },
  { fg: "primary-text", bg: "card", mode: "light", label: "Брэнд текст / карт" },
  { fg: "secondary-foreground", bg: "secondary", mode: "light", label: "2-р товчны текст / товч" },
  { fg: "muted-foreground", bg: "background", mode: "light", label: "Бүдэг текст / дэвсгэр" },
  { fg: "muted-foreground", bg: "card", mode: "light", label: "Бүдэг текст / карт" },
  { fg: "accent-foreground", bg: "accent", mode: "light", label: "Онцлох текст / онцлох" },
  { fg: "destructive-foreground", bg: "destructive", mode: "light", label: "Анхааруулгын текст" },
  { fg: "ck-ink", bg: "ck-page", mode: "light", label: "Нүүрний текст / хуудас" },
  { fg: "ck-muted", bg: "ck-page", mode: "light", label: "Нүүрний бүдэг текст / хуудас" },
  { fg: "ck-muted", bg: "ck-cream", mode: "light", label: "Нүүрний бүдэг текст / цөцгий" },
  { fg: "ck-gold", bg: "ck-page", mode: "light", label: "Алтлаг текст / хуудас" },
  { fg: "promo-bar-fg", bg: "promo-bar-bg", mode: "light", label: "Зарын зурвас" },
  { fg: "ck-ink", bg: "ck-page", mode: "dark", label: "Харанхуй: текст / хуудас" },
  { fg: "ck-muted", bg: "ck-page", mode: "dark", label: "Харанхуй: бүдэг текст / хуудас" },
  { fg: "ck-ink", bg: "ck-surface", mode: "dark", label: "Харанхуй: текст / карт" },
  { fg: "ck-muted", bg: "ck-surface", mode: "dark", label: "Харанхуй: бүдэг текст / карт" },
  { fg: "ck-gold", bg: "ck-page", mode: "dark", label: "Харанхуй: алтлаг текст" },
];

export interface ContrastResult { fg: string; bg: string; mode: "light" | "dark"; label: string; ratio: number; ok: boolean }

const tokenValue = (look: ThemeLook, key: string, mode: "light" | "dark"): string =>
  (mode === "dark" ? (look.dark as Record<string, string>)[key] : undefined) ?? (look.light as Record<string, string>)[key];

/** Бүх хосын харьцаа. `ok === false` мөр байвал хадгалахгүй. */
export function checkLookContrast(look: ThemeLook, min = AA_NORMAL): ContrastResult[] {
  return CONTRAST_PAIRS.map(pair => {
    const ratio = contrastRatio(tokenValue(look, pair.fg, pair.mode), tokenValue(look, pair.bg, pair.mode));
    return { ...pair, ratio: Math.round(ratio * 100) / 100, ok: ratio >= min };
  });
}

const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

/**
 * Текстийн өнгийг дэвсгэртэйгээ `target` харьцаанд хүртэл харанхуйлж/цайруулна — өнгөний аяыг
 * (hue) хадгалж хар эсвэл цагаан руу шугамаар холино. Аль чиглэл илүү контраст өгөхийг сонгоно.
 */
export function fixForeground(fg: string, bg: string, target = AA_NORMAL): string {
  if (contrastRatio(fg, bg) >= target) return fg;
  const { r, g, b } = hexToRgb(fg);
  const towardBlack = contrastRatio("#000000", bg) >= contrastRatio("#ffffff", bg);
  const end = towardBlack ? 0 : 255;
  for (let step = 1; step <= 40; step++) {
    const t = step / 40;
    const hex = `#${toHex(r + (end - r) * t)}${toHex(g + (end - g) * t)}${toHex(b + (end - b) * t)}`;
    if (contrastRatio(hex, bg) >= target) return hex;
  }
  return towardBlack ? "#000000" : "#ffffff";
}
