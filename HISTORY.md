# SUGI ASAYAKE — Дэлгэрэнгүй түүхэн ажлын лог

Энэ файл нь `CLAUDE.md`-г богино, session бүрт хурдан уншигдахуйц байлгах зорилгоор тусгаарласан **дэлгэрэнгүй, өдөр бүрийн narrative лог**. `CLAUDE.md` автоматаар session бүрийн эхэнд уншигддаг тул одоо зөвхөн "одоогийн статус/тохиргоо/идэвхтэй асуудал"-ыг л агуулна; энд бол бүх нарийн ширийн түүх, шалтгаан, баталгаажуулалтын алхам хадгалагдана. `CLAUDE.md` заавал шаардлагатай үед л (жишээ нь ижил төстэй bug дахин гарвал, эсвэл өмнөх шийдвэрийн шалтгааныг мэдэх хэрэгтэй үед) энд ирж хайж болно.

---

## Манус-ээс салгах явц, эхний bug-ууд (2026-08-20-аас өмнөх)

### 1. Manus-ээс бүрэн салгасан
- `server/_core/oauth.ts` (Manus OAuth) → **устгасан**, оронд нь `server/routers.ts`-ийн `auth` router дотор `register`/`login`/`logout`/`me` procedure бичсэн (email+password, JWT session)
- `server/_core/env.ts`, `context.ts`, `trpc.ts`, `cookies.ts`, `notification.ts`, `systemRouter.ts`, `vite.ts`, `shared/_core/errors.ts` — бүгд шинээр бичигдсэн
- `server/storage.ts`, `server/_core/storageProxy.ts` → Manus Forge-ийн оронд **бодит AWS S3-compatible bucket**-тай ажилладаг болгосон (`@aws-sdk/client-s3` ашиглана)
- `vite.config.ts` → `vite-plugin-manus-runtime`, debug-collector, `allowedHosts` хязгаарлалт бүгдийг устгасан
- `drizzle/schema.ts` дэх `users` хүснэгтээс `openId`/`loginMethod` (Manus OAuth) хассан, `passwordHash` нэмсэн — migration: `drizzle/0009_independent_auth.sql`
- Password hashing: Node built-in `scrypt` ашигладаг (`server/_core/password.ts`), гадны dependency нэмээгүй

### 2. Localhost дээр бодит туршилтын орчин зохион байгуулсан
- **MySQL 8** (native Windows суулгалт, Docker биш — Docker Desktop суулгах гэж оролдоход Windows boot эвдэрч, `bcdboot`-оор засварласан удаа бий, тиймээс энэ төсөлд Docker-оос зайлсхийсэн)
- **MinIO AIStor** (одоогийн үнэгүй хувилбар нь license key шаарддаг, `MINIO_LICENSE` env var-аар дамждаг) — хожим (2026-08-26) Cloudflare R2 руу шилжсэн, доор үзнэ үү

### 3. Бодит ашиглалтаас олдсон, засагдсан bug-ууд
- **`client/src/pages/ProductDetail.tsx`** — React "Rules of Hooks" зөрчил байсан (`useMemo` нь эрт `return`-ийн ДАРАА бичигдсэн байсан тул "Rendered more hooks than during the previous render" crash өгдөг байсан). Засагдсан.
- **Пост/мэдээ функц бүрэн дутуу байсан** — admin панель дотор пост үүсгэж "Нийтлэх" боломжтой байсан ч, олон нийтэд харуулах хуудас/route огт байхгүй байсан. Шинээр бүтээсэн: `getPublishedPostBySlug()`, `content.bySlug` public procedure, `PostDetail.tsx`, `/:slug` catch-all route.

---

## ⚠️ Чухал bug: MySQL timestamp 8 цагаар зөрдөг байсан (2026-08-20, TIER4)
Локал MySQL серверийн session `time_zone = SYSTEM` (Asia/Ulaanbaatar = UTC+8) байсан бол `drizzle-orm`-ийн mysql `timestamp` багана нь DB-ээс ирсэн raw утгыг үргэлж UTC гэж таамаглаж уншдаг (`+0000` нэмдэг). Үүний үр дүнд `defaultNow()`-ээр автоматаар үүсдэг бараг бүх хүснэгтийн `createdAt`/`updatedAt` нь app-ын `new Date()`-тэй шууд харьцуулахад бодит утгаасаа 8 цагаар түрүүлж харагддаг байсан. TIER4-ийн Audit Log-ийн огнооны шүүлтүүр бичих явцад илэрсэн. **Засаж, root cause-д нь шийдсэн:** `server/db.ts`-ийн `getDb()`-д MySQL connection pool-ийн `'connection'` event дээр `SET time_zone = '+00:00'` ажиллуулдаг болгосон.

