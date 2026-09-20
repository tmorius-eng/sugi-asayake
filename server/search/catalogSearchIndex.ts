import MiniSearch, { type Query, type SearchOptions } from "minisearch";
import { collapseDoubles, latinVariants, normaliseSearchText, type SynonymDictionary } from "../../shared/search-synonyms";
import { brandSearchTerms, canonicalBrand, type BrandAliasMap } from "../../shared/brand-aliases";
import { isCyrillicText, isLatinText, toCyrillicVariants, toCyrillicWords } from "../../shared/transliterate";
import { looksLikeBarcode, normaliseBarcode } from "../../shared/barcode";

/**
 * Каталогийн хайлтын индекс (2026-09-20, хайлт v3) — ЦЭВЭР модуль: DB, кэш,
 * tRPC огт мэдэхгүй; мөр + толь + alias → индекс, индекс + query → id-ууд.
 * server/search/catalogSearch.ts нь үүнийг кэшилж, мөрөөр hydrate хийнэ.
 *
 * ЯАГААД MySQL FULLTEXT-ийг орхив (Tom, 2026-09-20: "буруу бичсэн ч гарч
 * ирдэг, брэнд хайхад амар"):
 *   - FULLTEXT typo мэддэггүй; 3 тэмдэгтээс богино үг индекслэдэггүй ("оо",
 *     "үс"); шинэ бараа cache flush хүртэл олддоггүй; латин нэрийг кириллээр
 *     ("кокочи") олох ямар ч зам байхгүй байв.
 *   - Каталог 984 мөр — процесс доторх индекс ~10–15 MB, хайлт < 5 мс.
 *     MiniSearch: fuzzy (засварын зай), prefix, талбар бүрийн жин, nested
 *     AND-of-OR query — толины "ойлголт бүрээс нэг үг" дүрмийг шууд илэрхийлнэ.
 *
 * ИНДЕКС-ҮЕИЙН БАЯЖУУЛАЛТ (бараа бүрд): латин нэр/брэндийн кирилл галиг
 * ("cocochi"→"кокочи"), кирилл тайлбарын латин галиг, брэндийн alias-ууд,
 * ойлголтын токенууд (`xcбатга` — "Acne" гэсэн нэртэй бараа "батга" ойлголттой),
 * admin-ий хайлтын үгс. Хайлтын үед query-г толиор өргөтгөж, галиглаж, fuzzy-гоор
 * таарууулна — хоёр талаасаа ойртуулах тул "prieclа", "сокамока", "shampuun"
 * бүгд олдоно.
 */

export type IndexableProduct = {
  id: number;
  name: string;
  nameMn?: string | null;
  brand?: string | null;
  shortDescription?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  sku?: string | null;
  stockQuantity?: number | null;
  searchKeywords?: string | null;
  productType?: string | null;
};

export type SearchDoc = {
  id: number;
  sku: string;
  brand: string;
  brandAliases: string;
  name: string;
  nameMn: string;
  keywords: string;
  brandTranslit: string;
  nameTranslit: string;
  concepts: string;
  category: string;
  categoryTranslit: string;
  shortDescription: string;
  descriptionLatin: string;
  productType: string;
  // stored only
  inStock: boolean;
  brandCanonical: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};

type FacetDoc = { id: string; kind: "brand" | "category"; label: string; slug: string | null; terms: string; count: number };

export type CatalogIndex = {
  products: MiniSearch<SearchDoc>;
  facets: MiniSearch<FacetDoc>;
  /** Индексийг барьсан толь — хайлтын query-г ЯГ ижил бүлгүүдээр өргөтгөнө. */
  dictionary: SynonymDictionary;
  skuToId: Map<string, number>;
  brandCounts: Map<string, number>;
  builtAt: number;
  documentCount: number;
};

export type SearchMode = "strict" | "broad" | "barcode" | "none";
export type RankedHit = { id: number; score: number };
export type SearchOutcome = {
  hits: RankedHit[];
  mode: SearchMode;
  normalised: string;
  brandMatches: Array<{ brand: string; count: number }>;
  categoryMatches: Array<{ name: string; slug: string | null }>;
  didYouMean: string | null;
};

/** Ойлголтын токены угтвар — хоёр бичигтэй, байгалийн үгэнд хэзээ ч тохиолдохгүй. */
const CONCEPT_PREFIX = "xc";
const conceptToken = (conceptId: string) => `${CONCEPT_PREFIX}${conceptId.replace(/\s+/g, "")}`;

