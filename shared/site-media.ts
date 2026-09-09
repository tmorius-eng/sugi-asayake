export const siteMediaSlots = [
  {
// 2026-09-09 deep audit: the four original brand-default objects
// (sugi-sunrise-editorial-hero_463a81c8.jpg, sugi-professional-assortment_74fa4e31.jpg,
// sugi-professional-family_07753755.jpg, sugi-care-retail_e5616f81.jpg) no longer
// exist in R2 -- every one returned 404, so the admin "BRAND DEFAULT" previews
// were broken and the home-stores slot (which has no upload) rendered nothing.
// The same photographs exist in R2 as Tom's own admin uploads under
// site-media/1/, which is what the fallbacks point at now. If those objects
// are ever deleted, re-upload the four photos and update these URLs.
    key: "home-hero",
    label: "Нүүр хуудасны гол зураг",
    description: "Нүүр хуудасны эхний том banner зураг.",
    fallbackUrl: "/cdn/site-media/1/sugi-professional-hero-1787734159733_30cd8572_a22051fe.webp",
  },
  {
    key: "home-categories",
    label: "Бүтээгдэхүүний ангиллын зураг",
    description: "Үндсэн ангиллын editorial зураг.",
    fallbackUrl: "/cdn/site-media/1/sugi-care-retail-1787207973163_8520a6e3_a3beb549.webp",
  },
  {
    key: "home-family",
    label: "Гэр бүлийн арчилгааны зураг",
    description: "Гэр бүлийн арчилгааны хэсгийн зураг.",
    fallbackUrl: "/cdn/site-media/1/sugi-professional-family-1787207997215_9cd7f13d_9c5e5e05.webp",
  },
  {
    key: "home-category-arhis-archilgaa",
    label: "Ангиллын зураг: Арьс арчилгаа",
    description: "Нүүр хуудасны Categories хэсгийн \"Арьс арчилгаа\" картын зураг.",
    fallbackUrl: "/cdn/catalog/products/69/organic-sugar-squalane_4d846540.jpg",
  },
  {
    key: "home-category-goo-saikhan",
    label: "Ангиллын зураг: Гоо сайхан",
    description: "Нүүр хуудасны Categories хэсгийн \"Гоо сайхан\" картын зураг.",
    fallbackUrl: "/cdn/catalog/products/550/sokamocka-makeup-remover-oil_cbd97a5a.jpg",
  },
  {
    key: "home-category-eruul-mend",
    label: "Ангиллын зураг: Эрүүл мэнд",
    description: "Нүүр хуудасны Categories хэсгийн \"Эрүүл мэнд\" картын зураг.",
    fallbackUrl: "/cdn/catalog/products/163/morimori-coffee_f163ce05.jpg",
  },
  {
    key: "home-category-eruul-akhui",
    label: "Ангиллын зураг: Эрүүл ахуй",
    description: "Нүүр хуудасны Categories хэсгийн \"Эрүүл ахуй\" картын зураг.",
    fallbackUrl: "/cdn/catalog/products/168/dental-beauty-care_d580f8bc.jpg",
  },
  {
    key: "home-category-us-ba-bie",
    label: "Ангиллын зураг: Үс ба бие",
    description: "Нүүр хуудасны Categories хэсгийн \"Үс ба бие\" картын зураг.",
    fallbackUrl: "/cdn/catalog/products/150/bayu_b7aca8ad.jpg",
  },
  {
    key: "home-category-eej-ba-khuukhed",
    label: "Ангиллын зураг: Ээж ба хүүхэд",
    description: "Нүүр хуудасны Categories хэсгийн \"Ээж ба хүүхэд\" картын зураг.",
    fallbackUrl: "/cdn/catalog/products/275/milk-save-blend_d14e5ce4.jpg",
  },
  {
    key: "home-stores",
    label: "Салбарын хэсгийн зураг",
    description: "Салбар, байршлын editorial зураг.",
    fallbackUrl: "/cdn/site-media/1/sugi-care-retail-1787207973163_8520a6e3_a3beb549.webp",
  },
  // 2026-09-08 (Tom, direct): SeasonalCampaignCarousel hasn't rendered on
  // the homepage since 2026-09-06 (see shared/site-text.ts's matching
  // home-text-summer-* retirement comment) -- these 3 image slots were
  // missed at the time and kept showing in admin Content & Media as if
  // still live/editable, which is exactly what Tom flagged. Retired here
  // the same way; the component itself (SeasonalCampaignCarousel.tsx)
  // stays in the repo, unrendered, in case it's ever reused.
] as const;

export type SiteMediaSlotKey = (typeof siteMediaSlots)[number]["key"];

export const siteMediaSlotKeys = siteMediaSlots.map(slot => slot.key) as [SiteMediaSlotKey, ...SiteMediaSlotKey[]];

export const getSiteMediaSlot = (key: SiteMediaSlotKey) =>
  siteMediaSlots.find(slot => slot.key === key)!;