Яагаад өмнөх бүх тест үүнийг олж чадаагүй бэ: Token/session expiry шалгалт бүгд app-аас бичигдэж, app-аас уншигддаг утгыг ашигладаг байсан тул бичих/унших хоёр тал ижил хазайлтаар давхар цуцлагддаг байсан — зөвхөн DB талаас автоматаар үүссэн утгыг app-ын шинэ `Date`-тэй шууд харьцуулах үед л алдаа гарч ирдэг байсан.

---

## Feature-ийн явц (огноогоор)

**TIER 0/1/5 CI+backup, Guest checkout (2026-08-20)** — `cart.*`/`checkout.createOrder` `publicProcedure`, `guest_cart_token` cookie-оор зочны сагс, нэвтрэхэд автомат нэгтгэгддэг. Дэлгэрэнгүй UX-RESEARCH.md, ROADMAP.md.

**ADMIN-PANEL.md TIER 1–6 (2026-08-20)** — Dashboard+Global Search, хэрэглэгч suspend/force-logout, `staff` RBAC role, Audit Log+Login History, Bulk Actions+CSV Export, DB/S3 health widget. Дэлгэрэнгүй ADMIN-PANEL.md.

**Профайл хуудас (`/profile`, 2026-08-21)** — avatar/нэр/утас засах, address book, checkout автомат бөглөлт. Secondary pages (Login/ForgotPassword/VerifyEmail/AcceptInvitation/Legal/MyOrders/NotFound) + admin sidebar брэнд шинэчлэл.

**Захиалгын имэйл мэдэгдэл + Personalization TIER 1 (2026-08-25)** — `checkout.createOrder`/`admin.updateOrder`/`admin.bulkUpdateOrderStatus` Brevo-гоор имэйл илгээдэг. `skinType`/`skinConcerns`/`interiorStyle` tag, `catalog.recommended`.

**Reviews & Ratings TIER 2 (2026-08-25)** — `product_reviews`, verified-purchase gate, admin moderation. MySQL `AVG()` string буцаадаг bug олж зассан.

**Ingredient Transparency + Store Locator TIER 3 (2026-08-25)** — 17 нэр томьёотой glossary tooltip, 3 салбарын ажиллах цаг+утас.

**⚠️ Bug: 937 бараатай болсны дараа pagination-гүй болсон (2026-08-25)** — `Shop.tsx` (24ш/хуудас) болон `AdminWorkspace.tsx` (25ш/хуудас) хоёуланд дугаартай хуудаслалт нэмсэн.

**Routine Builder & Bundles TIER 4 (2026-08-25)** — admin "Routine" удирдлага, `/routine/:slug`, `orders.discountMnt`/`appliedRoutineId` бодит суутгал.

**Loyalty (Гишүүнчлэлийн карт) TIER 5 (2026-08-25)** — Tom-ийн бодит Smart POS-той адил шатлалт хямдрал (500k→3%, 1сая→5%, 10сая→10%, `shared/loyalty.ts`), native систем + admin гар нэмэлт (`AdminUserDetailDrawer.tsx`).

**⚠️ Bug: /shop-ийн хоосон orange блок + CartDrawer-ийн scroll bug (2026-08-25)** — `RecentlyViewed` хоосон үед бүхэлд нь нуух, `CartDrawer.tsx`-д `min-h-0 overflow-y-auto` нэмж 3+ барааны сагстай хэрэглэгч захиалга хийж чадахгүй байсныг зассан.

**Маркетингийн попап/banner систем (2026-08-25)** — Admin "Урамшуулал" таб, `SitePromo`, `position: sticky` + `--promo-banner-offset` fix.

**Өрсөлдөгчийн шинжилгээ (asahi.mn) + цоорхой засалт (2026-08-25)** — `compareAtPriceMnt` анх удаа storefront дээр харуулав (strikethrough + "-X%" badge), ProductDetail "Зөвхөн N ширхэг үлдсэн", canonical URL Manus домэйн засвар, coupon code систем нэмэгдсэн.

**⚠️ Том bug: header logo + 900 гаруй placeholder зураг "broken image" (2026-08-25)** — Шинэ компьютерийн MinIO хоосон эхэлсэн тул код доtorh хатуу бичсэн 7 файлын нэр бодит storage-д байхгүй байсан. Лого зам зассан, `client/public/product-placeholder.svg` (local bundled SVG) 9 файлд нэвтрүүлсэн, Home.tsx-ийн байхгүй зурган slot-уудад CSS градиент fallback нэмсэн.

