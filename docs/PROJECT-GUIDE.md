# SUGI ASAYAKE — Төслийн танилцуулга (хөгжүүлэгчийн тэмдэглэл)

Энэ файлыг ажил эхлэх бүрт эхлээд уншина.

> 📘 **Код хэрхэн ажилладаг вэ — бүрэн тайлбар: [docs/CODEBASE.md](docs/CODEBASE.md)** (2026-09-12). Файл бүр юу хариуцдаг, өгөгдөл хаанаас хаашаа урсдаг, хэзээ ч зөрчиж болохгүй 8 дүрэм. Шинэ файл нэмэх/өөрчлөх бүрт түүнийг мөн шинэчилнэ. **Файлыг бага байлгахын тулд дэлгэрэнгүй өдөр бүрийн ажлын лог [HISTORY.md](HISTORY.md)-рүү зөөгдсөн** (2026-08-26) — тодорхой bug/шийдвэрийн шалтгааныг мэдэх хэрэгтэй үед л тэнд хайна. Энд зөвхөн **одоогийн статус, тохиргоо, идэвхтэй асуудал** байна.

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
# Сонголттой (2026-09-04, доор дэлгэрэнгүй) — байхгүй бол error tracking чимээгүй no-op:
HONEYBADGER_API_KEY=
# Сонголттой (2026-09-05, доор дэлгэрэнгүй) — байхгүй бол утасны SMS баталгаажуулалт
# (бүртгэл + нууц үг сэргээх) дуудагдмагц ШУУД алдаа шидэнэ (бусад интеграцаас ялгаатай,
# чимээгүй no-op БИШ — эсвэл шалтгаан server/_core/env.ts-ийн verifyMnApiKey-ийн тайлбарт):
VERIFY_MN_API_KEY=
# Сонголттой боловч production-д ЗААВАЛ (2026-09-09 deep audit, доор дэлгэрэнгүй): Aiven-ий CA
# сертификат (PEM, Aiven Console → service → Overview → "CA certificate"). Байвал сервер
# сертификатыг шалгана; байхгүй бол TLS ажиллах ч сертификат шалгагдахгүй (startup-д warning).
# Эсвэл файлын зам: DATABASE_CA_CERT_PATH=./aiven-ca.pem (файлыг commit хийхгүй).
# ✅ 2026-09-12: ГЭРИЙН лаптоп дээр ./aiven-ca.pem + DATABASE_CA_CERT_PATH тавигдаж, бодитоор шалгасан
#    (TLSv1.3, буруу CA-г татгалзсан). АЖЛЫН лаптоп + production host дээр ижил файлыг гараар хуулна
#    (Aiven Console → Overview → CA certificate) — .env болон *.pem хоёулаа gitignore тул git-ээр ирэхгүй.
DATABASE_CA_CERT_PATH=./aiven-ca.pem
# Сонголттой (2026-09-11): утасны push мэдэгдлийг ЭНЭ машинаас илгээх эсэх. Хоёр лаптоп нэг DB
# хуваалцдаг тул зөвхөн НЭГ машин (production host) дээр 1 болгоно. ntfy-ийн token/сэдвүүд .env-д
# БИШ, /admin → Интеграцууд-д шифрлэгдэж хадгалагдана.
NOTIFICATIONS_DISPATCH=
```
Клиент талд мөн `VITE_HONEYBADGER_API_KEY` (server-ийн `HONEYBADGER_API_KEY`-тэй ижил утга) тохируулж болно — Vite build руу шингэдэг тул нууц биш, Sentry-ийн public DSN-тэй ижил итгэлийн загвар.
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
`drizzle/meta` экспортод ороогүй тул `pnpm db:push`-д бүрэн найдаж болохгүй — `.sql` файлуудыг гараар ажиллуулна. **2026-09-09-өөс хойш албан ёсны арга** (Aiven дээр аппын өөрийн холболтоор — TLS, UTC session, query log бүгд production-тай ижил; `--> statement-breakpoint`-ийг өөрөө хасна):
```powershell
pnpm exec tsx scripts/db-apply-migration.ts drizzle/0056_discount_code_per_customer_cap.sql
```
Өмнө нь: `scripts/db-backup.ps1 -DatabaseUrl "<Aiven URI>"` (`-DatabaseUrl`-гүй бол `$env:DATABASE_URL` шаардана, `.env`-ийг өөрөө уншдаггүй). Зөвхөн интернэтгүй, local MySQL дээр ажиллаж байгаа үед л хуучин арга: `(Get-Content <file>.sql -Raw) -replace '--> statement-breakpoint', '' | mysql.exe -u root -p sugi_asayake`.

### Тест ажиллуулах тухай
Бүх integration gate идэвхтэй үед vitest-ийн анхдагч параллель горим тогтмол бус ~3 файлыг унагаадаг (pre-existing race, 20 гаруй файл нэг MySQL/MinIO-г зэрэг hammer хийдгээс) — **үргэлж `pnpm exec vitest run --no-file-parallelism` ашиглах**:
```powershell
$env:RUN_AUTH_INTEGRATION_TESTS="1"; $env:COMMERCE_INTEGRATION_TESTS="1"; $env:RUN_MEDIA_INTEGRATION_TESTS="1"
pnpm exec vitest run --no-file-parallelism
```
Сүүлд БОДИТООР хэмжсэн бүрэн тоо: **783/783 ✅ (84/84 файл, регресс 0)**, `52e9e65` дээр (2026-09-12, SQL injection probe-той). ⚠️ Бүрэн suite ажиллаж байхад **зэрэгцүүлэн өөр тест/скрипт ижил Aiven дээр ажиллуулахгүй** — 2026-09-12-нд ингэснээс `loyalty.integration` hook 10 с timeout-оор нэг удаа унасан (485 с), цэвэр дараалсан run-д ногоон. Мөн **`pnpm check`** одоо 2 tsc (апп + `tsconfig.tests.json`-оор тест/скрипт) ба **`pnpm lint`** (ESLint, CI-д ч ажиллана) — commit хийхээсээ өмнө хоёуланг ажиллуул. Шинэ integration тест fake session user бичихгүй, `server/_test-helpers.ts`-ийн `testSessionUser({id,...})`-ийг ашиглана (CI горимд gate-үүд идэвхгүй тул ихэнх integration файл skip болно — хэвийн). ⚠️ Strict rate-limit tier-үүд одоо DB дээр тоолдог (`rate_limit_buckets`) тул тестэд **тогтмол IP** ашиглавал 15 минутын дотор дахин ажиллуулахад блоклогдоно — `callerFor`-ийн санамсаргүй/per-run IP загварыг дага.

✅ **CI-ийн `INTEGRATIONS_ENCRYPTION_KEY` цоорхой ШИЙДЭГДСЭН (2026-09-01)**: `server/integrations.integration.test.ts`-ийн "encryption (unit)" 2 тест gate-гүйгээр ажилладаг ба `server/_core/crypto.ts`-ийн `getKey()` нь 64-тэмдэгт hex түлхүүргүй бол шууд шатдаг тул бодит GitHub Actions дээр улаан гарч байв. Эдгээр нь **зөвхөн round-trip болон tamper-detection шалгадаг цэвэр unit тест** бөгөөд түлхүүрийн утга нь огт хамаагүй. Тиймээс `server/_test-setup.ts` орчинд түлхүүр байхгүй үед л **түр зуурын түлхүүр өгдөг** болгов (бодит `.env` утга байвал үргэлж түүнийг хүндэтгэнэ). **Аппликейшний код (`env.ts`/`crypto.ts`) огт хөндөгдөөгүй** — жинхэнэ сервер бодит түлхүүргүйгээр юу ч шифрлэхээс татгалзсан хэвээр, өөрөөр хэлбэл аюултай "insecure dev fallback" НЭМЭЭГҮЙ. Улмаар `ci.yml`-д repo secret огт хэрэггүй болж, шинэ clone дээр `pnpm test` тохиргоогүйгээр ногоон гарна.

### Шинэ S3/R2 bucket байгуулах бүрт (production, шинэ орчин) мартаж болохгүй 2 алхам
Зөвхөн `CreateBucketCommand` хийгээд зогсвол зураг upload "амжилттай" ч browser дээр **403**-аар харагдахгүй:
1. `CreateBucketCommand`
2. `PutBucketPolicyCommand` (`s3:GetObject`-ийг public болгох)

## Одоогийн статус — юу шалгагдсан, юу шалгагдаагүй

**Ажиллаж байгаа нь баталгаажсан:** бүртгэл/нэвтрэлт (OTP 2-алхамт, эхний хэрэглэгч auto-admin), role-based хамгаалалт, admin панель (бүтээгдэхүүн/зураг/post/routine/coupon/promo/integrations/variants), каталог+server-side FULLTEXT хайлт (`catalog.search`), guest checkout, loyalty/routine хямдрал, reviews, wishlist, profile (address book, preferences, security), захиалгын имэйл мэдэгдэл (Brevo), Cloudflare R2 storage (хоёр laptop хуваалцдаг), **Product Variants PHASE 1+2 (variant сонголттой худалдан авалт, доор дэлгэрэнгүй)**, **Admin Analytics/CRM dashboard (Geckoboard маягийн харанхуй KPI самбар: sparkline/gauge/P&L card/ranked list-үүд, + борлуулалт/дүүрэг/харилцагчийн мэдээлэл/ашиг/маржин/сагс орхилт/нөөц/суваг/эх сурвалж/**хөрвүүлэлтийн хувь (Conversion Rate, бодит visitor session tracking)**/**CAC**/**буцаалтын хувь (Return Rate)** + Excel/PDF export, доор дэлгэрэнгүй — Playwright-ээр throwaway өгөгдлөөр screenshot баталгаажсан, бодит 937 барааны өгөгдлөөр хараахан үзээгүй)**, **Нүүр хуудасны premium reference-driven редизайн (2026-08-28, доор дэлгэрэнгүй — QuickStatsSection infinity graph, CategoryMasonry v2 (pixel-хэмжилтээр баталгаажсан overlap/offset/watermark засвар), WhyChooseUs, JournalSection, StoreLocatorSection, бодит throwaway хэрэглэгчээр authenticated screenshot баталгаажсан)**. Дэлгэрэнгүй бүх TIER-ийн баталгаажуулалт: [HISTORY.md](HISTORY.md), [ROADMAP.md](ROADMAP.md), [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md), [ADMIN-PANEL.md](ADMIN-PANEL.md).
**Өнгөний систем (2026-09-11):** storefront нь **Linen** цайвар палитр (суурь `#dae0da`, карт `#f2f5f2`, band `#ced5cf`) — харанхуй горим БИШ. 7 хуудас × 4 өргөнд WCAG 2.2 AA контрастын алдаа 0 (бодит computed дэвсгэр дээр хэмжсэн). Дэлгэрэнгүй доорх 2026-09-11 хэсэгт.
**Навигацийн засвар (2026-08-28):** Shop-ийн хайлт/ангилал/хуудаслалт URL-д хадгалагдаж refresh болон product-оос буцахад state сэргээнэ; product breadcrumb болон Admin-ийн нүүр хуудасны холбоосууд ажиллана.