/** Загварчилсан тайлбарын ("<brand> брэндийн Японы жинхэнэ бүтээгдэхүүн.") утгагүй үгс. */
const DESCRIPTION_STOPWORDS = new Set(["брэндийн", "японы", "жинхэнэ", "бүтээгдэхүүн", "нь", "бөгөөд", "зориулагдсан", "тутмын", "хэрэглээнд", "жижиглэнгийн", "худалдаанд", "өргөн", "танигдсан", "агуулсан", "байдаг", "зэргийг", "найрлагадаа", "болон", "ба"]);

export const FIELD_BOOSTS: Record<string, number> = {
  sku: 10,
  brand: 5, brandAliases: 5,
  name: 4, nameMn: 4, keywords: 4,
  brandTranslit: 3,
  nameTranslit: 2, concepts: 2, productType: 2,
  category: 1.5, categoryTranslit: 1.5,
  shortDescription: 1, descriptionLatin: 0.5,
};
const INDEXED_FIELDS = Object.keys(FIELD_BOOSTS);
const STORED_FIELDS: Array<keyof SearchDoc> = ["inStock", "brandCanonical", "categoryName", "categorySlug"];
const HUMAN_FIELDS = ["name", "nameMn", "brand", "brandAliases", "category", "keywords"];

/**
 * Tokenizer: normaliseSearchText → зайгаар. Зураастай үг ("BA-YU", "non-silicone")
 * хэсгүүд + нийлүүлсэн хэлбэрээ хоёуланг өгнө: "ba-yu", "bayu", "ba yu" бүгд таарна.
 */
export function tokenizeSearchText(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of normaliseSearchText(text).split(" ")) {
    if (!raw) continue;
    if (raw.includes("-")) {
      const parts = raw.split("-").filter(Boolean);
      tokens.push(...parts);
      if (parts.length > 1) tokens.push(parts.join(""));
    } else tokens.push(raw);
  }
  return tokens;
}

// Индекс: үг бүрийг түүхий + давхар үсэг нийлүүлсэн хэлбэрээр ("shampoo" +
// "shampo"); хайлтын тал үргэлж нийлүүлсэн хэлбэрээр хайдаг тул "shampooo",
// "morinii" ижил бичлэгт буудаг. 2 тэмдэгтээс богино токен индекслэгдэхгүй.
function indexProcessTerm(term: string, fieldName?: string): string | string[] | null {
  if (term.length < 2) return null;
  if ((fieldName === "shortDescription" || fieldName === "descriptionLatin") && DESCRIPTION_STOPWORDS.has(term)) return null;
  const collapsed = collapseDoubles(term);
  return collapsed === term ? term : [term, collapsed];
}
const searchProcessTerm = (term: string) => (term.length < 2 ? null : collapseDoubles(term));

const joinWords = (words: Iterable<string>) => Array.from(new Set(words)).join(" ");

export function buildSearchDoc(row: IndexableProduct, dictionary: SynonymDictionary, aliases: BrandAliasMap): SearchDoc {
  const canonical = canonicalBrand(aliases, row.brand);
  const brandTerms = canonical ? brandSearchTerms(aliases, canonical) : [];
  const keywords = (row.searchKeywords ?? "").split(",").map(word => word.trim()).filter(Boolean);
  const shortDescription = row.shortDescription ?? "";
  const categoryName = row.categoryName ?? "";
  const conceptSource = [row.name, row.nameMn ?? "", shortDescription, keywords.join(" "), categoryName, row.productType ?? ""].join(" ");
  return {
    id: row.id,
    sku: row.sku ? normaliseBarcode(row.sku) : "",
    brand: canonical ?? "",
    brandAliases: joinWords(brandTerms.filter(term => term !== (canonical ?? "").toLowerCase())),
    name: row.name,
    nameMn: row.nameMn ?? "",
    keywords: keywords.join(" "),
    brandTranslit: canonical ? joinWords(toCyrillicWords(canonical)) : "",
    nameTranslit: joinWords(toCyrillicWords(row.name)),
    concepts: joinWords(dictionary.conceptIdsForText(conceptSource).map(conceptToken)),
    category: categoryName,
    categoryTranslit: joinWords(categoryName.split(/\s+/).flatMap(word => latinVariants(word))),
    shortDescription,
    descriptionLatin: joinWords(normaliseSearchText(shortDescription).split(" ").filter(word => isCyrillicText(word) && !DESCRIPTION_STOPWORDS.has(word)).flatMap(word => latinVariants(word).slice(0, 2))),
    productType: (row.productType ?? "").replace(/_/g, " "),
    inStock: (row.stockQuantity ?? 0) > 0,
    brandCanonical: canonical,
    categoryName: row.categoryName ?? null,
    categorySlug: row.categorySlug ?? null,
  };
}