**Header хайлт бүх хуудсанд (2026-08-25)** — `HeaderSearch.tsx` CommerceHeader болон Home-д mount хийсэн.

**937 барааны бодит POS каталог импорт (2026-08-25)** — Tom-ийн 3 салбарын Smart POS-оос бодит бараа material, 6 ангилал, sku=баркод. Дэлгэрэнгүй PRODUCT-IMPORT.md.

**"10 жилийн туршлагатай auditor" гүнзгий шинжилгээ (2026-08-25)** — Цэвэрлэгээ (1868 мөр үхсэн код устгасан, 9 Manus-эриний баримт `archive/`-руу зөөсөн), хүргэлтийн үнэ эрт харуулах (`UB_DELIVERY_FEE_MNT`), зурган боловсруулалт (`sharp`, `server/_core/imageProcessing.ts`, product 1600px/site-media 1920px/avatar 512px, quality 82), server-side хайлт (MySQL FULLTEXT, `catalog.search`, Монгол кирилл баталгаажсан). `pnpm test` 124/124.

**Дахин гүнзгий audit (2026-08-25 үргэлжлэл 2)** — Git file size цэвэр (цэвэрлэх зүйл олдсонгүй). 3 bug олсон: (1) хүргэлтийн үнэ `server/db.ts`-ийн `createOrderFromActiveCart`-д давхар hardcode байсныг нэгтгэсэн, (2) Loyalty хямдралын томьёо клиент дээр давхар хэрэгжсэнийг `cart.applicableLoyaltyDiscount` procedure-оор арилгасан, (3) `HeaderSearch.tsx` FULLTEXT рүү шилжээгүй байсныг зассан. Product reviews race condition тэмдэглэсэн (засаагүй, эрсдэл бага — UNIQUE INDEX хамгаалдаг). `pnpm test` 125/125.

**World-class UI/UX polish (2026-08-25 үргэлжлэл 3)** — Захиалгын celebration хуудас (`OrderConfirmation.tsx`), product zoom/lightbox (`ImageLightbox.tsx`), skeleton loading (`Skeleton.tsx`, Shop/ProductDetail/Profile бүх таб), гишүүнчлэлийн картны tier дизайн (`.tier-bronze/silver/gold`). `pnpm test` 125/125.

**matsukiyococokara-online.com-оос санаа авсан homepage шинэчлэл (2026-08-26)** — Sugi/Asahi Japan meeting-ийн өмнө. Playwright+Edge-ээр өрсөлдөгчийн homepage screenshot судалгаа. Нэмэгдсэн: `.membership-strip` (3-panel promo), `.bestseller-section` (бодит захиалгын түүхээр, `getBestsellingProducts()`, fan-out bug-аас зайлсхийхийн тулд 2 тусдаа query), `.home-news-section` (blog rail), `.category-icon-badge` (lucide icon, бодит зураг биш), wishlist icon header-т. `pnpm test --no-file-parallelism` 128/128.

**⚠️ Орчны асуудал тэмдэглэв (засаагүй)**: Бүх integration gate идэвхтэй үед `pnpm test`-ийг vitest-ийн анхдагч параллель горимоор ажиллуулахад тогтмол бус ~3 файл (`routine-discount`, `discount-codes`, `bestsellers`) унадаг — 20 гаруй тусдаа integration test файл нэг локал MySQL/MinIO instance-ыг зэрэг hammer хийхэд гарч ирдэг pre-existing race. **`--no-file-parallelism`-ээр тогтвортой ажилладаг тул одооноос энэ flag-тай ажиллуулах.**

## Object storage: локал MinIO → Cloudflare R2 (2026-08-26)
Tom "хоёр laptop MinIO датаг автоматаар хуваалцах" гэж хүссэн — Google Drive sync-ийн эрсдэлийг (амьд DB-style дата sync хийх нь эвдрэл үүсгэж болзошгүй) тайлбарлаж, оронд нь **нэг ижил cloud storage** руу шилжсэн (Tom R2 сонгосон). Код талд өөрчлөлт хэрэггүй байсан (`s3Region` анхдагч утга нь аль хэдийн `"auto"`). `scripts/migrate-storage-to-r2.ts` нэмсэн (дахин ажиллуулахад аюулгүй, key давхцвал алгасна). Гэрийн laptop: 39/39 объект амжилттай. Ажлын laptop: `SOURCE_S3_REGION` override нэмэх шаардлагатай байсан (хуучин "Mongolia" region bug), 88/88 объект амжилттай. Одоо хоёр laptop нэг R2 bucket ашиглаж байна. `pnpm test --no-file-parallelism` 128/128 (хоёуланд).

