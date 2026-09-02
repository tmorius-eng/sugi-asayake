# NEWVISION — Isetan-структуртай нүүр хуудасны шинэчлэл

Энэ баримт бичиг нь SUGI ASAYAKE-ийн нүүр хуудсыг **isetankl.com.my** (Isetan Kuala Lumpur — Isetan Mitsukoshi Group-ийн Малайз дахь салбар, Токёод 1948 онд байгуулагдсан Японы жижиглэнгийн худалдааны сүлжээ) шиг мэдрэмжтэй болгох Tom-ийн тодорхой хүсэлтээр бичигдэв. Энэ бол хэрэгжүүлэлтийн явцад дагаж мөрдөх **батлагдсан төлөвлөгөө** (2026-09-02, plan mode-оор батлагдсан), `docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md`-тэй ижил зарчмаар (өмнөх Tier 0-21 нүүр хуудасны шинэчлэлийг удирдсан баримт бичиг) бичигдсэн.

**Bодит vision mockup** (статик HTML, SUGI-ийн бодит брэнд token/зураг/агуулгаар зохиосон, кодонд холбогдоогүй жишээ): https://claude.ai/code/artifact/24255eb8-36e7-44a3-b186-155dc9ca21d2

## 1. Яагаад Isetan, яагаад одоо

Өнгөрсөн сарын "Tier 0-21" reference-driven redesign хийгдсэн ч нүүр хуудас бодит бүтэц/ритмийн хувьд хэвээрээ **нэг тэгш хавтгай хуудас** хэвээр байна:
- **Хэрэглэгчийг тэвэрсэн, гараар гүйлгэдэг ("shelf") бараа-эгнээ нэг ч байхгүй** — `CategoryMasonry.tsx` бол статик 2 мөрийн grid, `SeasonalCampaignCarousel.tsx` бол нэг слайдтай fade carousel, зэрэгцэн гүйлгэдэг зүйл огт байхгүй.
- **Header нь бусад бүх хуудсаас тусдаа** — `Home.tsx`-ийн өөрийн inline header (hardcoded anchor nav, сагс/хүслийн жагсаалт/профайл огт байхгүй) `CommerceHeader.tsx`-аас (бодит сагсны тоо, хүслийн жагсаалт, профайл avatar-тай) бүрмөсөн ялгаатай.
- **Footer нь нэг эгнээ л агуулгатай**, олон баганат биш.

Isetan KL-ийн нүүр хуудас нь **editorial түүхийг барааны худалдаанаас өмнө тавьдаг** (анхны banner нь хямдрал биш "Autumn Flavours of Japan" улирлын түүх), full-width brand-story banner-уудыг carousel shelf-үүдтэй ("Shop Fragrance", "Shop Skincare", "Shop Home & Living", "Shop Wellness") ээлжлүүлдэг, итгэл/урамшууллын 3 самбар (triptych) хуудасны доод хэсэгт, олон баганат баялаг footer-ийн өмнө байрладаг.

## 2. Юу хийхгүй байгаа вэ (зохиомол агуулгын аудит)

Tom тодорхой заасан: **Isetan-ийн бүтэц/ритмийг SUGI-ийн бодит агуулгаар дүүргэнэ, хэзээ ч зохиохгүй.** Дараах Isetan-ийн элементүүд SUGI-д тохирох бодит зүйл байхгүй тул **бүрмөсөн орхигдоно**:
- Фашион бутик, ресторан/хоолны газар, idol-ийн (жишээ нь KLP48) collab-мерч — SUGI ямар ч ийм бараа/үйлчилгээ зардаггүй.
- Гаднын luxury брэндийн (D&G, SK-II, Lancôme) "brand takeover" banner — SUGI өөрийн болон импортолсон брэндүүдээр л ажилладаг.
- Зохиомол countdown timer, "эхний худалдан авалт" хямдралын код (одоогоор ийм код-концепц системд байхгүй), newsletter бүртгэл (backend байхгүй), гар утасны апп (байхгүй), Japan-ийн эх компанийн тусдаа сайт руу холбоос (байхгүй).
- Бизнесийн бүртгэлийн дугаар footer-т — бодит дугаар Tom-оос авахгүй бол зохиохгүй.

Эдгээрийг **орлуулах биш, зөвхөн хасна** — хоосон зайг зохиомол зүйлээр дүүргэхгүй.

## 3. Дизайны token — өөрчлөгдөхгүй

Tom тодорхой шийдвэрлэсэн: **SUGI-ийн одоогийн брэндийн өнгийг бүрэн хэвээр хадгална**, зөвхөн Isetan-ийн бүтэц/ритмийг зээлнэ:

```
--primary:  #df1f3d  (вермилион)
--accent:   #f0b52d  (алт)
--background: #f8f5ef  (буудайн цаас)
--foreground: #17181b  (харанхуй бичээс)
--sky:      #3970a7
--surface-dark: #17181b
--surface-dark-raised: #1f2024
--font-display: "Space Grotesk"
--font-body: "DM Sans"
```

Мөн SUGI-ийн бусад аль хэдийн тогтсон, **давтагдах брэндийн гарын үсэг**-ийг шинэ хэсгүүдэд ашиглана (үзэх боломжтой vision mockup дээр аль хэдийн ашигласан):
- `CommerceHeader.tsx`-ийн gradient дээд зурвас: `linear-gradient(90deg,#df1f3d 0 36%,#f0b52d 36% 54%,#3970a7 54% 72%,#97c6b8 72% 100%)`
- `.hero-image-sun`/`.care-sun-stamp`/`.final-cta-sun` — эргэсэн дугуй "sun stamp" badge мотив, hero/care/final-CTA-д давтагддаг.
- `.shop-search-panel`-ийн алтан sticker offset shadow: `8px 9px 0 rgba(240,181,45,.72)`.

## 4. Шинэ, дахин ашиглах боломжтой primitive-үүд

Tom тодорхой шаардсан: **зүгээр л одоо байгаа энгийн зүйлийг бага зэрэг тохируулаад орхихгүй, жинхэнэ шинэ компонент бичнэ.**

- **`client/src/components/home/CarouselShelf.tsx`** — SUGI-д огт байхгүй хэвтээ гүйлгэдэг shelf. Native `overflow-x:auto; scroll-snap-type:x proximity`, гараар бичсэн prev/next товч (`scrollBy`, ирмэгт хүрэхэд идэвхгүй болдог), гарын сум товчлуураар удирдах боломжтой. `emptyState`/`loading` prop-той (bestseller "хоосон бол нуух", recommended "үргэлж fallback-той" дисциплин шилжинэ). `prefers-reduced-motion: reduce` үед `behavior:"auto"` — sunrise-ribbon-ийн ганц онцгойлол хэвээрээ, энэ шинэ компонент онцгойлогдохгүй.
- **`ShelfProductCard.tsx`** — `Home.tsx`-д хоёр удаа давхардсан card JSX-г (bestseller/recommended) нэг компонент болгоно, `getSalePercent()`/`.shop-sale-badge`-ийг дахин ашиглана (шинээр зохиохгүй).
- **`EditorialBanner.tsx`** — SUGI-д байхгүй brand-story-takeover primitive. `variant: "image-right" | "image-left" | "full-bleed-dark"`, зөвхөн бодит `useSiteText`/`imageFor`-аас тэжээгддэг.
- **`TrustTriptych.tsx`** — `client/src/index.css`-ийн одоо ашиглагдахгүй байгаа `.membership-strip`/`.membership-panel` CSS-ийг дахин ашиглана.

## 5. "Топ брэндүүд" — бүрэн admin CRUD (Tom-ийн тодорхой засвар)

Анхны төлөвлөгөөнд орхигдсон байсныг Tom шууд зассан: **"Топ брэндүүд" заавал байх ёстой, /admin-аас бүгдийг нэмэх/хасах/засах боломжтой байх ёстой.**

Бодит өгөгдөл (Aiven-ээс шууд шалгасан): **167 давхцалгүй бодит брэнд** — S-Select 241 (SUGI-ийн өөрийн private label, 139 зурагтай), Daisy Doll 69 (69/69 зурагтай), SokaMocka 28, Club Suppin 23, PRIECLAT 21, Cocochi 16, T3 10, Arga 7, DRH+ 7.

**Шинэ хүснэгт** `featured_brands` (`product_categories`-ийн загвартай ижил): `id`, `brandName varchar(120)` (бодит `products.brand`-тай яг таарах ёстой, чөлөөт текст биш), `tagline text`, `photoUrl text` (админ upload хийхгүй бол тухайн брэндийн хамгийн сүүлд нэмэгдсэн бодит зурагтай бараагаар автоматаар бөглөгдөнө), `sortOrder int`, `isActive boolean`, timestamps.

**Шинэ CRUD** (`posts`-ийн create/update/delete загвараар): `getFeaturedBrands()` (public), `getAdminFeaturedBrands()`, `getDistinctRealBrands()` (админы dropdown-д зориулж бодит брэнд+тоог өгнө), `createFeaturedBrand`/`updateFeaturedBrand`/`deleteFeaturedBrand` (staff).

