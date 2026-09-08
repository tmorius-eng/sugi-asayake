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
] as const;

export type StoreSettingKey = (typeof storeSettingSlots)[number]["key"];

export const storeSettingKeys = storeSettingSlots.map(slot => slot.key) as [StoreSettingKey, ...StoreSettingKey[]];

export const getStoreSettingSlot = (key: StoreSettingKey) =>
  storeSettingSlots.find(slot => slot.key === key)!;