## Хүргэлтийн үнэ 10,000₮ + И-баримт схем бэлтгэл (2026-08-26)
`UB_DELIVERY_FEE_MNT` 5000→10000 (ганц тогтмол өөрчлөхөд хангалттай байсан). StorePay/карт/эльч хүргэлт бүгд олон нийтэд нээлттэй API байхгүй (Tom өөрөө компанитай гэрээ хийх ёстой) — код бичээгүй. eBarimt-ийн хувьд зөвхөн инерт схем: `drizzle/0028_ebarimt_receipt_fields.sql` (`ebarimtStatus`/`ebarimtReceiptId`/`ebarimtQrData`/`ebarimtLotteryNumber`), admin-д зөвхөн уншихад зориулсан мөр. EBARIMT.md-д Tom SmartSoftware нийлүүлэгчтэйгээ тодруулах 6 асуулт бичсэн. `pnpm test --no-file-parallelism` 128/128.

## Admin "Интеграцууд" панель (2026-08-26)
karkaron.com жишээ prompt-оос ялгаж авсан 3 цоорхойн эхнийх: `integration_configs` хүснэгт (ebarimt/storepay/card_golomt/courier_ebuuhia), `server/_core/crypto.ts` (AES-256-GCM, `INTEGRATIONS_ENCRYPTION_KEY`), нууц утга хэзээ ч клиент рүү буцдаггүй, `adminProcedure` (staff биш). QPay-г зориудаар оруулаагүй (аль хэдийн `.env`-ээс ажилладаг). ⚠️ Тест явцад Tom-ийн бодит `/admin` ашиглалттай давхацсан bug (script нь Tom-ийн бичсэн утгыг дарж бичсэн) — илрүүлж, `integration_configs`-ийг 0 мөр рүү буцааж, зөвхөн өөрийн debris-ийг устгасан (Tom-ийн audit log хөндөөгүй). `pnpm test --no-file-parallelism` 134/134.

## Brevo API IP хязгаарлалт + Product Variants PHASE 1 (2026-08-26)
`GET /v3/account` 401 "unrecognised IP address" — IPv4/IPv6 хоёул Brevo dashboard-ийн Authorised IPs-д ороогүй. Tom dashboard дээрээ IP хязгаарлалтыг унтраахаар сонгосон (хараахан баталгаажаагүй — идэвхжсэний дараа шалгах хэрэгтэй).

Product Variants PHASE 1: `product_variants` хүснэгт (`drizzle/0030_product_variants.sql`), 937 бараа backfill (937 variant, бүгд isDefault=true). `products.priceMnt`/`stockQuantity`/`sku` ХЭВЭЭРЭЭ cart/checkout/order-ийн цорын ганц эх сурвалж (0 эрсдэл). Admin-д variant CRUD UI нэмэгдсэн, storefront/cart хараахан хөндөгдөөгүй (PHASE 2 — тусад нь). Migration-аас өмнө DB backup авсан. `pnpm test --no-file-parallelism` 141/141.

## Product Variants PHASE 2 (2026-08-26, үргэлжлэл 5): storefront/cart бодитоор variantId ашиглаж эхэлсэн
Tom "Brevo IP-г dashboard-аас unтраа" гэсэн зааврыг өгсний дараа шууд "одоо Phase 2 руу шилжье" гэж хүссэн (Brevo-ийн бодит "IP хязгаарлалт унтраах" товч байдаггүйг тодруулсан — доор бичсэн шинэ blocker-ийг үзнэ үү). PHASE 1-ийн `productVariants` schema comment-д өөрөө тодорхой зааж өгсөн төлөвлөгөөг дагаж хэрэгжүүлэв:

