/**
 * Каталогийн хоёр хэлний хайлтын үгсийн сан (2026-09-12).
 *
 * ШИЙДЭЖ БУЙ АСУУДАЛ, таамаглаагүй, амьд каталог дээр хэмжсэн:
 *
 *   - 937 нийтлэгдсэн барааны нэр бүгд цэвэр латин ("BA-YU Horse Oil Non-Silicone
 *     Shampoo"). Кирилл тэмдэгт агуулсан нь тэг.
 *   - Бараа бүрийн монгол текст нэг томьёолсон өгүүлбэр "<brand> брэндийн Японы
 *     жинхэнэ <type>." — тиймээс бараа монголоор яг НЭГ үгээр л олддог, 220-д нь
 *     (23%) тэр үг нь утгагүй "бүтээгдэхүүн". "S-SELECT White Clay Foam cleanser"-
 *     ийг ямар ч монгол үгээр олох боломжгүй байв.
 *   - Худалдан авагч монголоор бичдэг. Tom-ийн өөрийн жишээ: BA-YU морины тос хайж
 *     буй хүн "морины тос" эсвэл "морины шампунь" гэж бичнэ, ахмад харилцагчид
 *     зээлсэн үгийг сонсогдсоноор нь — "крем"-ийг "крэм", "шампунь"-ийг "шампуунь".
 *
 * ЗАСВАР: каталог биш query-г орчуулна. Доорх бичлэг бүр нэг ОЙЛГОЛТ бөгөөд түүнийг
 * илэрхийлэх бүх үгийг агуулна — монгол бичлэгүүд, латин галиг, барааны нэрэнд бодитоор
 * байдаг англи үг. Аль нэг үг таарвал бүх бүлэг татагдана: "морины тос" "horse" ба
 * "oil"-ийг ч хайж BA-YU-г олно, "нүүр угаагч" "cleanser"/"wash"/"facial"-д хүрч
 * өнөөх үл үзэгдэх 220 барааг олно.
 *
 * ЯАГААД DB-ИЙГ BACKFILL ХИЙХГҮЙ: 937 монгол тайлбарыг дахин бичих нь мөрөнд хөлдсөн
 * нэг удаагийн таамаг, алдаатай бичлэгийг ч хамрахгүй. Query өргөтгөх нь хоёуланг
 * хамарна, migration хэрэггүй, шинэ синоним энд нэг мөрөөр орно.
 *
 * Монгол тал амьд каталогийн бодитоор ашигладаг 199 ялгаатай төрлийн үгэнд, англи
 * тал барааны нэрэнд бодитоор тааралддаг үгэнд суурилсан (хоёулаа DB-ээс шууд
 * тоолсон).
 */

