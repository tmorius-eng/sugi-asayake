import { normaliseSearchText, latinVariants } from "./search-synonyms";
import { toCyrillicVariants } from "./transliterate";

/**
 * Брэндийн нэрийн нормчлол (2026-09-20, хайлт v3).
 *
 * `products.brand` POS-оос чөлөөт текстээр ирдэг тул нэг брэнд хэд хэдэн бичлэгтэй
 * (`S-Select`/`SSELECT`, `BA-YU`/`BAYU`, `Love Liner`/`LoveLiner`/`Loveline`), мөн
 * худалдан авагч кириллээр ("кокочи") хайдаг. Энд зөвхөн ЦЭВЭР функцүүд: alias-ийн
 * жагсаалт (DB-ийн `brand_aliases`, admin-аас засварлагдана) → хайлтын map.
 * `DEFAULT_BRAND_ALIASES` нь seed л (scripts/seed-search-dictionaries.ts) —
 * ажиллаж буй сервер DB-ийн мөрүүдийг уншина.
 */
export type BrandAliasRow = { canonicalBrand: string; alias: string };

export type BrandAliasMap = {
  /** brandKey(alias | canonical) → canonical */
  canonicalByKey: Map<string, string>;
  /** canonical → alias-ууд (canonical өөрөө ороогүй) */
  aliasesByCanonical: Map<string, string[]>;
};

/**
 * Seed: 2026-09-20-нд амьд каталогоос бодитоор олдсон давхардлууд + Tom-ийн
 * нэрлэсэн, хамгийн олон бараатай брэндүүдийн кирилл бичлэг. Хайлтын индекс
 * үүн дээр автоматаар латин→кирилл галиг нэмдэг тул энд зөвхөн галигаас ӨӨР
 * (хүмүүсийн бодитоор бичдэг) хэлбэрүүд орно.
 */
export const DEFAULT_BRAND_ALIASES: readonly BrandAliasRow[] = [
  { canonicalBrand: "S-Select", alias: "SSELECT" },
  { canonicalBrand: "S-Select", alias: "S SELECT" },
  { canonicalBrand: "S-Select", alias: "эс селект" },
  { canonicalBrand: "S-Select", alias: "с-селект" },
  { canonicalBrand: "BA-YU", alias: "BAYU" },
  { canonicalBrand: "BA-YU", alias: "ба-ю" },
  { canonicalBrand: "BA-YU", alias: "баю" },
  { canonicalBrand: "BA-YU", alias: "морины тос" },
  { canonicalBrand: "CICA method", alias: "CICAmethod" },
  { canonicalBrand: "CICA method", alias: "сика метод" },
  { canonicalBrand: "Love Liner", alias: "LoveLiner" },
  { canonicalBrand: "Love Liner", alias: "Loveline" },
  { canonicalBrand: "Love Liner", alias: "лав лайнер" },
  { canonicalBrand: "My Organy", alias: "MyOrgany" },
  { canonicalBrand: "PRIECLAT", alias: "Prieclair" },
  { canonicalBrand: "PRIECLAT", alias: "приеклат" },
  { canonicalBrand: "PRIECLAT", alias: "приклат" },
  { canonicalBrand: "PRIECLAT", alias: "прикла" },
  { canonicalBrand: "Cocochi", alias: "кокочи" },
  { canonicalBrand: "Cocochi", alias: "кококи" },
  { canonicalBrand: "SokaMocka", alias: "сокамока" },
  { canonicalBrand: "SokaMocka", alias: "сока мока" },
  { canonicalBrand: "SokaMocka", alias: "soka mocka" },
  { canonicalBrand: "Asmy", alias: "асми" },
  { canonicalBrand: "Asmy", alias: "асмы" },
  { canonicalBrand: "Daisy Doll", alias: "дэйзи долл" },
  { canonicalBrand: "Daisy Doll", alias: "дейзи долл" },
  { canonicalBrand: "Daisy Doll", alias: "дэйси" },
  { canonicalBrand: "Diane", alias: "диан" },
  { canonicalBrand: "Diane", alias: "даян" },
  { canonicalBrand: "Diane", alias: "Moist Diane" },
  { canonicalBrand: "Club Suppin", alias: "клаб суппин" },
  { canonicalBrand: "Club Suppin", alias: "Club" },
  { canonicalBrand: "NMN", alias: "нмн" },
  { canonicalBrand: "NMN", alias: "энэмэн" },
  { canonicalBrand: "Botanical", alias: "ботаникал" },
  { canonicalBrand: "MELLSAVON", alias: "мелсавон" },
  { canonicalBrand: "MELLSAVON", alias: "мэлсавон" },
  { canonicalBrand: "P'S", alias: "PS" },
  { canonicalBrand: "P'S", alias: "пи эс" },
  { canonicalBrand: "S-LABO", alias: "SLABO" },
  { canonicalBrand: "S-LABO", alias: "эс лабо" },
  { canonicalBrand: "T3", alias: "ти3" },
  { canonicalBrand: "LIHAW", alias: "лихав" },
  { canonicalBrand: "Rishiri", alias: "ришири" },
  { canonicalBrand: "Zettoc", alias: "зеттоk" },
  { canonicalBrand: "Zettoc", alias: "зетток" },
  { canonicalBrand: "MASSEMOLLY", alias: "массемолли" },
  { canonicalBrand: "JELLAN", alias: "желлан" },
  { canonicalBrand: "JELLAN", alias: "жэллан" },
  { canonicalBrand: "Off & Relax", alias: "OR" },
  { canonicalBrand: "Off & Relax", alias: "офф энд релакс" },
  { canonicalBrand: "SUGI ASAYAKE", alias: "суги асаяке" },
  { canonicalBrand: "SUGI ASAYAKE", alias: "суги" },
  { canonicalBrand: "Asayake", alias: "асаяке" },
];

