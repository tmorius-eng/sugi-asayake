import { BODY_PRODUCT_TYPES, HAIR_PRODUCT_TYPES, SKINCARE_PRODUCT_TYPES, type ProductType } from "./product-types";

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
 * v2 (2026-09-20, Tom: шинж чанарыг ЗӨВХӨН дүрмээр, AI-гүй):
 *   - `productType` — барааны төрөл (цэвэрлэгч/тонер/серум/…/шампунь/бие угаагч),
 *     нэрний үгээр. Санал болголтын диверс + хайлтын ойлголт.
 *   - `skinTypes` — ОЛОН утга: чийгшүүлэгч найрлага → хуурай+хэвийн+хосолсон,
 *     себум/шавар → тослог+хосолсон, cica → мэдрэг; арьсны бүтээгдэхүүн боловч
 *     дохиогүй бол `all` (бүх төрөлд). Хуучин ганц `skinType` хэвээр (хамгийн
 *     хүчтэй нэг утга) — placeholder "normal" ХЭЗЭЭ Ч энд гарахгүй.
 *   - `bodySkinType` / `bodyConcerns` — биеийн арчилгаа (бие угаагч, лосьон,
 *     дезодорант, ванн): асуулгын шинэ "Биеийн арчилгаа" алхамтай таарна.
 *
 * scripts/auto-tag-products.ts (Node, bulk pass) БА client/src/components/
 * AdminWorkspace.tsx (хөтөч, бараа бүрийн санал chip) хоёулаа ашигладаг — тиймээс
 * server/ биш shared/-д.
 */

export type SkinTypeValue = "dry" | "oily" | "combination" | "sensitive" | "normal";

