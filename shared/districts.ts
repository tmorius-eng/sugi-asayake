// Улаанбаатарын 9 албан ёсны дүүрэг + УБ-аас гадуур эсвэл parse хийгдэхгүй бүхэнд
// нэг catch-all. Утгууд романчлагдсан/англи (энэ кодын enum-ийн дотоод утгын конвенц
// — drizzle/schema.ts-ийн skinType), монгол дэлгэцийн шошго энд тусдаа, shared/
// catalog-filter.ts-ийн skinTypeLabels-тэй ижил хуваалт.
export const ubDistricts = ["baganuur", "bagakhangai", "bayangol", "bayanzurkh", "nalaikh", "songinokhairkhan", "sukhbaatar", "khan_uul", "chingeltei", "other"] as const;

export type UbDistrict = (typeof ubDistricts)[number];

export const ubDistrictLabels: Record<UbDistrict, string> = {
  baganuur: "Багануур",
  bagakhangai: "Багахангай",
  bayangol: "Баянгол",
  bayanzurkh: "Баянзүрх",
  nalaikh: "Налайх",
  songinokhairkhan: "Сонгинохайрхан",
  sukhbaatar: "Сүхбаатар",
  khan_uul: "Хан-Уул",
  chingeltei: "Чингэлтэй",
  other: "Бусад / Улаанбаатараас гадна",
};

/**
 * Best-effort district guess from a free-text delivery address (the
 * checkout/address-book field has always been a plain textarea — see
 * userAddresses/orders in drizzle/schema.ts — so this is what backfills
 * deliveryDistrict for every order placed before the district dropdown
 * existed, and is also reused by the dropdown's own "letting the customer
 * confirm" flow rather than trusting free text alone going forward).
 * Checks full Cyrillic names, common Cyrillic district abbreviations
 * (e.g. "ХУД" = Хан-Уул дүүрэг, seen in this app's own store addresses —
 * see the locations array in Home.tsx), and romanized spellings, since
 * real customer-entered Mongolian addresses mix all three freely. Returns
 * null (not "other") when nothing matches, so the caller can distinguish
 * "genuinely outside UB" from "couldn't tell" — see PROFILE-ANALYTICS note
 * in server/analytics.ts.
 */
/**
 * 🔴 2026-09-23: БҮТЭН нэрүүдийг ЭХЛЭЭД, товчлолуудыг ДАРАА нь, товчлол бүрийг
 * үгийн хил дотор.
 *
 * Өмнө нь нэг жагсаалт байсан бөгөөд эхний таарсан нь буцдаг байв. 2–3
 * үсгийн товчлолууд нь ЭНГИЙН үгийн дотор таардаг: `худ` нь
 * "Худалдааны"-д, `нд` нь "Өндөр"/"Индустри"/"Гандан"-д. Улмаас "Налайх
 * дүүрэг, Худалдааны гудамж" → khan_uul, "Багахангай дүүрэг, Индустрийн
 * гудамж" → nalaikh гэж БУРУУ ангилагдаж, хүргэлтийн дүүрэг ба аналитикийн
 * "дүүрэг" хуваарилалт Хан-Уул/Налайх тал руу хазайдаг байв.
 */
const districtFullNamePatterns: [UbDistrict, RegExp][] = [
  ["bayanzurkh", /баянзүрх|bayanzurkh/i],
  ["songinokhairkhan", /сонгинохайрхан|сонгино|songinokhairkhan|songino/i],
  ["sukhbaatar", /сүхбаатар|sukhbaatar/i],
  ["bayangol", /баянгол|bayangol/i],
  ["khan_uul", /хан[\s-]?уул|khan[\s-]?uul/i],
  ["chingeltei", /чингэлтэй|chingeltei/i],
  ["nalaikh", /налайх|nalaikh/i],
  ["baganuur", /багануур|baganuur/i],
  ["bagakhangai", /багахангай|bagakhangai/i],
];

/** Товчлолууд — зөвхөн бие даасан үг байх үед (өмнө/хойно нь үсэг байхгүй). */
const districtAbbreviationPatterns: [UbDistrict, RegExp][] = [
  ["bayanzurkh", /(?<![\p{L}\p{N}])(?:бзд|bzd)(?![\p{L}\p{N}])/iu],
  ["songinokhairkhan", /(?<![\p{L}\p{N}])(?:схд|shd)(?![\p{L}\p{N}])/iu],
  ["sukhbaatar", /(?<![\p{L}\p{N}])(?:сбд|sbd)(?![\p{L}\p{N}])/iu],
  ["bayangol", /(?<![\p{L}\p{N}])(?:бгд|bgd)(?![\p{L}\p{N}])/iu],
  ["khan_uul", /(?<![\p{L}\p{N}])(?:худ|hud)(?![\p{L}\p{N}])/iu],
  ["chingeltei", /(?<![\p{L}\p{N}])чд(?![\p{L}\p{N}])/iu],
  ["nalaikh", /(?<![\p{L}\p{N}])нд(?![\p{L}\p{N}])/iu],
  ["baganuur", /(?<![\p{L}\p{N}])бнд(?![\p{L}\p{N}])/iu],
  ["bagakhangai", /(?<![\p{L}\p{N}])бхд(?![\p{L}\p{N}])/iu],
];

export function guessDistrictFromAddress(address: string | null | undefined): UbDistrict | null {
  if (!address) return null;
  for (const [district, pattern] of districtFullNamePatterns) {
    if (pattern.test(address)) return district;
  }
  for (const [district, pattern] of districtAbbreviationPatterns) {
    if (pattern.test(address)) return district;
  }
  return null;
}
