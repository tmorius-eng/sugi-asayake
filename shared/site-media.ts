export const siteMediaSlots = [
  {
    key: "home-hero",
    label: "Нүүр хуудасны гол зураг",
    description: "Нүүр хуудасны эхний том banner зураг.",
    fallbackUrl: "/manus-storage/sugi-sunrise-editorial-hero_463a81c8.jpg",
  },
  {
    key: "home-categories",
    label: "Бүтээгдэхүүний ангиллын зураг",
    description: "Үндсэн ангиллын editorial зураг.",
    fallbackUrl: "/manus-storage/sugi-professional-assortment_74fa4e31.jpg",
  },
  {
    key: "home-family",
    label: "Гэр бүлийн арчилгааны зураг",
    description: "Гэр бүлийн арчилгааны хэсгийн зураг.",
    fallbackUrl: "/manus-storage/sugi-professional-family_07753755.jpg",
  },
  {
    key: "home-category-arhis-archilgaa",
    label: "Ангиллын зураг: Арьс арчилгаа",
    description: "Нүүр хуудасны Categories хэсгийн \"Арьс арчилгаа\" картын зураг.",
    fallbackUrl: "/manus-storage/catalog/products/69/organic-sugar-squalane_4d846540.jpg",
  },
  {
    key: "home-category-goo-saikhan",
    label: "Ангиллын зураг: Гоо сайхан",
    description: "Нүүр хуудасны Categories хэсгийн \"Гоо сайхан\" картын зураг.",
    fallbackUrl: "/manus-storage/catalog/products/550/sokamocka-makeup-remover-oil_cbd97a5a.jpg",
  },
  {
    key: "home-category-eruul-mend",
    label: "Ангиллын зураг: Эрүүл мэнд",
    description: "Нүүр хуудасны Categories хэсгийн \"Эрүүл мэнд\" картын зураг.",
    fallbackUrl: "/manus-storage/catalog/products/163/morimori-coffee_f163ce05.jpg",
  },
  {
    key: "home-category-eruul-akhui",
    label: "Ангиллын зураг: Эрүүл ахуй",
    description: "Нүүр хуудасны Categories хэсгийн \"Эрүүл ахуй\" картын зураг.",
    fallbackUrl: "/manus-storage/catalog/products/168/dental-beauty-care_d580f8bc.jpg",
  },
  {
    key: "home-category-us-ba-bie",
    label: "Ангиллын зураг: Үс ба бие",
    description: "Нүүр хуудасны Categories хэсгийн \"Үс ба бие\" картын зураг.",
    fallbackUrl: "/manus-storage/catalog/products/150/bayu_b7aca8ad.jpg",
  },
  {
    key: "home-category-eej-ba-khuukhed",
    label: "Ангиллын зураг: Ээж ба хүүхэд",
    description: "Нүүр хуудасны Categories хэсгийн \"Ээж ба хүүхэд\" картын зураг.",
    fallbackUrl: "/manus-storage/catalog/products/275/milk-save-blend_d14e5ce4.jpg",
  },
  {
    key: "home-stores",
    label: "Салбарын хэсгийн зураг",
    description: "Салбар, байршлын editorial зураг.",
    fallbackUrl: "/manus-storage/sugi-care-retail_e5616f81.jpg",
  },
  {
    key: "summer-slide-1",
    label: "Зуны banner 01",
    description: "ASAYAKE SUMMER carousel-ийн эхний зураг.",
    fallbackUrl: "/manus-storage/sugi-sunrise-editorial-hero_463a81c8.jpg",
  },
  {
    key: "summer-slide-2",
    label: "Зуны banner 02",
    description: "ASAYAKE SUMMER carousel-ийн хоёр дахь зураг.",
    fallbackUrl: "/manus-storage/sugi-professional-assortment_74fa4e31.jpg",
  },
  {
    key: "summer-slide-3",
    label: "Зуны banner 03",
    description: "ASAYAKE SUMMER carousel-ийн гурав дахь зураг.",
    fallbackUrl: "/manus-storage/sugi-professional-family_07753755.jpg",
  },
] as const;

export type SiteMediaSlotKey = (typeof siteMediaSlots)[number]["key"];

export const siteMediaSlotKeys = siteMediaSlots.map(slot => slot.key) as [SiteMediaSlotKey, ...SiteMediaSlotKey[]];

export const getSiteMediaSlot = (key: SiteMediaSlotKey) =>
  siteMediaSlots.find(slot => slot.key === key)!;
