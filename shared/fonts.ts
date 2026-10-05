/**
 * Брэнд студийн фонтын сонголт (A2, 2026-10-05). Бүгд SIL OFL 1.1, монгол Ө/Ү (cyrillic-ext) бүрэн —
 * `e2e/typography.spec.ts` хөтөч дээр хэмжиж батална. Файлууд client/public/fonts/<key>/<subset>.woff2
 * (scripts/fetch-brand-fonts.ts); Golos Text нь index.css-д аль хэдийн (анхдагч, өөрчлөгдөхгүй).
 *
 * Зөвхөн СОНГОСОН фонтын @font-face сервер `<style id="brand-tokens">`-д орно (themeCss.ts) —
 * сонгоогүй фонт хэзээ ч татагдахгүй. Unicode-range нь Google Fonts-ийн хуваалт.
 */
export const FONT_SUBSETS: Record<string, string> = {
  "cyrillic-ext": "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
  cyrillic: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  "latin-ext": "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
  latin: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
};

export const BRAND_FONTS = [
  { key: "golos", family: "Golos Text", weights: "400..900", note: "Одоогийн (анхдагч) — орчин үеийн, цэвэр" },
  { key: "inter", family: "Inter", weights: "400..900", note: "Дэлгэцэд уншигдахуйц, төвийг сахисан" },
  { key: "manrope", family: "Manrope", weights: "400..800", note: "Дугуйвтар, найрсаг" },
  { key: "onest", family: "Onest", weights: "400..900", note: "Кирилл үсэгт зориулсан, зөөлөн" },
  { key: "nunito", family: "Nunito", weights: "400..900", note: "Дугуй үзүүртэй — хүүхэд, гэр бүл" },
  { key: "montserrat", family: "Montserrat", weights: "400..900", note: "Өргөн, гарчигт хүчтэй" },
  // IBM Plex Sans-ийг ХАССАН: OFL-ийн Reserved Font Name "Plex" — subset хийсэн файлыг тэр нэрээр түгээх эрсдэлтэй.
  { key: "noto-sans", family: "Noto Sans", weights: "400..900", note: "Google-ийн бүх хэлний, найдвартай" },
  { key: "roboto-flex", family: "Roboto Flex", weights: "400..900", note: "Уян хатан, Android-тай ойр" },
] as const;

export type FontKey = (typeof BRAND_FONTS)[number]["key"];
export const FONT_KEYS = BRAND_FONTS.map(font => font.key) as readonly FontKey[];
export const getBrandFont = (key: string) => BRAND_FONTS.find(font => font.key === key) ?? BRAND_FONTS[0];

/** CSS-ийн font-family утга (fallback-тай). */
export const fontStack = (key: string) => `"${getBrandFont(key).family}", "Golos Text", system-ui, sans-serif`;

/** Сонгосон фонтын @font-face дүрмүүд (golos бол хоосон — index.css-д бий). */
export function fontFaceCss(key: string): string {
  const font = getBrandFont(key);
  if (font.key === "golos") return "";
  const [min, max] = font.weights.split("..");
  return Object.entries(FONT_SUBSETS)
    .map(([subset, range]) => `@font-face{font-family:"${font.family}";font-style:normal;font-weight:${min} ${max};font-display:swap;src:url("/fonts/${font.key}/${subset}.woff2") format("woff2");unicode-range:${range};}`)
    .join("");
}
