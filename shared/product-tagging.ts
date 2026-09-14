/**
 * Preference Profile v2 (2026-09-01) — дүрэмд суурилсан, ML-гүй keyword tagging.
 *
 * Санаатайгаар machine learning БИШ: амьд каталогийг бодитоор уншихад 937-оос ердөө
 * 4 бараа personalization tag-тай, 82% нь ерөнхий, ялгарахгүй shortDescription-тэй
 * (ж. "S-Select брэндийн Японы жинхэнэ бүтээгдэхүүн"). Тиймээс энэ голдуу барааны
 * НЭР-тэй (тэнд "cream"/"shampoo"/"uv" мэт англи/брэнд маягийн token түгээмэл),
 * дараа нь тайлбарын тексттэй тулгаж, шампунь арьсны асуудлаар (эсрэгээр) буруу tag
 * хийгдэхгүйн тулд хэд хэдэн талбарыг categorySlug-ийн ард хаана. Keyword таараагүй
 * талбар undefined үлдэнэ — энэ модуль хэзээ ч таадаггүй, кодын бусад газрын "N of M,
 * хэзээ ч зохиохгүй" зарчимтай ижил (server/analytics.ts).
 *
 * scripts/auto-tag-products.ts (Node, bulk pass) БА client/src/components/
 * AdminWorkspace.tsx (хөтөч, бараа бүрийн санал chip) хоёулаа ашигладаг — тиймээс
 * server/ биш shared/-д.
 */

export type SuggestedTags = {
  skinType?: "dry" | "oily" | "combination" | "sensitive" | "normal";
  skinConcerns?: string[]; // keys matching Profile.tsx's SKIN_CONCERNS + NEW_SKIN_CONCERN
  hairType?: "dry" | "oily" | "normal" | "damaged" | "color_treated";
  hairConcerns?: string[];
  fragrancePreference?: "unscented" | "light" | "floral" | "citrus";
  wellnessInterests?: string[];
};

export type TaggableProductInput = {
  name: string;
  brand?: string | null;
  categorySlug?: string | null;
  shortDescription?: string | null;
  description?: string | null;
};

const SKINCARE_CATEGORIES = new Set(["arhis-archilgaa", "goo-saikhan"]);
const HAIR_CATEGORIES = new Set(["us-ba-bie"]);
const WELLNESS_CATEGORIES = new Set(["eruul-mend"]);

function haystackFrom(input: TaggableProductInput): string {
  // Name weighted heaviest by simply appearing first — matchAny below just
  // checks substring presence, not position, but name is included whole so
  // multi-word name patterns (e.g. "hair repair") still match.
  return [input.name, input.shortDescription, input.description].filter(Boolean).join(" ").toLocaleLowerCase();
}

function matchAny(haystack: string, patterns: string[]): boolean {
  return patterns.some(pattern => haystack.includes(pattern));
}

/**
 * Name-only haystack. 917 of this catalog's 937 descriptions are TEMPLATE
 * text generated at import time ("<brand> нь Японы жижиглэнгийн худалдаанд
 * өргөн танигдсан <form> бөгөөд..." — see PRODUCT-IMPORT.md's bulk-import
 * section), so any rule whose keyword also appears in that template matches
 * almost the whole catalog and carries no information. Rules that would be
 * swamped that way read the product NAME only, which is real POS data.
 */
function nameFrom(input: TaggableProductInput): string {
  return input.name.toLocaleLowerCase();
}

