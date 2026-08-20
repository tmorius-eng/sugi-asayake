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