**Шалгагдаагүй/хараахан идэвхгүй:**
- QPay төлбөр (жинхэнэ merchant credential шаардана; ⚠️ 2026-09-12: QPay-д **sandbox** орчин байдаг — `QPAY_ENVIRONMENT=sandbox` + sandbox merchant эрхээр бүх урсгалыг гэрээний өмнө туршиж болно)
- **Smart Software** (код бэлэн, эрх хүлээж байна): холбогдмогц 15 мин тутам үлдэгдэл татаж **автоматаар** нөөц болно (Бараа хүлээн авах → Тооллого нь түүх). Үнэ/хөнгөлөлт/найрлага-заавар-анхааруулга нь **батлуулдаг** зөрүүний дэлгэцээр. ⚠️ Эхний таталтыг заавал `vendor-stock-auto-apply=0`-оор, 1 салбар дээр хийж нүдээр шалгаад л автоматыг ас.
- **StorePay** (2026-09-12, код бэлэн, туршигдаагүй): 4 салбар бүгд StorePay хүлээн авдаг тул сайтад нэмэв. Tom StorePay-ээс **7 утга** авах хэрэгтэй: auth хаяг, api хаяг, апп-ын нэр/нууц үг, үндсэн нэр/нууц үг, дэлгүүрийн код (storeId) → /admin → Интеграцууд → StorePay. Бүгд орж, "Идэвхтэй" болтол checkout дээр харагдахгүй. ⚠️ Онлайн төлбөр (QPay ба StorePay) зөвхөн **нэвтэрсэн** хэрэглэгчид харагдана.
- SMS (Brevo) — SMS кредит/route-ийг Tom баталгаажуулаагүй хэвээр (имэйл тал ажиллаж байгаа нь баталгаажсан, доор "Brevo API" хэсгийг үзнэ үү)
- eBarimt, StorePay, шууд карт төлбөр, эльч (eBuuhia) хүргэлт — бүгд Tom-ийн биечлэн хийх бизнесийн алхам шаардана, код бэлэн биш (eBarimt зөвхөн inert schema бэлэн — [EBARIMT.md](EBARIMT.md))
- **Product Variants — PHASE 1 болон PHASE 2 хоёулаа дууссан (2026-08-26)** — худалдан авагч ProductDetail/QuickView дээр 2+ variant-тай бараанаас сонголт хийж, тухайн variant-ийн үнэ/нөөц/sku-гоор бодитоор захиалж болно. Ганц variant-тай (одоогийн 936/937) бараанд ямар ч харагдах өөрчлөлт алга. **Бодит Playwright screenshot баталгаажуулалт хараахан хийгдээгүй** (зөвхөн 149 автомат тест + `pnpm build` + throwaway DB probe script-ээр баталгаажсан) — дэлгэрэнгүй [HISTORY.md](HISTORY.md)-ийн "Product Variants PHASE 2" хэсэгт.
- Хэрэглэгчийн удирдлага (`/admin` → Хэрэглэгч хэсэг)

