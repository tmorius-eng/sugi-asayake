import { BASE_THEME, DARK_TOKEN_KEYS, LIGHT_TOKEN_KEYS, RADIUS_PRESETS, type DarkTokenKey, type ProductAspect, type RadiusPreset, type ThemeLook, type ThemeTokenKey } from "@shared/theme-tokens";

/** Брэнд студи → Өнгө табын бүлгүүд. Токен бүр нэг л бүлэгт (tokenMeta.test-гүйгээр ч гараар тулгахад хялбар). */
export const LIGHT_GROUPS: ReadonlyArray<{ title: string; hint: string; collapsed?: boolean; tokens: ReadonlyArray<[ThemeTokenKey, string]> }> = [
  {
    title: "Брэнд өнгө",
    hint: "Товч, үнэ, холбоос, онцлох тэмдэг",
    tokens: [["primary", "Үндсэн өнгө (товч)"], ["primary-hover", "Товч — дээр нь очиход"], ["primary-text", "Брэнд текст, үнэ"], ["primary-foreground", "Товч дээрх текст"], ["accent", "Онцлох өнгө"], ["accent-foreground", "Онцлох дээрх текст"]],
  },
  {
    title: "Дэвсгэр",
    hint: "Хуудас, карт, зурвас",
    tokens: [["background", "Хуудасны дэвсгэр"], ["card", "Карт"], ["secondary", "Зурвас, 2-р товч"], ["muted", "Бүдэг дэвсгэр"], ["surface-tint", "Тодотгол дэвсгэр"], ["border", "Хүрээ"], ["input", "Талбарын хүрээ"]],
  },
  {
    title: "Текст",
    hint: "Гарчиг, бичвэр, тайлбар",
    tokens: [["foreground", "Үндсэн текст"], ["muted-foreground", "Бүдэг текст"], ["card-foreground", "Картын текст"], ["secondary-foreground", "2-р товчны текст"]],
  },
  {
    title: "Нүүр хуудас",
    hint: "Толгой, нүүр, хөл",
    tokens: [["ck-page", "Хуудас"], ["ck-surface", "Хэсгийн дэвсгэр"], ["ck-cream", "Цөцгий зурвас"], ["ck-chip", "Чип"], ["ck-ink", "Текст"], ["ck-muted", "Бүдэг текст"], ["ck-line", "Зураас"], ["ck-gold", "Алтлаг текст, мэндчилгээ"]],
  },
  {
    title: "Зарын зурвас",
    hint: "Хамгийн дээд мөр",
    tokens: [["promo-bar-bg", "Дэвсгэр"], ["promo-bar-fg", "Текст"]],
  },
  {
    title: "Нарийн тохиргоо",
    hint: "Цонх, анхааруулга, фокус",
    collapsed: true,
    tokens: [["popover", "Цонхны дэвсгэр"], ["popover-foreground", "Цонхны текст"], ["destructive", "Анхааруулга"], ["destructive-foreground", "Анхааруулгын текст"], ["ring", "Фокусын хүрээ"], ["sky", "Цэнхэр холбоос"]],
  },
];

export const DARK_LABELS: Record<DarkTokenKey, string> = {
  "ck-page": "Хуудас", "ck-surface": "Карт", "ck-cream": "Зурвас", "ck-chip": "Чип",
  "ck-ink": "Текст", "ck-muted": "Бүдэг текст", "ck-line": "Зураас", "ck-gold": "Алтлаг текст",
};

export const RADIUS_LABELS: Record<RadiusPreset, string> = { none: "0", sm: "6px", md: "10px", lg: "14px", xl: "20px" };
export const ASPECT_LABELS: Record<ProductAspect, string> = { "1/1": "1:1", "4/5": "4:5", "3/4": "3:4", "8/9": "8:9", "7/5": "7:5" };

export type LookPatch = { light?: Partial<Record<ThemeTokenKey, string>>; dark?: Partial<Record<DarkTokenKey, string>>; radius?: RadiusPreset; productAspect?: ProductAspect };

/** Зөвхөн суурьнаас ялгаатай утгууд — баярын загвар суурийн дээр давхарлагддаг тул бүрэн хуулбар хадгалахгүй. */
export function diffLook(base: ThemeLook, look: ThemeLook): LookPatch {
  const patch: LookPatch = {};
  const light: Partial<Record<ThemeTokenKey, string>> = {};
  for (const key of LIGHT_TOKEN_KEYS) if (look.light[key] !== base.light[key]) light[key] = look.light[key];
  const dark: Partial<Record<DarkTokenKey, string>> = {};
  for (const key of DARK_TOKEN_KEYS) if (look.dark[key] !== base.dark[key]) dark[key] = look.dark[key];
  if (Object.keys(light).length) patch.light = light;
  if (Object.keys(dark).length) patch.dark = dark;
  if (look.radius !== base.radius) patch.radius = look.radius;
  if (look.productAspect !== base.productAspect) patch.productAspect = look.productAspect;
  return patch;
}

/** iframe preview-д илгээх CSS хувьсагч (горимоор). */
export function previewVars(look: ThemeLook, mode: "light" | "dark"): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of LIGHT_TOKEN_KEYS) vars[`--${key}`] = look.light[key];
  if (mode === "dark") for (const key of DARK_TOKEN_KEYS) vars[`--${key}`] = look.dark[key];
  vars["--radius"] = RADIUS_PRESETS[look.radius];
  vars["--product-aspect"] = look.productAspect.replace("/", " / ");
  return vars;
}

export const CODE_BASE = BASE_THEME;