function buildFacetDocs(rows: IndexableProduct[], dictionary: SynonymDictionary, aliases: BrandAliasMap): { docs: FacetDoc[]; brandCounts: Map<string, number> } {
  const brandCounts = new Map<string, number>();
  const categories = new Map<string, { name: string; slug: string | null; count: number }>();
  for (const row of rows) {
    const canonical = canonicalBrand(aliases, row.brand);
    if (canonical) brandCounts.set(canonical, (brandCounts.get(canonical) ?? 0) + 1);
    if (row.categoryName) {
      const entry = categories.get(row.categoryName) ?? { name: row.categoryName, slug: row.categorySlug ?? null, count: 0 };
      entry.count++;
      categories.set(row.categoryName, entry);
    }
  }
  const docs: FacetDoc[] = [];
  brandCounts.forEach((count, brand) => {
    docs.push({ id: `b:${brand}`, kind: "brand", label: brand, slug: null, terms: joinWords(brandSearchTerms(aliases, brand)), count });
  });
  categories.forEach(entry => {
    const words = normaliseSearchText(entry.name).split(" ").filter(Boolean);
    const terms = new Set<string>(words);
    for (const word of words) {
      for (const variant of latinVariants(word)) terms.add(variant);
      dictionary.lookup(word)?.forEach(term => terms.add(term));
    }
    docs.push({ id: `c:${entry.slug ?? entry.name}`, kind: "category", label: entry.name, slug: entry.slug, terms: joinWords(terms), count: entry.count });
  });
  return { docs, brandCounts };
}

export function buildCatalogIndex(input: { rows: IndexableProduct[]; dictionary: SynonymDictionary; aliases: BrandAliasMap }): CatalogIndex {
  const { rows, dictionary, aliases } = input;
  const products = new MiniSearch<SearchDoc>({
    fields: INDEXED_FIELDS,
    storeFields: STORED_FIELDS,
    idField: "id",
    tokenize: tokenizeSearchText,
    processTerm: indexProcessTerm,
    searchOptions: { tokenize: tokenizeSearchText, processTerm: searchProcessTerm },
  });
  const docs = rows.map(row => buildSearchDoc(row, dictionary, aliases));
  products.addAll(docs);

  const facets = new MiniSearch<FacetDoc>({
    fields: ["terms"],
    storeFields: ["kind", "label", "slug", "count"],
    idField: "id",
    tokenize: tokenizeSearchText,
    processTerm: indexProcessTerm,
    searchOptions: { tokenize: tokenizeSearchText, processTerm: searchProcessTerm },
  });
  const facetInput = buildFacetDocs(rows, dictionary, aliases);
  facets.addAll(facetInput.docs);

  const skuToId = new Map<string, number>();
  for (const doc of docs) if (doc.sku) skuToId.set(doc.sku, doc.id);

  return { products, facets, dictionary, skuToId, brandCounts: facetInput.brandCounts, builtAt: Date.now(), documentCount: docs.length };
}

/**
 * Per-term fuzzy: ойлголтын токен ба 3 хүртэлх үсэгтэй үгэнд ҮГҮЙ (богино үгийн
 * нэг засвар нь огт өөр үг), 4–5 үсэгт 1 засвар, урт үгэнд 20% (дээд тал нь 3).
 */
const fuzzyFor = (term: string): number | false => {
  if (term.startsWith(CONCEPT_PREFIX)) return false;
  if (term.length <= 3) return false;
  if (term.length <= 5) return 1;
  return 0.2;
};