**Шинэ admin UI**: `AdminWorkspace.tsx`-д шинэ "Брэндүүд" sidebar section (Posts/Discount Codes-тэй ижил жинтэй, Content & Media-ийн дэд tab биш — учир нь гишүүнчлэл нь хувьсах тоотой). Жагсаалт (зураг, нэр, tagline, идэвхтэй эсэх, дараалал өөрчлөх дээш/доош товч, засах, устгах), нэмэх форм — **бодит брэндийн нэрийн dropdown** (чөлөөт текст биш, hэзээ ч хоосон бараа руу заахгүй).

**Дагалдах өөрчлөлт**: `shared/catalog-filter.ts`-д `filterCatalogBrand()` нэмэх (categoryName-тэй ижил exact-match), `Shop.tsx`-д `?brand=` URL параметр унших боломж — эс тэгвэл Топ брэндийн tile нь юу ч шүүхгүй холбоос болно.

## 6. "Юу ярьж байна" — бодит харилцагчийн сэтгэгдэл

Isetan-ийн "Let Customers Speak for Us" хэсгийн бодит эквивалент. Шинэ `getFeaturedReviews(limit=8)` (бодит, өндөр үнэлгээтэй (`rating>=4`), сэтгэгдэлтэй review-үүд), шинэ `reviews.featured` public procedure, шинэ `CustomerVoices.tsx` компонент.

**Шударга хоосон төлөв**: одоогоор бодит paid захиалга бараг байхгүй тул review нь мөн бараг байхгүй байж болно — тэгвэл энэ хэсэг **бүхэлдээ нуугдана** (bestseller rail-тай яг ижил дисциплин), хэзээ ч зохиомол review-гээр дүүргэхгүй.

## 7. Шинэ Home.tsx section дараалал

Header (нэгтгэгдсэн, §8) → Hero (өөрчлөгдөөгүй) → sunrise-ribbon (өөрчлөгдөөгүй) → **Топ брэндүүд** (шинэ) → **EditorialBanner** (өв түүх, `.story-section`-ийг орлоно) → WhyChooseUs (дээш зөөгдсөн) → **8 CarouselShelf** (bestseller + recommended + 6 ангилал, 2-3-аар бүлэглэж, дунд нь SeasonalCampaignCarousel editorial зогсоолт болгож байрлуулна) → QuickStatsSection (байрлал өөрчлөгдсөн, **дотоод логик хэвээрээ**) → **EditorialBanner** (гэр бүлийн арчилгаа) → JournalSection → **CustomerVoices** (шинэ, хоосон бол нуугдана) → StoreLocatorSection → **TrustTriptych** (шинэ) → эцсийн CTA → **шинэчлэгдсэн footer**.

## 8. Header/nav нэгтгэл

**`CommerceHeader.tsx` бүх хуудсанд, тэр дундаа Home-д ганц header болно.** Одоо байгаа бодит бүтэц (сагс/хүслийн жагсаалт/профайл) хэвээрээ, дээр нь заавал биш `marketingNav` prop нэмж (Home дээр л идэвхтэй) 2 дахь мөрөнд plain-text nav (Дэлгүүр/Брэндүүд/Салбарууд/Journal/Гишүүнчлэл + бодит `trpc.promotions.active`-аар шалгагдсан "Онлайн хямдрал"). Home-ийн одоогийн тусдаа header, dead CSS (`.site-header*`) устгагдана. Home бодит сагсны холболт авна (`trpc.cart.current.useQuery()`, `Shop.tsx`-тай яг адил). CommerceHeader хуваалцсан тул бусад бүх хуудсыг (Shop/ProductDetail/Profile/Checkout) regression шалгана.

## 9. Footer шинэчлэл

Шинэ `SiteFooter.tsx` (тусдаа компонент, ирээдүйд бусад хуудсанд ашиглахад бэлэн). Олон багана — Брэнд, Дэлгүүр (6 бодит ангилал), Тухай, Нөхцөл (`/privacy`, `/terms`, `/returns` — яг эдгээр 3, зохиомол `/faq`/`/shipping` үгүй), Холбоо барих (бодит утас/имэйл), Салбарууд (4 бодит салбар, Google Maps холбоостой). Хасагдсан, зохиомол биш зүйлс: Japan-ийн эх компанийн лого, апп татах badge, newsletter талбар, бизнесийн бүртгэлийн дугаар.

## 10. Шинэ CMS slot-ууд