/**
 * One concept per line. Order inside a group does not matter -- every word
 * maps to every other. Keep entries lowercase; lookup lowercases the query.
 *
 * Multi-word entries ("шүдний оо") are matched as a phrase BEFORE the query
 * is split into single words, which is what makes the 2-letter "оо"
 * reachable at all: MySQL's FULLTEXT index has a 3-character minimum
 * (innodb_ft_min_token_size = 3 on this server, verified), so "оо" is not
 * in the index and `+оо*` matches nothing, which under the old all-terms-
 * required query zeroed the entire search -- "шүдний оо" returned 0 results
 * while 12 products were literally described with that exact phrase.
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // ---- Үсний бүтээгдэхүүн ----------------------------------------------
  ["шампунь", "шампун", "шампуунь", "шампуни", "шампү", "shampoo", "shampun"],
  ["кондиционер", "нөхөн сэргээгч", "conditioner", "rinse"],
  ["үс", "үсний", "толгойн", "hair"],
  ["самнуур", "сам", "comb"],
  ["үсний будаг", "hair color", "hair colour"],

  // ---- Тос, крем --------------------------------------------------------
  // "тос" covers both oil and cream in everyday Mongolian, and the
  // catalogue itself writes "тос (крем)" -- so both English words belong in
  // this group rather than being split into two.
  ["тос", "тосон", "oil", "cream", "tos"],
  ["крем", "крэм", "кремэн", "krem", "cream"],
  ["морь", "морины", "морин", "horse"],
  ["зөгийн бал", "бал", "honey"],
  ["нүүрс", "charcoal"],
  ["шавар", "шохой", "clay"],

  // ---- Арьс арчилгаа ----------------------------------------------------
  ["сэрум", "серум", "essence", "serum"],
  ["эссенц", "эссенци", "essence"],
  ["лосьон", "лосьён", "лосион", "lotion"],
  ["эмульси", "emulsion"],
  ["тоник", "toner"],
  // "sheet"/"pack" deliberately NOT here: they are packaging words, not
  // product types -- including them made "нүүрний маск" return 165 rows led
  // by "Repair Sheets Citrus Soap", a soap.
  ["маск", "маска", "нүүрний маск", "mask"],
  ["чийгшүүлэгч", "чийгшүүлэх", "moist", "moisture", "moisturizing", "hydra"],
  ["нарнаас хамгаалагч", "нарны", "sunscreen", "sun", "uv"],
  ["цэвэрлэгч", "цэвэрлэх", "цэвэрлэгээ", "cleansing", "cleanser", "clear"],
  ["нүүр угаагч", "нүүр угаах", "угаагч", "угаах", "wash", "cleanser", "foam"],
  ["хөгшрөлт", "хөгшрөлтийн", "үрчлээ", "anti-aging", "wrinkle", "aging"],

  // ---- Бие, гар ---------------------------------------------------------
  ["бие", "биеийн", "body"],
  ["бие угаагч", "body soap", "body wash"],
  ["саван", "савангийн", "soap", "savan", "savon"],
  ["гар", "гарын", "hand"],
  ["хөл", "хөлний", "foot", "feet"],
  ["хусуур", "сахлын", "razor", "shaver", "shaving"],
  ["хумс", "хумсны", "nail"],

  // ---- Нүүр будалт ------------------------------------------------------
  ["нүүр", "нүүрний", "face", "facial"],
  ["нүд", "нүдний", "eye"],
  ["уруул", "уруулын", "lip"],
  ["хөмсөг", "хөмсөгний", "eyebrow", "brow"],
  ["хацар", "хацрын", "cheek", "blush"],
  ["сормуус", "сормуусны", "маскара", "lash", "mascara"],
  ["будаг", "будалт", "color", "colour", "tint", "lipstick"],
  ["нунтаг", "нунтаг будаг", "powder"],
  ["харандаа", "liner", "pencil", "eyeliner"],
  ["суурь", "тон", "foundation", "bb", "cc"],
  ["согог далдлагч", "concealer"],
  ["будаг арчигч", "нүүр угаалга", "remover", "cleansing oil"],

  // ---- Ам, шүд ----------------------------------------------------------
  ["шүд", "шүдний", "tooth", "teeth", "dental"],
  ["шүдний оо", "оо", "toothpaste"],
  ["шүдний сойз", "toothbrush"],
  ["сойз", "brush"],
  ["аман хөндий", "амны", "mouth", "mouthwash"],

  // ---- Эрүүл ахуй -------------------------------------------------------
  ["салфетка", "норгосон салфетка", "нойтон", "wipes", "wet", "sheets"],
  ["хөвөн", "cotton", "puff"],
  ["боолт", "наалт", "bandage", "plaster"],
  ["угаалгын бодис", "угаалга", "detergent", "laundry"],
  ["ариутгагч", "халдваргүйжүүлэгч", "sanitizer", "disinfect"],
  ["агаар анхилуулагч", "үнэртэн", "fragrance", "deodorant", "air"],

  // ---- Эрүүл мэнд -------------------------------------------------------
  ["хоол тэжээлийн нэмэлт", "нэмэлт", "витамин", "supplement", "vitamin"],
  ["цай", "tea"],
  ["ундаа", "drink", "juice"],
  ["чихэр", "candy", "gummy"],
  ["коллаген", "collagen"],

  // ---- Ээж, хүүхэд ------------------------------------------------------
  ["хүүхэд", "хүүхдийн", "нялх", "baby", "kids", "child"],
  ["эрэгтэй", "эрэгтэйчүүдийн", "men", "man"],
  ["эмэгтэй", "эмэгтэйчүүдийн", "women", "woman", "ladies"],

  // ---- Бүтэц ------------------------------------------------------------
  ["гель", "гел", "gel"],
  ["хөөс", "foam"],
  ["сүү", "milk"],
  ["ус", "усан", "water", "aqua"],
  ["тослог арчигч цаас", "цаас", "paper", "blotting"],
  ["арчилгаа", "арчилгааны", "care", "treatment"],

  // ---- Материал, найрлага ------------------------------------------------
  // 2026-09-12, Tom: "silk гэж бичиж мэдэхгүй зөндөө хүн байгаа, тэр хүмүүс
  // торго гэж хайх байх" -- an ingredient or material printed in English on
  // the package is exactly what a shopper will look up in Mongolian.
  ["торго", "торгон", "silk"],
  ["ноос", "ноосон", "wool"],
  ["алоэ", "aloe"],
  ["сарнай", "сарнайн", "rose"],
  ["нимбэг", "нимбэгэн", "lemon", "citrus"],
  ["гаа", "мята", "мятa", "mint", "menthol"],
  ["ногоон цай", "matcha", "green tea"],
  ["жимс", "жимсэн", "fruit", "berry"],
  ["лаванда", "lavender"],
  ["вазелин", "vaseline", "petroleum"],
  ["мочевин", "мочевина", "urea"],
  ["коэнзим", "q10", "coenzyme"],
  ["хиалурон", "гиалурон", "hyaluronic", "hyaluron"],
  ["чацаргана", "seabuckthorn", "buckthorn"],
  ["хүнс", "хүнсний", "идэх", "edible", "food"],

  // ---- Арьсны байдал, асуудал --------------------------------------------
  // Derived by listing every English word that appears in 3+ of the 937
  // product names and checking which had no Mongolian route into them at
  // all. "skin" alone was in 24 names and unreachable in Mongolian.
  // Terminology checked against Mongolian beauty publishing (mn.oriflame.com,
  // ub.life) rather than translated word-for-word: "нүх сүв" and "мэдрэг
  // арьс" are what Mongolian sources actually print.
  ["арьс", "арьсны", "skin", "hada"],
  ["батга", "батганы", "тууралт", "acne", "pimple", "blemish"],
  ["нүх сүв", "сүв", "нүхжилт", "pore", "pores"],
  ["мэдрэг", "эмзэг", "sensitive", "mild"],
  ["цайруулагч", "цайруулах", "цайруулагч", "whitening", "brightening", "bright"],
  ["хуулагч", "хальслагч", "peeling", "scrub", "exfoliat"],
  
  ["нөхөн сэргээх", "гэмтсэн", "сэргээх", "repair", "damage", "damaged"],
  ["чангаруулах", "firming", "lift", "lifting"],
  ["тослог", "өөхлөг", "oily", "sebum"],
  ["хуурай", "хуурайшилт", "dry", "dryness"],

  // ---- Бүтээгдэхүүний хэлбэр ---------------------------------------------
  ["шингэн", "liquid"],
  ["шүршигч", "мананцар", "spray", "mist"],
  ["нөхөх сав", "нөхөх", "дүүргэгч", "refill"],
  ["дэвсгэр", "pad", "pads"],
  ["хөвөн мөс", "чихний мөс", "swab", "swabs"],
  ["алчуур", "towel", "towelette"],
  ["цаасан алчуур", "tissue", "tissues"],
  ["саваа", "stick"],
  ["хямсаа", "tweezers"],
  ["желе", "jelly"],
  ["хальс", "ороолт", "wrap", "film"],
  ["хиймэл шүд", "denture"],
  ["ширхэг", "багц", "pieces", "pack", "packs", "packets", "pcs", "sets", "sachets"],

  // ---- Шинж чанар --------------------------------------------------------
  ["зөөлөн", "soft", "gentle"],
  ["гүн", "deep"],
  ["нимгэн", "thin"],
  ["зузаан", "thick"],
  ["том", "large", "big"],
  ["дунд", "medium"],
  ["сэрүүн", "fresh", "refreshing", "cooling", "ice", "cool"],
  ["халуун", "hot", "warm"],
  ["байгалийн", "органик", "natural", "organic", "botanical"],
  ["эмийн", "эмчилгээний", "medicated", "medical", "pharma"],
  ["үнэргүй", "unscented", "fragrance-free"],
  ["үнэр", "анхилуун", "scent", "aroma", "perfume"],
  ["ус нэвтэрдэггүй", "усны хамгаалалттай", "waterproof"],
  ["удаан", "тогтвортой", "lasting", "long"],
  ["шөнийн", "night"],
  ["өдрийн", "өдөр тутмын", "daily", "day"],
  ["гоо сайхан", "гоо сайхны", "beauty", "makeup", "cosmetic"],
  ["дээд зэрэглэлийн", "премиум", "premium", "luxury"],
  ["амт", "амттай", "flavor", "flavour", "taste"],

  // ---- Бие, эрүүл мэндийн бусад ------------------------------------------
  ["массаж", "massage"],
  ["хоолой", "throat"],
  ["өвдөг", "knee"],
  ["хуруу", "finger"],
  ["цээж", "bust", "chest"],
  ["элэг", "liver"],
  ["спирт", "alcohol"],
  ["сод", "soda", "baking"],
  ["ванн", "усанд орох", "bath"],
  ["ургамал", "ургамлын", "herb", "herbal", "plant"],
  ["цэцэг", "цэцгийн", "flower", "floral", "bloom"],
  ["хандмал", "extract", "essence"],
  ["центелла", "cica", "centella", "asiatica"],
  ["турмерик", "turmeric"],
  ["манука", "manuka"],
  ["лютейн", "lutein"],
  ["спа", "spa"],
  ["гоймон", "noodle", "noodles", "somen"],

  // ---- Өнгө --------------------------------------------------------------
  ["цагаан", "white"],
  ["хар", "black"],
  ["улаан", "red"],
  ["ногоон", "green"],
  ["хөх", "цэнхэр", "blue"],
  ["ягаан", "pink"],
  ["бор", "хүрэн", "brown"],
];

/**
 * Informal Mongolian romanisation (2026-09-12, Tom: "заавал кириллээр
 * хүмүүс бичихгүй, утсаар зүгээр латинаар бичих ч хүн байгаа").
 *
 * Plenty of shoppers type Mongolian on a Latin keyboard -- "krem", "tos",
 * "shampun", "savan" -- because switching layouts on a phone is a nuisance.
 * There is no single correct romanisation and nobody types the official
 * one, so each ambiguous letter contributes its realistic alternatives and
 * the word is emitted in every combination.
 *
 * Generated rather than hand-listed: the dictionary above already carries
 * ~200 Mongolian words, and hand-writing 2-4 Latin spellings for each would
 * be both enormous and the thing that rots first when a synonym is added.
 */