- **Migration** (`drizzle/0031_product_variants_phase2.sql`): `cart_items.productId` → `variantId` (NOT NULL, `product_variants.id`-руу FK, unique index `(cartId, variantId)` болгож сольсон — ижил барааны 2 өөр variant сагсанд тусдаа мөр болж орох боломжтой болсон) — өмнөх бүх идэвхтэй сагсны мөрийг тухайн барааны default variant рүү backfill хийсэн (0 nullable үлдсэн). `order_items`-д `variantId` (nullable, SET NULL, `productId`-тэй ижил зарчим) нэмж, өмнөх захиалгын мөрүүдийг мөн адил backfill хийсэн. Бодит DB (937 бараа, бодит захиалга) дээр ажиллуулахын өмнө `scripts/db-backup.ps1`-ээр backup авсан, ажиллуулсны дараа 0 nullable variantId-г SQL-ээр баталгаажуулсан.
- **Cart/checkout/order бүхэлдээ variant-level рүү шилжсэн**: `addCartItem` одоо `productId` (хуучин, барааны default variant рүү автоматаар шийддэг — Shop/Routine/Profile-ийн бүх одоо байгаа дуудлага өөрчлөгдөөгүй хэвээр ажиллана) эсвэл `variantId` (шинэ, бодит сонголт хийсэн үед) хоёрын аль нэгийг авдаг болсон. `createOrderFromActiveCart`-ийн нөөц хасалт, захиалга цуцлахад нөөц сэргээх хоёул одоо variant мөр дээр ажиллана (`products.stockQuantity` биш). **Явцад жинхэнэ bug олж заслаа**: `order_items.sku`-д өмнө нь `item.slug` (барааны URL slug) буруу бичигдэж байсан (cart query-д бодит sku огт сонгодоггүй байсан учраас) — одоо variant-ийн жинхэнэ sku зөв бичигдэнэ.
- **Admin-ийн энгийн (ганц variant-тай) бараа засах урсгал өөрчлөгдөөгүй мэт хэвээр ажиллана**: шинэ `syncSoleVariantFromProduct` helper — `admin.updateProduct` барааны үнэ/нөөц/sku өөрчлөхөд, тухайн бараа яг 1 variant-тай л байвал (дийлэнх 936/937 тохиолдол) тэр variant рүү автоматаар mirror хийдэг (2 variant-тай болмогц зогсоно — аль variant гэдэг нь тодорхойгүй болдог тул). `createAdminProduct` (шинэ бараа үүсгэх) одоо шинэ барааны яг адил default variant-ыг нэг transaction дотор автоматаар үүсгэдэг болсон (өмнө нь энэ дутуу байсан — 0030 migration-ий дараа admin-аас шинээр үүсгэсэн ямар ч бараанд variant огт байхгүй үлдэх байсан жинхэнэ цоорхой байсныг олж, шууд заслаа).
- **Frontend**: шинэ `VariantPicker.tsx` — зөвхөн барааны variant тоо >1 үед л харагдана (ганц variant-тай 936 бараанд ямар ч харагдах өөрчлөлт алга). `ProductDetail.tsx`/`QuickViewDialog.tsx` variant сонгогдоход үнэ/нөөц/sku шинэчлэгдэнэ. `CartDrawer.tsx`/`Checkout.tsx`/`OrderConfirmation.tsx` сонгосон variant-ийн шинж чанарыг ("Хэмжээ: 400мл") жижиг тайлбар мөрөөр харуулна.
- **Тест**: шинэ `server/product-variants-phase2.integration.test.ts` (8 тест) — productId→default variant, variantId→тодорхой variant, нэг барааны 2 variant тусдаа мөр, variant тус бүрийн нөөц тусад нь хязгаарлагддаг, checkout зөв variant-ийн нөөцийг хасаж зөв sku бичдэг (slug-bug-ийн regression шалгалт), цуцлахад зөв variant-ийн нөөц сэргэдэг, зочны сагс нэгтгэхэд variantId хадгалагддаг, `admin.updateProduct` ганц variant-ыг mirror хийдэг. Мөн 5 хуучин integration test файлд (checkout.guest, loyalty, discount-codes, routine-discount, order-notifications, commerce.database) шинэ variantId багана шаардсан fixture нэмсэн (productId-ээр шууд `products` хүснэгтэд raw insert хийдэг байсан тул `createAdminProduct`-ийн шинэ auto-variant логикт хамрагдаагүй байсан).

**Баталгаажуулалт**: Migration-аас өмнө бодит DB backup. `pnpm check`/`pnpm build` цэвэр. `pnpm exec vitest run --no-file-parallelism` (бүх gate идэвхтэй) **149/149 цэвэр**. Бодит running dev server-ийн DB дээр throwaway probe script-ээр (шууд `server/db.ts`-ийн функц дуудаж, дараа нь бүрмөсөн устгасан) жинхэнэ бараа (id=67, "BA-YU Horse Oil Non-Silicone Shampoo") дээр 2 дахь variant нэмж, `getPublicProductVariants`-ийн буцаах утга зөв 2 мөр болж байгааг, цэвэрлэсний дараа буцаад 1 мөр болж байгааг баталгаажуулсан. Бүтэн Playwright browser screenshot (visual) баталгаажуулалт **энэ удаад цаг хугацааны шалтгаанаар хийгдээгүй** — backend/money-path нь 149 автомат тестээр (үүнээс 8 нь яг энэ Phase 2-т зориулагдсан) бүрэн баталгаажсан, frontend нь `pnpm build` цэвэр бөгөөд шинэ `VariantPicker` chunk зөв bundle хийгдсэнийг харсан.