## Сүүлийн үеийн гол ажлууд (дэлгэрэнгүй бүгд [HISTORY.md](../HISTORY.md)-д)

Өдөр бүрийн бүрэн тэмдэглэл HISTORY.md-д байна — тодорхой bug/шийдвэрийн
шалтгааныг мэдэх хэрэгтэй үед л тэнд гарчгаар хайна.

- (09-15) **Хэмжилт (GA4/Pixel) дэлгэц**, Smart Software холболтын карт, **вендорын үлдэгдэл автомат** + үнэ/факт батлах дэлгэц (0083)
- (09-15) **Токен хэмнэлт** — энэ гарын авлага 165 KB → ~25 KB; дүрэм: [docs/TOKEN-USAGE.md](TOKEN-USAGE.md)
- (09-14) **Zochil-той харьцуулалт** — /about, /careers хуудас, ажлын байрны зар (`job_postings`, 0081) + ирсэн анкет (`job_applications`, 0082), барааны QR код, YouTube холбоос
- (09-14) **Танилцуулга v4** (`docs/SUGI-ASAYAKE-presentation-v4.pptx`) — 16 хэсэг, 46 frame, Morph, QR
- (09-14) **8 дутагдал нэг дор** — зочны checkout OTP, гар захиалга, GA4/Pixel, барааны факт, сэтгэгдэл хүсэх job, буцаалтын хүсэлт, staging, Messenger товч
- (09-14) **Бэлгийн карт checkout-оор** (0076), **cache + орхигдсон сагсны push**, **OG карт**, **/help**
- (09-13) **Oracle HeatWave Токио руу нүүсэн**, **сайт VM дээр**, **царай таних MediaPipe**, **Q&A/PDF/push/FB login/PWA**
- (09-12) **Нүүр Cosme Kitchen редизайн**, **dark theme**, **хэл солих 3 хэл**, **forensic аудит**, **SQL injection үнэлгээ**
- (09-11) **Linen палитр**, **ntfy push + нөөцийн ledger + сканнер + шилжүүлэг**

