/**
 * Storefront-ийн өнгө/хэлбэрийн токенууд — Брэнд студийн НЭГ эх сурвалж (2026-10-05).
 *
 * Нэрс нь `client/src/index.css`-ийн одоогийн CSS хувьсагчтай ЯГ ижил (`--primary`,
 * `--ck-ink` …) тул index.css-ийн бүх дүрэм, Tailwind-ийн `@theme inline` хэвээр ажиллана:
 * сервер (`server/_core/themeCss.ts`) зөвхөн эдгээрийн УТГЫГ `<style id="brand-tokens">`-оор
 * дарна. `BASE_THEME` нь index.css-ийн өнөөгийн утгуудтай тэнцүү байх ёстой —
 * `server/theme-tokens-css.test.ts` хоёуланг нь тулгана (нэгийг нь өөрчилбөл нөгөөг нь).
 *
 * Формат: hex (`#rrggbb`). Админы өнгө сонгогч, CSS, contrast e2e бүгд sRGB hex-ээр
 * ажилладаг тул HSL/OKLCH руу хөрвүүлэх шаардлагагүй.
 */

import { FONT_KEYS, type FontKey } from "./fonts";

/** Гэрэл горимд `:root`-д байдаг токенууд. */
export const LIGHT_TOKEN_KEYS = [
  "background", "foreground",
  "card", "card-foreground",
  "popover", "popover-foreground",
  "primary", "primary-foreground", "primary-text", "primary-hover",
  "secondary", "secondary-foreground",
  "muted", "muted-foreground",
  "accent", "accent-foreground",
  "destructive", "destructive-foreground",
  "border", "input", "ring", "sky", "surface-tint",
  // Нүүр/толгой/footer-ийн "cosmekitchen" палитр (index.css `--ck-*`)
  "ck-ink", "ck-muted", "ck-line", "ck-cream", "ck-chip", "ck-gold", "ck-page", "ck-surface",
  // Зарын зурвас (SitePromo + heroShell) — өмнө нь `bg-[#17181b]` хатуу бичигдсэн байв
  "promo-bar-bg", "promo-bar-fg",
] as const;
export type ThemeTokenKey = (typeof LIGHT_TOKEN_KEYS)[number];

/** Харанхуй горимд `html[data-storefront-theme="dark"]`-д солигддог токенууд (index.css :2403-2412). */
export const DARK_TOKEN_KEYS = ["ck-page", "ck-surface", "ck-cream", "ck-chip", "ck-ink", "ck-muted", "ck-line", "ck-gold"] as const satisfies readonly ThemeTokenKey[];
export type DarkTokenKey = (typeof DARK_TOKEN_KEYS)[number];

export type ThemeTokens = Record<ThemeTokenKey, string>;
export type DarkThemeTokens = Record<DarkTokenKey, string>;

/** Бүтээгдэхүүний зургийн харьцааны сонголт (`--product-aspect`). */
export const PRODUCT_ASPECTS = ["1/1", "4/5", "3/4", "8/9", "7/5"] as const;
export type ProductAspect = (typeof PRODUCT_ASPECTS)[number];

/** Булангийн муруйлт (`--radius`) — Tailwind-ийн `--radius-sm/md/lg/xl` үүнээс бодогддог. */
export const RADIUS_PRESETS = { none: "0rem", sm: "0.375rem", md: "0.625rem", lg: "0.9rem", xl: "1.25rem" } as const;
export type RadiusPreset = keyof typeof RADIUS_PRESETS;

export interface ThemeLook {
  light: ThemeTokens;
  dark: DarkThemeTokens;
  radius: RadiusPreset;
  productAspect: ProductAspect;
  /** Үндсэн текст ба гарчгийн фонт (shared/fonts.ts, A2) — анхдагч Golos Text */
  fontBody: FontKey;
  fontDisplay: FontKey;
}

