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
    key: "push-body-abandoned-cart",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "Сагс орхисон push мэдэгдлийн текст",
    description: "Утасны push мэдэгдэл асаасан хэрэглэгчид сагсандаа бараа үлдээгээд 24 цаг өнгөрөхөд очно (гарчиг нь имэйлийнхтэй ижил). {нэр} = хэрэглэгчийн нэр.",
    fallbackValue: "{нэр}, таны сагсанд сонгосон бараа хүлээж байна. Нэг товшилтоор захиалгаа дуусгаарай.",
  },
  {
    key: "seo-google-site-verification",
    group: "SEO ба баталгаажуулалт",
    type: "text" as const,
    label: "Google Search Console баталгаажуулах код",
    description: "Search Console → Property → HTML tag: content=\"...\" доторх утгыг л буулгана. Хоосон бол tag гарахгүй.",
    fallbackValue: "",
  },
  {
    key: "seo-facebook-domain-verification",
    group: "SEO ба баталгаажуулалт",
    type: "text" as const,
    label: "Meta (Facebook) домэйн баталгаажуулах код",
    description: "Meta Business Suite → Brand safety → Domains → Meta-tag verification: content=\"...\" доторх утга. Business verification-д хэрэгтэй.",
    fallbackValue: "",
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
  // Post-delivery review request + reward (2026-09-14). The job asks each
  // buyer once, N days after their order is completed; a reward (store
  // credit) is granted the moment a verified-purchase review is posted.
  {
    key: "review-request-days",
    group: "Захиалга",
    type: "number" as const,
    label: "Сэтгэгдэл хүсэх хугацаа (захиалга дууссанаас хойш хэд хоног)",
    description: "Захиалга \"Дууссан\" болсноос хойш энэ хэдэн хоногийн дараа худалдан авагчид push/имэйлээр сэтгэгдэл бичихийг нэг удаа хүснэ. 0 = хүсэхгүй.",
    fallbackValue: "3",
  },
  {
    key: "review-reward-mnt",
    group: "Захиалга",
    type: "number" as const,
    label: "Сэтгэгдлийн урамшуулал (₮ дэлгүүрийн зээл)",
    description: "Худалдан авсан бараандаа сэтгэгдэл бичсэн хэрэглэгчид энэ дүнгээр дэлгүүрийн зээл автоматаар нэмэгдэнэ (нэг бараанд нэг л удаа — сэтгэгдэл бараа/хэрэглэгч бүрд нэг байдаг). 0 = урамшуулалгүй.",
    fallbackValue: "0",
  },
  {
    key: "email-subject-review-request",
    group: "Имэйлийн гарчиг",
    type: "text" as const,
    label: "Сэтгэгдэл хүсэх имэйлийн гарчиг",
    description: "",
    tokens: ["{захиалга}"] as const,
    fallbackValue: "SUGI ASAYAKE — {захиалга} захиалгын бараа таалагдсан уу?",
  },
  {
    key: "email-body-review-request",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "Сэтгэгдэл хүсэх имэйлийн текст",
    description: "{урамшуулал} нь \"Сэтгэгдлийн урамшуулал\" 0-ээс их үед л мөр болж орно.",
    tokens: ["{нэр}", "{захиалга}", "{урамшуулал}"] as const,
    fallbackValue: "Сайн байна уу, {нэр}!\n\nТаны {захиалга} захиалга хүрсэн байх гэж найдаж байна. Бараа таалагдсан эсэхээ 1 минутад бичиж бусад худалдан авагчид туслаарай: Профайл → Захиалга → тухайн бараа → Сэтгэгдэл үлдээх.{урамшуулал}\n\nБаярлалаа,\nSUGI ASAYAKE",
  },
  {
    key: "push-body-review-request",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "Сэтгэгдэл хүсэх push мэдэгдлийн текст",
    description: "",
    tokens: ["{нэр}", "{урамшуулал}"] as const,
    fallbackValue: "{нэр}, захиалсан бараа тань таалагдсан уу? Сэтгэгдлээ 1 минутад бичээрэй.{урамшуулал}",
  },
  // Customer return request window (2026-09-14): how many days after the
  // order is completed the profile still offers "Буцаах хүсэлт".
  {
    key: "return-window-days",
    group: "Захиалга",
    type: "number" as const,
    label: "Буцаалтын хүсэлт илгээх хугацаа (хоног)",
    description: "Захиалга дууссанаас хойш энэ хэдэн хоногийн дотор худалдан авагч профайлаасаа буцаалтын хүсэлт илгээж болно (/returns бодлоготой нийцүүлнэ). Хүсэлт нь зөвхөн мэдэгдэл — буцаалтыг ажилтан \"Буцаагдсан\" төлөв + буцаан олголтоор шийднэ.",
    fallbackValue: "14",
  },
  // Measurement (2026-09-14): GA4 and the Meta Pixel load ONLY after the
  // visitor accepts the matching cookie category (analytics / marketing),
  // from /vendor/analytics-init.js. Empty = tag never loads.
  {
    key: "analytics-ga4-measurement-id",
    group: "SEO ба баталгаажуулалт",
    type: "text" as const,
    label: "Google Analytics 4 Measurement ID",
    description: "analytics.google.com → Admin → Data streams → Web → \"G-XXXXXXXXXX\". Зочин \"Тоолуур\" күкийг зөвшөөрсний дараа л ачаалагдана; хоосон бол огт ачаалагдахгүй.",
    fallbackValue: "",
  },
  {
    key: "analytics-meta-pixel-id",
    group: "SEO ба баталгаажуулалт",
    type: "text" as const,
    label: "Meta (Facebook) Pixel ID",
    description: "business.facebook.com → Events Manager → Data sources → Pixel ID (15–16 орон). Зочин \"Маркетинг\" күкийг зөвшөөрсний дараа л ачаалагдана — Facebook сурталчилгааны хөрвүүлэлтийг (PageView, ViewContent, AddToCart, Purchase) хэмжинэ.",
    fallbackValue: "",
  },
  // Guest checkout phone verification (2026-09-14). "1" = a shopper with no
  // verified phone on their account must confirm the number on the order by
  // verify.mn SMS before the order is accepted; "0" = off (e.g. while the
  // verify.mn balance is empty). Signed-in shoppers registered by phone are
  // never asked twice.
  {
    key: "checkout-guest-phone-verification",
    group: "Захиалга",
    type: "text" as const,
    label: "Зочны захиалгад утас баталгаажуулах (1 = тийм, 0 = үгүй)",
    description: "1 бол бүртгэлгүй (эсвэл утасгүй) худалдан авагч захиалгаа батлахын өмнө утасны дугаараа verify.mn SMS-ээр баталгаажуулна — хуурамч бэлэн мөнгөний захиалгаас хамгаална. verify.mn-ийн үлдэгдэл дууссан үед 0 болгож түр унтраана.",
    fallbackValue: "1",
  },
  // Order SMS (2026-09-14). Off by default: Brevo transactional SMS credits
  // are needed (Интеграцууд → Brevo). When on, the shopper gets a text at
  // order time and on every status change, whether or not they gave an
  // email -- the one channel every Mongolian shopper has.
  {
    key: "sms-order-notifications",
    group: "Захиалга",
    type: "text" as const,
    label: "Захиалгын SMS мэдэгдэл (1 = тийм, 0 = үгүй)",
    description: "1 бол захиалга орох болон төлөв бүр солигдоход харилцагчийн утсанд SMS очно (Brevo SMS кредит шаардана). Имэйл/push-аас үл хамааран ажиллана.",
    fallbackValue: "0",
  },
  {
    key: "sms-body-order-placed",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "SMS — захиалга хүлээн авлаа",
    description: "Захиалга орох үед илгээх SMS. 160 тэмдэгтээс хэтэрвэл 2 мессеж болно.",
    tokens: ["{захиалга}", "{дүн}"] as const,
    fallbackValue: "SUGI ASAYAKE: {захиалга} захиалгыг хүлээн авлаа ({дүн}). Баталгаажмагц мэдэгдэнэ. Хянах: sugi.karkaron.com/track-order",
  },
  {
    key: "sms-body-order-status",
    group: "Мессежийн загвар",
    type: "text" as const,
    label: "SMS — захиалгын төлөв солигдлоо",
    description: "Төлөв бүр солигдоход илгээх SMS.",
    tokens: ["{захиалга}", "{төлөв}"] as const,
    fallbackValue: "SUGI ASAYAKE: {захиалга} захиалга — {төлөв}. Асуулт байвал 9450-9911.",
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