const ROMANISATION: Record<string, string[]> = {
  а: ["a"], б: ["b"], в: ["v"], г: ["g"], д: ["d"], е: ["e"], ё: ["yo"],
  ж: ["j"], з: ["z"], и: ["i"], й: ["i"], к: ["k"], л: ["l"], м: ["m"],
  н: ["n"], о: ["o"], ө: ["u", "o"], п: ["p"], р: ["r"], с: ["s"], т: ["t"],
  у: ["u"], ү: ["u"], ф: ["f"], х: ["h", "kh"], ц: ["ts", "c"], ч: ["ch"],
  ш: ["sh"], щ: ["sh"], ъ: [""], ы: ["i"], ь: [""], э: ["e"], ю: ["yu"], я: ["ya"],
};

/** At most this many spellings per word -- the ambiguous letters multiply fast. */
const MAX_LATIN_VARIANTS = 4;

export function latinVariants(cyrillic: string): string[] {
  if (!/[а-яөүё]/i.test(cyrillic)) return [];
  let variants = [""];
  for (const char of cyrillic.toLowerCase()) {
    const options = ROMANISATION[char] ?? [char];
    const next: string[] = [];
    for (const prefix of variants) {
      for (const option of options) next.push(prefix + option);
      if (next.length >= MAX_LATIN_VARIANTS * 2) break;
    }
    variants = next.slice(0, MAX_LATIN_VARIANTS);
  }
  return Array.from(new Set(variants.filter(variant => variant.length >= 2)));
}