/** index.css-ийн одоогийн утгууд (2026-10-05). Энд өөрчилбөл index.css-ийг МӨН өөрчил (тест тулгана). */
export const BASE_THEME: ThemeLook = {
  light: {
    background: "#dae0da",
    foreground: "#17181b",
    card: "#f2f5f2",
    "card-foreground": "#17181b",
    popover: "#f2f5f2",
    "popover-foreground": "#17181b",
    primary: "#df1f3d",
    "primary-foreground": "#fffaf5",
    "primary-text": "#b01729",
    "primary-hover": "#bc1732",
    secondary: "#ced5cf",
    "secondary-foreground": "#17181b",
    muted: "#e4e8e4",
    "muted-foreground": "#545958",
    accent: "#f0b52d",
    "accent-foreground": "#17181b",
    destructive: "#df1f3d",
    "destructive-foreground": "#fffaf5",
    border: "#b7beb9",
    input: "#b7beb9",
    ring: "#28537a",
    sky: "#28537a",
    "surface-tint": "#d3dad4",
    "ck-ink": "#212121",
    "ck-muted": "#6e6e6e",
    "ck-line": "#e5e5e5",
    "ck-cream": "#fafaf5",
    "ck-chip": "#f8f7ef",
    // index.css :2392-д #93781e, гэвч :3469-ийн `:root { --ck-gold: #7a6318 }` (AA контраст) дарна
    "ck-gold": "#7a6318",
    "ck-page": "#ffffff",
    "ck-surface": "#ffffff",
    "promo-bar-bg": "#17181b",
    "promo-bar-fg": "#ffffff",
  },
  dark: {
    "ck-page": "#131313",
    "ck-surface": "#1b1b1b",
    "ck-cream": "#191917",
    "ck-chip": "#232323",
    "ck-ink": "#ededed",
    "ck-muted": "#a6a6a6",
    "ck-line": "#333333",
    "ck-gold": "#d9b45c",
  },
  radius: "lg",
  productAspect: "1/1",
  fontBody: "golos",
  fontDisplay: "golos",
};

const HEX_RE = /^#[0-9a-f]{6}$/;

/** `#abc` / `#AABBCC` → `#aabbcc`; буруу бол null. CSS-д орох утгыг ЗААВАЛ эндээр (injection-ий хамгаалалт). */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return HEX_RE.test(v) ? v : null;
}

/**
 * Хэсэгчилсэн өөрчлөлтийг (баярын загвар зөвхөн хэдэн өнгө солино) хадгалахад бэлэн болгоно:
 * зөвхөн мэдэгдэх түлхүүр, зөвхөн зөв hex. DB-д үргэлж эндээс гарсан утга бичигдэнэ.
 */
const isFontKey = (value: unknown): value is FontKey => (FONT_KEYS as readonly string[]).includes(value as string);

export function sanitizeLookPatch(patch: unknown): Partial<{ light: Partial<ThemeTokens>; dark: Partial<DarkThemeTokens>; radius: RadiusPreset; productAspect: ProductAspect; fontBody: FontKey; fontDisplay: FontKey }> {
  const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const out: ReturnType<typeof sanitizeLookPatch> = {};
  const pl = (p.light && typeof p.light === "object" ? p.light : {}) as Record<string, unknown>;
  const pd = (p.dark && typeof p.dark === "object" ? p.dark : {}) as Record<string, unknown>;
  const light: Partial<ThemeTokens> = {};
  for (const key of LIGHT_TOKEN_KEYS) { const v = normalizeHex(pl[key]); if (v) light[key] = v; }
  const dark: Partial<DarkThemeTokens> = {};
  for (const key of DARK_TOKEN_KEYS) { const v = normalizeHex(pd[key]); if (v) dark[key] = v; }
  if (Object.keys(light).length) out.light = light;
  if (Object.keys(dark).length) out.dark = dark;
  if (typeof p.radius === "string" && p.radius in RADIUS_PRESETS) out.radius = p.radius as RadiusPreset;
  if ((PRODUCT_ASPECTS as readonly string[]).includes(p.productAspect as string)) out.productAspect = p.productAspect as ProductAspect;
  if (isFontKey(p.fontBody)) out.fontBody = p.fontBody;
  if (isFontKey(p.fontDisplay)) out.fontDisplay = p.fontDisplay;
  return out;
}

/**
 * Хэсэгчилсэн (DB/импорт) утгыг суурьтай нийлүүлнэ: буруу/үл мэдэх түлхүүрийг хаяж, байхгүйг
 * суурийнхаар нөхнө. Үр дүн үргэлж бүрэн, CSS-д аюулгүй.
 */
export function mergeLook(base: ThemeLook, patch: unknown): ThemeLook {
  const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const light = { ...base.light };
  const dark = { ...base.dark };
  const pl = (p.light && typeof p.light === "object" ? p.light : {}) as Record<string, unknown>;
  const pd = (p.dark && typeof p.dark === "object" ? p.dark : {}) as Record<string, unknown>;
  for (const key of LIGHT_TOKEN_KEYS) { const v = normalizeHex(pl[key]); if (v) light[key] = v; }
  for (const key of DARK_TOKEN_KEYS) { const v = normalizeHex(pd[key]); if (v) dark[key] = v; }
  const radius = typeof p.radius === "string" && p.radius in RADIUS_PRESETS ? (p.radius as RadiusPreset) : base.radius;
  const productAspect = (PRODUCT_ASPECTS as readonly string[]).includes(p.productAspect as string) ? (p.productAspect as ProductAspect) : base.productAspect;
  const fontBody = isFontKey(p.fontBody) ? p.fontBody : base.fontBody;
  const fontDisplay = isFontKey(p.fontDisplay) ? p.fontDisplay : base.fontDisplay;
  return { light, dark, radius, productAspect, fontBody, fontDisplay };
}