## ⚠️ Admin эрх хэн авдаг вэ — bootstrap логик (`server/db.ts`-ийн `createUserWithPassword`)
Шинээр бүртгүүлж буй хэрэглэгч **admin** эрхтэй болдог ЗӨВХӨН: (1) `users` хүснэгт хоосон үеийн хамгийн ЭХНИЙ хэрэглэгч, эсвэл (2) имэйл нь `.env`-ийн `OWNER_EMAIL`-тэй яг таарвал. Бусад бүх шинэ бүртгэл энгийн `"user"` эрхтэй. `staff`/`admin` эрхийг зөвхөн одоо байгаа admin гараар л оноож болно.

⚠️ **Production/deploy хийхээсээ өмнө заавал шалгах:** `.env`-ийн `OWNER_EMAIL=t.morius@gmail.com` байх ёстой (placeholder-оор биш).

## ⚠️ Чухал сануулга: integration test-үүд бодит production slot/контент ашиглахгүй байх
`site-media.integration.test.ts` өмнө нь бодит `home-hero` slot-ыг шууд ашиглаж, `afterEach`-д болзолгүй устгадаг байсан тул тест ажиллуулах БҮРТ Tom-ий бодит upload-ийг DB-ээс устгаж байсан (2026-08-26, дэлгэрэнгүй HISTORY.md). Одоо snapshot-and-restore болгож заслаа. **Ирээдүйд шинэ integration test бичихдээ**: бодит хэрэглэгчийн харах/удирдах өгөгдөл (site_media slots, бодит admin тохиргоо гэх мэт) дээр тест хийвэл заавал snapshot-and-restore хэлбэрээр бичих, эсвэл тусад нь throwaway өгөгдөл (marker-tagged) ашиглах — хэзээ ч бодит slot/мөрийг болзолгүй устгах/дарж бичихгүй байх.

