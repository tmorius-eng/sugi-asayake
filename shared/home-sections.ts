/**
 * Нүүр хуудасны хэсгүүд (Брэнд студи A3, 2026-10-05) — `site_layouts` (pageKey "home").
 *
 * Админ хэсэг бүрийг нууж, дарааллыг сольж, хувилбар сонгоно. **Hero үргэлж эхэнд, үргэлж
 * харагдана**: сервер hero shell-ийг (heroShell.ts) React-аас өмнө зурдаг тул hero хөдөлбөл эсвэл
 * алга болбол shell ↔ React зөрж нүүр "үсэрнэ" — тиймээс hero нь layout-д ордоггүй, тогтмол.
 * Шинэ хэсэг нэмбэл `HOME_SECTIONS`-д нэм; хадгалсан layout-д байхгүй хэсэг ДООР нь харагдана.
 */
export const HOME_SECTIONS = [
  { key: "chips", label: "Түлхүүр үгс (ангилал, брэнд)", variants: ["default"] },
  { key: "bestsellers", label: "Их зарагддаг бараа", variants: ["default"] },
  { key: "recommended", label: "Танд санал болгох (нэвтэрсэн үед)", variants: ["default"] },
  { key: "brands", label: "Онцлох брэндүүд", variants: ["default"] },
  { key: "categories", label: "Ангиллууд", variants: ["default"] },
  { key: "story", label: "Брэндийн түүх, сэтгэгдэл", variants: ["default"] },
  { key: "stats", label: "Гишүүнчлэлийн тоо баримт", variants: ["default"] },
  { key: "editorial", label: "Гэр бүлийн халамж (зураг + текст)", variants: ["image-left", "image-right"] },
  { key: "stores", label: "Салбарууд", variants: ["default"] },
] as const;

export type HomeSectionKey = (typeof HOME_SECTIONS)[number]["key"];
export interface HomeSectionEntry { key: HomeSectionKey; visible: boolean; variant: string }

export const HOME_SECTION_KEYS = HOME_SECTIONS.map(section => section.key) as readonly HomeSectionKey[];

/** Одоогийн нүүрний дараалал (2026-10-05) — хадгалсан layout байхгүй бол яг өнөөдрийнх. */
export const DEFAULT_HOME_LAYOUT: HomeSectionEntry[] = HOME_SECTIONS.map(section => ({ key: section.key, visible: true, variant: section.variants[0] }));

/**
 * DB/клиентээс ирсэн layout-ийг цэвэрлэнэ: үл мэдэх түлхүүр, давхардал, буруу хувилбарыг хаяж,
 * дутуу хэсгийг (шинээр нэмэгдсэн) төгсгөлд нь харагдахаар нэмнэ. Үр дүн үргэлж бүрэн.
 */
export function sanitizeHomeLayout(input: unknown): HomeSectionEntry[] {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: HomeSectionEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { key, visible, variant } = row as Record<string, unknown>;
    const def = HOME_SECTIONS.find(section => section.key === key);
    if (!def || seen.has(def.key)) continue;
    seen.add(def.key);
    out.push({ key: def.key, visible: visible !== false, variant: (def.variants as readonly string[]).includes(variant as string) ? (variant as string) : def.variants[0] });
  }
  for (const def of HOME_SECTIONS) if (!seen.has(def.key)) out.push({ key: def.key, visible: true, variant: def.variants[0] });
  return out;
}
