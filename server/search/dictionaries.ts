import { asc, eq } from "drizzle-orm";
import { brandAliases, searchSynonyms } from "../../drizzle/schema";
import { getDb } from "../db";
import { getOrSetCached, invalidateCached } from "../_core/ttlCache";
import { DEFAULT_SYNONYM_GROUPS, buildSynonymDictionary, defaultSynonymDictionary, normaliseSearchText, type SynonymDictionary } from "../../shared/search-synonyms";
import { DEFAULT_BRAND_ALIASES, buildBrandAliasMap, canonicalBrand, type BrandAliasMap } from "../../shared/brand-aliases";
import { BRAND_ALIASES_CACHE_KEY, CATALOG_INDEX_CACHE_KEY, SEARCH_SYNONYMS_CACHE_KEY } from "./cacheKeys";

/**
 * Хайлтын толиудын DB давхарга (2026-09-20). Синонимын бүлэг, брэндийн alias
 * хоёулаа хүснэгтэд (admin-аас засварлагдана); энд уншиж, барьж, кэшлэнэ.
 * Хүснэгт хоосон (seed хийгдээгүй шинэ орчин, CI) бол кодын анхдагч
 * жагсаалтаар ажиллана — хайлт хэзээ ч "толь байхгүй" гэж унахгүй.
 */
const DICTIONARY_TTL_MS = 60_000;

/** "a, b ,c" → ["a","b","c"] (нормчилсон, хоосонгүй, давхардалгүй). */
export function parseSynonymTerms(terms: string): string[] {
  return Array.from(new Set(terms.split(",").map(term => normaliseSearchText(term)).filter(Boolean)));
}

export async function getSynonymDictionary(): Promise<SynonymDictionary> {
  return getOrSetCached(SEARCH_SYNONYMS_CACHE_KEY, DICTIONARY_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return defaultSynonymDictionary;
    const rows = await db.select({ terms: searchSynonyms.terms }).from(searchSynonyms).where(eq(searchSynonyms.isActive, true));
    if (!rows.length) return defaultSynonymDictionary;
    return buildSynonymDictionary(rows.map(row => parseSynonymTerms(row.terms)));
  });
}

export async function getBrandAliasMap(): Promise<BrandAliasMap> {
  return getOrSetCached(BRAND_ALIASES_CACHE_KEY, DICTIONARY_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return buildBrandAliasMap(DEFAULT_BRAND_ALIASES);
    const rows = await db.select({ canonicalBrand: brandAliases.canonicalBrand, alias: brandAliases.alias }).from(brandAliases);
    return buildBrandAliasMap(rows.length ? rows : DEFAULT_BRAND_ALIASES);
  });
}

/** Толь өөрчлөгдвөл индекс ч дахин баригдах ёстой — хоёуланг нь унагаана. */
export function invalidateSearchDictionaries(): void {
  invalidateCached(SEARCH_SYNONYMS_CACHE_KEY);
  invalidateCached(BRAND_ALIASES_CACHE_KEY);
  invalidateCached(CATALOG_INDEX_CACHE_KEY);
}

/** Бараа бичигчид брэндийг canonical бичлэг рүү нормчлохдоо. */
export async function canonicaliseBrandName(raw: string | null | undefined): Promise<string | null> {
  return canonicalBrand(await getBrandAliasMap(), raw);
}

// ---- Admin CRUD ------------------------------------------------------------

export async function listSearchSynonyms() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(searchSynonyms).orderBy(asc(searchSynonyms.concept));
}