## ⛔ Хэзээ ч зөрчиж болохгүй дүрмүүд

Эдгээр нь бодит incident-ээс гарсан. Дэлгэрэнгүй шалтгааныг HISTORY.md-ийн ижил
нэртэй хэсгээс үзнэ.

**Өгөгдлийн сан, мөнгө**
- Шинэ `sql.raw` БИЧИХГҮЙ — `server/_core/sqlSafe.ts`-ийн `sqlInt()` ашиглана.
- `branch_stock`-д шууд бичихгүй — `applyBranchStockDelta` / `setBranchStockAbsolute` / `recordStockMovement`.
- Захиалга бичдэг шинэ зам бүр `clientRequestId` (idempotency) авна.
- Борлуулалтын тоо `settledSaleSql` (`paid AND status<>'cancelled'`) — өөрөө нөхцөл бичихгүй.
- Барааны үнэ ХОЁР газар (`products.priceMnt` + `product_variants.priceMnt`) — шинэ зам хоёуланг бичих эсэхийг шалга.
- Вендорын үлдэгдэл **автоматаар** нөөц болдог (`vendor-stock-auto-apply=1`) ч зөвхөн тооллогын замаар — `postCount(..., { automatic: true })`. Шинэ автомат бичигч гаргахгүй.
- Store setting-д формат шаардлагатай бол `format` slot-д бич — regex-ийг хоёр дахь газар хуулахгүй (`checkStoreSettingFormat`).
- zod update schema-д `.partial()` биш **`partialForUpdate()`** (zod 4-д `.default()` partial дотор ч хэрэгждэг).
- Migration нэг нэгээр: `pnpm exec tsx scripts/db-apply-migration.ts drizzle/00NN_*.sql` (admin эрхээр, `DATABASE_ADMIN_URL`).

**Admin, аюулгүй байдал**
- Шинэ admin procedure бичихдээ `protectedProcedure` БИШ, role builder (`adminProcedure`/`marketingProcedure`/…) — эс бөгөөс царайны proof шалгагдахгүй.
- Session-ий эрх өөрчилдөг шинэ бичигч `forgetSessionUser` дуудна (5 секундын cache).
- Шинэ tRPC client/fetch зам `x-admin-tab` header дамжуулна (`adminTabId()`).
- Мэдэгдэлд харилцагчийн нэр/утас/хаяг ХЭЗЭЭ Ч оруулахгүй (ntfy сэдэв нээлттэй).

**Frontend**
- `index.html`-д inline `<script>` бичихгүй (CSP `script-src 'self'`) — JSON блок эсвэл `client/public/vendor/*.js`.
- Secure-context-only API (`randomUUID`, `clipboard`, `share`, `getUserMedia`) ашиглавал fallback тавина.
- Storefront-ийн dark горимд Tailwind-ийн `.dark` класс ХЭРЭГЛЭХГҮЙ — `html[data-storefront-theme="dark"]`.
- DOM ажиглах давтамжид `requestAnimationFrame` ашиглахгүй (background tab-д зогсдог) — `setTimeout`.
- Шинэ storefront текстийг React `{expr}`-тэй бол template literal-аар НЭГ text node болго (орчуулга таарахгүй).
- Fixed доод элементэд `env(safe-area-inset-bottom)`-ийг өндөр ДОТОР нь биш ДЭЭР нь нэм.
- `scroll-snap-type` нь marquee-г зогсооно — `.hero-rail`-д тавихгүй.