`home-text-story-*` slot-уудыг өв түүхийн banner-т дахин ашиглана (slotKey сольохгүй — админы хийсэн засвар алдагдахгүй). Шинэ бүлгүүд: 6 ангиллын shelf + 2 curated rail (eyebrow/view-all label), Топ брэндийн гарчиг, CustomerVoices гарчиг, trust triptych (3× гарчиг/тайлбар), footer tagline. Нэг шинэ media slot `home-heritage-banner`. Migration шаардлагагүй (`site_text`/`site_media` нь plain varchar slotKey). `featured_brands` (§5) энэ төлөвлөгөөний цорын ганц бодит schema migration.

## 11. Шинэ backend query-ууд

`server/db.ts`: `getCategoryShelfProducts`/`getHomeCategoryShelves` (6 ангиллын shelf, нөөцтэй эхэлж, борлуулалтаар эрэмбэлнэ), `getFeaturedBrands`/CRUD (§5), `getFeaturedReviews` (§6). `server/routers.ts`: `catalog.categoryShelves`, `catalog.featuredBrands`, `reviews.featured` (public), `admin.featuredBrands`/`distinctRealBrands`/create/update/delete (staff).

## 12. Tier-by-tier хэрэгжүүлэлтийн төлөвлөгөө

`docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md`-ийн Tier загвараар:

- **Tier 0** — суурь baseline, одоогийн байдлыг screenshot хийж баримтжуулах.
- **Tier 1** — CarouselShelf + ShelfProductCard + BrandTileCard (тусад нь, хуудсанд холбогдоогүй).
- **Tier 2** — EditorialBanner + TrustTriptych (тусад нь).
- **Tier 3** — Backend (categoryShelves, featuredBrands + migration, featuredReviews).
- **Tier 4** — Admin "Брэндүүд" CRUD UI.
- **Tier 5** — `Home.tsx` дараалал өөрчлөх + шинэ CMS slot-ууд + TopBrands + CustomerVoices холбох.
- **Tier 6** — Header нэгтгэл + сагсны холболт + бусад хуудсын regression шалгалт.
- **Tier 7** — Footer.
- **Tier 8** — Бүрэн баталгаажуулалт (§13).

## 13. Баталгаажуулалтын чеклист

`pnpm check` + `pnpm build` цэвэр (шаардлагатай ч хангалтгүй). `pnpm exec vitest run --no-file-parallelism` ногоон. Түр `pnpm add -D playwright -w` → screenshot 1440/1024/768/430/390/375/320px, зочин **ба** бодит throwaway нэвтэрсэн хэрэглэгч (header-ийн сагс/жагсаалт/профайл төлөвт зориулж) → хэвтээ overflow 0, console алдаа 0 → `reducedMotion:"reduce"` эмуляц → гарын товчлуураар shelf/header ажиллах эсэх → **CustomerVoices-ийн шударга хоосон төлөв, Топ брэндийн admin CRUD урсгалыг бодит throwaway admin-аар шалгах** → Shop/ProductDetail/Profile/Checkout-ийн бүрэн regression → Playwright устгах (`git checkout -- package.json pnpm-lock.yaml && pnpm install`).

## 14. Phase 2 — Shop & Product Detail (ирээдүйн ажил, одоо хийгдэхгүй)

- Isetan-ийн density-toggle (жижиг/том grid) → `Shop.tsx`-ийн grid-т (client-side localStorage сонголт).
- Isetan-ийн гүн faceted filter → `shared/catalog-filter.ts`-ийн category/skin-type pill дээр үнийн зурвас/брэнд нэмэх (энэ session-д нэмсэн `filterCatalogBrand` энэ ажлын эхний хэсэг аль хэдийн бэлэн).
- Isetan-ийн "Pairs well with" cross-sell → `ProductDetail.tsx`-ийн одоо байгаа `catalog.related` rail-ыг шинэ `CarouselShelf`/`ShelfProductCard`-аар дахин зурах.
- Энэ Phase 2 өөрийн тусдаа review/төлөвлөгөөний үе шаардана, энэ баримт бичигт зөвхөн чиглэлийг тэмдэглэв.

## Чухал файлууд

`client/src/pages/Home.tsx`, `client/src/components/CommerceHeader.tsx`, `client/src/components/home/CategoryMasonry.tsx`, `client/src/components/home/CarouselShelf.tsx`/`ShelfProductCard.tsx`/`BrandTileCard.tsx`/`EditorialBanner.tsx`/`TrustTriptych.tsx`/`TopBrands.tsx`/`CustomerVoices.tsx` (шинэ), `client/src/components/SiteFooter.tsx` (шинэ), `client/src/components/AdminWorkspace.tsx`, `drizzle/schema.ts` + шинэ migration, `server/db.ts`, `server/routers.ts`, `shared/site-text.ts`, `shared/site-media.ts`, `shared/catalog-filter.ts`, `client/src/pages/Shop.tsx`, `client/src/index.css`.
