/**
 * Барааны төрөл (2026-09-20, migration 0090 `products.productType`).
 *
 * Ангилал ("Арьс арчилгаа") нь 445 барааг нэг хайрцагт хийдэг — санал болголт
 * 8 маск санал болгож, хайлт "цэвэрлэгч" гэдгийг ойлгодоггүй байв. Төрөл нь
 * routine-ий алхмын түвшин: цэвэрлэгч → тонер → серум → крем → нарны. Санал
 * болголтын хөдөлгүүр төрөл тус бүрээс дээд тал нь 2 (reco-max-per-product-type)
 * авч, хайлтын индекс төрлийн нэрийг concept болгож индекслэнэ. Утга нь
 * scripts/auto-tag-products.ts-ийн дүрмээр эсвэл admin-аас тавигдана.
 */
export const productTypeOptions = [
  { value: "cleanser", label: "Нүүр цэвэрлэгч" },
  { value: "makeup_remover", label: "Будаг арилгагч" },
  { value: "toner", label: "Тонер / лосьон" },
  { value: "essence", label: "Эссенц" },
  { value: "serum", label: "Серум / ампул" },
  { value: "cream", label: "Крем / эмульс" },
  { value: "mask", label: "Маск" },
  { value: "sunscreen", label: "Нарнаас хамгаалагч" },
  { value: "eye_care", label: "Нүдний арчилгаа" },
  { value: "lip_care", label: "Уруулын арчилгаа" },
  { value: "makeup", label: "Нүүр будалт" },
  { value: "shampoo", label: "Шампунь" },
  { value: "conditioner", label: "Кондиционер / treatment" },
  { value: "hair_styling", label: "Үс засалт / арчилгаа" },
  { value: "body_wash", label: "Бие угаагч / саван" },
  { value: "body_lotion", label: "Биеийн тос / лосьон" },
  { value: "hand_care", label: "Гар, хөлийн арчилгаа" },
  { value: "deodorant", label: "Дезодорант" },
  { value: "bath", label: "Ванн / усанд орох" },
  { value: "oral_care", label: "Ам, шүдний арчилгаа" },
  { value: "supplement", label: "Хоол тэжээлийн нэмэлт" },
  { value: "tea", label: "Цай / ундаа" },
  { value: "food", label: "Хүнс" },
  { value: "household", label: "Гэр ахуй / цэвэрлэгээ" },
  { value: "hygiene", label: "Эрүүл ахуйн хэрэгсэл" },
  { value: "baby", label: "Хүүхдийн бүтээгдэхүүн" },
  { value: "device", label: "Төхөөрөмж / хэрэгсэл" },
  { value: "gift_card", label: "Бэлгийн карт" },
  { value: "other", label: "Бусад" },
] as const;

export type ProductType = (typeof productTypeOptions)[number]["value"];
export const PRODUCT_TYPE_VALUES = productTypeOptions.map(option => option.value) as [ProductType, ...ProductType[]];
export const productTypeLabel = (value: string | null | undefined): string | null =>
  productTypeOptions.find(option => option.value === value)?.label ?? null;

/** Арьсны арчилгааны routine-ийн алхам болдог төрлүүд (санал болголтын диверс). */
export const SKINCARE_PRODUCT_TYPES: readonly ProductType[] = ["cleanser", "makeup_remover", "toner", "essence", "serum", "cream", "mask", "sunscreen", "eye_care", "lip_care"];
export const HAIR_PRODUCT_TYPES: readonly ProductType[] = ["shampoo", "conditioner", "hair_styling"];
export const BODY_PRODUCT_TYPES: readonly ProductType[] = ["body_wash", "body_lotion", "hand_care", "deodorant", "bath"];