**Тест, deploy**
- Тест: `pnpm exec vitest run --no-file-parallelism` (параллель горим race үүсгэдэг).
- Integration тестэд fake session user бичихгүй — `server/_test-helpers.ts`-ийн `testSessionUser()`; IP санамсаргүй (rate limit 15 мин).
- Бодит production slot/мөрийг тестээр болзолгүй устгахгүй (snapshot-and-restore).
- `deploy.ps1` PowerShell-д exit code 7 өгдөг нь stderr noise — health 200 бол амжилттай.
- Commit хийхээс өмнө `pnpm check` + `pnpm lint`.
- **AI attribution хэзээ ч бичихгүй** (commit trailer, docs, код) — Tom сайтыг өөрийнхөөрөө танилцуулдаг.

## ⚠️ ХОЁР ЛАПТОП — session бүрийн эхэнд ЗААВАЛ

```powershell
git fetch --all --prune ; git status -sb
```

Хоёр лаптоп нэг repo, нэг HeatWave DB, нэг R2 хуваалцдаг. Нөгөө лаптопын
migration бодит DB дээр аль хэдийн ажилласан байж болох тул **DB шинэ, код
хуучин** гэсэн байдал чимээгүй үүсдэг. Аппликейшн ажиллаж байгаа нь синк болсны
баталгаа БИШ. (2026-09-11-ний бодит incident: 2 commit хоцорсон branch дээр
бүтэн өдрийн ажил хийж, ижил CSS-ийг дахин бичсэн.)

## 📱 Демо / утсаар турших — `scripts/demo.ps1`

`.\scripts\demo.ps1` = production build + `node dist/index.js` (3000 порт, LAN IP,
access log). `-Tunnel` нэмбэл Cloudflare quick tunnel (HTTPS тул утсан дээр камер,
царайны хаалга ажиллана). Production-only зүйлийг (CSP, compression, static)
ЗААВАЛ энэ script-ээр нэг удаа шалга — `pnpm dev`-д CSP байхгүй тул inline script
алдаа харагддаггүй.

## 💰 Токен зарцуулалт — [docs/TOKEN-USAGE.md](TOKEN-USAGE.md)

Session бүр энэ файлыг бүтнээр ачаалдаг тул **энд юу ч урт бичихгүй**: шинэ
session-ий тэмдэглэл HISTORY.md-д, дүрэм л энд. Ажиллах дүрэм (аль загвар аль
ажилд, output-оо хэрхэн таслах, session-ээ хэрхэн хуваах) TOKEN-USAGE.md-д.

## ⚠️ Tom-оос хүлээж буй (2026-09-14, "Za bugdiin hii"-ийн дараа)
- **Staging DNS**: Cloudflare → karkaron.com → DNS → CNAME `sugi-staging` → `bbd3128e-486e-481d-8c21-f9d3d240a56c.cfargotunnel.com`, proxied. Дараа нь `https://sugi-staging.karkaron.com` (өөрийн `sugi_staging` схем — prod-ын 2026-09-14-ний хуулбар, туршилтын захиалга энд хийнэ; push илгээхгүй).
- **Хэмжилт**: GA4 Measurement ID + Meta Pixel ID → /admin → **Хэмжилт** (09-15-аас тусдаа цэс). Буруу форматтай ID одоо хадгалагдахгүй — өмнө нь ногоон хадгалагдаад чимээгүй ачаалагддаггүй байв.
- **Захиалгын SMS** асаах бол Brevo SMS кредит → `sms-order-notifications=1`. verify.mn үлдэгдэл дуусвал `checkout-guest-phone-verification=0`.
- **Сэтгэгдлийн урамшуулал**: `review-reward-mnt` (жишээ 2000) тавибал асна.
- **2 junk захиалгыг цуцлах/устгах** (автомат residue тайлан нэрээр нь олдоггүй): `#6802 SAMU21BHE3OSC20F` "Checkout Test", бэлгийн карт 200,000₮, 2026-09-15 (бүтэн suite ажиллаж байхад зэрэгцүүлэн скрипт ажиллуулснаас нэг тест унаж үүсгэсэн) ба `#6655 SAMU0NHNJY458K8X` "ТУРШИЛТ — Claude (цуцлана уу)", 26,980₮, 2026-09-14. Хоёул `pending/unpaid` тул борлуулалтад тоологдохгүй ч /admin-д хүлээгдэж буй захиалга мэт харагдана. ⚠️ Бэлгийн картынх нь картын код үүсгэсэн эсэхийг устгахын өмнө шалгах.
- HeatWave дээр `sugi_migtest` схемийг устгах (`DROP DATABASE sugi_migtest` — migration chain туршилтын үлдэгдэл, хоосон).
- GitHub Actions → `database-tests` job-ийн эхний үр дүнг харах (улаан бол seed-д нэмэх мөр байна).