export async function upsertSearchSynonym(input: { id?: number; concept: string; terms: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const terms = parseSynonymTerms(input.terms);
  if (terms.length < 2) throw new Error("Нэг ойлголтод дор хаяж 2 үг хэрэгтэй (жишээ: батга, acne).");
  const concept = normaliseSearchText(input.concept) || terms[0];
  // 2026-09-23: кэшийг БИЧСЭНИЙ ДАРАА л унагана. Өмнө нь бичихээс өмнө
  // байсан тул дундуур ирсэн хайлт кэшийг ХУУЧИН мөрүүдээр дахин дүүргэж,
  // админы "+ синоним" 60 секундын турш ажиллаагүй мэт харагддаг байв
  // (`seedSearchDictionaries` аль хэдийн зөв дараалалтай).
  if (input.id) {
    await db.update(searchSynonyms).set({ concept, terms: terms.join(", "), isActive: input.isActive ?? true, updatedAt: new Date() }).where(eq(searchSynonyms.id, input.id));
    invalidateSearchDictionaries();
    const [row] = await db.select().from(searchSynonyms).where(eq(searchSynonyms.id, input.id)).limit(1);
    return row;
  }
  const [existing] = await db.select({ id: searchSynonyms.id }).from(searchSynonyms).where(eq(searchSynonyms.concept, concept)).limit(1);
  if (existing) {
    await db.update(searchSynonyms).set({ terms: terms.join(", "), isActive: input.isActive ?? true, updatedAt: new Date() }).where(eq(searchSynonyms.id, existing.id));
    const [row] = await db.select().from(searchSynonyms).where(eq(searchSynonyms.id, existing.id)).limit(1);
    return row;
  }
  const inserted = await db.insert(searchSynonyms).values({ concept, terms: terms.join(", "), isActive: input.isActive ?? true });
  const [row] = await db.select().from(searchSynonyms).where(eq(searchSynonyms.id, Number(inserted[0].insertId))).limit(1);
  return row;
}

export async function deleteSearchSynonym(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(searchSynonyms).where(eq(searchSynonyms.id, id));
  invalidateSearchDictionaries();
  return { id };
}

export async function listBrandAliases() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(brandAliases).orderBy(asc(brandAliases.canonicalBrand), asc(brandAliases.alias));
}

export async function createBrandAlias(input: { canonicalBrand: string; alias: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const canonical = input.canonicalBrand.trim();
  const alias = input.alias.trim();
  if (!canonical || !alias) throw new Error("Брэнд ба alias хоёулаа хэрэгтэй.");
  if (canonical.toLowerCase() === alias.toLowerCase()) throw new Error("Alias нь брэндийн өөрийнх нь нэртэй ижил байж болохгүй.");
  const inserted = await db.insert(brandAliases).values({ canonicalBrand: canonical, alias }).onDuplicateKeyUpdate({ set: { canonicalBrand: canonical } });
  invalidateSearchDictionaries();
  const [row] = await db.select().from(brandAliases).where(eq(brandAliases.alias, alias)).limit(1);
  return row ?? { id: Number(inserted[0].insertId), canonicalBrand: canonical, alias, createdAt: new Date() };
}

export async function deleteBrandAlias(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(brandAliases).where(eq(brandAliases.id, id));
  invalidateSearchDictionaries();
  return { id };
}

/**
 * Кодын анхдагч жагсаалтуудыг хүснэгтэд оруулна — idempotent: аль хэдийн байгаа
 * concept/alias-ийг алгасна (admin-ий засварыг дарахгүй). scripts/seed-search-
 * dictionaries.ts болон CI seed дуудна.
 */
export async function seedSearchDictionaries(): Promise<{ synonymsInserted: number; aliasesInserted: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existingConcepts = new Set((await db.select({ concept: searchSynonyms.concept }).from(searchSynonyms)).map(row => row.concept));
  let synonymsInserted = 0;
  for (const group of DEFAULT_SYNONYM_GROUPS) {
    const terms = parseSynonymTerms(group.join(","));
    const concept = terms[0];
    if (!concept || existingConcepts.has(concept)) continue;
    await db.insert(searchSynonyms).values({ concept, terms: terms.join(", "), isActive: true });
    existingConcepts.add(concept);
    synonymsInserted++;
  }
  const existingAliases = new Set((await db.select({ alias: brandAliases.alias }).from(brandAliases)).map(row => row.alias.toLowerCase()));
  let aliasesInserted = 0;
  for (const row of DEFAULT_BRAND_ALIASES) {
    if (existingAliases.has(row.alias.toLowerCase())) continue;
    await db.insert(brandAliases).values({ canonicalBrand: row.canonicalBrand, alias: row.alias });
    existingAliases.add(row.alias.toLowerCase());
    aliasesInserted++;
  }
  invalidateSearchDictionaries();
  return { synonymsInserted, aliasesInserted };
}