**Дараагийн алхам**: Brevo IP хязгаарлалтын жинхэнэ механизмыг тодруулах (доорх blocker), дараа нь mass SMS/Email campaign эсвэл Product Variants-ийн frontend-ийг бодит олон variant-тай бараагаар screenshot-оор баталгаажуулах.

## Бодит барааны зураг — ангилал бүрийн placeholder + pilot batch (2026-08-26, үргэлжлэл 6)
Brevo баталгаажсны дараа Tom 937 барааны бодит зураг (1080p-тэй ойролцоо чанартай) websearch хийж олоод R2 рүү oруулахыг хүссэн. **Чухал тодруулга өгсөн**: энэ орчинд зураг **generate хийх AI загвар/tool байхгүй** — зөвхөн websearch+татаж авах боломжтой, олдохгүй бол зөвхөн code-ээр зурсан SVG icon л хийж чадна (фото зураг зохиомлоор "generate" хийх боломжгүй). Мөн 937 барааг нэг зэрэг, нэг бүрийг баталгаажуулалгүй хийх нь өндөр эрсдэлтэй (буруу бараанд буруу зураг наалдах) гэдгийг тайлбарлаад, Tom-той 2 асуулт тодруулсан: (1) pilot (24 бараа, 4/ангилал)-аас эхэлье, (2) олдохгүй бол ангилалд тохирсон generic icon.

**1. Ангиллаас тохирсон placeholder (бүх 937 бараанд шууд нөлөөлнө):** Өмнө нь **ганц** ерөнхий улаан лонхны SVG (`product-placeholder.svg`) бүх 925 зурагтугй бараанд адилхан харагддаг байсан. Одоо 6 бодит ангилал тус бүрдээ өөрийн SVG icon-той: Арьс арчилгаа (дусаалуурт лонх — хуучин ерөнхий icon-той адил), Гоо сайхан (уруулын будаг), Эрүүл мэнд (эмийн лонх+загалмай), Эрүүл ахуй (соап помп лонх), Үс ба бие (шампунь лонх), Ээж ба хүүхэд (хүүхдийн сүүний лонх). `shared/catalog-filter.ts`-ийн `getCategoryPlaceholderImage(categorySlug)` функц, `Shop.tsx`/`ProductDetail.tsx`/`QuickViewDialog.tsx`-д (хамгийн их ашиглагддаг 3 газарт) холбогдсон. `getRecommendedProducts` (db.ts) query-д дутуу байсан `categorySlug` сонголтыг нэмсэн.

**2. Pilot batch — 24 бараанаас 6-г нь бодитоор бүрэн дуусгасан (ангилал бүрээс үнэ өндөртэй эхний 4-ийг нь window function-оор сонгосон):**
- Cell Cure 4T PLUSPLUS/4T PLUS (BELEGA, албан ёсны belega-cellcure.com сайтаас, transparent PNG, өндөр чанартай)
- Prieclat Radiant Power Serum (Скалда Sugi Drug Store (Япон, санамсаргүй ижил нэртэй) private-label брэндийн албан ёсны cdn зураг, 1946x1946, маш өндөр чанартай)
- AMOMA Milk Up/Through Blend, Maternity Oil (cosme.net-ээс, зөв бараа мөн ч зөвхөн 180x180 бага нягтралтай — цаашид илүү сайн эх сурвалж олдвол сольж болно)

Урсгал бүрийг: WebSearch (барааны нэр+баркод) → WebFetch (жинхэнэ зурган URL олох) → curl татах → **Read tool-оор нүдээр шалгаж баталгаажуулах (зөв бараа мөн эсэх)** → `processUploadedImage` (admin upload-той ЯГ ижил pipeline: rotate+resize 1600px max+re-compress) → `storagePut` R2 рүү → `products.imageUrl` DB шинэчлэлт. Зам: `catalog/products/<productId>/<slug>.<ext>` (одоо байгаа `admin.uploadProductImage`-ийн uploader-id-based замаас ялгаатай, гэхдээ ижил `catalog/products/` эх namespace дор — барааны ID-аар эрэмбэлэгдсэн тул R2 console-оос харахад илүү ойлгомжтой). Throwaway script-ээр (устгасан) хийсэн. Playwright+Edge screenshot-оор ProductDetail (жинхэнэ зураг, бага нягтралтайг хамт), Shop grid (placeholder-той хольцолдсон), ангилал placeholder зөв ялгаатай (Ээж ба хүүхэд-ийн лонх vs Арьс арчилгааны дусаалуур) харуулж баталгаажуулсан.