## Дараагийн ажлын санал (2026-09-12-ний байдлаар НЭЭЛТТЭЙ зүйлс л — хаагдсан бүх зүйл HISTORY.md-д)
0. **10k зэрэгцээ хэрэглэгч (Tom-ийн асуулт, 2026-09-09)** — одоогийн архитектур (нэг Node process, in-memory rate limiter, mysql2 pool 10, Бангалор RTT ~174ms, cache зөвхөн /shop каталогийн 10с TTL) статик HTML-ийг даана (5.4k req/s хэмжсэн) харин DB-д хүрэх бүх зүйл ~30–60 query/с-т тулна. Дараалал: (a) нүүр/каталог/site_media/site_text/brands/bestsellers read-үүдэд 30–60с in-memory cache (`catalogPageCache` загвар) — хамгийн том ялалт, backend өөрчлөлт бага; (b) Aiven-ийг Токио руу (Console → Change cloud) + `connectionLimit` 10→25–50 (Aiven plan-ий max_connections шалгах); (c) hosting дээр Node-ийг `cluster`/PM2-ээр CPU бүрт + Cloudflare CDN (HTML "no-cache" тул зөвхөн assets, /cdn/*); (d) хэрэв олон instance бол R3-ийн in-memory tier + `catalogPageCache`-ийг Redis руу; (e) global limiter 300/15мин/IP нь оффисын NAT-ад бага байж болзошгүй — hosting дээр бодит тоогоор тааруулах. Бодит 10k-ийн өмнө staging дээр k6-ээр нүүр хуудасны бүрэн flow-г ачааллах.
1. **Барааны бодит зураг — үлдсэн 415** (`docs/products-needing-photos.csv`): автомат эх сурвалжууд шавхагдсан (HISTORY.md, "Зургийн эх сурвалжийн бүрэн эрэл"), дэлгүүрт өөрөө зураг авах л үлдсэн.
2. **Tom-ийн бизнесийн алхам шаардах зүйлс** (код бэлэн, тохиргоо/гэрээ л дутуу): QPay merchant credential (R6/R7 засвартай), eBarimt ([EBARIMT.md](EBARIMT.md)-ийн 6 асуулт), StorePay/хүргэлтийн гэрээ, Honeybadger API key (`HONEYBADGER_API_KEY` + `VITE_HONEYBADGER_API_KEY`), Brevo SMS кредит/route (mass SMS campaign-ийн өмнө), hosting сонголт (дараа нь `PUBLIC_BASE_URL`, staging/CDN/uptime, R3-ийн in-memory tier-үүдийг шаардлагатай бол Redis).
3. ✅ **Амьд Aiven дээрх тестийн үлдэгдэл ЦЭВЭРЛЭГДЛЭЭ (2026-09-12, Tom зөвшөөрсөн)** — `scripts/test-residue-report.ts` (зөвхөн уншина) + `scripts/test-residue-purge.ts --apply`. Устгасан: 3 тестийн хэрэглэгч (⚠️ тэдгээрийн **2 нь admin эрхтэй** байсан: `Order Notify Admin`, `Telemetry Test Admin`), `Telemetry Test Shopper`-ийн 2 захиалга (тус бүр 22,000₮ борлуулалтад тоологдож байсан), 887 `suppressed` мэдэгдлийн мөр. Бараа/ангилал үлдээгүй байв. **Үлдсэн хэрэглэгч: bataa (admin), zulaa (staff) — өөр данс байхгүй.** Ledger drift 0 хэвээр. ⚠️ Скрипт нь `%test%`-ээр хайдаггүй (каталогт жинхэнэ `Honey amproom tester` гэх бараа бий) бөгөөд сүүлийн 1 цагт үүссэн мөрийг алгасдаг (тест яг ажиллаж байж болзошгүй).
4. ⚠️ **`a { color: inherit }` cascade-layer bug** — зөвхөн 5 баталгаажсан тохиолдол `!`-ээр засагдсан; `index.css`-ийн reset дүрмийг `@layer base`-д шилжүүлж сайт даяар засах (screenshot баталгаажуулалттай).
5. **Product Variants** — олон variant-тай бодит бараагаар Playwright screenshot баталгаажуулалт хараахан хийгдээгүй (автомат тест + DB probe л).
16. ⚠️ **Tom-оос хүлээж буй (2026-09-12)**: (a) `posts`-ийн 5 junk нийтлэл болон 8 брэндийн лого — **Tom өөрөө хийнэ гэсэн**; (b) chat-д нэг удаа бичигдсэн ntfy access token-ийг ntfy.sh дээр **rotate** хийж /admin → Интеграцууд-д шинээр хадгалах; (c) Smart Logic username/password, StorePay 7 утга, QPay sandbox эрх; (d) нягтлангаас НӨАТ/НХАТ хариу (EBARIMT.md); (e) production host дээр `NOTIFICATIONS_DISPATCH=1`.
6. **Admin face gate** — Tom 50 хүнээр false-reject rate хэмжих; `ADMIN_FACE_LIVENESS_ENFORCED`-ийг бодит тоон дээр шийдэх. Aiven байршил Бангалор (median 174ms) → Токио (Console → Change cloud).
7. **NEWVISION §14 / PREMIUM TIER 5 үлдэгдэл**: density toggle, үнийн faceted filter, "Pairs well with" cross-sell; referral, abandoned-cart имэйл.
8. **Купоны per-customer cap race**: нэг хэрэглэгч сүүлчийн зөвшөөрөгдсөн ашиглалтыг 2 зэрэгцээ checkout-оор давж болно (global `maxUses` атомик хэвээр) — хэрэгтэй бол (code, customer, n) unique key.
9. `--a-faint` (admin жижиг uppercase шошго) гэрэл горимд 2.74:1 — WCAG AA-д хүрэхгүй (codemod-оос өмнө ч ижил байсан, регресс биш).
10. ⚠️ **`/shop` "баруун тийш шахагдсан" (Tom, 2026-09-11) — НӨХӨН ҮЗҮҮЛЭГДЭЭГҮЙ**: 1024–3200px хүртэл 15 өргөнд `scrollWidth - clientWidth` хэмжихэд бүгдэд нь 0 гарсан. Дахин гарвал Tom-оос **цонхны бодит өргөн + browser zoom хувь**-ийг асуух (zoom нь `vw` нэгжүүдийг өөрчилдөг).
11. ⚠️ **Брэндийн лого — 9-өөс ганц нь л байна** (Cocochi). 2026-09-12-оос лого зурвас **брэнд бүрд тусдаа**: логотой брэндийн зургийн доор цагаан зурвас (лавлагаа: зураг → доор нь лого), логогүй брэнд зай авахгүй. **/admin → Брэнд дээр 8 лого оруулбал** бүгд ижил харагдана. ⚠️ Cocochi-ийн "лого" гэж хадгалсан файл нь бодит лого биш, кампанит зураг (618×323) — Tom жинхэнэ лого (тунгалаг PNG) оруулах.
13. **Display шрифт нэмэх** — Golos Text ганцаараа бүх 643 элементийг тохируулж байна (68px hero-гоос 8px шошго хүртэл), хуудсанд дуу хоолой алга. ⚠️ Кирилл глифийг заавал шалгах.
14. **9-өөс 7 хэсэг бүтэн өргөний хэвтээ band** — 2 хэсгийг тэгш бус bento болгож гаргах (2026-ийн чиглэл, HISTORY.md-ийн эх сурвалжууд).
15. **Skip link аль ч хуудсанд байхгүй** (WCAG 2.4.1 Level A). Мөн эхний ачаалалтын 643 KB-аас 462 KB нь үндсэн JS chunk.
12. **Bestseller filler-ийг брэндээр хязгаарлах** — одоо `featured_brands`-ийн БҮХ идэвхтэй брэнд round-robin-д ордог. Хэрэв зөвхөн тодорхой 3-4 брэнд харагдах ёстой бол admin → Брэнд дээр бусдыг нь идэвхгүй болгох, эсвэл filler-д зориулсан тусдаа тугийн багана нэмэх.

Дэлгэрэнгүй бүх session-ий бүрэн түүх, шалтгаан, screenshot-ын баталгаажуулалт: **[HISTORY.md](HISTORY.md)**.
