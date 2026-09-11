import { UB_DELIVERY_FEE_MNT } from "./const";

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase A): the registry
 * behind the new store_settings table (drizzle/schema.ts) -- business-rule
 * values that were previously hardcoded TypeScript (a constant or an inline
 * template-literal string) and required a code deploy to change. Same
 * pattern as shared/site-text.ts's slot registry: `key` is a stable
 * settingKey (varchar, not an enum -- no migration needed for more
 * settings later), `fallbackValue` is the CURRENT real value already live
 * in code (copied verbatim from its source constant), not a new/invented
 * default -- an admin override replaces it, clearing it restores exactly
 * today's behavior.
 *
 * `type: "number"` settings are stored as their string form and parsed with
 * `Number(...)` by readers (server/db.ts's getStoreSettingNumber) --
 * store_settings.settingValue is a varchar for both kinds, same as every
 * other slotKey->value table in this app.
 *
 * `type: "text"` message-template settings are deliberately scoped to PURE
 * PROSE ONLY -- every one of these strings is verified (server/routers.ts)
 * to contain zero runtime placeholders (no order number, item lines, totals,
 * customer name, tracking ref). Anything with a placeholder stays
 * code-owned, exactly matching site-text.ts's "editable prose + code-owned
 * structure" boundary for the homepage's 2-line headings.
 */
export const storeSettingSlots = [
  // ---- Холбоо барих (Contact) — 2026-09-12 ------------------------------
  // The shop's own contact facts. Before this group existed, the phone
  // number was hardcoded in 9 files / 17 places, the email in 3, and the
  // opening hours in a code constant -- changing the shop's phone number
  // meant a code deploy touching every page's footer, the store locator,
  // the /shop CTA, the profile support tab and all three legal documents.
  //
  // `contact-phone-tel` is deliberately SEPARATE from `contact-phone`:
  // one is the human-readable label ("9450-9911"), the other is what goes
  // into a `tel:` href, which must not contain the hyphen. Deriving one
  // from the other by stripping non-digits would work today but silently
  // break the moment a country code or extension is added, so both are
  // explicit -- the same "never infer a functional value from a display
  // value" rule site-text.ts applies to category titles.
  {
    key: "contact-phone",
    group: "Холбоо барих",
    type: "text" as const,
    label: "Утасны дугаар (харагдах хэлбэр)",
    description: "Сайт даяар (footer, салбарын хэсэг, /shop, профайл) харагдах утасны дугаар.",
    fallbackValue: "9450-9911",
  },
  {
    key: "contact-phone-tel",
    group: "Холбоо барих",
    type: "text" as const,
    label: "Утасны дугаар (залгах холбоос)",
    description: "Дарахад залгагдах жинхэнэ дугаар. Зай, зураасгүй, зөвхөн цифр (жишээ: 94509911).",
    fallbackValue: "94509911",
  },
  {
    key: "contact-email",
    group: "Холбоо барих",
    type: "text" as const,
    label: "Холбоо барих имэйл",
    description: "Footer, профайлын тусламж, хуулийн хуудсанд харагдах имэйл хаяг.",
    fallbackValue: "asayake0307@gmail.com",
  },
  {
    key: "contact-branch-hours",
    group: "Холбоо барих",
    type: "text" as const,
    label: "Салбаруудын ажиллах цаг",
    description: "Бүх салбарт нэг ижил ажиллах цаг (салбар бүрээр өөр бол Салбарууд хэсгээс тус тусад нь бичнэ).",
    fallbackValue: "Өдөр бүр 11:00–20:00",
  },
  {
    key: "contact-facebook-url",
    group: "Холбоо барих",
    type: "text" as const,
    label: "Facebook хуудасны холбоос",
    description: "Footer-ийн Facebook icon. Icon-ыг нуухын тулд холбоосын оронд \"-\" бичнэ (http-ээр эхлээгүй утгыг холбоос биш гэж үзэж, icon-ыг харуулахгүй).",
    fallbackValue: "https://www.facebook.com/AsayakeJapaneseDrugstore/",
  },
  {
    key: "contact-instagram-url",
    group: "Холбоо барих",
    type: "text" as const,
    label: "Instagram хуудасны холбоос",
    description: "Footer-ийн Instagram icon. Icon-ыг нуухын тулд холбоосын оронд \"-\" бичнэ.",
    fallbackValue: "https://www.instagram.com/asayake_japan_cosmetics/",
  },

  // ---- Хүргэлт (Delivery) — Phase B --------------------------------------
  {
    key: "delivery-fee-ub-mnt",
    group: "Хүргэлт",
    type: "number" as const,
    label: "Хүргэлтийн үнэ (Улаанбаатар доторх, ₮)",
    description: "shared/const.ts-ийн UB_DELIVERY_FEE_MNT-ийн одоогийн бодит утга -- өөрчлөхөд шинэ захиалгын хүргэлтийн үнэ шууд шинэчлэгдэнэ.",
    // Borrows the real constant rather than repeating "10000" as a second
    // literal -- shared/const.ts stays the one canonical number, this is
    // just its string form for the settings row.
    fallbackValue: String(UB_DELIVERY_FEE_MNT),
  },
  {
    key: "free-shipping-threshold-mnt",
    group: "Хүргэлт",
    type: "number" as const,
    label: "Хүргэлт үнэгүй болох доод дүн (₮, 0 = идэвхгүй)",
    description: "Захиалгын дүн энэ хэмжээнээс их бол хүргэлтийн төлбөр автоматаар 0 болно. 0 гэдэг нь энэ дүрэм идэвхгүй гэсэн үг.",
    fallbackValue: "0",
  },

  // ---- Мессежийн загвар (Message templates) — Phase C --------------------
  // Each key below mirrors one entry of server/routers.ts's
  // orderStatusMessages record exactly (same current wording as
  // fallbackValue), plus the one placeholder-free closing line inside
  // sendOrderConfirmationEmail.
  {
    key: "email-order-status-confirmed",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "Захиалга баталгаажсан үеийн мессеж",
    description: "Захиалгын статус \"Баталгаажсан\" болоход илгээгдэх мессежийн текст.",
    fallbackValue: "Таны захиалгыг баталгаажууллаа.",
  },
  {
    key: "email-order-status-packed",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "Захиалга бэлтгэгдсэн үеийн мессеж",
    description: "Захиалгын статус \"Бэлтгэсэн\" болоход илгээгдэх мессежийн текст.",
    fallbackValue: "Таны захиалгыг бэлтгэж дууслаа.",
  },
  {
    key: "email-order-status-out_for_delivery",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "Хүргэлтэд гарсан үеийн мессеж",
    description: "Захиалгын статус \"Хүргэлтэд гарсан\" болоход илгээгдэх мессежийн текст.",
    fallbackValue: "Таны захиалга хүргэлтэд гарлаа.",
  },
  {
    key: "email-order-status-completed",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "Захиалга дууссан үеийн мессеж",
    description: "Захиалгын статус \"Дууссан\" болоход илгээгдэх мессежийн текст.",
    fallbackValue: "Таны захиалга амжилттай хүргэгдлээ. Худалдан авалт хийсэнд баярлалаа!",
  },
  {
    key: "email-order-status-cancelled",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "Захиалга цуцлагдсан үеийн мессеж",
    description: "Захиалгын статус \"Цуцалсан\" болоход илгээгдэх мессежийн текст.",
    fallbackValue: "Таны захиалгыг цуцаллаа. Асуух зүйл байвал бидэнтэй холбогдоно уу.",
  },
  {
    key: "email-order-status-returned",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "Захиалга буцаагдсан үеийн мессеж",
    description: "Захиалгын статус \"Буцаагдсан\" болоход илгээгдэх мессежийн текст.",
    fallbackValue: "Таны захиалгыг буцаагдсан гэж тэмдэглэлээ. Асуух зүйл байвал бидэнтэй холбогдоно уу.",
  },
  {
    key: "email-order-confirmation-closing",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "Захиалга баталгаажсан имэйлийн төгсгөл өгүүлбэр",
    description: "Захиалга баталгаажсан имэйлийн хамгийн сүүлийн (баярлалаа гэсэн) өгүүлбэр.",
    fallbackValue: "Захиалгынхаа явцыг веб сайтаас харах боломжтой. Худалдан авалт хийсэнд баярлалаа!",
  },

  // ---- Имэйлийн гарчиг ба бусад загвар (2026-09-12) ---------------------
  // The block above is placeholder-free prose by design. These are not: an
  // order-confirmation subject line without the order number in it is
  // useless in an inbox. Rather than abandon that discipline, they declare
  // exactly which tokens they accept -- `tokens` is enforced at write time
  // (server/routers.ts rejects an unknown {...} before it can be saved), so
  // a typo surfaces as an admin error instead of reaching a customer's
  // inbox as literal "{zahialga}".
  {
    key: "email-subject-order-confirmation",
    group: "Имэйлийн гарчиг",
    type: "text" as const,
    label: "Захиалга баталгаажсан имэйлийн гарчиг",
    description: "Хэрэглэгчийн inbox-д харагдах мөр.",
    tokens: ["{захиалга}"] as const,
    fallbackValue: "SUGI ASAYAKE — Захиалга баталгаажлаа ({захиалга})",
  },
  {
    key: "email-subject-order-status",
    group: "Имэйлийн гарчиг",
    type: "text" as const,
    label: "Захиалгын төлөв өөрчлөгдсөн имэйлийн гарчиг",
    description: "",
    tokens: ["{захиалга}"] as const,
    fallbackValue: "SUGI ASAYAKE — Захиалга {захиалга}: шинэчлэлт",
  },
  {
    key: "email-subject-back-in-stock",
    group: "Имэйлийн гарчиг",
    type: "text" as const,
    label: "Бараа дахин нөөцөд орсон имэйлийн гарчиг",
    description: "Хүслийн жагсаалтад нэмсэн бараа дахин нөөцөд орох үед илгээгдэнэ.",
    tokens: ["{бараа}"] as const,
    fallbackValue: "SUGI ASAYAKE — \"{бараа}\" дахин нөөцөд орлоо",
  },
  {
    key: "email-body-back-in-stock",
    group: "Имэйлийн гарчиг",
    type: "text" as const,
    label: "Бараа дахин нөөцөд орсон имэйлийн бие",
    description: "",
    tokens: ["{бараа}"] as const,
    fallbackValue: "Таны хүслийн жагсаалтад байгаа \"{бараа}\" бүтээгдэхүүн дахин нөөцөд орлоо. Дуусахаас өмнө SUGI ASAYAKE дэлгүүрийн \"{бараа}\" хуудсаас шалгаарай.",
  },
  {
    key: "email-subject-abandoned-cart",
    group: "Имэйлийн гарчиг",
    type: "text" as const,
    label: "Сагс орхисон сануулгын гарчиг",
    description: "Сагсандаа бараа үлдээгээд 24 цаг өнгөрсөн хэрэглэгчид илгээгдэнэ.",
    fallbackValue: "SUGI ASAYAKE — Сагсандаа юм үлдсэн байна",
  },
  {
    key: "email-body-abandoned-cart",
    group: "Имэйлийн гарчиг",
    type: "text" as const,
    label: "Сагс орхисон сануулгын бие",
    description: "Нэр нь тодорхойгүй хэрэглэгчид \"хүндэт харилцагч\" гэж орно.",
    tokens: ["{нэр}"] as const,
    fallbackValue: "Сайн байна уу, {нэр}!\n\nТаны сагсанд сонгосон бүтээгдэхүүн хэвээр хадгалагдаж байна. Захиалгаа өнөөдөр дуусгаад, дуртай зүйлээ гартаа авчих боломжтой.\n\nАсуух зүйл байвал бидэнтэй холбогдоно уу.",
  },
  {
    key: "email-subject-low-stock-digest",
    group: "Имэйлийн гарчиг",
    type: "text" as const,
    label: "Нөөц дуусч буй барааны мэдэгдлийн гарчиг (эзэнд)",
    description: "Энэ имэйл зөвхөн дэлгүүрийн эзэнд (OWNER_EMAIL) өдөрт нэг удаа очно, харилцагчид очихгүй.",
    tokens: ["{тоо}"] as const,
    fallbackValue: "SUGI ASAYAKE — {тоо} бараа нөөц дуусч байна",
  },
] as const;

/**
 * Fills a template's declared tokens. Anything not in `values` is left
 * exactly as typed -- a template that somehow carries an unknown token is
 * printed literally rather than silently blanked, which makes the mistake
 * visible instead of producing a sentence with a hole in it.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  let filled = template;
  for (const [token, value] of Object.entries(values)) filled = filled.replaceAll(token, value);
  return filled;
}

/** Every `{...}` token a template actually contains -- used to validate an admin's edit. */
export const tokensIn = (template: string): string[] => template.match(/\{[^}\s]+\}/g) ?? [];

export type StoreSettingKey = (typeof storeSettingSlots)[number]["key"];

export const storeSettingKeys = storeSettingSlots.map(slot => slot.key) as [StoreSettingKey, ...StoreSettingKey[]];

export const getStoreSettingSlot = (key: StoreSettingKey) =>
  storeSettingSlots.find(slot => slot.key === key)!;
