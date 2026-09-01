/**
 * Preference Profile v2 (2026-09-01) — rule-based, zero-ML keyword tagging.
 *
 * Deliberately NOT machine learning: a real read of the live catalog found
 * only 4/937 products carry any personalization tag, and 82% of products
 * have generic, non-differentiating shortDescription text (e.g. "S-Select
 * брэндийн Японы жинхэнэ бүтээгдэхүүн"). So this matches primarily against
 * product NAME (English/brand-style tokens like "cream"/"shampoo"/"uv" are
 * common there), then description text, and gates several fields behind
 * categorySlug so a shampoo can never be mistagged with a skin-only concern
 * and vice versa. A field with no keyword hit is left undefined — this
 * module never guesses, matching the codebase's "N of M, never fabricate"
 * discipline used everywhere else (see server/analytics.ts).
 *
 * Used by BOTH scripts/auto-tag-products.ts (Node, bulk pass) and
 * client/src/components/AdminWorkspace.tsx (browser, per-product suggestion
 * chips) — this is why it lives in shared/, not server/.
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

export function suggestTagsForProduct(input: TaggableProductInput): SuggestedTags {
  const haystack = haystackFrom(input);
  const category = input.categorySlug ?? null;
  const suggestions: SuggestedTags = {};

  // --- skinType (skincare/beauty categories only) ---
  if (category === null || SKINCARE_CATEGORIES.has(category)) {
    if (matchAny(haystack, ["мэдрэмтгий арьс", "sensitive skin", "sensitive"])) suggestions.skinType = "sensitive";
    else if (matchAny(haystack, ["тослог арьс", "oily skin"])) suggestions.skinType = "oily";
    else if (matchAny(haystack, ["хуурай арьс", "dry skin"])) suggestions.skinType = "dry";
    else if (matchAny(haystack, ["хосолмол арьс", "combination skin"])) suggestions.skinType = "combination";
  }

  // --- skinConcerns (skincare/beauty categories only, multi) ---
  if (category === null || SKINCARE_CATEGORIES.has(category)) {
    const concerns: string[] = [];
    if (matchAny(haystack, ["acne", "батга", "бацлуур", "pimple"])) concerns.push("acne");
    if (matchAny(haystack, ["anti-aging", "anti aging", "wrinkle", "үрчлээ", "хөгшрөлт", "collagen", "коллаген"])) concerns.push("aging");
    if (matchAny(haystack, ["whitening", "цайруулах", "brightening", "pigment", "толбо"])) concerns.push("pigmentation");
    // Deliberately NOT "moistur"/"hydrat"/"чийг" alone -- a real run against
    // the live catalog found ~99% of skincare products' long `description`
    // carries generic "чийгшүүлж..." boilerplate marketing copy regardless
    // of actual product type (even a plain cleansing oil), which would make
    // this concern tag non-discriminative noise instead of real signal. A
    // named specific ingredient or an explicit dry-skin phrase is a much
    // more trustworthy signal than the generic moisturizing claim alone.
    if (matchAny(haystack, ["hyaluron", "гиалурон", "хуурай, хагарсан", "маш хуурай арьс", "extra dry"])) concerns.push("dryness");
    if (matchAny(haystack, ["dull", "уйтгар", "gloss", "тод гэрэлт"])) concerns.push("dullness");
    if (matchAny(haystack, ["uv", "spf", "sun protect", "нар", "наранаас хамгаалах"])) concerns.push("sun_damage");
    if (concerns.length) suggestions.skinConcerns = concerns;
  }

  // --- hairType / hairConcerns (hair & body category only) ---
  if (category === null || HAIR_CATEGORIES.has(category)) {
    if (matchAny(haystack, ["repair", "damaged hair", "гэмтсэн үс"])) suggestions.hairType = "damaged";
    else if (matchAny(haystack, ["color treated", "будсан үс", "хими хийсэн"])) suggestions.hairType = "color_treated";
    else if (matchAny(haystack, ["тослог үс", "oily hair", "oily scalp"])) suggestions.hairType = "oily";
    else if (matchAny(haystack, ["хуурай үс", "dry hair"])) suggestions.hairType = "dry";

    const hairConcerns: string[] = [];
    if (matchAny(haystack, ["hair loss", "hairloss", "үс унах", "anti-hair loss"])) hairConcerns.push("hairloss");
    if (matchAny(haystack, ["dandruff", "хусам"])) hairConcerns.push("dandruff");
    if (matchAny(haystack, ["frizz", "ширхэгжилт", "smooth hair", "гөлгөр"])) hairConcerns.push("frizz");
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