export function runCatalogSearch(index: CatalogIndex, rawQuery: string, options: { limit?: number } = {}): SearchOutcome {
  const limit = options.limit ?? 200;
  const normalised = normaliseSearchText(rawQuery);
  const empty: SearchOutcome = { hits: [], mode: "none", normalised, brandMatches: [], categoryMatches: [], didYouMean: null };
  if (!normalised) return empty;

  // Баркод: яг таарах sku — хайлтын хэллэг биш (2026-09-11-ний скан урсгал хэвээр).
  if (looksLikeBarcode(rawQuery)) {
    const id = index.skuToId.get(normaliseBarcode(rawQuery));
    if (id != null) return { ...empty, hits: [{ id, score: 1 }], mode: "barcode" };
  }

  const dictionary = index.dictionary;
  const concepts = dictionary.expandQueryConcepts(normalised);
  if (!concepts.length) return empty;
  const ownWords = concepts.flatMap(concept => concept.own.split(" "));
  const ownCollapsed = new Set(ownWords.map(collapseDoubles));
  // Толинд ТАНИГДСАН өөрийн үг ("маск") — бүрэн бичигдсэн гэсэн үг; танигдаагүй
  // үг ("cocoh", "шампу") хагас бичигдсэн байж болно.
  const knownOwnCollapsed = new Set(ownWords.filter(word => dictionary.lookup(word)).map(collapseDoubles));

  /**
   * Prefix: латин үг (хагас бичсэн брэнд, англи үндэс "sheet"→"sheets") ба
   * толинд байхгүй өөрийн үгэнд. Толины кирилл entry-д ҮГҮЙ — "маск" prefix нь
   * "маскара"-г мөн татаж, нүүрний маск хайхад сормуусны будаг тэргүүлж байв
   * (2026-09-12-нд хэмжсэн).
   */
  const prefixFor = (term: string): boolean =>
    !term.startsWith(CONCEPT_PREFIX) && term.length >= 3 &&
    (isLatinText(term) || (ownCollapsed.has(term) && !knownOwnCollapsed.has(term)));

  const groupQueries: Query[] = concepts.map(concept => {
    const terms = new Set<string>(concept.alternatives);
    if (isCyrillicText(concept.own)) for (const variant of latinVariants(concept.own)) terms.add(variant);
    if (isLatinText(concept.own)) for (const variant of toCyrillicVariants(concept.own)) terms.add(variant);
    if (concept.conceptId) terms.add(conceptToken(concept.conceptId));
    const queries: Query[] = Array.from(terms).map(term =>
      term.includes(" ") ? { combineWith: "AND", queries: term.split(" ").filter(Boolean) } : term);
    return { combineWith: "OR", queries, fuzzy: fuzzyFor, prefix: prefixFor };
  });

  const baseOptions: SearchOptions = {
    boost: FIELD_BOOSTS,
    weights: { fuzzy: 0.4, prefix: 0.5 },
    maxFuzzy: 3,
    // Нөөцгүй бараа алга болохгүй, доошилно.
    boostDocument: (_id, _term, stored) => (stored?.inStock ? 1 : 0.85),
  };

  const rank = (results: ReturnType<typeof index.products.search>): RankedHit[] =>
    results
      .sort((a, b) => b.score - a.score || Number(Boolean(b.inStock)) - Number(Boolean(a.inStock)) || a.id - b.id)
      .slice(0, limit)
      .map(result => ({ id: result.id as number, score: result.score }));

  // STRICT: ойлголт бүрээс дор хаяж нэг үг. "гарын тос" = гар-үг AND тос-үг:
  // гарын крем таарна, тослог арчигч цаас таарахгүй.
  let hits = rank(index.products.search({ combineWith: "AND", queries: groupQueries }, baseOptions));
  let mode: SearchMode = "strict";
  if (!hits.length) {
    // BROAD: аль ч ойлголтын аль ч үг; худалдан авагчийн өөрийн үг ×2 — хоосон
    // тавиураас сул тавиур дээр (хуучин `boostExpr*3` ORDER BY-ийн үүрэг).
    hits = rank(index.products.search({ combineWith: "OR", queries: groupQueries }, { ...baseOptions, boostTerm: term => (ownCollapsed.has(term) ? 2 : 1) }));
    mode = hits.length ? "broad" : "none";
  }

  // Брэнд/ангиллын илрүүлэлт — зөвхөн богино query (урт хэллэг брэнд хайлт биш).
  const brandMatches: SearchOutcome["brandMatches"] = [];
  const categoryMatches: SearchOutcome["categoryMatches"] = [];
  const tokenCount = normalised.split(" ").length;
  if (tokenCount <= 3) {
    const facetHits = index.facets.search(normalised, { combineWith: "OR", fuzzy: 0.25, prefix: true, maxFuzzy: 2 });
    const top = facetHits[0]?.score ?? 0;
    for (const hit of facetHits) {
      if (hit.score < top * 0.6) break;
      if (hit.kind === "brand" && brandMatches.length < 3) brandMatches.push({ brand: hit.label as string, count: hit.count as number });
      else if (hit.kind === "category" && categoryMatches.length < 2) categoryMatches.push({ name: hit.label as string, slug: (hit.slug as string | null) ?? null });
    }
  }

  // "Та … гэж хайсан уу?" — зөвхөн сул үр дүнтэй үед, хүний уншдаг талбараас.
  let didYouMean: string | null = null;
  if (mode !== "strict" || hits.length < 3) {
    const suggestion = index.products.autoSuggest(normalised, { fields: HUMAN_FIELDS, fuzzy: 0.3, prefix: true, maxFuzzy: 3 })[0]?.suggestion ?? null;
    if (suggestion && suggestion !== normalised && !suggestion.startsWith(CONCEPT_PREFIX)) didYouMean = suggestion;
  }

  return { hits, mode, normalised, brandMatches, categoryMatches, didYouMean };
}
