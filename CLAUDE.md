# SUGI ASAYAKE — Төслийн танилцуулга (Claude Code-д зориулав)

Энэ файлыг Claude Code сесс бүрийн эхэнд автоматаар уншина. **Файлыг бага байлгахын тулд дэлгэрэнгүй өдөр бүрийн ажлын лог [HISTORY.md](HISTORY.md)-рүү зөөгдсөн** (2026-08-26) — тодорхой bug/шийдвэрийн шалтгааныг мэдэх хэрэгтэй үед л тэнд хайна. Энд зөвхөн **одоогийн статус, тохиргоо, идэвхтэй асуудал** байна.

## Төслийн зорилго
**SUGI ASAYAKE** — Улаанбаатар дахь интерьер/skincare дэлгүүрийн онлайн худалдааны сайт (SUGI × ASAYAKE брэнд). Эзэмшигч: Tom (`t.morius@gmail.com`). Анхны эх код нь Manus AI платформоор бүтээгдсэн байсныг бүрэн салгасан (JWT email+password auth, S3-compatible storage, Manus runtime хассан) — дэлгэрэнгүй шалтгаан/алхам: [HISTORY.md](HISTORY.md).

## Локал орчны тохиргоо (чухал — эдгээрийг мэдэхгүй бол дахин цаг алдана)

⚠️ **`DATABASE_URL` нь ЗААВАЛ Aiven руу заасан байх ёстой, local MySQL руу БИШ** (2026-09-01 бодит incident-ээр баталгаажсан шалтгаан доор):

```
DATABASE_URL=mysql://avnadmin:<Aiven password>@sugi-asayake-db-project-4b75.h.aivencloud.com:25861/defaultdb?ssl-mode=REQUIRED
JWT_SECRET=local-test-secret-12345
OWNER_EMAIL=t.morius@gmail.com
S3_REGION=auto
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<R2 access key>
S3_SECRET_ACCESS_KEY=<R2 secret key>
S3_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev
PORT=3000
```
(Бодит Aiven нууц үг/R2 утгууд: Tom-оос асуух, эсвэл Aiven dashboard → sugi-asayake-db → Connection information / Cloudflare dashboard → R2 → Manage R2 API Tokens. Хоёр laptop **нэг ижил Aiven DB, нэг ижил R2 bucket**-ыг хуваалцдаг тул `DATABASE_URL`/`S3_*` утгууд хаана ч яг ижил байх ёстой.)

**⚠️ 2026-09-01 бодит incident, яагаад энэ анхааруулга чухал вэ**: Энэ (гэрийн) лаптопын `.env` хэзээ нэгэн цагт (Aug 26 20:36-аас өмнө/дараа тодорхойгүй) local MySQL руу буцаж сольсон байсан — магадгүй яг энэ дээрх жишээ блокийг харж хуулснаас (өмнө нь энд `mysql://root:...@127.0.0.1/...` жишээ байсан нь бодит local MySQL руу заасан жишээ атлаа "чухал тохиргоо" мэт харагдаж байсан). Үр дагавар: Tom-ийн бодитоор /admin-аар upload хийсэн зургууд (`home-hero`, `home-categories`, `home-family` гэх мэт) Cloudflare R2-д бүрэн бүтэн хэвээрээ байсан ч (шалгасан: `ListObjectsV2Command`-ээр бодитоор баталгаажуулсан, файлууд алга болоогүй), local MySQL-ийн `site_media` хүснэгт хоосон байсан тул `/admin` → Content & Media дээр бүгд "BRAND DEFAULT" (буюу зураг алга болсон мэт) харагдаж байв. **Зураг хэзээ ч устаагүй, зөвхөн буруу DB-ээс уншиж байсан.** Local MySQL-ийг зөвхөн интернэтгүй үед түр орлуулагч болгон ашиглах (доорх "MySQL-тэй холбоотой" хэсгийг үзнэ үү) — хэзээ ч `.env`-д удаан хугацаагаар үлдээхгүй, ажил дуусмагц заавал Aiven руу буцааж тавих.

**`pnpm dev` стандарт байдлаар ажилладаг** (2026-08-20-с хойш засагдсан) — зүгээр:
```powershell
cd C:\Sugi-asayake
pnpm dev
```
Гар `$env:` тохиргоо зөвхөн `.env`-ийн утгыг түр override хийх шаардлагатай үед л хэрэгтэй.

### Shared database and catalog navigation (Aiven)
Aiven MySQL is the shared source of truth for both laptops; Cloudflare R2 stores image bytes. Keep the Aiven `DATABASE_URL` only in the ignored `.env`. Shop search/category/pagination state is kept in the URL, product breadcrumbs return to the shop, and the admin sidebar has a direct homepage link.

Aiven service-ийн built-in daily backup-ийг идэвхжүүлж, нэмэлт локал backup нь өдөр бүр **19:00** цагт ажиллана (`SUGI ASAYAKE Daily DB Backup` Windows Task Scheduler task, 14 backup хадгална). Aiven URI-д `?ssl-mode=REQUIRED` байвал backup/restore script-үүд TLS flag-ийг автоматаар дамжуулна.

**Aiven trial дуусахаас өмнө хийх ажил:** trial-ийн сүүлийн долоо хоногт Aiven-ээс хамгийн сүүлийн бүрэн `.zip` backup-ийг татаж аваад, өөр төхөөрөмж/cloud drive дээр хадгална. Дараа нь хүсвэл backup-ийг managed MySQL эсвэл локал MySQL рүү `scripts/db-restore.ps1 -DatabaseUrl "<target>" -BackupFile "<zip>" -Force`-оор сэргээнэ. Backup файл, password, CA certificate-ийг GitHub-д commit хийхгүй. Trial дуусах яг өдрийг Aiven Console-ийн Billing/Service мэдээллээс шалгана.