export type SuggestedTags = {
  skinType?: SkinTypeValue;
  /** Олон утга; "all" = арьсны бүтээгдэхүүн боловч төрлийн дохиогүй. */
  skinTypes?: Array<SkinTypeValue | "all">;
  skinConcerns?: string[]; // keys matching Profile.tsx's SKIN_CONCERNS + NEW_SKIN_CONCERN
  hairType?: "dry" | "oily" | "normal" | "damaged" | "color_treated";
  hairConcerns?: string[];
  fragrancePreference?: "unscented" | "light" | "floral" | "citrus";
  wellnessInterests?: string[];
  productType?: ProductType;
  bodySkinType?: "dry" | "normal" | "sensitive";
  bodyConcerns?: string[];
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
const BODY_CATEGORIES = new Set(["us-ba-bie", "arhis-archilgaa", "eruul-akhui"]);

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

/**
 * Барааны төрөл — НЭРНЭЭС л (тайлбар загварчилсан). Дараалал чухал: илүү
 * тодорхой үг эхэлж ("cleansing oil" нь тос биш цэвэрлэгч; "hand cream" нь
 * крем биш гарын арчилгаа; "body lotion" нь тонер биш).
 */
export function suggestProductType(input: TaggableProductInput): ProductType | undefined {
  const name = nameFrom(input);
  const category = input.categorySlug ?? null;
  const has = (patterns: string[]) => matchAny(name, patterns);
  if (category === "gift-card" || has(["gift card", "бэлгийн карт"])) return "gift_card";
  if (has(["toothpaste", "tooth paste", "toothbrush", "tooth brush", "dental", "mouthwash", "mouth wash", "floss", "шүдний", "denture"])) return "oral_care";
  if (has(["deodorant", "antiperspirant", "дезодорант"])) return "deodorant";
  if (has(["bath salt", "bath bomb", "bath milk", "bath powder", "bath tablet", "bath ", "ванн"])) return "bath";
  if (has(["hand cream", "hand soap", "hand wash", "hand gel", "foot", "heel", "гарын", "хөлний"])) return "hand_care";
  if (has(["body wash", "body soap", "body cleanser", "shower gel", "body scrub", "бие угаагч"])) return "body_wash";
  if (has(["body milk", "body lotion", "body cream", "body oil", "body butter", "body mist", "биеийн тос"])) return "body_lotion";
  if (has(["shampoo", "шампун"])) return "shampoo";
  if (has(["spot treatment", "acne treatment"])) return "serum";
  // "Treatment" ганцаараа энэ каталогт үсний (Diane/Botanical/Moist Diane
  // treatment 400-450ml) — арьсных нь дээр "spot treatment"-ээр барьсан.
  if (has(["conditioner", "hair treatment", "hair mask", "hair pack", "rinse", "кондиционер", "treatment"])) return "conditioner";
  if (has(["hair oil", "hair milk", "hair water", "hair spray", "hair wax", "styling", "hair color", "hair colour", "hair dye", "scalp", "hair essence", "hair serum", "hair brush", "comb", "самнуур"])) return "hair_styling";
  if (has(["sunscreen", "sun screen", "sunblock", "uv ", "spf", "наранаас", "нарны"])) return "sunscreen";
  if (has(["cleansing oil", "cleansing balm", "makeup remover", "make up remover", "remover", "cleansing water", "micellar"])) return "makeup_remover";
  if (has(["cleanser", "cleansing", "face wash", "facial wash", "wash", "foam", "facial soap", "face soap", "нүүр угаа", "цэвэрлэгч"])) return "cleanser";
  if (has(["eye cream", "eye serum", "eye mask", "eye gel", "нүдний"])) return "eye_care";
  if (has(["lip balm", "lip cream", "lip mask", "lip care", "уруулын"])) return "lip_care";
  // Нүүр будалт: "Eye Color", "I DRAW SHADOW", "eye gloss", "Glitter Eye" зэрэг нь
  // нүдний АРЧИЛГАА биш будалт — доорх eye_care-ийн өмнө шалгана (2026-09-20).
  if (has(["mascara", "eyeliner", "eye liner", "lipstick", "lip tint", "foundation", "concealer", "powder", "blush", "eyebrow", "brow", "eyeshadow", "eye shadow", "eye color", "eye colour", "eye gloss", "glitter eye", "shadow", "palette", "primer", "bb cream", "cc cream", "cushion", "nail"])) return "makeup";
  // ⚠️ Ганц "pack" БИШ: "30-Pack", "10 Packets" нь савлагааны тоо бөгөөд меламин
  // хөвөн, цайг маск болгож байсан (2026-09-20-нд бодит өгөгдлөөс олов).
  if (has(["sheet mask", "face mask", "facial mask", "mask", "face pack", "sheet pack", "маск"])) return "mask";
  if (has(["serum", "ampoule", "ampule", "booster", "сэрум", "серум"])) return "serum";
  if (has(["essence", "эссенц"])) return "essence";
  if (has(["toner", "lotion", "skin conditioner", "тонер", "лосьон"])) return "toner";
  if (has(["cream", "emulsion", "moisturizer", "moisturiser", "gel cream", "milk", "balm", "крем", "эмульс"])) return "cream";
  if (has(["baby", "kids", "kid ", "child", "хүүхд", "нялх", "diaper", "wipes for baby"])) return "baby";
  if (has(["supplement", "collagen", "vitamin", "nmn", "capsule", "tablet", "gummy", "protein", "probiotic", "enzyme", "витамин", "коллаген", "нэмэлт"])) return "supplement";
  if (has(["tea", "drink", "juice", "coffee", "цай", "ундаа"])) return "tea";
  if (category === "khuns" || has(["candy", "chocolate", "snack", "noodle", "rice cracker", "cookie", "biscuit", "хүнс"])) return "food";
  if (has(["detergent", "laundry", "softener", "bleach", "sponge", "cleaner", "air freshener", "freshener", "deodorizer", "insect", "угаалгын"])) return "household";
  if (has(["wipes", "wet tissue", "tissue", "cotton", "puff", "swab", "bandage", "plaster", "mask (", "face mask (", "sanitizer", "disinfect", "razor", "shaver", "салфетка", "хөвөн", "боолт", "наалт"])) return "hygiene";
  if (has(["device", "roller", "massager", "brush device", "led", "ipl", "steamer", "tool", "lift brush", "ems", "laser"])) return "device";
  // 2026-09-20: амьд каталогийн үлдсэн 92 төрөлгүй барааны бодит хэв маягууд.
  if (has(["tester", "amproom test", "trial set", "lucky bag", "variety", "complete set", "sample"])) return "other";
  // Хамар/сүвний наалт, сэргээх наалт, нойтон салфетка, дэвсгэр — эрүүл ахуйн хэрэгсэл.
  if (has(["pore clean", "pore pack", "pore strip", "sap sheet", "sap sheets", "refresh sheets", "recover patch", "flooring sheets", "soft pad", "replacement brush", "tooth eraser", "toothstick"])) return "hygiene";
  if (has(["sun protector", "protector (uv)"])) return "sunscreen";
  if (has(["color stick"])) return "makeup";
  if (has(["night cap", "shaping pants", "esthe time", "abdominal", "heat method"])) return "other";
  if (has(["wet sheet", "wet plus", "wet tissue", "sheets for", "thick sheets", "orange sheets", "sesquicarbonate", "whipping net", "thin pad", "tweezers", "cambable", "cooling ring", "coolring", "cicibella"])) return "hygiene";
  if (has(["blend", "leaf", "balance", "amino", "sachet", "cell cure", "4200"])) return "supplement";
  if (has(["beauty water", "lotion water", "skin water"])) return "toner";
  if (has(["lip", "уруул"])) return "lip_care";
  if (has(["eye sheet", "eye patch", "eye pack"])) return "eye_care";
  if (has(["paste", "whip care", "jasmine", "kwansoo", "be white"])) return "cream";
  if (has(["condition"])) return "conditioner";
  // Сүүлийн ерөнхий дүрмүүд (2026-09-20-ны dry run-д 169 төрөлгүй үлдсэнээс):
  if (has(["hair", "үс"])) return "hair_styling";
  if (has(["lash", "nail", "makeup", "make up", "make-up", "base"])) return "makeup";
  if (has(["flavor", "flavour", "slim tea", "jelly", "diet"])) return "tea";
  if (has(["mist", "спрей", "spray"])) return "toner";
  if (has(["oil", "extract", "placenta", "squalane", "ampoule", "тос"])) return category === "us-ba-bie" ? "body_lotion" : "serum";
  if (has(["soap", "саван"])) return category === "arhis-archilgaa" ? "cleanser" : "body_wash";
  if (has(["gel", "jelly", "cream"])) return "cream";
  if (has(["massage", "sugaring", "scrub", "peeling"])) return "body_lotion";
  if (category === "eruul-akhui") return "hygiene";
  if (category === "eruul-mend") return "supplement";
  return undefined;
}

const SKINCARE_TYPE_SET = new Set<string>(SKINCARE_PRODUCT_TYPES);
const HAIR_TYPE_SET = new Set<string>(HAIR_PRODUCT_TYPES);
const BODY_TYPE_SET = new Set<string>(BODY_PRODUCT_TYPES);

export function suggestTagsForProduct(input: TaggableProductInput): SuggestedTags {
  const haystack = haystackFrom(input);
  const category = input.categorySlug ?? null;
  const suggestions: SuggestedTags = {};
  const productType = suggestProductType(input);
  if (productType) suggestions.productType = productType;
  const isSkincareProduct = productType ? SKINCARE_TYPE_SET.has(productType) : (category === null || SKINCARE_CATEGORIES.has(category));

  // --- skinTypes (олон утга) + skinType (хамгийн хүчтэй ганц) — арьсны бүтээгдэхүүнд ---
  if (isSkincareProduct && (category === null || SKINCARE_CATEGORIES.has(category) || productType)) {
    const types: Array<SkinTypeValue | "all"> = [];
    // CICA / Centella Asiatica products are formulated for irritated and
    // reactive skin -- that is the product's own stated purpose, not a guess
    // about the shopper. 21 real products, and it is the only signal in this
    // catalog that can reach skinType "sensitive" at all.
    const name = nameFrom(input);
    if (matchAny(haystack, ["мэдрэмтгий арьс", "sensitive skin", "sensitive", "cica", "centella", "эмзэг арьс"]) || matchAny(name, ["mild", "fragrance-free", "fragrance free", "hypoallergenic"])) types.push("sensitive");
    // "sebum"/"pore"/"acne" ЗӨВХӨН нэрнээс: тайлбарын тайлбарлах өгүүлбэрт
    // ("sebum-ыг тэнцвэржүүлнэ") орсон squalane тос "тослог" болж байсан (регресс тест).
    if (matchAny(haystack, ["тослог арьс", "oily skin", "charcoal", "clay ", "oil control"]) || matchAny(name, ["sebum", "pore", "acne", "blotting", "matte", "mattifying"])) types.push("oily", "combination");
    if (matchAny(haystack, ["хуурай арьс", "dry skin", "extra dry", "маш хуурай", "hyaluron", "гиалурон", "ceramide", "керамид", "squalane", "horse oil", "морины тос", "shea butter"]) || matchAny(name, ["rich", "deep moist", "nourishing"])) types.push("dry", "normal", "combination");
    if (matchAny(haystack, ["хосолмол арьс", "combination skin"])) types.push("combination");
    const unique = Array.from(new Set(types));
    // Дохиогүй арьсны бараа "all" (бага жин) — гэхдээ зөвхөн ТӨРӨЛ нь тодорхой
    // (цэвэрлэгч, крем …) үед; төрөл ч, дохио ч байхгүй бол юу ч таахгүй.
    if (unique.length) suggestions.skinTypes = unique;
    else if (productType && SKINCARE_TYPE_SET.has(productType)) suggestions.skinTypes = ["all"];
    if (unique.includes("sensitive")) suggestions.skinType = "sensitive";
    else if (unique.includes("oily")) suggestions.skinType = "oily";
    else if (unique.includes("dry")) suggestions.skinType = "dry";
    else if (unique.includes("combination")) suggestions.skinType = "combination";
  }

  // --- skinConcerns (skincare/beauty categories only, multi) ---
  if (isSkincareProduct && (category === null || SKINCARE_CATEGORIES.has(category) || productType)) {
    const concerns: string[] = [];
    if (matchAny(haystack, ["acne", "батга", "бацлуур", "pimple", "blemish"])) concerns.push("acne");
    if (matchAny(haystack, ["anti-aging", "anti aging", "wrinkle", "үрчлээ", "хөгшрөлт", "collagen", "коллаген", "retinol", "ретинол", "firming", "placenta", "плацент", "lifting"])) concerns.push("aging");
    if (matchAny(haystack, ["whitening", "цайруулах", "brightening", "pigment", "толбо", "niacinamide", "ниацинамид", "vitamin c", "витамин c", "arbutin", "tranexamic"])) concerns.push("pigmentation");
    // "sensitivity" is in skinConcernOptions but no rule could ever produce
    // it before -- a shopper picking "Мэдрэг байдал" matched literally
    // nothing. Same CICA/Centella evidence as the skinType branch above.
    if (matchAny(haystack, ["cica", "centella", "мэдрэмтгий арьс", "sensitive skin", "soothing", "calming"])) concerns.push("sensitivity");
    // Deliberately NOT "moistur"/"hydrat"/"чийг" alone -- a real run against
    // the live catalog found ~99% of skincare products' long `description`
    // carries generic "чийгшүүлж..." boilerplate marketing copy regardless
    // of actual product type (even a plain cleansing oil), which would make
    // this concern tag non-discriminative noise instead of real signal. A
    // named specific ingredient or an explicit dry-skin phrase is a much
    // more trustworthy signal than the generic moisturizing claim alone.
    if (matchAny(haystack, ["hyaluron", "гиалурон", "хуурай, хагарсан", "маш хуурай арьс", "extra dry", "horse oil", "морины тос", "squalane", "скваллан", "ceramide", "керамид", "shea butter"])) concerns.push("dryness");
    // NB: "rice" is deliberately absent -- it is a substring of "price".
    // Same class of bug as "epa" inside "rEPAir" (see PRODUCT-IMPORT.md).
    if (matchAny(haystack, ["dull", "уйтгар", "gloss", "тод гэрэлт", "будаа", "vitamin c", "витамин c", "glow", "radiance"])) concerns.push("dullness");
    if (matchAny(haystack, ["uv", "spf", "sun protect", "нар", "наранаас хамгаалах"])) concerns.push("sun_damage");
    if (concerns.length) suggestions.skinConcerns = Array.from(new Set(concerns));
  }

  // --- hairType / hairConcerns (hair & body category only) ---
  // HAIR_CATEGORIES is "Үс ба бие" -- hair AND body -- so category alone is
  // not enough: 36 of its 118 products are body milk / body wash / hand
  // soap, and a body milk is not a "dry hair" product. Require the name to
  // actually name a hair product before any hair tag is allowed.
  const looksLikeHairProduct = (productType ? HAIR_TYPE_SET.has(productType) : false) || matchAny(nameFrom(input), ["hair", "shampoo", "conditioner", "scalp", "treatment", "үс", "шампун"]);
  if (category === null || (HAIR_CATEGORIES.has(category) && looksLikeHairProduct)) {
    if (matchAny(haystack, ["repair", "damaged hair", "гэмтсэн үс"])) suggestions.hairType = "damaged";
    else if (matchAny(haystack, ["color treated", "будсан үс", "хими хийсэн", "color care", "colour care"])) suggestions.hairType = "color_treated";
    else if (matchAny(haystack, ["тослог үс", "oily hair", "oily scalp", "deep cleanse", "clarifying"])) suggestions.hairType = "oily";
    // Moisture-line products, read from the NAME only (the template
    // description's "чийгшүүлэх" boilerplate would otherwise match nearly
    // every hair product). Checked AFTER repair/damaged above on purpose:
    // "Moist Diane ... Night Repair Shampoo" is a repair product from a
    // brand whose name happens to contain "Moist", and should stay
    // "damaged" rather than being reclassified by its brand name.
    else if (matchAny(haystack, ["хуурай үс", "dry hair"]) || matchAny(nameFrom(input), ["moist", "moisturizing"])) suggestions.hairType = "dry";

    const hairConcerns: string[] = [];
    if (matchAny(haystack, ["hair loss", "hairloss", "үс унах", "anti-hair loss", "volume"])) hairConcerns.push("hairloss");
    if (matchAny(haystack, ["dandruff", "хусам"])) hairConcerns.push("dandruff");
    if (matchAny(haystack, ["frizz", "ширхэгжилт", "smooth hair", "гөлгөр"]) || matchAny(nameFrom(input), ["silky", "smooth"])) hairConcerns.push("frizz");
    // scalp_sensitivity is the other option the quiz offered that no rule
    // could ever produce. Scalp-care products name it explicitly.
    if (matchAny(haystack, ["толгойн арьс"]) || matchAny(nameFrom(input), ["scalp"])) hairConcerns.push("scalp_sensitivity");
    if (hairConcerns.length) suggestions.hairConcerns = hairConcerns;
  }

  // --- bodySkinType / bodyConcerns (биеийн арчилгааны бүтээгдэхүүнд, 2026-09-20) ---
  const looksLikeBodyProduct = productType ? BODY_TYPE_SET.has(productType) : matchAny(nameFrom(input), ["body", "bath", "deodorant", "hand", "foot"]);
  if (looksLikeBodyProduct && (category === null || BODY_CATEGORIES.has(category))) {
    if (matchAny(haystack, ["sensitive", "mild", "fragrance-free", "fragrance free", "мэдрэмтгий", "эмзэг", "baby"])) suggestions.bodySkinType = "sensitive";
    else if (matchAny(haystack, ["dry", "хуурай", "moist", "shea", "milk", "butter", "oil", "urea", "мочевин", "horse oil"])) suggestions.bodySkinType = "dry";
    const bodyConcerns: string[] = [];
    if (matchAny(haystack, ["dry", "хуурай", "moist", "shea", "butter", "urea", "мочевин", "cracked", "хагар"])) bodyConcerns.push("dryness");
    if (matchAny(haystack, ["scrub", "peeling", "rough", "keratin", "барзгар", "хуулагч", "heel", "өсгий"])) bodyConcerns.push("roughness");
    if (matchAny(haystack, ["deodorant", "antiperspirant", "sweat", "odor", "odour", "хөлс", "үнэр"])) bodyConcerns.push("odor_sweat");
    if (matchAny(haystack, ["uv", "spf", "sun", "нар"])) bodyConcerns.push("sun_damage");
    if (matchAny(haystack, ["bath", "relax", "aroma", "massage", "ванн", "амрал", "массаж"])) bodyConcerns.push("relaxation");
    if (matchAny(haystack, ["baby", "kids", "хүүхд", "нялх"])) bodyConcerns.push("kids_safe");
    if (bodyConcerns.length) suggestions.bodyConcerns = Array.from(new Set(bodyConcerns));
  }

  // --- fragrancePreference (cross-category, only when explicitly stated) ---
  if (matchAny(haystack, ["unscented", "fragrance-free", "fragrance free", "үнэргүй"])) suggestions.fragrancePreference = "unscented";
  else if (matchAny(haystack, ["floral", "цэцэг", "rose", "сарнай", "lavender", "sakura", "jasmine"])) suggestions.fragrancePreference = "floral";
  else if (matchAny(haystack, ["citrus", "lemon", "жүрж", "лимон", "orange", "yuzu", "grapefruit"])) suggestions.fragrancePreference = "citrus";

  // --- wellnessInterests (health category only, multi) ---
  if (category === null || WELLNESS_CATEGORIES.has(category)) {
    const wellness: string[] = [];
    if (matchAny(haystack, ["vitamin", "витамин", "эрч хүч", "energy", "iron", "b12"])) wellness.push("energy");
    if (matchAny(haystack, ["digest", "хоол боловсруулалт", "probiotic", "enzyme", "fiber", "fibre", "lactic"])) wellness.push("digestion");
    if (matchAny(haystack, ["sleep", "нойр", "melatonin", "gaba", "relax"])) wellness.push("sleep");
    if (matchAny(haystack, ["immune", "дархлаа", "propolis", "manuka", "zinc"])) wellness.push("immune");
    if (matchAny(haystack, ["weight", "жин хянах", "diet", "slim", "burn", "carb"])) wellness.push("weight");
    if (wellness.length) suggestions.wellnessInterests = wellness;
  }

  return suggestions;
}
