/**
 * Нүүр хуудасны хэсгүүд (Брэнд студи A3, 2026-10-05) — `site_layouts` (pageKey "home").
 *
 * Админ хэсэг бүрийг нууж, дарааллыг сольж, хувилбар сонгоно. **Hero үргэлж эхэнд, үргэлж
 * харагдана**: сервер hero shell-ийг (heroShell.ts) React-аас өмнө зурдаг тул hero хөдөлбөл эсвэл
 * алга болбол shell ↔ React зөрж нүүр "үсэрнэ" — тиймээс hero нь layout-д ордоггүй, тогтмол.
 * Шинэ хэсэг нэмбэл `HOME_SECTIONS`-д нэм; хадгалсан layout-д байхгүй хэсэг ДООР нь харагдана.
 *
 * "Чөлөөт зурвас" (free-1..3): админ өөрөө гарчиг, текст, товч, зураг (Content & Media →
 * home-free-N) өгдөг хэсэг. Анхдагчаар НУУГДСАН — одоогийн нүүр өөрчлөгдөхгүй.
 */
export const HOME_SECTIONS = [
  { key: "chips", label: "Түлхүүр үгс (ангилал, брэнд)", variants: ["default"], defaultVisible: true },
  { key: "bestsellers", label: "Их зарагддаг бараа", variants: ["rail", "grid"], defaultVisible: true },
  { key: "recommended", label: "Танд санал болгох (нэвтэрсэн үед)", variants: ["default"], defaultVisible: true },
  { key: "brands", label: "Онцлох брэндүүд", variants: ["default"], defaultVisible: true },
  { key: "categories", label: "Ангиллууд", variants: ["default"], defaultVisible: true },
  { key: "story", label: "Брэндийн түүх, сэтгэгдэл", variants: ["default"], defaultVisible: true },
  { key: "stats", label: "Гишүүнчлэлийн тоо баримт", variants: ["default"], defaultVisible: true },
  { key: "editorial", label: "Гэр бүлийн халамж (зураг + текст)", variants: ["image-left", "image-right"], defaultVisible: true },
  { key: "stores", label: "Салбарууд", variants: ["default"], defaultVisible: true },
  { key: "free-1", label: "Чөлөөт зурвас 1", variants: ["image-left", "image-right", "text-only"], defaultVisible: false },
  { key: "free-2", label: "Чөлөөт зурвас 2", variants: ["image-left", "image-right", "text-only"], defaultVisible: false },
  { key: "free-3", label: "Чөлөөт зурвас 3", variants: ["image-left", "image-right", "text-only"], defaultVisible: false },
] as const;

export type HomeSectionKey = (typeof HOME_SECTIONS)[number]["key"];
export type FreeBlockKey = "free-1" | "free-2" | "free-3";
export interface FreeBlockProps { heading: string; text: string; ctaLabel: string; ctaHref: string }
export interface HomeSectionEntry { key: HomeSectionKey; visible: boolean; variant: string; props?: FreeBlockProps }

export const HOME_SECTION_KEYS = HOME_SECTIONS.map(section => section.key) as readonly HomeSectionKey[];
export const isFreeBlockKey = (key: string): key is FreeBlockKey => /^free-[123]$/.test(key);
/** Чөлөөт зурвасын зураг: site_media `home-free-N` (Content & Media). */
export const freeBlockMediaSlot = (key: FreeBlockKey) => `home-${key}` as const;

/** Одоогийн нүүрний дараалал (2026-10-05) — хадгалсан layout байхгүй бол яг өнөөдрийнх. */
export const DEFAULT_HOME_LAYOUT: HomeSectionEntry[] = HOME_SECTIONS.map(section => ({ key: section.key, visible: section.defaultVisible, variant: section.variants[0] }));

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
/** Товчны холбоос: зөвхөн сайтын дотоод зам эсвэл #хэсэг (гадаад/`javascript:` биш). */
const safeHref = (value: unknown) => {
  const href = clip(value, 200);
  return /^\/(?![/\\])[\w\-./?=&%#]*$/.test(href) || /^#[\w-]+$/.test(href) ? href : "";
};

export function sanitizeFreeBlockProps(input: unknown): FreeBlockProps {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return { heading: clip(raw.heading, 120), text: clip(raw.text, 600), ctaLabel: clip(raw.ctaLabel, 40), ctaHref: safeHref(raw.ctaHref) };
}

/**
 * DB/клиентээс ирсэн layout-ийг цэвэрлэнэ: үл мэдэх түлхүүр, давхардал, буруу хувилбарыг хаяж,
 * дутуу хэсгийг (шинээр нэмэгдсэн) төгсгөлд нь анхдагч харагдацаар нэмнэ. Үр дүн үргэлж бүрэн.
 */
export function sanitizeHomeLayout(input: unknown): HomeSectionEntry[] {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: HomeSectionEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { key, visible, variant, props } = row as Record<string, unknown>;
    const def = HOME_SECTIONS.find(section => section.key === key);
    if (!def || seen.has(def.key)) continue;
    seen.add(def.key);
    const entry: HomeSectionEntry = { key: def.key, visible: visible !== false, variant: (def.variants as readonly string[]).includes(variant as string) ? (variant as string) : def.variants[0] };
    if (isFreeBlockKey(def.key)) entry.props = sanitizeFreeBlockProps(props);
    out.push(entry);
  }
  for (const def of HOME_SECTIONS) if (!seen.has(def.key)) out.push({ key: def.key, visible: def.defaultVisible, variant: def.variants[0] });
  return out;
}

/**
 * Баярын БЭЛЭН нүүрний бүтэц (2026-10-06). Баяр өөрийн бүтэц хадгалаагүй үед: өөрийн мөр → энэ
 * бэлэн бүтэц (байвал) → глобал. Эзэн (Tom) Шинэ жилийн дизайны mockup-ыг сонгосон: hero →
 * барааны мөр → бэлгийн хөтөч (ангилал) — урт нүүрийн оронд богино, баярын нүүр. Админ
 * "Нүүрний бүтэц → Засах загвар"-аас өөрчилж хадгалбал өөрийнх нь бүтэц энэ бэлэн бүтцийг дарна.
 */
function festiveLayout(visible: Partial<Record<HomeSectionKey, string>>): HomeSectionEntry[] {
  const shown = (Object.entries(visible) as [HomeSectionKey, string][]).map(([key, variant]) => ({ key, visible: true, variant }));
  const hidden = HOME_SECTIONS.filter(section => !(section.key in visible)).map(section => ({ key: section.key, visible: false, variant: section.variants[0] as string }));
  return sanitizeHomeLayout([...shown, ...hidden]);
}

export const HOLIDAY_HOME_PRESETS: Record<string, HomeSectionEntry[]> = {
  "new-year": festiveLayout({ bestsellers: "grid", categories: "default", stores: "default" }),
};
export const holidayHomePreset = (themeKey: string | null | undefined): HomeSectionEntry[] | null => (themeKey ? HOLIDAY_HOME_PRESETS[themeKey] ?? null : null);
