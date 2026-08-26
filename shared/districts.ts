// Ulaanbaatar's 9 official дүүрэг (districts) + a catch-all for anything
// outside UB or unparseable. Values are romanized/English (matching this
// codebase's convention for enum internals — see skinType in
// drizzle/schema.ts) with the Mongolian display label kept separately here,
// same split as skinTypeLabels in shared/catalog-filter.ts.
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
const districtPatterns: [UbDistrict, RegExp][] = [
  ["bayanzurkh", /баянзүрх|бзд|bayanzurkh|bzd/i],
  ["songinokhairkhan", /сонгинохайрхан|сонгино|схд|songinokhairkhan|songino|shd/i],
  ["sukhbaatar", /сүхбаатар|сбд|sukhbaatar|sbd/i],
  ["bayangol", /баянгол|бгд|bayangol|bgd/i],
  ["khan_uul", /хан[\s-]?уул|худ|khan[\s-]?uul|hud/i],
  ["chingeltei", /чингэлтэй|чд|chingeltei/i],
  ["nalaikh", /налайх|нд|nalaikh/i],
  ["baganuur", /багануур|бнд|baganuur/i],
  ["bagakhangai", /багахангай|бхд|bagakhangai/i],
];

export function guessDistrictFromAddress(address: string | null | undefined): UbDistrict | null {
  if (!address) return null;
  for (const [district, pattern] of districtPatterns) {
    if (pattern.test(address)) return district;
  }
  return null;
}