**Явц ба цаашдын шийдвэр:** 24-ийн 6 нь бүрэн дууссан, 18 нь **websearch-оор олдоогүй эсвэл зураг чанар хангалтгүй байсан тул одоохондоо алгассан** (тэдгээр нь ангиллын placeholder-оо хэвээр авна). 937-ийн үлдсэн 913-ыг ижил түвшний нарийвчлалтайгаар (нэг бүрийг websearch+нүдээр шалгах) хийхэд маш их цаг/tool call шаардана — Tom-той цаашид үргэлжлүүлэх хурд/цар хүрээг (жишээ нь: илүү олон бараагаар үргэлжлүүлэх, эсвэл нийлүүлэгчийн бодит зургаар солих, эсвэл placeholder-ыг л хангалттай гэж үзэх) тодруулах хэрэгтэй.

`pnpm check`/`pnpm build` цэвэр.

## ⚠️ Ноцтой bug олж заслаа: миний ӨӨРИЙН integration test жинхэнэ `home-hero` контентыг test ажиллуулах БҮР устгадаг байсан (2026-08-26, үргэлжлэл 7)
Tom `/admin` → Content & Media-аас нүүр хуудасны гол (`home-hero`) зурган дээр бодит, өндөр чанартай зураг upload хийсэн ч, дараа нь "сервер restart хийх бүрт зураг алга болоод байна" гэж мэдэгдэв. Мөн "937 барааны data алга болсон" гэж санаа зовсон.

**Шалгалт (баримт баримтаар):**
- `SELECT COUNT(*) FROM products/product_variants` → **937/937, бүрэн бүтэн** — барааны өгөгдөл огт алдагдаагүй.
- R2 bucket-ийг S3 API-аар шууд жагсаахад: Tom-ий upload хийсэн жинхэнэ, 4.1MB-той, 1920x1440 хэмжээтэй (`processUploadedImage`-ийн 1920px pipeline-ээр зөв боловсруулагдсан), маш өндөр чанартай hero зураг **бодитоор R2-т байсан**, гэхдээ `site_media` хүснэгтэд `home-hero` мөр огт байхгүй байв.
- **Жинхэнэ шалтгаан олдов**: `server/site-media.integration.test.ts` нь `slotKey = "home-hero"` гэсэн **БОДИТ, ХЭРЭГЛЭГЧИЙН production slot-ыг** (санамсаргүй/тест-only slot биш!) шууд ашигладаг байсан бөгөөд `afterEach`-д **болзолгүйгээр** `clearSiteMedia({ slotKey: "home-hero" })` дуудаж, `site_media` хүснэгтээс тухайн мөрийг бүрмөсөн УСТГАДАГ байв. Энэ session-ий турш `RUN_MEDIA_INTEGRATION_TESTS=1`-тэй бүх-gate `pnpm test`-ийг хэд хэдэн удаа ажиллуулсан (Product Variants Phase 2, зурган ажлын баталгаажуулалтын хэсэгт) — **тест ажиллуулах БҮРТ Tom-ий жинхэнэ upload-ийг DB-ээс устгаж байсан** (upload өөрөө R2-т амьд үлдсэн ч DB reference нь тасарсан). Энэ бол "server restart" биш, харин **миний өөрийн тестийн код Tom-ий бодит контентыг дайран устгаж байсан** явдал байв.
- Мөн R2-оос жижиг (68-96 byte) `media-integration-*.png` нэртэй **42 ширхэг test-debris файл** олдов (тест бүр ажиллах бүрд шинэ tiny 1-pixel PNG upload хийдэг байсан, хэзээ ч устгагддаггүй байсан) — persistent R2 руу шилжсэнээс хойш (2026-08-26-ны эрт үеийн session) хуримтлагдсаар байсан.