export function suggestTagsForProduct(input: TaggableProductInput): SuggestedTags {
  const haystack = haystackFrom(input);
  const category = input.categorySlug ?? null;
  const suggestions: SuggestedTags = {};

  // --- skinType (skincare/beauty categories only) ---
  if (category === null || SKINCARE_CATEGORIES.has(category)) {
    // CICA / Centella Asiatica products are formulated for irritated and
    // reactive skin -- that is the product's own stated purpose, not a guess
    // about the shopper. 21 real products, and it is the only signal in this
    // catalog that can reach skinType "sensitive" at all.
    if (matchAny(haystack, ["мэдрэмтгий арьс", "sensitive skin", "sensitive", "cica", "centella"])) suggestions.skinType = "sensitive";
    else if (matchAny(haystack, ["тослог арьс", "oily skin", "charcoal", "clay ", "oil control"])) suggestions.skinType = "oily";
    else if (matchAny(haystack, ["хуурай арьс", "dry skin"])) suggestions.skinType = "dry";
    else if (matchAny(haystack, ["хосолмол арьс", "combination skin"])) suggestions.skinType = "combination";
  }

  // --- skinConcerns (skincare/beauty categories only, multi) ---
  if (category === null || SKINCARE_CATEGORIES.has(category)) {
    const concerns: string[] = [];
    if (matchAny(haystack, ["acne", "батга", "бацлуур", "pimple"])) concerns.push("acne");
    if (matchAny(haystack, ["anti-aging", "anti aging", "wrinkle", "үрчлээ", "хөгшрөлт", "collagen", "коллаген", "retinol", "ретинол", "firming", "placenta", "плацент"])) concerns.push("aging");
    if (matchAny(haystack, ["whitening", "цайруулах", "brightening", "pigment", "толбо", "niacinamide", "ниацинамид", "vitamin c", "витамин c", "arbutin"])) concerns.push("pigmentation");
    // "sensitivity" is in skinConcernOptions but no rule could ever produce
    // it before -- a shopper picking "Мэдрэг байдал" matched literally
    // nothing. Same CICA/Centella evidence as the skinType branch above.
    if (matchAny(haystack, ["cica", "centella", "мэдрэмтгий арьс", "sensitive skin"])) concerns.push("sensitivity");
    // Deliberately NOT "moistur"/"hydrat"/"чийг" alone -- a real run against
    // the live catalog found ~99% of skincare products' long `description`
    // carries generic "чийгшүүлж..." boilerplate marketing copy regardless
    // of actual product type (even a plain cleansing oil), which would make
    // this concern tag non-discriminative noise instead of real signal. A
    // named specific ingredient or an explicit dry-skin phrase is a much
    // more trustworthy signal than the generic moisturizing claim alone.
    // Named emollient/humectant INGREDIENTS only -- never the generic
    // "чийгшүүлэх" marketing claim, which the template description puts on
    // ~99% of skincare (the 441/445 false-positive found on 2026-09-01).
    if (matchAny(haystack, ["hyaluron", "гиалурон", "хуурай, хагарсан", "маш хуурай арьс", "extra dry", "horse oil", "морины тос", "squalane", "скваллан", "ceramide", "керамид", "shea butter"])) concerns.push("dryness");
    // NB: "rice" is deliberately absent -- it is a substring of "price".
    // Same class of bug as "epa" inside "rEPAir" (see PRODUCT-IMPORT.md).
    if (matchAny(haystack, ["dull", "уйтгар", "gloss", "тод гэрэлт", "будаа", "vitamin c", "витамин c"])) concerns.push("dullness");
    if (matchAny(haystack, ["uv", "spf", "sun protect", "нар", "наранаас хамгаалах"])) concerns.push("sun_damage");
    if (concerns.length) suggestions.skinConcerns = concerns;
  }

  // --- hairType / hairConcerns (hair & body category only) ---
  // HAIR_CATEGORIES is "Үс ба бие" -- hair AND body -- so category alone is
  // not enough: 36 of its 118 products are body milk / body wash / hand
  // soap, and a body milk is not a "dry hair" product. Require the name to
  // actually name a hair product before any hair tag is allowed.
  const looksLikeHairProduct = matchAny(nameFrom(input), ["hair", "shampoo", "conditioner", "scalp", "treatment", "үс", "шампун"]);
  if (category === null || (HAIR_CATEGORIES.has(category) && looksLikeHairProduct)) {
    if (matchAny(haystack, ["repair", "damaged hair", "гэмтсэн үс"])) suggestions.hairType = "damaged";
    else if (matchAny(haystack, ["color treated", "будсан үс", "хими хийсэн"])) suggestions.hairType = "color_treated";
    else if (matchAny(haystack, ["тослог үс", "oily hair", "oily scalp"])) suggestions.hairType = "oily";
    // Moisture-line products, read from the NAME only (the template
    // description's "чийгшүүлэх" boilerplate would otherwise match nearly
    // every hair product). Checked AFTER repair/damaged above on purpose:
    // "Moist Diane ... Night Repair Shampoo" is a repair product from a
    // brand whose name happens to contain "Moist", and should stay
    // "damaged" rather than being reclassified by its brand name.
    else if (matchAny(haystack, ["хуурай үс", "dry hair"]) || matchAny(nameFrom(input), ["moist", "moisturizing"])) suggestions.hairType = "dry";

    const hairConcerns: string[] = [];
    if (matchAny(haystack, ["hair loss", "hairloss", "үс унах", "anti-hair loss"])) hairConcerns.push("hairloss");
    if (matchAny(haystack, ["dandruff", "хусам"])) hairConcerns.push("dandruff");
    if (matchAny(haystack, ["frizz", "ширхэгжилт", "smooth hair", "гөлгөр"]) || matchAny(nameFrom(input), ["silky", "smooth"])) hairConcerns.push("frizz");
    // scalp_sensitivity is the other option the quiz offered that no rule
    // could ever produce. Scalp-care products name it explicitly.
    if (matchAny(haystack, ["толгойн арьс"]) || matchAny(nameFrom(input), ["scalp"])) hairConcerns.push("scalp_sensitivity");
    if (hairConcerns.length) suggestions.hairConcerns = hairConcerns;
  }

  // --- fragrancePreference (cross-category, only when explicitly stated) ---
  if (matchAny(haystack, ["unscented", "fragrance-free", "fragrance free", "үнэргүй"])) suggestions.fragrancePreference = "unscented";
  else if (matchAny(haystack, ["floral", "цэцэг", "rose", "сарнай"])) suggestions.fragrancePreference = "floral";
  else if (matchAny(haystack, ["citrus", "lemon", "жүрж", "лимон", "orange"])) suggestions.fragrancePreference = "citrus";

  // --- wellnessInterests (health category only, multi) ---
  if (category === null || WELLNESS_CATEGORIES.has(category)) {
    const wellness: string[] = [];
    if (matchAny(haystack, ["vitamin", "витамин", "эрч хүч", "energy"])) wellness.push("energy");
    if (matchAny(haystack, ["digest", "хоол боловсруулалт", "probiotic"])) wellness.push("digestion");
    if (matchAny(haystack, ["sleep", "нойр", "melatonin"])) wellness.push("sleep");
    if (matchAny(haystack, ["immune", "дархлаа"])) wellness.push("immune");
    if (matchAny(haystack, ["weight", "жин хянах", "diet"])) wellness.push("weight");
    if (wellness.length) suggestions.wellnessInterests = wellness;
  }

  return suggestions;
}