/**
 * Collapses doubled letters: "morinii" -> "morini", "shampuunь" -> ...
 *
 * Romanised Mongolian has no agreed spelling for long vowels, so the same
 * word arrives as "morini", "morinii" or "moriniy" depending on the typist.
 * Rather than enumerate those in the dictionary, an unknown word is looked
 * up a second time with its doubles collapsed, and the dictionary's own
 * keys are indexed the same way.
 */
const collapseDoubles = (word: string) => word.replace(/(.)\1+/g, "$1");

/**
 * word -> every word in the same concept (including itself).
 *
 * Groups that share a word are MERGED rather than left to overwrite each
 * other. Some overlaps are deliberate bridges -- "cream" belongs to both
 * "тос" (Mongolian uses one word for oil and cream) and "крем" -- and
 * without merging, the result depended on which group happened to be
 * declared last: "cream" found both concepts while "крем" found only one.
 * Building the union makes the dictionary order-independent, so a group can
 * be added anywhere in the list without silently changing another.
 */
const EXPANSION = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  // Each group also gains the Latin spellings of its Mongolian words, so a
  // shopper typing "shampun" or "morinii tos" lands in the same concept as
  // one typing "шампунь" or "морины тос".
  const merged = new Set<string>(group);
  for (const word of group) for (const variant of latinVariants(word)) merged.add(variant);
  // Pull in everything already reachable from any of these words.
  new Set(merged).forEach(word => EXPANSION.get(word)?.forEach(other => merged.add(other)));
  // Point every member -- old and new -- at the one merged set.
  merged.forEach(word => EXPANSION.set(word, merged));
}