/**
 * Брэндийн харьцуулах түлхүүр: том/жижиг үсэг, зай, зураас, апостроф, цэг —
 * бүгд орхигдоно ("S-Select" = "sselect" = "S SELECT"). Кирилл хэвээр үлдэнэ.
 */
export function brandKey(raw: string): string {
  return normaliseSearchText(raw).replace(/[\s\-.'’&+]/g, "");
}

export function buildBrandAliasMap(rows: readonly BrandAliasRow[]): BrandAliasMap {
  const canonicalByKey = new Map<string, string>();
  const aliasesByCanonical = new Map<string, string[]>();
  for (const row of rows) {
    const canonical = row.canonicalBrand.trim();
    const alias = row.alias.trim();
    if (!canonical || !alias) continue;
    canonicalByKey.set(brandKey(canonical), canonical);
    // Эхний тодорхойлолт ялна — нэг alias хоёр брэндэд заавал заасан бол
    // seed/admin-ий алдаа, чимээгүй дарж бичихгүй.
    if (!canonicalByKey.has(brandKey(alias))) canonicalByKey.set(brandKey(alias), canonical);
    const list = aliasesByCanonical.get(canonical) ?? [];
    if (!list.includes(alias)) list.push(alias);
    aliasesByCanonical.set(canonical, list);
  }
  return { canonicalByKey, aliasesByCanonical };
}

/** Түүхий брэндийг canonical бичлэг рүү; танигдахгүй бол trim хийгээд хэвээр. */
export function canonicalBrand(map: BrandAliasMap, raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  return map.canonicalByKey.get(brandKey(trimmed)) ?? trimmed;
}

/**
 * Хайлтын индекст брэндийн талбарт орох бүх үг: canonical + alias-ууд + латин
 * хэлбэрүүдийн кирилл галиг + кирилл хэлбэрүүдийн латин галиг.
 */
export function brandSearchTerms(map: BrandAliasMap, canonical: string): string[] {
  const seen = new Set<string>();
  const add = (value: string) => { const v = value.trim().toLowerCase(); if (v) seen.add(v); };
  add(canonical);
  for (const alias of map.aliasesByCanonical.get(canonical) ?? []) add(alias);
  for (const term of Array.from(seen)) {
    for (const word of term.split(/\s+/)) {
      for (const variant of toCyrillicVariants(word)) add(variant);
      for (const variant of latinVariants(word)) add(variant);
    }
  }
  return Array.from(seen);
}

/** Хэрэглэгчийн /shop?brand= гэх мэт facet харьцуулалт — бичлэгийн зөрүүг тэвчинэ. */
export function sameBrand(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return brandKey(a) === brandKey(b);
}