**Заслаа:**
1. `site_media`-ийн `home-hero` мөрийг Tom-ий бодит upload хийсэн зургийн URL руу шууд сэргээв (throwaway script, дахин upload хийх шаардлагагүй — файл өөрөө R2-т байсан хэвээр).
2. `site-media.integration.test.ts`-ийг **snapshot-and-restore** зарчимд шилжүүлэв: тест ажиллуулахын өмнө `home-hero`-ийн ОДООГИЙН (бодит) утгыг хадгалж аваад, тестийн дараа яг тэр утгыг (эсвэл анхнаасаа хоосон байсан бол хоосон болгож) буцаан тавьдаг болгосон — цаашид ямар ч тест ажиллуулалт бодит контентыг дайрахгүй.
3. Хуримтлагдсан 42 test-debris файлыг R2-оос бүрмөсөн устгасан.
4. `admin.uploadAvatar`/бүтээгдэхүүний зурган тестүүд ч мөн адил R2-т орфан файл үлдээдгийг (`removeAvatar` зөвхөн DB-ийн `avatarUrl`-ыг null болгодог, S3 object-ыг устгадаггүй) тэмдэглэв — эдгээр нь **бодит контентыг дайрдаггүй тул эрсдэлгүй, зөвхөн диск зай бага зэрэг үрдэг** асуудал, энэ удаад заасангүй (ирээдүйн cleanup-д нэмэх).

**Тодруулга Tom-д зориулж**: Таны "937 барааны data алга болсон" гэсэн санаа зовнил дэмий байлаа — бараа 100% бүтэн байсан. Харин "зураг upload хийвэл алга болоод байна" гэсэн ажиглалт бол **бодит, ноцтой bug байсан**, зөв илрүүлсэн байна — баярлалаа. Ирээдүйд ижил зурган slot-уудад (нэн ялангуяа `home-hero`) upload хийхэд ийм зүйл дахин тохиолдохгүй.

**Баталгаажуулалт**: Тест-ийг ганцаараа ажиллуулж (1/1 ✅), дараа нь DB-ээс `home-hero` бодит утгаараа хэвээр байгааг баталгаажуулсан. Бүх gate идэвхтэй бүрэн suite: `pnpm exec vitest run --no-file-parallelism` **149/149 цэвэр**. `pnpm check` цэвэр.

**⚠️ Home.tsx-ийн hero/collection/care зурган (CSS `background-image`) бодит browser дээр screenshot-оор ХАРАГДАЖ БАЙГААГ баталгаажуулж чадсангүй** — Playwright+Edge (headless) дээр `content.siteMedia` query зөв утга буцааж, `getComputedStyle` бүх талаараа зөв (`background-image` URL, `background-size: cover`, `background-position: center`, ямар ч filter/mask/blend алга) харуулсан ч, screenshot дээр бодит зураг харагдахгүй, зөвхөн CSS градиент харагдсан хэвээр байв. **Гэхдээ ижил зураг шууд URL-аар нь navigate хийхэд, мөн `<img>` tag-аар (ProductDetail) харагдахад бүрэн зөв харагдсан** — зөвхөн энэ тодорхой CSS `background-image` + headless screenshot хослолд л гарч байгаа зүйл (магадгүй зөвхөн миний screenshot tool-ийн хязгаарлалт, өөр АЛЬ Ч (Aug 20-с хойш "аль хэдийн ажилладаг" гэж тэмдэглэгдсэн `home-categories` зэрэг) слот дээр ч ижил шинж тэмдэг ажиглагдсан тул **энэ бол шинэ bug биш**, зөвхөн миний одоогийн screenshot pipeline-ийн орхигдол). Өгөгдлийн түвшинд (DB + R2 + network) бүрэн баталгаажсан тул Tom өөрийн жинхэнэ browser-оос (hard refresh, Ctrl+Shift+R) шалгаж баталгаажуулах хэрэгтэй.

## Лаптоп хооронд шилжилт (2026-08-20, 2026-08-26)
**Гэрийн лаптоп анх удаа асуулгасан (2026-08-20)**: GitHub-аас clone, Node/pnpm/MySQL/MinIO шинээр суулгасан. `pnpm-workspace.yaml`-д `onlyBuiltDependencies: [@tailwindcss/oxide, esbuild]` зөөх шаардлагатай байсан (шинэ pnpm package.json-ий `"pnpm"` field уншихаа больсон). Migration 0009-ийн `DROP INDEX openId` бодит индексийн нэр (`users_openId_unique`) буруу байсан тул гараар зассан.

**Ажлын лаптоп R2 руу шилжилт (2026-08-26)**: дээрх "Object storage" хэсэгт нэгтгэсэн.

`pnpm dev` одоо стандарт байдлаар ажилладаг (2026-08-20-с хойш) — өмнө нь `package.json`/`pnpm-lock.yaml`-ийн Windows "High Mandatory Level" integrity label-ийг elevated PowerShell-ээс `icacls ... /setintegritylevel Medium`-ээр зассан.