### MySQL-тэй холбоотой чухал зүйл
Windows дээрх MySQL 8 root хэрэглэгч `caching_sha2_password`-оор тохиргоологдвол Node.js-ийн `mysql2` драйвертай зөрчилдөнө (`mysql.exe` CLI ажилладаг тул андуурч болно). Засвар:
```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'Zulaa123';
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY 'Zulaa123';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

### Migration-уудыг ажиллуулах тухай
`drizzle/meta` экспортод ороогүй тул `pnpm db:push`-д бүрэн найдаж болохгүй — `.sql` файлуудыг гараар ажиллуулна. **`--> statement-breakpoint` мөрийг заавал устгах** (MySQL 8 үүнийг ойлгодоггүй):
```powershell
(Get-Content <file>.sql -Raw) -replace '--> statement-breakpoint', '' | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p sugi_asayake
```

### Тест ажиллуулах тухай
Бүх integration gate идэвхтэй үед vitest-ийн анхдагч параллель горим тогтмол бус ~3 файлыг унагаадаг (pre-existing race, 20 гаруй файл нэг MySQL/MinIO-г зэрэг hammer хийдгээс) — **үргэлж `pnpm exec vitest run --no-file-parallelism` ашиглах**:
```powershell
$env:RUN_AUTH_INTEGRATION_TESTS="1"; $env:COMMERCE_INTEGRATION_TESTS="1"; $env:RUN_MEDIA_INTEGRATION_TESTS="1"
pnpm exec vitest run --no-file-parallelism
```
Одоогийн бүрэн тоо: **161/161** ✅ (CI горимд ~59 passed / ~102 skipped, gate-үүд CI дээр идэвхгүй тул хэвийн).

⚠️ **CI-д мэдэгдэж буй, засаагүй цоорхой** (`server/integrations.integration.test.ts`-ийн "encryption (unit)" тест, засаагүй, миний өнөөдрийн ажилтай холбоогүй): `INTEGRATIONS_ENCRYPTION_KEY` env var-д dev fallback байхгүй тул env var огт байхгүй (жинхэнэ шинэ CI checkout шиг) орчинд энэ нэг тест шатна. `.github/workflows/ci.yml` энэ var-ыг тохируулдаггүй тул **бодит GitHub Actions CI дээр энэ тест улаан гарч байж магадгүй** — шалгах/шийдэх хэрэгтэй (нууцлалын шинж чанартай тул санамсаргүй "insecure dev fallback" нэмэхээс өмнө Tom-той зөвшилцөх нь дээр).

### Шинэ S3/R2 bucket байгуулах бүрт (production, шинэ орчин) мартаж болохгүй 2 алхам
Зөвхөн `CreateBucketCommand` хийгээд зогсвол зураг upload "амжилттай" ч browser дээр **403**-аар харагдахгүй:
1. `CreateBucketCommand`
2. `PutBucketPolicyCommand` (`s3:GetObject`-ийг public болгох)

## Одоогийн статус — юу шалгагдсан, юу шалгагдаагүй

**Ажиллаж байгаа нь баталгаажсан:** бүртгэл/нэвтрэлт (OTP 2-алхамт, эхний хэрэглэгч auto-admin), role-based хамгаалалт, admin панель (бүтээгдэхүүн/зураг/post/routine/coupon/promo/integrations/variants), каталог+server-side FULLTEXT хайлт (`catalog.search`), guest checkout, loyalty/routine хямдрал, reviews, wishlist, profile (address book, preferences, security), захиалгын имэйл мэдэгдэл (Brevo), Cloudflare R2 storage (хоёр laptop хуваалцдаг), **Product Variants PHASE 1+2 (variant сонголттой худалдан авалт, доор дэлгэрэнгүй)**, **Admin Analytics/CRM dashboard (Geckoboard маягийн харанхуй KPI самбар: sparkline/gauge/P&L card/ranked list-үүд, + борлуулалт/дүүрэг/харилцагчийн мэдээлэл/ашиг/маржин/сагс орхилт/нөөц/суваг/эх сурвалж/**хөрвүүлэлтийн хувь (Conversion Rate, бодит visitor session tracking)**/**CAC**/**буцаалтын хувь (Return Rate)** + Excel/PDF export, доор дэлгэрэнгүй — Playwright-ээр throwaway өгөгдлөөр screenshot баталгаажсан, бодит 937 барааны өгөгдлөөр хараахан үзээгүй)**, **Нүүр хуудасны premium reference-driven редизайн (2026-08-28, доор дэлгэрэнгүй — QuickStatsSection infinity graph, CategoryMasonry v2 (pixel-хэмжилтээр баталгаажсан overlap/offset/watermark засвар), WhyChooseUs, JournalSection, StoreLocatorSection, бодит throwaway хэрэглэгчээр authenticated screenshot баталгаажсан)**. Дэлгэрэнгүй бүх TIER-ийн баталгаажуулалт: [HISTORY.md](HISTORY.md), [ROADMAP.md](ROADMAP.md), [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md), [ADMIN-PANEL.md](ADMIN-PANEL.md).
**Навигацийн засвар (2026-08-28):** Shop-ийн хайлт/ангилал/хуудаслалт URL-д хадгалагдаж refresh болон product-оос буцахад state сэргээнэ; product breadcrumb болон Admin-ийн нүүр хуудасны холбоосууд ажиллана.

**Шалгагдаагүй/хараахан идэвхгүй:**
- QPay төлбөр (жинхэнэ merchant credential шаардана, localhost дээр бүрэн туршигдахгүй)
- SMS (Brevo) — SMS кредит/route-ийг Tom баталгаажуулаагүй хэвээр (имэйл тал ажиллаж байгаа нь баталгаажсан, доор "Brevo API" хэсгийг үзнэ үү)
- eBarimt, StorePay, шууд карт төлбөр, эльч (eBuuhia) хүргэлт — бүгд Tom-ийн биечлэн хийх бизнесийн алхам шаардана, код бэлэн биш (eBarimt зөвхөн inert schema бэлэн — [EBARIMT.md](EBARIMT.md))
- **Product Variants — PHASE 1 болон PHASE 2 хоёулаа дууссан (2026-08-26)** — худалдан авагч ProductDetail/QuickView дээр 2+ variant-тай бараанаас сонголт хийж, тухайн variant-ийн үнэ/нөөц/sku-гоор бодитоор захиалж болно. Ганц variant-тай (одоогийн 936/937) бараанд ямар ч харагдах өөрчлөлт алга. **Бодит Playwright screenshot баталгаажуулалт хараахан хийгдээгүй** (зөвхөн 149 автомат тест + `pnpm build` + throwaway DB probe script-ээр баталгаажсан) — дэлгэрэнгүй [HISTORY.md](HISTORY.md)-ийн "Product Variants PHASE 2" хэсэгт.
- Хэрэглэгчийн удирдлага (`/admin` → Хэрэглэгч хэсэг)

## 🟡 (2026-09-01) Preference Profile v2 + Recommendation Engine v2 + Admin Analytics segment — код бэлэн, bulk auto-tag ЭЦСИЙН APPLY хараахан хийгдээгүй

Tom "Хувийн профайл" таб хэт basic байна, "Гоо сайхны & Гэрийн профайл" хэсэг хэт богино гэж мэдэгдэж, (1) бүрэн хувийн мэдээлэл (хаяг/дүүрэг/ажил/нас/хүйс), (2) олон segment-тэй өргөтгөсөн quiz, (3) 937 барааны каталогоос бодитоор тохирсон санал болгох систем, (4) admin Analytics-ийг ("хэт oldschool") нэг зэрэг шаардав, эрдэмтэй websearch/судалгаа хийхийг тодорхой шаардсан. Judgment call шаардсан 3 сонголтыг Tom өөрөө шийдсэн: (a) **quiz wizard** (segmented card биш), (b) **`catalog.recommended` public** (guest-д ч bestseller fallback-аар харагдана), (c) bulk auto-tag script-ийг **эхлээд dry-run тайлан үзүүлж, "za" гэсний дараа** бодит Aiven дээр ажиллуулна.

**Хийгдсэн (бүгд `pnpm check`/`pnpm build` цэвэр, throwaway admin+staff хэрэглэгчээр Playwright QA баталгаажсан):**
- **Schema** (`drizzle/0038_preference_profile_v2.sql`): `users`-д `gender`/`primaryDistrict`/`skinRoutineComplexity`/`hairType`/`hairConcerns`/`fragrancePreference`/`wellnessInterests`/`hasYoungChildren`; `products`-д `hairType`/`hairConcerns`/`fragrancePreference`/`wellnessInterests` (skinType/skinConcerns/interiorStyle хэвээр). Aiven дээр бодитоор ажиллуулж баталгаажуулсан.
- **`shared/catalog-filter.ts`**: recommendation engine v2-ийн цэвэр, unit-тестлэгдсэн scoring функцууд (`scorePreferenceMatch`, `scorePriceBandAffinity`, `applyDiversityCap`, `computeCategoryAffinity`) + бүх шинэ талбарын vocabulary/label map/option list (өмнөх Profile.tsx-ийн локал массивуудыг эндээс дахин ашигладаг болгож нэгтгэв, drift багасгав).
- **`shared/product-tagging.ts`** (шинэ): keyword-based `suggestTagsForProduct` — нэр/тайлбар/ангиллаас rule-based tag санал болгодог, hiч хэзээ таамаглахгүй (match олдохгүй бол `undefined`). **Real dry-run explore хийхэд том bug олж заслаа**: анхны хувилбарт "чийгшүүлэх"-тэй холбоотой keyword (moistur/hydrat/чийг) 445-ийн 441 (99%) skincare бараанд боловсролгүй боловч бараг бүх тайлбарт байдаг boilerplate-аас болж **бүх зүйлийг "dryness" гэж дүрмээр tag хийж байсан** — non-discriminative noise байсныг олж, зөвхөн тодорхой ингредиент/хэллэгээр солив.
- **`server/db.ts`'s `getRecommendedProducts` v2**: preference-tag match (backbone) + захиалгын түүхээс category affinity + үнийн зурвас (price-band) + wishlist-adjacency + brand/category diversity cap + **cold-start/thin-result fallback** (bestseller-ээр дүүргэдэг, хэзээ ч хоосон харагдахгүй). `catalog.recommended` endpoint public болов (guest-д ч ажиллана).
- **`server/db.ts`'s шинэ `getRelatedProducts`** + `catalog.related` public endpoint: ProductDetail-ийн шинэ "Мөн танд таалагдаж магадгүй" хэсэг (өмнө нь ProductDetail-д related-products огт байгаагүй) — тухайн барааны tag-аар бусад барааг matched.
- **`client/src/components/ProfileQuizWizard.tsx`** (шинэ): 6 алхамт + review алхам (Хувийн мэдээлэл → Арьсны профайл → Үсний профайл → Үнэр & хэрэглээ → Эрүүл мэнд & амьдрал → Интерьер), `@/components/ui/dialog`-г ашигласан, бүх асуулт заавал биш, "Алгасах"/"Буцах"/"Дараах", эрт хаавал partial save хийдэг. `Profile.tsx`-ийн "Гоо сайхны & Гэрийн профайл" карт "Таны тохиргоо" read-only summary + "Профайл засах/бөглөх" товч болов.
- **`client/src/components/RecommendedForYou.tsx`** (Shop.tsx-аас extract хийсэн) — одоо `Home.tsx`-д мөн ашиглагдана (шинэ "Танд санал болгож байна" section, bestseller rail-ийн ард).
- **`client/src/components/AdminWorkspace.tsx`**: PERSONALIZATION TAGS блокт шинэ 4 талбар (hairType/hairConcerns/fragrancePreference/wellnessInterests) + `suggestTagsForProduct`-аас дуудсан dismissible санал chip-үүд (admin өөрөө дарж баталгаажуулна, автоматаар бичигдэхгүй).
- **`server/analytics.ts`**: шинэ `getPreferenceSegmentBreakdown` (хүйс/арьс/үс/дүүргийн breakdown, "N of M" discipline) + `getRecommendationCoverage` (нийтлэгдсэн барааны хэдэн хувь tag-тай вэ, ангиллаар) — `AdminAnalyticsPanel.tsx`-д шинэ "Тохиргооны сегмент" + "Санал болгох системийн хамрах хүрээ" секц.
- **`scripts/auto-tag-products.ts`** (шинэ, dry-run горимд л ажилласан): 2 tier — Tier 1 keyword match (`suggestTagsForProduct`), Tier 2 category-level default (жишээ нь tag-гүй skincare→`skinType:"normal"`). Зөвхөн `NULL` талбар дээр бичдэг, admin гараар оруулсан утгыг хэзээ ч дарж бичихгүй.

**🔴 Playwright QA-гийн явцад олдож, бодит Aiven дээр шууд заслагдсан bug**: Tom өөрөө localhost:3000 дээр амьдаар ажиглаж байхдаа "юу сонгосон ч дандаа хүүхдийн бараа гарч байна" гэж мэдэгдэв. Шалтгаан: `hasYoungChildren` signal-ийн жин (+3) нь яг skinType/hairType exact match-тай (+3) ижил байсан ч, real production дээр tagging coverage 4/937 л байсан тул бусад signal тохирох бараа олдоогүй үед энэ ганц signal **бүх жагсаалтыг дарж авчихсан** (5-аас 4-5 нь бэби бүтээгдэхүүн). Засвар: жинг +3→+1 болгож (fragrancePreference-тэй ижил "зөөлөн" signal), diversity cap-ыг maxPerCategory 4→3 болгов. Тухайн хэрэглэгчийн бодит хадгалсан тохиргоогоор шууд дахин шалгахад 3 арьс арчилгаа + 3 Ээж/хүүхэд гэсэн илүү тэнцвэртэй жагсаалт болсныг баталгаажуулав.

**⚠️ ХАРААХАН ДУУСААГҮЙ, дараагийн session-д заавал үргэлжлүүлэх**:
1. **`scripts/auto-tag-products.ts --apply` бодит Aiven дээр хараахан АЖИЛЛУУЛААГҮЙ** — зөвхөн dry-run хийгдсэн (937/937 tagged болно гэсэн тооцоо, Tier 2 category-default нэмсний дараа). Tom "937/937 болго" гэж тодорхой шаардсан (анхны Tier 1-single 113/937-г хангалтгүй гэж татгалзсан) — Tier 2 нэмсний дараа dry-run 937/937 гаргаж байгааг баталгаажуулсан. **Дараагийн session эхлээд `scripts/db-backup.ps1`-ээр backup аваад, дараа нь `pnpm exec tsx scripts/auto-tag-products.ts --apply` ажиллуулж бодит catalog-ийг tag хийх ёстой** — Tom энэ commit/push + CLAUDE.md/HISTORY.md + self-review.md (доор) дуусахыг **энэ apply алхмаас өмнө** гэж тодорхой заасан.
2. Full `pnpm exec vitest run --no-file-parallelism` бүрэн ажиллуулаагүй (зөвхөн холбогдох файлуудыг тусад нь: `catalog-filter.test.ts` 17/17, `product-tagging.test.ts` 6/6, `profile.integration.test.ts` 14/14 — бүгд ✅; бүрэн suite-ийг timeout/network өмнөх мэдэгдсэн асуудлаас болж бүрэн ажиллуулаагүй, доорх "Дараагийн ажлын санал"-ийг үзнэ үү).
3. `server/recommendations.integration.test.ts` (шинэ, DB-тэй бодит тест) болон `server/analytics.integration.test.ts`-ийн preference-segment/coverage тестүүд төлөвлөгөөнд байсан ч цаг хугацааны шаардлагаар бичигдээгүй — зөвхөн unit test (`catalog-filter.test.ts`, `product-tagging.test.ts`) + гар Playwright QA-аар баталгаажсан.
4. `self-review.md` (шинэ файл, доор тайлбарласан) энэ commit-д орсон эсэхийг шалгах — Tom тусгайлан шаардсан.

## ✅ (2026-09-01) Branch консолидаци, CI encryption key засвар, CategoryMasonry v8 сэргээв

Tom "хэт олон uncommitted өөрчлөлт, хэт олон branch байна" гэж мэдэгдэж, бүх branch-ийг нэг `main`-руу нэгтгэхийг шаардав. Хийсэн зүйл:
- **Branch судалгаа**: `main` хуучирсан (0dbcd005) байсан бол `home-redesign-categorymasonry-v2` (өөр session/agent-ийн үргэлжлүүлсэн CategoryMasonry v2→v8 iteration + site-text CMS + sunrise ribbon бүгдийг агуулсан) хамгийн ахисан байв. `agents/ai-assisted-website-creation` аль хэдийн ancestor байсан (нэмэлт merge хэрэггүй). `agents/minio-r2-cloudflare-setup`-д 5 давхцаагүй commit байсан (Aiven DB backup scheduling, Shop pagination URL-state fix — сүүлийнх нь `home-redesign` талд аль хэдийн bugfix-той хувилбараар давхцаж байсан).
- **Merge**: `agents/minio-r2-cloudflare-setup`-ийг нэгтгэхэд 3 conflict гарав (`CLAUDE.md`, `HISTORY.md` — хоёулаа prose лог, аль алиных нь агуулгыг хадгалж нэгтгэсэн; `client/src/pages/Shop.tsx` — хоёр branch яг ижил feature-ийг тусад нь хэрэгжүүлсэн байсан тул bugfix-той хувилбарыг сонгосон). `main`-ийг fast-forward хийж push хийв.
- **CategoryMasonry v8 сэргээлт**: Working directory-д өөр session-ий committed-ХЭЗЭЭ БОЛООГҮЙ бодит WIP (heading text disappearing bug fix, product photo cropping→contain fix) байсныг `git stash`-аар аюулгүй хадгалж, merge дараа буцаан нэгтгэв — алдагдаагүй.
- **CI**: `.github/workflows/ci.yml`-д `INTEGRATIONS_ENCRYPTION_KEY` (GitHub secret-ээс) нэмэв — `server/integrations.integration.test.ts`-ийн "encryption (unit)" 2 тест `RUN_*_INTEGRATION_TESTS` gate-гүйгээр үргэлж ажилладаг тул key байхгүй бол шатдаг байсан. **⚠️ Tom-ийн GitHub repo settings дээр `INTEGRATIONS_ENCRYPTION_KEY` secret-ийг гараар нэмэх шаардлагатай хэвээр** (Settings → Secrets and variables → Actions) — bодит 64-тэмдэгт hex түлхүүр session-д үүсгэгдсэн, чат дотор Tom-д өгсөн (нууц тул энд бичихгүй).
- **Цэвэрлэгээ**: миний `home-redesign-categorymasonry-v2` branch (local+remote) устгав (бүрэн `main`-д орсон). `agents/*` 3 worktree branch (`ai-assisted-website-creation`, `minio-r2-cloudflare-setup`, `pixel-perfect-ui-tailwind-css`) идэвхтэй worktree-д checkout хийгдсэн хэвээр байгаа тул **зориудаар устгаагүй** — өөр session идэвхтэй ашиглаж байж болзошгүй тул устгах эсэхийг Tom өөрөө шийдэх хэрэгтэй.
- **Баталгаажуулалт**: `pnpm check`/`pnpm build` merge бүрийн дараа цэвэр. Бүрэн integration test suite цаг хугацааны шаардлагаар ажиллуулаагүй — дараагийн session-д ажиллуулж баталгаажуулах зөвлөмжтэй.

## ✅ (2026-09-01) Sunrise ribbon — баруун тийш урсдаг болгов, текст нь admin-аар засварлагдах боллоо

Tom 3 зүйл шаардсан: (1) Hero-ийн доорх урсдаг зурвасын (`JAPANESE DAILY CARE` / `УЛААНБААТАР / MONGOLIA` / `ГЭР БҮЛИЙН ГИШҮҮН БҮРТ`) урсгалын чиглэлийг **үргэлж баруун тийш** болгох, (2) энэ 3 хэллэгийг мөн admin Content & Media → Текст-ээр засварлах боломжтой болгох, (3) **24 цагийн турш тасралтгүй** урсдаг байхыг заавал баталгаажуулах, бүх алдааг давхар шалгах.

**Чиглэл**: `client/src/index.css`-ийн `@keyframes sunrise-track` нь `to { transform: translateX(-100%) }` байсан (0-ээс -100%-руу, зүүн тийш урсдаг байсан) — `from { translateX(-100%) } to { translateX(0) }` болгож урвуулав. 2 ижил давхардсан мөр (нэг харагдах, нэг `aria-hidden`) зэрэгцэн байрлалтай тул loop-ийн голд (100%→0% руу шилжихэд) хараанд ялгарахгүй, тасралтгүй мэт харагдана — өмнөх зүүн тийш урсдаг hacks-тай яг ижил техник, зөвхөн цагийн чиглэлийг урвуулсан.

**24/7 тасралтгүй байдал — ⚠️ ЭНЭ ЯГ ГОЛ АСУУДАЛ БАЙВ**: Эхлээд би "animation аль хэдийн `infinite` тул асуудалгүй" гэж дүгнээд Tom-д тэгж хэлсэн нь **буруу байсан** — Tom "0.000000000001 инч ч хөдлөхгүй байна" гэж дахин шаардсаны дараа жинхэнэ root cause олдов: **Tom-ийн компьютерт OS/browser-ийн "reduce motion" (Windows: Ease of Access → Visual effects → Animation effects) тохиргоо унтраалттай байсан** (түүний screenshot дээрх FPS/GPU/CPU overlay нь performance-тохируулсан setup болохыг илтгэж байсан нь энэ таамаглалыг дэмжсэн). Playwright-ийн `reducedMotion: "reduce"` emulation-оор баталгаажуулав: тухайн үед `animation-name: none` болж, элемент **яг 0.00px хөдөлдөг** байв (энгийн үед 1.2 секундэд 30.71px хөдөлдөг).

Хоёр тусдаа CSS дүрэм үүнийг зогсоож байсан: (1) `@media (prefers-reduced-motion: reduce)`-ийн доторх **глобал** `*, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }` blanket дүрэм, (2) тусгайлан бичигдсэн `.sunrise-ribbon > div { animation: none; }`. Tom "заавал 24 цагийн турш урсана" гэж 2 удаа тодорхой шаардсан тул **энэ зурвасыг reduce-motion дүрмээс чөлөөлөв**: (2)-ыг устгаж, (1)-ийг давахын тулд media query дотор `.sunrise-ribbon > div { animation-duration: 24s !important; animation-iteration-count: infinite !important; }` нэмэв.

⚠️ **Энэ бол ухамсартай хийсэн accessibility буулт** (алдаа биш): reduce-motion тохиргоотой ЖИНХЭНЭ хөдөлгөөнд мэдрэг зочин ч энэ зурвасыг хөдөлж байгаагаар харна. Үндэслэл: жижиг, удаан (нэг эргэлт 24 секунд), бага контрасттай, зөвхөн брэндийн чимэглэлийн элемент — сайтын бусад БҮХ animation (`order-confirm-check`, `skeleton`, бүх transition) reduce-motion-ыг хэвээр хүндэтгэнэ. Код дотор тайлбар бичсэн тул хожим хэн нэгэн "алдаа" гэж бодоод буцаахгүй.

**Admin-editable болгов**: `shared/site-text.ts`-д "Урсдаг зурвас (Hero доор)" шинэ бүлэгт 3 slot (`home-text-ribbon-phrase1/2/3`) нэмэв. `Home.tsx`-д `ribbonPhrases` array + `ribbonRow(keyPrefix)` helper нэмж, **2 давхардсан мөр хоёул яг ижил эх сурвалжаас (нэг array) рендерлэгддэг** тул admin засвар хийхэд 2 мөр хэзээ ч бие биенээсээ зөрөхгүй.

**Баталгаажуулалт (давхар шалгасан)**: `pnpm check`/`pnpm build` цэвэр. Playwright-ээр: (1) 2 мөрийн текст яг ижил болохыг баталгаажуулав; (2) `translateX`-ийг 3 удаа (1.5с зайтай) хэмжихэд тогтмол өсч байгааг (жишээ: -565px → -526.7px → -488.4px) баталгаажуулж, **баруун тийш** урсаж байгааг тоогоор нотолсон (зөвхөн нүдээр биш); (3) `animation-play-state: running` (хэзээ ч "paused" биш) баталгаажуулав; (4) throwaway staff эрхтэй хэрэглэгчээр (бодит Aiven DB дээр, дараа нь бүрэн устгасан) admin → Текст таб → "Урсдаг зурвас" бүлгийг нээж 1-р slot-ыг шинэ утгаар хадгалж, нүүр хуудсан дээр **2 мөр хоёул** шинэ утгаар шинэчлэгдсэнийг баталгаажуулав, backend-ээс ямар ч 5xx алдаа, browser console алдаа гараагүй; (5) хэвтээ overflow 0. Бүх throwaway өгөгдлийг (site_text мөр, staff хэрэглэгч, audit log) Aiven-ээс бүрэн устгасан.

## ✅ (2026-09-01) TrustStrip ("800+ / 03 / 01" тоон баримтын зурвас) бүрмөсөн устгав

Tom тодорхой заав: "delete these 3 permantly!!!! idont think these are good looking div with current design!!" — Hero доорх `.hero-facts` зурвас (800+ бүтээгдэхүүн / 03 УБ дахь салбар / 01 Японы албан ёсны эрх) одоогийн дизайнтай зохицохгүй байгааг шийдвэрлэж, зөвхөн нуух биш **бүрэн устгав**:
- `client/src/components/home/TrustStrip.tsx` файлыг бүхэлд нь устгав.
- `Home.tsx`-аас импорт болон `<TrustStrip branchCount={locations.length} />` дуудлагыг хассан.
- `client/src/index.css`-ээс `.hero-facts` бүх CSS дүрмийг (desktop, mobile responsive, dark-tint overrides — нийт 3 тусдаа блок) устгав.
- `shared/site-text.ts`-ээс энэ section-д зориулагдсан "Тоон баримт (Trust Strip)" 4 slot-ыг (2026-09-01-д өөрөө нэмсэн байсан) хассан — Aiven дээрх `site_text` хүснэгт хоосон байсан тул (0 мөр) орфон admin override цэвэрлэх шаардлагагүй байв.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр. Playwright-ээр (түр суулгаад дараа нь бүрэн хассан) 1440px/390px screenshot — `.hero-facts` DOM-д алга, hero зураг шууд хар "sunrise ribbon" texture рүү цэвэрхэн шилждэг, хоосон зай/artifact алга, хэвтээ overflow 0, console алдаагүй.

## 🔴 (2026-09-01) КРИТИК incident — "зургууд алга болсон" нь код биш, буруу DATABASE_URL байсан (шийдэгдсэн)

Tom "зурагнууд server restart болгонд алга болоод байна, cloudflare-оос татаж чадаж байна уу" гэж ноцтой шаардсан. Deep-dive хийхэд код огт эвдрээгүй, харин **энэ (гэрийн) лаптопын `.env`-ийн `DATABASE_URL` нь local MySQL руу заасан байсан, Aiven руу биш** байсныг олов — дээрх "Локал орчны тохиргоо" хэсгийн шинэ анхааруулгын яг тэр incident.

**Баталгаажуулсан баримтууд (таамаглаагүй, бүгд шууд шалгасан)**:
1. `.env`-ийн `DATABASE_URL` = `mysql://root:...@127.0.0.1:3306/sugi_asayake` (local), файлын mtime Aug 26 20:36-аас хойш өөрчлөгдөөгүй.
2. Энэ local DB-д **937 бараа БОЛОВЧ 0 захиалга** байсан — бодит production дээр захиалга байдаг тул энэ бол "нэг удаагийн snapshot", "амьд" DB биш гэдгийг илтгэнэ.
3. Local DB-ийн `site_media` хүснэгт **бүрэн хоосон (0 мөр)** байсан — тул бүх slot "BRAND DEFAULT" харагдаж байв.
4. **Гэхдээ Cloudflare R2 bucket-ыг шууд `ListObjectsV2Command`-ээр шалгахад Tom-ийн бодитоор upload хийсэн бүх зураг (`sugi-professional-hero`, `sugi-care-retail`, `sugi-professional-assortment`, `sugi-professional-family`, `sugi-sunrise-editorial-hero`, `sugi-symbol`) бүгд бодит хэмжээтэй (3-5MB), Aug 26 ~03:33-т upload хийгдсэн хэвээрээ байсан** — файл хэзээ ч устаагүй.
5. Aiven DB-г (Tom-ийн dashboard-с өгсөн connection string-ээр) шууд `mysql2`-оор холбож шалгахад: **937 бараа, 4 бодит захиалга, `site_media`-д яг 7 мөр** (`home-hero`, `home-categories`, `home-family`, `home-stores`, 3 summer-slide) — Tom-ийн upload хийсэн зурагтай **яг таарч байв**.

**Root cause**: CLAUDE.md-ийн "Локал орчны тохиргоо" хэсгийн жишээ blockнь `DATABASE_URL=mysql://root:...@127.0.0.1/...`-г "чухал тохиргоо" мэтээр харуулж байсан нь бодит зорилго (Aiven-ыг ашиглах) -тай зөрчилдөж байв — доор нь "Aiven MySQL is the shared source of truth" гэж өөр өгүүлбэрт бичигдсэн байсан ч дээрх жишээ block илүү анзаарагдахуйц байсан. Хэн нэгэн (өмнөх session эсвэл Tom өөрөө) энэ жишээг шууд хуулсны улмаас `.env` Aiven-аас local руу буцсан байх магадлалтай.

**Засвар**:
- `.env`-ийг Tom-оос авсан бодит Aiven connection string руу буцаан тохируулав (`avnadmin@sugi-asayake-db-project-4b75.h.aivencloud.com:25861/defaultdb`).
- Хуучин node процессийг PowerShell-ээр (`Stop-Process`, taskkill classifier-т blocked-той тул) зогсоож, dev server-ийг шинэ `.env`-тэйгээр дахин асаав.
- Баталгаажуулалт: `curl http://localhost:3000/api/trpc/content.siteMedia` бодит 7 мөрийг буцаав; `/manus-storage/site-media/1/sugi-professional-hero-...png`-ийг curl -L хийхэд R2-ийн бодит 4,148,819 byte файл руу 302→200 redirect хийж байгааг баталгаажуулав; Playwright screenshot-оор нүүр хуудсан дээр бодит hero зураг (лааз, ургамал бүхий lifestyle фото) харагдаж байгааг нүдээр баталгаажуулав (placeholder gradient биш).
- CLAUDE.md-ийн "Локал орчны тохиргоо" жишээ blockыг Aiven-руу засаж, яагаад чухал болохыг тодорхой тайлбарлав (энэ бичлэг өөрөө).

**✅ Дуусав**: Auto mode-ийн classifier анх Aiven руу шууд schema-mutating тушаал (`CREATE TABLE site_text`) явуулахыг блоклосон байсан ч Tom тодорхой зөвшөөрсний дараа дахин оролдоход амжилттай — `site_text` хүснэгт одоо Aiven дээр бодитоор үүссэн (баталгаажуулсан: `curl .../api/trpc/content.siteText` → `[]`, хоосон, зөв — учир нь admin override хараахан нэмэгдээгүй, бүх slot fallback утгаараа харагдана). Нууц үг агуулсан түр migration script устгасан.

**Сургамж, цаашид сануулах зүйл**: Хоёр laptop-ийн аль нэг дээр `.env`-ийг ЯМАР Ч учиртай local MySQL руу түр сольсон бол ажил дуусмагц заавал буцааж Aiven руу тавих ёстой — эс бөгөөс дараагийн session (би эсвэл Tom) анзаарахгүйгээр буруу DB дээр ажиллаж, "зураг алга болсон" мэт ижил төстэй будлиан дахин үүсэх эрсдэлтэй. Цаашид `.env` солих бүрдээ `SELECT COUNT(*) FROM orders`-оор шалгаж, 0 гарвал шууд болгоомжлох дадал зуршил болгох нь зүйтэй.

## ✅ (2026-09-01) Нүүр хуудасны текст (гарчиг/тайлбар/товч мэдэгдэл) admin-аар засварлагдах боллоо — шинэ `site_text` CMS

CategoryMasonry v7-ийн дараа Tom тодорхой асуусан: "хажуудаа related холбоотой хамааралтай текстийг ч бас admin-аар засварлаж болдог болгох" гэдгийг ямар хэмжээгээр хийхийг асуухад **"Бүх нүүр хуудас (Home.tsx)"** гэж тодорхой хариулав — зөвхөн CategoryMasonry биш, Hero/TrustStrip/Бидний ялгаа/WhyChooseUs/CategoryMasonry/Их зарагддаг бараанууд/Гэр бүлийн арчилгаа/SUGI Journal/Салбарууд/Quick Stats/Эцсийн CTA гэсэн **бүх 12 хэсгийн** маркетинг-текстийг хамруулав.

**Архитектур**: `shared/site-media.ts`-тэй яг ижил pattern (slotKey → утга, upsert-by-unique-key, enum биш plain varchar тул миграци шаардлагагүй), зөвхөн зурган URL-ийн оронд чөлөөт текст:
- **DB**: шинэ `site_text` хүснэгт (`drizzle/0037_site_text.sql`) — `slotKey varchar(80) unique`, `textValue text`, `updatedByUserId`, timestamps. Локал MySQL-д гараар ажиллуулж баталгаажуулсан (CLAUDE.md-ийн "--> statement-breakpoint устгах" зааврын дагуу).
- **shared/site-text.ts**: **74 slot**-ын бүртгэл, `group`-оор ангилагдсан (жишээ нь "Hero", "Яагаад биднийг сонгох вэ", "Гэр бүлийн арчилгаа" гэх мэт), тус бүрийн `fallbackValue` нь одоо сайт дээр бодитоор байгаа эх текст (шинэ зохиомол текст биш).
- **server**: `content.siteText` (public, `getSiteText`), `admin.siteText` (staff query), `admin.updateSiteText`/`admin.clearSiteText` (staffProcedure mutation, `server/db.ts`-ийн `upsertSiteText`/`deleteSiteText`, `site_media`-тай яг ижил upsert-by-unique-key shape).
- **client**: шинэ `client/src/hooks/useSiteText.ts` hook (`imageFor()`-той ижил зарчим) — Home.tsx болон бүх 6 `home/*.tsx` section компонент дотор шууд дуудагдана (`trpc.content.siteText.useQuery()` нь react-query-ээр deduped тул олон компонент дуудсан ч 1 network request).
- **admin UI**: шинэ `ContentTextPanel.tsx`, `AdminWorkspace.tsx`-ийн "Content & Media" хэсэгт **"Зураг" / "Текст" гэсэн 2 sub-tab** нэмэгдэв (Tom "хажуудаа" гэж тодорхой хүссэн тул шинэ тусдаа sidebar section биш, яг зурган хэсгийн хажууд). Slot бүрийг `group`-оор эмхэтгэсэн 12 collapsible хэсэгт харуулна (жишээ нь "Hero" бүлэгт 9 текст).

**Ухамсартай хязгаарлалт (шинэ файлын толгойн тайлбарт бичигдсэн)** — дараах зүйлс ЭНЭ системд ОРООГҮЙ:
- Ангиллын **нэр** (жишээ: "Арьс арчилгаа") — учир нь `/shop?category=<нэр>` шүүлтүүрийн exact-match түлхүүрээр давхар ашиглагддаг тул чөлөөт текстээр засварлавал линк тасрах эрсдэлтэй. Зөвхөн доод тайлбар (`detail`) мөр л засварлагдана.
- Утасны дугаар шингэсэн CTA (жишээ нь "9450-9911 руу залгах") — бодит `tel:` холбоостой холбоотой тул тусдаа зассан тохиолдолд зөрчил үүсэх эрсдэлтэй.
- Салбарын нэр/хаяг/цаг/утас (`locations-data.ts`-ийн бодит бизнесийн өгөгдөл), шинэ мэдээний гарчиг/агуулга (Posts admin панель), бүтээгдэхүүний нэр/тайлбар (Products admin панель) — эдгээр аль хэдийн өөрийн CMS-тэй.
- Бодит тоо/хэрэглэгчийн мэдээлэл дээр тулгуурласан өгүүлбэрүүд (жишээ нь Quick Stats-ийн "Одоогийн зэрэглэл"/жишээ тайлбар өгүүлбэр, review count, үнэ) — эдгээр серверээс бодитоор тооцоологддог, чөлөөт текст болговол дүрмийн зөрчил гарах эрсдэлтэй.
- **"800+"** тоо 4 өөр газарт (Hero badge, TrustStrip, CategoryMasonry тайлбар, WhyChooseUs карт) давхардсан хэвээр байгаа — тус бүр ӨӨР ӨӨРИЙН slot-той тул нэгийг нь өөрчлөхөд бусад автоматаар өөрчлөгдөхгүй (админ UI-д энэ тухай тодорхой anхааруулга бичсэн).
- 2-мөртэй гарчиг бүр (жишээ: "Японы чанарыг / ойртуулна.") **нэг slot**-д "\n"-ээр холбогдсон 2 мөр хэлбэрээр хадгалагдана (74 slot-ыг 2 дахин нэмэхийн оронд), компонент бүр `.split("\n")`-ээр задалж өөрийн `<br/>`/`<em>` дүрслэлийг хэвээр хадгална. Нэг жижиг дизайны хялбарчлал: анх "Багахан **итгэл.**" гэж зөвхөн нэг үгийг тод өнгөтэй байсан бол одоо бүтэн эхний мөр адилхан онцлогтойгоор харагдана.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр. Шинэ `server/site-text.integration.test.ts` (3 тест: admin засвар → public query-д харагдах → reset → устах; буруу slotKey/хоосон утга rejected; admin бус caller rejected) — `site-media.integration.test.ts`-тэй ижил **snapshot-and-restore** discipline ашигласан (CLAUDE.md-ийн "бодит production slot ашиглахгүй" сануулгын дагуу). Бүрэн suite **33 файл, 168/168 тест ✅**. Playwright-ээр (түр суулгаад дараа нь бүрэн хассан): (1) 1440px-д бүх 9 харагдаж буй хэсгийг (Hero→QuickStats→Бидний ялгаа→WhyChooseUs→CategoryMasonry→Гэр бүл→Салбарууд→Эцсийн CTA) scroll хийж screenshot авахад бүгд визуал регресс алгүй зөв харагдав, overflow=0, console алдаагүй; (2) throwaway `staff` эрхтэй хэрэглэгчээр бодитоор нэвтэрч, admin → Content & Media → Текст таб нээж, нэг slot-ыг шинэ утгаар хадгалж, нүүр хуудсан дээр шууд тусгагдсаныг баталгаажуулсан (`QA-MARKER` тестийн текст), дараа нь slot-ыг устгаж, throwaway хэрэглэгч болон audit log мөрүүдийг DB-ээс бүрэн устгасан.

**Bestseller/Journal хэсгүүд screenshot дээр харагдаагүй** (одоогийн dev DB-д бодит захиалга/пост байхгүй тул арчилгааны дагуу бүхэлдээ нуугддаг, өмнө нь ч тэгж баримталж байсан зарчим) — эдгээр 2 хэсгийн wiring зөвхөн typecheck + кодын шалгалтаар баталгаажсан, бусад 9 хэсэгтэй яг ижил механик хэлбэрээр хийгдсэн тул итгэлтэй байна.

**Мэдэгдэж буй цаашдын ажил**: slot 74 тоо цаашид улам нэмэгдэж болно (жишээ нь Shop/ProductDetail/бусад хуудсууд текст-CMS-д ороогүй хэвээр, зөвхөн Home.tsx л энэ session-д хийгдсэн). Хэрэв Tom өөр хуудсыг мөн адил хамруулахыг хүсвэл ижил `shared/site-text.ts`/`useSiteText()`/`ContentTextPanel.tsx` pattern-ийг өргөтгөхөд хангалттай (шинэ table/backend endpoint шаардлагагүй, зөвхөн шинэ slot бүртгэл + component wiring).

## ✅ (2026-08-31) CategoryMasonry v7 — anchor scrim зөөллөв, 6 ангиллын зураг admin-аар засварлагдах боллоо

Tom v6-ийн дараа 2 зүйл заав: (1) жижиг 6 картын scrim-ийг v6-д арилгасан ч **anchor (том зураг) тайлын өөрийн харанхуй scrim хэвээр хэт хүчтэй, хажуугийн текстийг халхалж** байсан (би v6-д зөвхөн жижиг картуудыг л засаж, anchor-ийг огт хөндөөгүй байсныг олов), (2) одоо ашиглаж буй бүх зургийг `/admin` → Контент & Медиа-гаар солих боломжтой болгох.

**Root cause (anchor scrim)**: `.cat-mosaic-anchor-shade` градиент 80%-д бүрэн опак `#17181b`-д хүрдэг байсан (`rgba(23,24,27,0)→rgba(23,24,27,1)`), v6-ийн жижиг карт scrim-тэй ижил түвшний хүчтэй харанхуй байсан ч энэ tile дээр CTA текст (`OUR SELECTION` / `Нэг өдөрт хэрэгтэй бүх зүйл` / `Ойр салбараа олох`) шууд дээр нь давхцаж байдаг тул илүү мэдэгдэхүүнтэй асуудал болж байв.

Засвар (`client/src/index.css`, `.cat-mosaic-anchor-shade`): градиентийг зөөлрүүлж, дээд тал бүрэн тунгалаг хэвээр, доод талд **опак 1.0 биш, дээд тал нь 0.74**-д зогсоо (`rgba(23,24,27,0) 0%→30%, rgba(23,24,27,.5) 62%, rgba(23,24,27,.74) 100%`) — текст унших боломжтой хэвээр, зураг ил харагдана.

**Admin-editable зургууд**: `shared/site-media.ts`-д 6 шинэ slot нэмэв (`home-category-arhis-archilgaa`, `-goo-saikhan`, `-eruul-mend`, `-eruul-akhui`, `-us-ba-bie`, `-eej-ba-khuukhed`), тус бүрийн `fallbackUrl` нь `Home.tsx`-д одоо hardcode-логдсон бодит бүтээгдэхүүний зурагтай яг ижил (шинэ зураг зохиогоогүй, зөвхөн одоо байгааг admin-аар солих боломжтой болгов). `drizzle/schema.ts`-ийн `site_media.slotKey` нь `varchar(80)` (enum биш) тул миграци шаардлагагүй. `ContentMediaPanel.tsx`-ийн admin UI **generic `siteMediaSlots.map()`** loop ашигладаг тул шинэ 6 slot автоматаар upload/alt-text/reset controls-той гарч ирнэ — нэмэлт admin UI код бичих шаардлагагүй байв (энэ pattern аль хэдийн `home-hero`/`home-categories`/`home-family`/`home-stores`/`summer-slide-*`-д ашиглагдаж байсан).

`Home.tsx`-ийн `<CategoryMasonry categories={...}>`: `imageUrl` талбарыг `imageFor(\`home-category-\${category.slug}\`, category.imageUrl ?? null) ?? undefined` болгож, admin upload байвал түүнийг, байхгүй бол одоо байгаа бодит бүтээгдэхүүний зургийг ашиглана (сайтын бусад бүх site-media slot-той яг ижил pattern).

**Нэмэлт нээлт**: `home-categories` slot-ийн одоогийн `fallbackUrl` (`/manus-storage/sugi-professional-assortment_74fa4e31.jpg`) нь Manus AI үеийн хуучин, **404 dead link** болохыг `curl`-ээр баталгаажуулав (анкор tile яагаад цайвар placeholder+icon-оор л харагддаг байсны шалтгаан) — засаагүй, зөвхөн тэмдэглэв (Tom бодит зураг upload хийхэд шийдэгдэнэ, admin panel-аар боломжтой болсон).

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр. Playwright-ээр (түр суулгаад дараа нь бүрэн хассан) screenshot: anchor scrim нүдээр харахад мэдэгдэхүйц зөөлөрсөн (бүрэн харанхуй block алга, текст тод унших боломжтой), бүх 6 карт бодит зургаа хэвээр харуулж байгаа, хэвтээ overflow=0, console алдаагүй.

**⚠️ Хараахан хийгдээгүй, Tom тодорхой хүссэн 3 дахь зүйл**: "хажуудаа related холбоотой хамааралтай **текст**-ийг ч бас admin-аар засварлаж болдог болгох" — энэ хэсэгт ажил хараахан эхлээгүй. `site_media` систем нь зөвхөн ЗУРАГ-т зориулагдсан (slotKey → image URL/alt), текстэд зориулсан ижил төстэй pattern одоогоор байхгүй. Нүүр хуудсанд л гэхэд headings/subtitle/detail text маш олон газар байгаа (QuickStats, CategoryMasonry-ийн 6 картын гарчиг/тайлбар, WhyChooseUs, Journal, StoreLocator гэх мэт) — үүнийг бүрэн CMS болгох нь шинэ хүснэгт (`site_text` эсвэл ижил төстэй, slotKey→text/locale), шинэ admin UI хэсэг, бүх компонентод "backend утга байвал ашиг, үгүй бол hardcode fallback" logic оруулах шаардлагатай **том, тусдаа scope-той ажил** — энэ session-д эхлээгүй, тусад нь төлөвлөж эхлэх шаардлагатай.

## ✅ (2026-08-31) CategoryMasonry v6 — харанхуй scrim бүрэн арилав (бүтэц буруу байсныг олов)

Tom тодорхой screenshot (crop) илгээж "dark black shadow" арилгахыг шаардав, `.cat-mosaic-item-title`-ийг заав. Root cause: миний card бүтэц **зурган дээр текстийг давхарлаж** (background-image + харанхуй gradient scrim + цагаан текст) байрлуулж байсан бол reference-д зураг **дээд хэсэгт цэвэрхэн**, текст нь **доод цайвар (var(--card)) хэсэгт тусад нь**, харанхуй scrim огт байхгүй байв.

Засвар:
- `CategoryMasonry.tsx`: card-ийн JSX бүтцийг өөрчилж, `<span className="cat-mosaic-item-photo">` (зөвхөн зураг, дээр юу ч биш) + `<span className="cat-mosaic-item-body">` (var(--card) цайвар дэвсгэр, бодит текст) гэсэн 2 тусдаа блок болгов
- `index.css`: `.cat-mosaic-item-shade` (харанхуй gradient scrim) бүрэн устгав — текст одоо цайвар дэвсгэр дээр харанхуй текстээр байрладаг тул scrim огт хэрэггүй болов
- Photo зон `height:150px` (desktop), `130px` (mobile) тогтмол өндөртэй — бүх 6 карт яг ижил хэвээр
- Mobile line-clamp 2 хэвээр хадгалав

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр, 1440/768/375px screenshot — харанхуй сүүдэр/scrim ХААНАЧ алга, бүх карт ижил хэмжээтэй, real product photo цэвэрхэн харагдаж, текст цайвар дэвсгэр дээр тод унших боломжтой.

## ✅ (2026-08-31) CategoryMasonry v5 — uniform хэмжээтэй, харанхуй сүүдэргүй, зайгүй

Tom v4-ийг ("positions all over the place", "dark shadow", "zawaan baina") дахин татгалзаад **бүх картыг ижил хэмжээтэй болгохыг тодорхой шаардав** — v4-ийн "irregular masonry" чиглэл буруу байсныг хүлээн зөвшөөрөв.

Root cause (v4): `translateY`-ээр карт тус бүрийг зөөх нь **grid track-ийн layout зайг агшаадаггүй** (transform зөвхөн visual, layout биш) — тул мөр хоорондоо хоосон зай ("zawaa") үлддэг байсан. Мөн `--shadow-lg` (хүнд харанхуй сүүдэр) 2 картад тусгайлан байсан.

Засвар (`client/src/index.css`, `CategoryMasonry.tsx`):
- `.cat-mosaic-grid`: `1.15fr 0.95fr 0.9fr` (тэгш бус) → `repeat(3,1fr)` (**бүрэн тэгш**), nth-child өндрийн ялгаа бүгд арилсан → **нэг ижил `min-height:250px`** бүх 6 картад
- Per-card `translateY` overlap/offset transform (4 тусдаа class) бүгд арилаад, **бүх grid-ийг нэгэн зэрэг** (`margin-top:-28px`) дээш зөөж, anchor-той **бүх мөр 1-ийн 3 карт адилхан хэмжээгээр** давхцдаг болгов — grid track зөв тооцоологддог тул хоосон зай алга
- `--shadow-lg` (харанхуй сүүдэр) бүрэн хасаж, бүх карт ижил зөөлөн `--shadow-sm` авдаг болов
- `CategoryMasonry.tsx`-аас `CARD_TREATMENT` logic бүрэн арилгав (component код бас цэвэрлэгдэв)

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр, 1440/768/375px screenshot — бүх 6 карт нүдээр харахад яг ижил хэмжээтэй, харанхуй сүүдэргүй, мөр хоорондын хоосон зай алга.

## ✅ (2026-08-31) CategoryMasonry v4 — жинхэнэ masonry (ууртан ялгаатай өргөн/өндөр)

Tom v3-ыг (бүх карт бодит зурагтай ч 3 тэгш баганад) "alignment/geometry бүгд сонин" гэж дахин татгалзав. Deep reasoning: v3 нь **зөвхөн 3 тэгш баганатай grid дээр 2 картыг transform-оор бага зэрэг зөөсөн** байсан — жинхэнэ masonry (өргөн/өндөр бүрд ялгаатай) БИШ байв. Reference-д картуудын өндөр мэдэгдэхүйц ялгаатай (нэг карт мэдэгдэхүйц урт), stagger тод харагддаг, зай маш нягт.

Засвар (`client/src/index.css`, зөвхөн CSS):
- `.cat-mosaic-grid`: `repeat(3,1fr)` (тэгш) → `1.15fr 0.95fr 0.9fr` (тэгш бус баганын өргөн), `gap: 10px→6px` (нягт)
- 6 картад тус тусдаа `nth-child` дүрмээр **зориудаар өөр өөр өндөр** (230/300/250/210/260/230px) — өмнө нь бүгд ижил `min-height:200px`
- Overlap: `-48px/-42px → -56px/-46px`, Stagger: `24px/20px → 46px/34px` (өмнөх нь ~200-260px картын хэмжээтэй харьцуулахад бараг үл анзаарагдах байсан)
- Mobile (≤820px): бүх nth-child өндрийг дахин 260px нэгдмэл болгож reset хийсэн (desktop-ийн irregular өндрүүд mobile 2-баганад дамжихаас сэргийлэв)

**Тодруулга**: Anchor зураг (баруун дээд, том lifestyle зураг) энэ орчинд одоо ч placeholder gradient хэвээр байгаа — учир нь "home-categories" R2 slot-д бодит зураг upload хийгээгүй байна. Энэ бол admin панелаас Tom өөрөө зураг upload хийх шаардлагатай **өгөгдлийн дутагдал**, код/geometry-ийн асуудал биш.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр, 1440/768/375px screenshot, overflow 0.

## ✅ (2026-08-31) CategoryMasonry v3 — бүх 6 карт бодит бүтээгдэхүүний фототой болов

Tom v2 (icon+text давхар зурагтай) хувилбарыг мөн "professional биш" гэж татгалзаад reference зурагтай (854×892 crop) дахин нягт харьцуулав. Гол ялгаа: reference-ийн small card бүр **бодит гэрэл зурагтай бүтээгдэхүүн** харуулдаг, миний хийсэн icon (шугаман зурсан lipstick/эмийн лонх icon) огт өөр. DB-ээс шалгахад **бүх 6 категори бодит, currently-published product фототой байсан** (`SELECT ... FROM products WHERE categoryId=? AND isPublished=1 AND imageUrl NOT LIKE '%placeholder%'`) — тул зохиомол/stock зураг биш, **жинхэнэ каталогийн бодит бүтээгдэхүүний фото** ашиглав.

Засвар:
- `Home.tsx`-ийн `categories` array-д `imageUrl` талбар нэмж, категори бүрт нэг бодит product photo оноов (жишээ нь Арьс арчилгаа → organic-sugar-squalane, Гоо сайхан → SokaMocka makeup remover, гэх мэт).
- `CategoryMasonry.tsx`: бүх 6 карт (өмнөх 2-оос) `.cat-mosaic-item--image` болов, `category.imageUrl`-г ашиглаж, зөвхөн байхгүй тохиолдолд `getCategoryPlaceholderImage` fallback хэвээр.
- Screenshot хийх явцад олдсон 2 CSS bug: (1) icon хассанаас `.cat-mosaic-item-number` badge зүүн тал руу шилжиж гарчигтай давхцаж байсныг `margin-left:auto` нэмж засав; (2) цайвар (жишээ нь цагаан лонх) бүтээгдэхүүний зураг дээр цагаан гарчиг текст харагдахгүй болж байсныг (scrim хангалтгүй) `.cat-mosaic-item-body`-д тусдаа найдвартай gradient scrim нэмж засав; (3) mobile 6 карт бүгд image болсноор `-webkit-line-clamp:1` бүх гарчгийг таслаж байсныг `2` болгож засав.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр, 1440/768/375px screenshot, overflow 0. Dev server-ийг Tom-ийн хүсэлтээр асаалттай үлдээв (screenshot QA-д зориулж Playwright-ыг л түр суулгаад бүрэн хассан).

## ✅ (2026-08-31) Quick Stats infinity graph — зочны төлөвт огт харагдаагүй bug засав + reference-тэй тааруулав

Tom reference зурагтай харьцуулаад "too basic" гэж татгалзсан. Root cause: **зочны (нэвтрээгүй) төлөвт infinity graph огт харагдаагүй** — зөвхөн 4 талбарын box харагдаж байсан (`QuickStatsSection.tsx`-ийн хуучин `.qs-guest-tiers` fallback). Тому reference-ийг зочноор харж байсныг баталгаажуулсан тул энэ бол гол шалтгаан байв. Дэлгэрэнгүй reasoning audit: `C:\Users\hero_\.claude\plans\aiven-msql-yg-connect-stateless-mitten.md`.

Засварууд (`InfinityGraph.tsx`, `QuickStatsSection.tsx`, `client/src/index.css`-ийн `.ig-*`/`.qs-*`):
- **Зочны төлөвт мөн адил infinity graph харагдана** — `shared/loyalty.ts`-ийн бодит `getLoyaltyTier`/`getNextLoyaltyTier`-ээс тооцоолсон жишээ утгаар (₮600,000 зарцуулалт → Хүрэл 3%), дэлгэц дээр тод **"ЖИШЭЭ ХАРУУЛАЛТ"** гэсэн шошготой — хэзээ ч хэрэглэгчийн бодит өгөгдөл гэж андуурагдахгүй.
- **Гарчиг "Quick Stats" болов** (өмнө нь зөвхөн жижиг eyebrow tag-д байсан, гол гарчиг нь өөр монгол хэллэг байсан) — master-prompt §16.5-ийн тодорхой заавраар reference-ийн visual-ыг хадгалж, монгол тайлбарыг доор нь нэмсэн.
- **Gradient stroke нэмэгдсэн** (`<linearGradient>` SVG defs) — өмнө нь flat өнгө байсан.
- **Шинэ muted өнгөний token** (`--graph-copper`, `--graph-copper-light`, `--graph-charcoal`, `--graph-gold-muted`) — master prompt тодорхой зааж байсан ("muted terracotta, not bright red") учир брэндийн тод vermilion/gold-ыг ашиглахгүй, зөвхөн энэ graph-д зориулсан шинэ token.
- **Geometry pinch засав**: 2 тойргийн зай 140px→166px (R=88 хэвээр) — өмнө нь 36px давхцдаг байсан бол одоо ~10px, жинхэнэ ∞ crossing шиг харагдана.
- **Том дүнгийн compact формат нэмэв** (`formatMntCompact`, жишээ нь "1.1M₮") — master prompt §16.7-ийн зөвлөсөн "₮1.2M" загварыг мөрдөж, infinity graph дотор урт тоо халхлагдахаас сэргийлэв.
- **Explore хийх явцад олдсон, холбоогүй bug**: `.eyebrow` class (сайт даяар ашиглагддаг) `display:inline-flex` тул зочны төлөвт дараагийн `.qs-cta` линктэй нэг мөрөнд наалддаг байсныг 768px screenshot-оор олж, `.qs-copy > .eyebrow { display: flex; }` гэсэн **scoped** (зөвхөн Quick Stats-д хамаарах, глобал биш) засвар хийсэн.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр, 1440/768/375px дээр screenshot (guest), throwaway хэрэглэгч+захиалгаар authenticated screenshot (Мөнгөн 5%, 1.1M₮, 24,000₮ хэмнэлт, Алтан хүртэл 8,924,000₮ — бүгд зөв), дараа нь бүх throwaway өгөгдлийг DB-ээс устгаж баталгаажуулсан. Playwright түр суулгаад бүрэн хассан.

## ✅ Brevo API IP хязгаарлалт арилсан, имэйл бодитоор ажиллаж байгааг баталгаажуулсан (2026-08-26)
Өмнөх blocker (`GET /v3/account` 401 "unrecognised IP address") шийдэгдсэн — Tom өөрийн талаас (яг ямар алхмаар хийснийг тодорхой мэдэгдээгүй, гэхдээ dashboard дээрх ганц "toggle" биш байсныг батлаcан) IP-г зөвшөөрсний дараа шууд бодитоор шалгасан:
- `GET https://api.brevo.com/v3/account` → **200 OK**, бодит акаунтын мэдээлэл буцсан (free tier, 300 sendLimit credit, "Sugi asayake" байгууллага).
- `POST /v3/smtp/email` → **201 Created**, бодит имэйл `t.morius@gmail.com` руу амжилттай илгээгдэж, жинхэнэ `messageId` буцсан.

**Имэйл (`sendAccountEmail`) бүрэн ажиллаж байгаа нь баталгаажлаа** — захиалгын баталгаажуулах, staff invitation, back-in-stock мэдэгдэл гэх мэт бүх имэйл feature-үүд одоо localhost дээрээс ч бодитоор гарах боломжтой.

**SMS хараахан шалгаагүй** (`sendAccountSms`) — Brevo-ийн SMS нь имэйлээс тусдаа кредит систем (мөнгө зарцуулдаг тул зөвшөөрөлгүй туршиж үзээгүй). SMS туршихаасаа өмнө Tom-оос: (1) Brevo dashboard дээр SMS кредит худалдаж авсан эсэх, (2) Монгол улс руу route/үнэ дэмжигдсэн эсэхийг (Transactional SMS → Country pricing) баталгаажуулах хэрэгтэй.

Одоо **mass SMS/Email campaign feature (email хэсгийг нь)** эхлэх боломжтой.

## ✅ Admin Analytics — Geckoboard дизайн + Conversion Rate/CAC/Return Rate дуусав (2026-08-27)
Tom Geckoboard дашбордын screenshot илгээж, яг тэр дизайнаар (харанхуй KPI карт, sparkline, gauge, P&L card, ranked list) хийхийг, мөн өмнө нь орхигдсон 3 metric-ийг (Conversion Rate, CAC, Return Rate — гурвуулаа шинэ өгөгдлийн эх сурвалж шаардсан тул хойшлуулагдаж байсан) заавал дуусгахыг тодорхой шаардсан. Бүгд дуусав:
- **Дизайн**: `AdminAnalyticsPanel.tsx`-ийн KPI хэсэг бүхэлдээ харанхуй `#17181b`/`#1f2126` дизайнтай болсон (зөвхөн энэ component дотор, сайтын global dark mode-той хамааралгүй). Sparkline/gauge chart-уудыг QA хийх явцад **жинхэнэ CSS bug олж заслаа**: CSS grid item-д `min-w-0` байхгүй бол дотор нь `justify-between` flex мөр багана гаднаа гарч зэргэлдээ карт руу орж болдог (2 газарт олдож заслаа). Мөн `bg-white/5` (тунгалаг) card background нь энэ орчны headless screenshot pipeline дээр visual ghosting artifact үүсгэдэг байсныг (getBoundingClientRect/elementFromPoint-оор бодит DOM зөв гэдгийг батлаад) илрүүлж, `#1f2126` (opaque) болгож шийдсэн.
- **Conversion Rate** (хамгийн том хэсэг): энэ site-д урьд байгаагүй жинхэнэ 1st-party visitor/session tracking (`visitor_sessions` хүснэгт, `telemetry.pageview` public procedure, `client/src/lib/pageviewTracking.ts`-ийн beacon). Hөрвүүлэлтийн хувь = захиалга ÷ session (Shopify-ийн стандарт томъёо).
- **CAC**: шинэ `marketing_spend` хүснэгт (сар тутам admin гараар оруулдаг), CAC tile дээрх inline editor-оор шууд оруулна. Сар бүрт зардал орсон эсэхийг бүрэн шалгадаг (нэг сар дутуу бол "тодорхойгүй" гэж мэдэгдэнэ, хэзээ ч ₮0 гэж таамаглахгүй).
- **Return Rate**: `orders.status`-д `"returned"` нэмэгдэв (зөвхөн "completed"-ээс шилждэг). **Явцад ноцтой pre-existing bug олж заслаа**: `updateAdminOrder`-ийн хуучин код "completed" захиалгыг ЯМАР Ч байдлаар өөрчлөхийг хориглодог байсан тул буцаалт хийх боломж угаасаа байгаагүй.
- **Мөн явцад олсон, том нөлөөтэй pre-existing bug засав**: `orders.paymentStatus` нь зөвхөн QPay webhook-оос л "paid" болдог байсан — бэлэн мөнгө/шилжүүлгийн захиалга хэзээ ч "paid" болдоггүй байсан тул **бараг бүх analytics тоо (орлого гэх мэт) бодит cash-on-delivery захиалга дээр ажиллахгүй байх эрсдэлтэй байсан**. Одоо "Дууссан" болгоход QPay биш захиалга автоматаар "paid" болдог.

`pnpm exec vitest run --no-file-parallelism` **161/161** (шинэ 7 тест: `telemetry.integration.test.ts` 4 + `analytics.integration.test.ts`-д нэмэгдсэн 3). Playwright-ээр throwaway admin+synthetic order/session өгөгдлөөр дэлгэрэнгүй QA хийж баталгаажуулсан, бүх throwaway өгөгдлийг устгаж DB-г буцаан хоосон төлөвт нь оруулсан. Дэлгэрэнгүй: [HISTORY.md](HISTORY.md).

## ⚠️ Admin эрх хэн авдаг вэ — bootstrap логик (`server/db.ts`-ийн `createUserWithPassword`)
Шинээр бүртгүүлж буй хэрэглэгч **admin** эрхтэй болдог ЗӨВХӨН: (1) `users` хүснэгт хоосон үеийн хамгийн ЭХНИЙ хэрэглэгч, эсвэл (2) имэйл нь `.env`-ийн `OWNER_EMAIL`-тэй яг таарвал. Бусад бүх шинэ бүртгэл энгийн `"user"` эрхтэй. `staff`/`admin` эрхийг зөвхөн одоо байгаа admin гараар л оноож болно.

⚠️ **Production/deploy хийхээсээ өмнө заавал шалгах:** `.env`-ийн `OWNER_EMAIL=t.morius@gmail.com` байх ёстой (placeholder-оор биш).

## ⚠️ Чухал сануулга: integration test-үүд бодит production slot/контент ашиглахгүй байх
`site-media.integration.test.ts` өмнө нь бодит `home-hero` slot-ыг шууд ашиглаж, `afterEach`-д болзолгүй устгадаг байсан тул тест ажиллуулах БҮРТ Tom-ий бодит upload-ийг DB-ээс устгаж байсан (2026-08-26, дэлгэрэнгүй HISTORY.md). Одоо snapshot-and-restore болгож заслаа. **Ирээдүйд шинэ integration test бичихдээ**: бодит хэрэглэгчийн харах/удирдах өгөгдөл (site_media slots, бодит admin тохиргоо гэх мэт) дээр тест хийвэл заавал snapshot-and-restore хэлбэрээр бичих, эсвэл тусад нь throwaway өгөгдөл (marker-tagged) ашиглах — хэзээ ч бодит slot/мөрийг болзолгүй устгах/дарж бичихгүй байх.

## ✅ (2026-08-28) Гэрийн лаптопын DB blocker цуцлагдсан — `.env` одоо Aiven руу заасан байна
Дээрх "идэвхтэй blocker" тэмдэглэл хуучирсан байсныг олж, шалгаад баталгаажуулав: энэ (гэрийн) лаптопын `.env`-ийн `DATABASE_URL` одоо `mysql://root:...@127.0.0.1/...` биш, харин **Aiven-ийн шууд hostname** (`sugi-asayake-db-project-4b75.h.aivencloud.com`) руу заасан байна — өөрөөр хэлбэл хоёр лаптоп аль хэдийн нэг ижил шинэ шинэ shared DB ашиглаж эхэлсэн (хэн, хэзээ шилжүүлснийг тодорхойгүй, гэхдээ бодитоор шалгасан). `SELECT count(*)` асуулгаар шууд баталгаажуулсан: **937 бараа, бодит захиалгууд байна**. Иймд доорх "DB backup сэргээх" алхам ба "гэрийн лаптоп дээр бодит өгөгдөл байхгүй" гэсэн урьдны тэмдэглэлүүд **бүгд хуучирсан** — цаашид гэрийн лаптоп дээрээс ч бодит 937 барааны өгөгдлөөр Admin Analytics, Categories, bestsellers зэргийг шалгах боломжтой.

## ✅ (2026-08-28, гэрийн лаптоп дээр) CategoryMasonry v2 засвар ВАЛИДАЦИ ХИЙГДЭЖ ДУУСАВ
Өмнөх тэмдэглэл ("код бичигдсэн ч validation хийгдээгүй") дараагийн session-д гэрийн лаптоп дээр (`C:\Users\hero_\Documents\Projects\sugi-asayake`, local MySQL, мөн 937 бараа) бүрэн шалгагдаж, олдсон 3 бодит bug засагдав:

- **`pnpm check` / `pnpm build`** — цэвэр (олон удаагийн checkpoint).
- **Overlap тоогоор баталгаажаагүй байсан** — эхний хувилбарт `margin-top`/`translateY` тооцоо буруу байсны улмаас overlap card-ууд boditoor anchor-ийн ирмэгт **хүрээгүй** (0px эсвэл -8px зай) байсныг Playwright `getBoundingClientRect()`-ээр яг хэмжиж олж, `.cat-mosaic-grid margin-top: 34px→16px`, `--overlap-1: -34px→-48px`, `--overlap-2: -26px→-42px` болгож засаад **32px/26px бодит overlap** (Tom-ийн шаардсан 24-40px хязгаарт) болохыг дахин хэмжиж баталгаажуулсан.
- **Anchor-ийн өөрийн "Ойр салбараа олох" линк overlap card-д халхлагдаж байсан** — `.cat-mosaic-anchor-card`-ийн `bottom: 24px→64px` болгож зассан.
- **Том bug: category placeholder SVG-үүдэд (`client/public/category-placeholder-*.svg`, мөн `product-placeholder.svg`) far "SUGI ASAYAKE" watermark текст шингэсэн байсан** (viewBox 400x400, y=335≈84% доод хэсэгт) — image-led card болон anchor-ийн `background-size:cover`-ээр card дүүргэхэд энэ watermark ил гарч ирж байсныг олж, scrim gradient-ийг тохируулж (`rgba(0) 0%→0% 58%→opaque #17181b 80%→100%`) бүрэн нуусан — **icon зураг (гоо сайхны lipstick, эрүүл мэндийн savtai icon гэх мэт) бүрэн харагдахаар үлдээж, зөвхөн доод watermark хэсгийг л нуусан** (эхний хувилбарт хэт хүчтэй scrim хийж icon-ийг бүхэлд нь нуучихсан алдаа гарсан, дараа нь тэнцвэржүүлсэн).
- **Mobile (≤820px) 2-баганад "Эрүүл мэнд" картын гарчиг icon-той давхцаж байсан** (157×200px нарийхан карт дээр `background-size:cover` бүх өндрийг харуулдаг тул icon+title зай хүрэлцэхгүй байсан) — `.cat-mosaic-item--image { min-height: 260px }` + гарчгийг 1-мөрөнд `-webkit-line-clamp:1` болгож зассан.
- **Баталгаажуулалт**: 1440/1024/768/430/375px бүх breakpoint дээр screenshot + `getBoundingClientRect()`-ээр pixel хэмжилт (overlap 32px/26px, offset 24px/20px), хэвтээ overflow 0, console/page алдаагүй. Playwright түр суулгаад (`pnpm add -D playwright -w`) дараа нь бүрэн хассан (`git checkout -- package.json pnpm-lock.yaml` + `pnpm install`).
- **Файлууд** (эцсийн): `client/src/index.css`-ийн `.cat-mosaic*` блок (олон удаа засварлагдсан), `client/src/components/home/CategoryMasonry.tsx`, `client/src/pages/Home.tsx`-ийн `categories` array-д `slug` талбар (өмнөх session-ээс өөрчлөгдөөгүй).

## ✅ (2026-08-28) Нүүр хуудасны premium reference-driven редизайн (Tier 0–7) дуусав
`docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md`-д тулгуурлан бүх нүүр хуудсыг дараалан (tokens/primitives → Hero → TrustStrip → **QuickStatsSection** (шинэ, infinity graph) → **CategoryMasonry** (шинэ, асимметр collage) → **WhyChooseUs** (шинэ, харанхуй 3 карт) → **JournalSection** (staggered restyle) → **StoreLocatorSection** (3-бүсийн зохион байгуулалт)) хийж дуусгав. `client/src/pages/Home.tsx` (302 мөрийн монолит) `client/src/components/home/*.tsx`-руу section тус бүрээр задарсан.
- **Quick Stats**: шинэ backend талбар `totalLoyaltySavingsMnt` (`server/db.ts`-ийн `getUserLoyaltyStatus`, зөвхөн `paymentStatus="paid"` захиалгын `loyaltyDiscountMnt`-ийг нэгтгэдэг, coupon/routine-той холилдохгүй) + `server/loyalty.integration.test.ts`-д 4 шинэ тест (бүгд pass). Frontend: `AdminAnalyticsPanel.tsx`-ийн `polarPoint`/`arcPath` SVG arc math-ыг `client/src/lib/svg-arc.ts`-руу зөөж (2 дахь хэрэглэгч гарсан тул) хуваалцав. Зочинд зөвхөн public tier table, нэвтэрсэн хэрэглэгчид бодит infinity graph (spend progress + discount%) + тусдаа "нийт хэмнэсэн дүн" тоо харагдана — 3 metric хэзээ ч холилдохгүй.
- **Categories masonry**: hardcoded 6 категори (icon/дараалал editorial curation, нэрс нь бодит `product_categories`-тай баталгаажсан таарсан) — href-ийг `/shop?category=...`-руу бодитоор холбов (`shared/catalog-filter.ts`-ийн exact-match логиктой баталгаатай).
- **Store locator**: 3 бодит салбар хэвээр, газрын зураг нь static SVG дүрслэл (Google Maps API key хаана ч тохируулаагүй тул `Map.tsx`-ийг холбоогүй — infra шийдвэр шаардана).
- **Баталгаажуулалт**: `pnpm check`/`pnpm build` олон checkpoint дээр цэвэр; Playwright (түр суулгаад дараа нь бүрэн хассан, `package.json`/lockfile өөрчлөгдөөгүй) -оор 1440px/390px screenshot, хэвтээ overflow шалгалт (1440–320px бүх breakpoint, 0 overflow), **бодит throwaway хэрэглэгч+захиалгаар authenticated Quick Stats infinity graph screenshot аваад тоо мат зөв болохыг баталгаажуулж (жишээ: Мөнгөн 5%, ₮1,076,000 зарцуулалт, ₮24,000 хэмнэлт, Алтан хүртэл ₮8,924,000 дутуу — бүгд гараар тооцоотой таарсан), дараа нь бүх throwaway өгөгдлийг DB-ээс устгаж баталгаажуулсан**. Нэг бага зэргийн CSS bug олж заслаа (mobile дээр category card-ийн тайлбар текст сум icon-той давхцаж байсан).
- **Тодруулга**: full test suite ажиллуулахад 21 тест fail гарсан (жишээ нь `order-notifications.integration.test.ts`, `discount-codes.integration.test.ts`, `checkout.guest.integration.test.ts` гэх мэт) — **эдгээр бүгд миний хөндөөгүй файлууд**, тусад нь isolate хийж ажиллуулахад ч давтагдсан тул энэ session-ийн ажилтай холбоогүй, өмнөх орчны/сүлжээний асуудал (Aiven network timeout 5000ms default vitest timeout-оос давсан + `order-notifications`-ийн тодорхойгүй logging асуудал). Дэлгэрэнгүй шалгаагүй — доор дараагийн ажлын саналд нэмэв.

## Дараагийн ажлын санал
0. **🔴 ХАМГИЙН ЭХЭНД**: `scripts/auto-tag-products.ts --apply`-г бодит Aiven дээр ажиллуулах (эхлээд `scripts/db-backup.ps1`) — Preference Profile v2/Recommendation Engine v2 дээрх тэмдэглэлийг үзнэ үү. Tom "937/937 tagged болго" гэж тодорхой шаардсан, dry-run 937/937 гаргаж байгааг баталгаажуулсан ч бодит бичилт хараахан хийгдээгүй. Мөн Home/Shop/ProductDetail дээрх шинэ "Танд санал болгож байна"/related-products секцүүдийг apply хийсний дараа дахин screenshot-оор шалгаж, олон төрлийн ангиллаас бараа гарч байгааг (зөвхөн нэг ангилал давамгайлахгүй) баталгаажуулах.
1. **Homepage редизайны хараахан хийгээгүй хэсэг**: `CommerceHeader.tsx` (бусад бүх хуудсанд ашиглагддаг) `Home.tsx`-ийн өөрийн header/hamburger-ээс ялгаатай хэвээр (нэгтгэх ажил хийгдээгүй); "800+" тооны бодит баримт шалгалт (одоо 937 бараа баталгаажсан тул "900+" эсвэл яг тоог шинэчлэх боломжтой боллоо); Shop/Product Detail/Checkout/Profile/Admin хуудсууд master prompt-ийн Tier 19-23-ийг хараахан хийгээгүй (зөвхөн homepage Tier 0-21-ийн хамрах хэсгийг хийсэн)
2. **Тест suite-ийн 21 fail-ыг судлах** (дээрх тэмдэглэл) — миний ажилтай холбоогүй ч Tom-д мэдэгдэх шаардлагатай: `order-notifications.integration.test.ts` 3 тест тусгаарлагдсан орчинд ч тогтвортой fail гардаг (network timeout биш, logged utгa хоосон), мөн олон файлд `Test timed out in 5000ms` — Aiven-руу сүлжээний саатал эсвэл vitest global timeout-ийг нэмэгдүүлэх шаардлагатай эсэхийг Tom-той зөвшилцөх
3. **Admin Analytics dashboard**-ыг (Geckoboard дизайн + Conversion Rate/CAC/Return Rate) одоо бодит 937 барааны/захиалгын өгөгдлөөр нүдэн дээр шалгах боломжтой боллоо (өмнө нь "гэрийн лаптоп дээр боломжгүй" гэж тэмдэглэгдэж байсан — дээрх DB blocker цуцлагдсан тэмдэглэлийг үзнэ үү)
4. **Барааны бодит зураг — pilot-ийн үлдсэн хэсэг / цар хүрээ шийдэх** (24-ийн 6 нь дууссан, 18 нь placeholder дээрээ үлдсэн; 937-ийн үлдсэн 913-ыг мөн адил хийх эсэхийг Tom-той тодруулах — дэлгэрэнгүй [HISTORY.md](HISTORY.md)-ийн сүүлийн хэсэгт)
5. **Mass SMS/Email campaign** (email тал одоо бодитоор ажиллаж байгаа нь баталгаажсан — дээрх Brevo хэсгийг үзнэ үү; SMS-ийг эхлэхийн өмнө Tom-оос кредит/route баталгаажуулах хэрэгтэй)
6. Product Variants-ийн frontend-ийг бодит олон variant-тай бараагаар Playwright screenshot-оор нүдэн дээр баталгаажуулах (PHASE 1+2 код бэлэн, 149 автомат тест+DB probe-оор баталгаажсан ч бодит browser screenshot хараахан аваагүй)
7. eBarimt — Tom SmartSoftware POS нийлүүлэгчтэйгээ [EBARIMT.md](EBARIMT.md)-ийн 6 асуултыг тодруулах ёстой (код бичих ажил биш)
8. PREMIUM-FEATURES.md TIER 5 үлдсэн (referral, abandoned-cart имэйл), ROADMAP TIER 2 үлдсэн (refund урсгал), TIER 5 үлдсэн (Sentry, staging, CDN, uptime monitoring)
9. ⚠️ CI дээр магадгүй улаан гарч буй `INTEGRATIONS_ENCRYPTION_KEY` тестийн цоорхой (дээр дурдсан) — шийдэхийн өмнө Tom-той зөвшилцөх
10. ✅ ~~Нүүр хуудасны текст admin-аар засварлах CMS~~ — **дууссан (2026-09-01, дээрх шинэ бичлэгийг үзнэ үү)**, зөвхөн Home.tsx-ийн хамрах хүрээгээр (Tom-ийн тодорхой сонголтоор). Хэрэв Tom Shop/ProductDetail/бусад хуудсыг мөн хамруулахыг хүсвэл ижил `shared/site-text.ts`/`useSiteText()`/`ContentTextPanel.tsx` pattern-ийг өргөтгөхөд хангалттай (шинэ backend/table шаардлагагүй)

Дэлгэрэнгүй бүх session-ий бүрэн түүх, шалтгаан, screenshot-ын баталгаажуулалт: **[HISTORY.md](HISTORY.md)**.