/**
 * The same map keyed by collapsed spelling, consulted only when an exact
 * lookup misses -- see collapseDoubles. Built after EXPANSION so it covers
 * the generated Latin variants too.
 */
const COLLAPSED = new Map<string, Set<string>>();
EXPANSION.forEach((bucket, word) => {
  const key = collapseDoubles(word);
  if (!COLLAPSED.has(key)) COLLAPSED.set(key, bucket);
});

/** Exact match first, then the doubled-letter-tolerant one. */
const lookup = (word: string): Set<string> | undefined =>
  EXPANSION.get(word) ?? COLLAPSED.get(collapseDoubles(word));

/** Multi-word entries, longest first, so "шүдний оо" wins over "шүд". */
const PHRASES = Array.from(EXPANSION.keys()).filter(word => word.includes(" ")).sort((a, b) => b.length - a.length);

/**
 * Folds the spelling differences a shopper cannot be expected to get right.
 * Only collapses pairs that are genuinely interchangeable in Mongolian
 * transliterations of borrowed words -- it does NOT touch native spelling,
 * because "өө"/"үү" carry real meaning there.
 */
export function normaliseSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    // Latin letters carrying Mongolian diacritics, which some phone
    // keyboards produce ("hüühdiin savan"). Without this they were stripped
    // as punctuation, shredding the word into unmatchable fragments.
    .replace(/[üûú]/g, "u").replace(/[öôó]/g, "o").replace(/[äàá]/g, "a").replace(/[ëèé]/g, "e")
    .replace(/[^0-9a-zа-яөүё\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}


/**
 * Turns a shopper's query into one GROUP OF ALTERNATIVES per concept they
 * typed.
 *
 * "гарын тос" produces two groups -- [гар, гарын, hand] and
 * [тос, тосон, тослог, oil, cream] -- rather than one flat list of five
 * words. That distinction is what makes the results usable: searched as a
 * flat OR, the top hit for "гарын тос" was an oil-blotting PAPER, because
 * it matched one word strongly. Requiring one word from EACH group instead
 * returns hand creams, which is what was asked for.
 *
 * Words the dictionary does not know (a brand, a full product name) become
 * a group of one, so they are still required and still matched.
 */
export function expandQueryGroups(rawQuery: string): string[][] {
  const normalised = normaliseSearchText(rawQuery);
  if (!normalised) return [];

  const groups: string[][] = [];
  let remainder = normalised;

  // Phrases first: "шүдний оо" must resolve to toothpaste rather than being
  // split into "шүдний" plus an unindexable "оо".
  for (const phrase of PHRASES) {
    if (!remainder.includes(phrase)) continue;
    groups.push(Array.from(EXPANSION.get(phrase)!));
    remainder = remainder.replaceAll(phrase, " ");
  }

  for (const word of remainder.split(" ").filter(Boolean)) {
    const synonyms = lookup(word);
    groups.push(synonyms ? Array.from(synonyms) : [word]);
  }

  return groups;
}

/**
 * Every word from every group, flattened -- the widened fallback used when
 * requiring one word per group finds nothing at all.
 */
export function expandQuery(rawQuery: string): string[] {
  const seen = new Set<string>();
  for (const group of expandQueryGroups(rawQuery)) for (const word of group) seen.add(word);
  return Array.from(seen);
}

/** Does this query mean something to the dictionary at all? Used to decide whether widening is worth a second query. */
export const hasKnownSynonym = (rawQuery: string): boolean =>
  normaliseSearchText(rawQuery).split(" ").some(word => Boolean(lookup(word))) ||
  PHRASES.some(phrase => normaliseSearchText(rawQuery).includes(phrase));
