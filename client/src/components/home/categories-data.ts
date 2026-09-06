import { BadgeCheck, CircleCheck, Flower2, Gift, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";

// 2026-09-04 cohesion audit: Home.tsx and Shop.tsx each hardcoded their own
// independent copy of "the 6 real product categories" -- different order,
// different detail copy, and Shop's version only listed 4 of the 6 (missing
// "Эрүүл ахуй" and, until reordered here, drifting on which number went with
// "Ээж ба хүүхэд"). If a category is ever renamed or a 7th added, only
// fixing one of the two lists would silently leave the other stale. Single
// source of truth now, same pattern as this folder's own locations-data.ts
// for store branches.
//
// slug matches the real product_categories.slug values (confirmed against
// backups/sugi-catalog-export-2026-08-27.sql). imageUrl is one real,
// currently-published product photo per category (queried directly from the
// DB, not invented/stock imagery) -- CategoryMasonry falls back to
// shared/catalog-filter.ts's getCategoryPlaceholderImage(slug) if that photo
// is ever unpublished/removed. `tone` is only used by Shop.tsx's empty-catalog
// discovery cards (a decorative color treatment, not a real link) -- Home's
// CategoryMasonry uses Icon/imageUrl instead.
export const categories: { number: string; title: string; detail: string; slug: string; Icon: LucideIcon; imageUrl: string; tone: string }[] = [
  { number: "01", title: "Арьс арчилгаа", detail: "Өдөр тутмын цэвэр, зөөлөн арчилгаа", slug: "arhis-archilgaa", Icon: Flower2, imageUrl: "/cdn/catalog/products/69/organic-sugar-squalane_4d846540.jpg", tone: "rose" },
  { number: "02", title: "Гоо сайхан", detail: "Японы сонгомол хэрэгцээт бүтээгдэхүүн", slug: "goo-saikhan", Icon: Sparkles, imageUrl: "/cdn/catalog/products/550/sokamocka-makeup-remover-oil_cbd97a5a.jpg", tone: "cobalt" },
  { number: "03", title: "Эрүүл мэнд", detail: "Өдөр тутмын сайн сайхны найдвартай сонголт", slug: "eruul-mend", Icon: ShieldCheck, imageUrl: "/cdn/catalog/products/163/morimori-coffee_f163ce05.jpg", tone: "marigold" },
  { number: "04", title: "Эрүүл ахуй", detail: "Гэр бүлд хэрэгтэй цэвэр, аюулгүй хэрэглээ", slug: "eruul-akhui", Icon: BadgeCheck, imageUrl: "/cdn/catalog/products/168/dental-beauty-care_d580f8bc.jpg", tone: "mint" },
  { number: "05", title: "Үс ба бие", detail: "Өдөр бүрийн арчилгааг илүү хялбар болгоно", slug: "us-ba-bie", Icon: CircleCheck, imageUrl: "/cdn/catalog/products/150/bayu_b7aca8ad.jpg", tone: "peach" },
  { number: "06", title: "Ээж ба хүүхэд", detail: "Зөөлөн, хэрэгцээт сонголтууд", slug: "eej-ba-khuukhed", Icon: Gift, imageUrl: "/cdn/catalog/products/275/milk-save-blend_d14e5ce4.jpg", tone: "sand" },
];
