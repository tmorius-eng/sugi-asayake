# SUGI ASAYAKE — Төслийн танилцуулга (Claude Code-д зориулав)

Энэ файлыг Claude Code сесс бүрийн эхэнд автоматаар уншина.

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
- **StorePay** (2026-09-12, код бэлэн, туршигдаагүй): 4 салбар бүгд StorePay хүлээн авдаг тул сайтад нэмэв. Tom StorePay-ээс **7 утга** авах хэрэгтэй: auth хаяг, api хаяг, апп-ын нэр/нууц үг, үндсэн нэр/нууц үг, дэлгүүрийн код (storeId) → /admin → Интеграцууд → StorePay. Бүгд орж, "Идэвхтэй" болтол checkout дээр харагдахгүй. ⚠️ Онлайн төлбөр (QPay ба StorePay) зөвхөн **нэвтэрсэн** хэрэглэгчид харагдана.
- SMS (Brevo) — SMS кредит/route-ийг Tom баталгаажуулаагүй хэвээр (имэйл тал ажиллаж байгаа нь баталгаажсан, доор "Brevo API" хэсгийг үзнэ үү)
- eBarimt, StorePay, шууд карт төлбөр, эльч (eBuuhia) хүргэлт — бүгд Tom-ийн биечлэн хийх бизнесийн алхам шаардана, код бэлэн биш (eBarimt зөвхөн inert schema бэлэн — [EBARIMT.md](EBARIMT.md))
- **Product Variants — PHASE 1 болон PHASE 2 хоёулаа дууссан (2026-08-26)** — худалдан авагч ProductDetail/QuickView дээр 2+ variant-тай бараанаас сонголт хийж, тухайн variant-ийн үнэ/нөөц/sku-гоор бодитоор захиалж болно. Ганц variant-тай (одоогийн 936/937) бараанд ямар ч харагдах өөрчлөлт алга. **Бодит Playwright screenshot баталгаажуулалт хараахан хийгдээгүй** (зөвхөн 149 автомат тест + `pnpm build` + throwaway DB probe script-ээр баталгаажсан) — дэлгэрэнгүй [HISTORY.md](HISTORY.md)-ийн "Product Variants PHASE 2" хэсэгт.
- Хэрэглэгчийн удирдлага (`/admin` → Хэрэглэгч хэсэг)

## Сүүлийн үеийн гол ажлууд — товч жагсаалт (дэлгэрэнгүй нь [HISTORY.md](HISTORY.md))

2026-09-09-нд CLAUDE.md 208KB болж session бүрт ачаалагдах хэмжээнээсээ хэтэрсэн тул доорх session бүрийн тэмдэглэлүүдийг **бүрэн эхээр нь** HISTORY.md-ийн "CLAUDE.md-ээс зөөсөн session бүрийн тэмдэглэл" хэсэгт зөөв. Гарчиг бүр тэнд яг ижил нэртэй байгаа тул хайлтаар олно. Тодорхой bug/шийдвэрийн шалтгааныг мэдэх хэрэгтэй үед л тэнд хайна.

- (2026-09-12) **Нүүр хуудас cosmekitchen-webstore.jp лавлагаагаар бүрэн шинэчлэгдэв** — Inter, цагаан хуудас, төвлөрсөн нимгэн гарчиг, 207px hairline карт, 65px цагаан header + хайлтын мөр, cream footer; бүх засвар `index.css`-ийн төгсгөлийн нэг давхаргад, tag `backup/pre-cosmekitchen-2026-09-12`
- (2026-09-12) **Нүүрний ангиллын 3×2 grid → нэг мөр, төгсгөлгүй swipe карусель** (`client/src/components/home/CategoryRail.tsx`): бодит scroll container + scroll-snap (утсан дээр native swipe), хулганы drag JS-ээр (8px-ээс хойш drag, дараах click залгигдана), жагсаалтын 3 хуулбар — дунд хуулбараас эхэлж, хагас set-ээс хэтэрвэл яг нэг set-ийн зайгаар (хуулбар хоорондын ижил картын зай, `scrollWidth/3` БИШ — сүүлийн хуулбарт gap байхгүй тул 8px зөрдөг) буцаана; хуулбарууд `aria-hidden` + `tabIndex=-1`. Карт өөрчлөгдөөгүй, `.cat-rail*` CSS
- (2026-09-12) **"Яагаад биднийг сонгох вэ" хэсэг Tom-ийн лавлагаа зургаар дахин бүтээгдэв** — төвлөрсөн eyebrow + гарчиг (сайтын өөрийн `.eyebrow`/`.editorial-heading` загвар), 3 багана (өнгөт tile, дунд нь 32px доош, 90px tile; Tom-ийн хүсэлтээр 01/02/03 дугааргүй, босоо зай хөрш band-уудтай ижил — лавлагааны 200/240px-ийг "дэндүү том" гэж буцаасан), сайтын дэвсгэртэй ижил; 2 догол тайлбар хасагдсан (slot хэвээр); "900+" тоо 1-р зүйлийн тайлбарт `{N}`-ээр; **зүйл бүрийн icon (12 нэрийн жагсаалт) болон tile өнгө (hex) /admin-ий site-text slot** (`home-text-wcu-cardN-icon/-color`); backup tag `backup/pre-wcu-redesign-2026-09-12`
- (2026-09-11, шөнө) **Утасны push мэдэгдэл (ntfy) + admin хонх + интеграцийн самбарын засвар** — 6 phase-ийн Phase 1, доорх хэсэгт. Мөн ажлын лаптопын 9 commit (`f7b6563..d30dc06`: баркод, Монгол хайлт, хууль/лоялти/footer admin-аар, hero слайд, migration 0061) татагдсан — тэдний тэмдэглэл HISTORY.md-д товчоор
- (2026-09-11, орой) **Гүнзгий аудит** (UI/UX+front+back) — үхсэн public endpoint (13 query/дуудлага), `getFeaturedBrands`-ийн N+1, `products.brand` индекс, хэсэг бүрийн ижил eyebrow/дугаарлалт, "Онцлох брэндүүд"-ийн цагаан зай — бүгд заслаа
- (2026-09-11) Storefront-ийн гэрэл 20% багасгаж **Linen** палитр болов + бүх хэсгийн босоо зай татав (нүүр 8015→6612px) + bestseller rail дүүргэв + **хоёр лаптопын git sync алдаа** (доор дэлгэрэнгүй)
- (2026-09-10, ажлын лаптоп) Топ брэнд Matsuya Ginza лавлагаагаар carousel болж дахин бүтээгдэв + шинэ `/brands` хуудас + back-to-top товч
- (2026-09-08) /admin бүхэлдээ reference дизайнаар дахин бүтээгдэв + харанхуй горим + хүссэн огноогоор шүүх
- (2026-09-08) /admin-д царайгаар нэвтрэх шалгалт (browser camera face recognition) — `admin-face-auth` branch
- (2026-09-07) Admin "Шинэ мэдээ" WordPress classic-editor parity болгож дахин бүтээв (`admin-posts-wordpress-editor` branch, main-д merge хийгээгүй)
- (2026-09-01, гэрийн лаптоп) Санал болголтын ЧАНАР — 246 зураг сэргээв, tagging дүрэм засав, 2 бодит bug олов
- (2026-09-01) Preference Profile v2 + Recommendation Engine v2 + Admin Analytics segment — bulk auto-tag ЭЦСИЙН APPLY бодит Aiven дээр амжилттай дуусав
- (2026-09-01) Branch консолидаци, CI encryption key засвар, CategoryMasonry v8 сэргээв
- (2026-09-01) Sunrise ribbon — баруун тийш урсдаг болгов, текст нь admin-аар засварлагдах боллоо
- (2026-09-01) TrustStrip ("800+ / 03 / 01" тоон баримтын зурвас) бүрмөсөн устгав
- (2026-09-01) КРИТИК incident — "зургууд алга болсон" нь код биш, буруу DATABASE_URL байсан (шийдэгдсэн)
- (2026-09-01) Нүүр хуудасны текст (гарчиг/тайлбар/товч мэдэгдэл) admin-аар засварлагдах боллоо — шинэ `site_text` CMS
- (2026-08-31) CategoryMasonry v7 — anchor scrim зөөллөв, 6 ангиллын зураг admin-аар засварлагдах боллоо
- (2026-08-31) CategoryMasonry v6 — харанхуй scrim бүрэн арилав (бүтэц буруу байсныг олов)
- (2026-08-31) CategoryMasonry v5 — uniform хэмжээтэй, харанхуй сүүдэргүй, зайгүй
- (2026-08-31) CategoryMasonry v4 — жинхэнэ masonry (ууртан ялгаатай өргөн/өндөр)
- (2026-08-31) CategoryMasonry v3 — бүх 6 карт бодит бүтээгдэхүүний фототой болов
- (2026-08-31) Quick Stats infinity graph — зочны төлөвт огт харагдаагүй bug засав + reference-тэй тааруулав
- Brevo API IP хязгаарлалт арилсан, имэйл бодитоор ажиллаж байгааг баталгаажуулсан (2026-08-26)
- Admin Analytics — Geckoboard дизайн + Conversion Rate/CAC/Return Rate дуусав (2026-08-27)
- (2026-08-28) Гэрийн лаптопын DB blocker цуцлагдсан — `.env` одоо Aiven руу заасан байна
- (2026-08-28, гэрийн лаптоп дээр) CategoryMasonry v2 засвар ВАЛИДАЦИ ХИЙГДЭЖ ДУУСАВ
- (2026-08-28) Нүүр хуудасны premium reference-driven редизайн (Tier 0–7) дуусав
- (2026-09-04) Honeybadger error tracking холбогдов (hosting хүлээгээгүй, `phase3-honeybadger` branch)
- (2026-09-06) /admin-ийн бүх ил хэсэг Gentelella загварын дэлгэцтэй ижилхэн болов (шинэ dark sidebar + light topbar + KPI grid + chart + activity feed)
- (2026-09-06) Бүртгэл одоо заавал verify.mn SMS-ээр баталгаажсан утас шаарддаг (Tom амьдаар туршиж, шийдвэрээ эргүүлэн өөрчилсөн)
- (2026-09-05) Бүртгэл/нэвтрэлт зөвхөн утасны дугаараар боллоо (имэйл бүрмөсөн хассан) + ажилтны имэйл-урилга бүрмөсөн хассан
- (2026-09-04) Phase 3 review (Shop/ProductDetail/Checkout/Profile) — том дахин зохион байгуулалт хэрэггүй байсныг баталгаажуулав, 3 бодит гарц-defect олж заслаа
- (2026-09-04) Phase B — хуваалцсан эх сурвалж (formatMnt/ангилал/800+/ProductCard) дуусав
- (2026-09-04) Phase C + Phase D (NEWVISION.md, Tier 1-8) дуусав — header/footer нэгтгэл, Топ Брэнд, ангиллын rail, бодит харилцагчийн сэтгэгдэл
- (2026-09-06) Admin sidebar-ийн 2 CSS bug засав + Homepage Journal section editorial редизайн
- (2026-09-06) Нүүр хуудасны дугаарлалт (01→06) зөрчлийг засав, admin-аар засварлагдах боллоо
- (2026-09-06) Гадны "Claude AI Pro" дизайны шүүмж — 3 удаагийн research pass-аар баталгаажуулж, нүүр хуудсыг ~6 хэсэг рүү нэгтгэв
- (2026-09-06) `/privacy` хуудсыг Монголын бодит хувь хүний мэдээлэл хамгаалах хуультай тулгаж бүрэн дахин бичив
- (2026-09-06) `/returns` бодит хууль тулгаж дахин бичив + "хэрэглэсэн бараа буцаадаггүй" бодлого + Checkout-д анхааруулга нэмэв
- (2026-09-06) Бодит, ажилладаг cookie-consent банер (Silktide Consent Manager, self-hosted) + бодит accessibility audit (axe-core)
- (2026-09-06) ProductDetail-ийн 3 бодит bug засав — давхар зайлсан "Мөн танд таалагдаж магадгүй" хэсэг, утгагүй давхардсан thumbnail, бараг бүх бүтээгдэхүүнд ижилхэн "холбоотой" жагсаалт
- (2026-09-06) Гүнзгий full-stack аудит (9 bug) — бүгд заслаа: JWT fallback secret, 6 ашиглагдаагүй dependency (75→10 vulnerability), phone-session race, checkout isPublished цоорхой, CSRF/index-ийн сайжруулалт

## ⚠️ Admin эрх хэн авдаг вэ — bootstrap логик (`server/db.ts`-ийн `createUserWithPassword`)
Шинээр бүртгүүлж буй хэрэглэгч **admin** эрхтэй болдог ЗӨВХӨН: (1) `users` хүснэгт хоосон үеийн хамгийн ЭХНИЙ хэрэглэгч, эсвэл (2) имэйл нь `.env`-ийн `OWNER_EMAIL`-тэй яг таарвал. Бусад бүх шинэ бүртгэл энгийн `"user"` эрхтэй. `staff`/`admin` эрхийг зөвхөн одоо байгаа admin гараар л оноож болно.

⚠️ **Production/deploy хийхээсээ өмнө заавал шалгах:** `.env`-ийн `OWNER_EMAIL=t.morius@gmail.com` байх ёстой (placeholder-оор биш).

## ⚠️ Чухал сануулга: integration test-үүд бодит production slot/контент ашиглахгүй байх
`site-media.integration.test.ts` өмнө нь бодит `home-hero` slot-ыг шууд ашиглаж, `afterEach`-д болзолгүй устгадаг байсан тул тест ажиллуулах БҮРТ Tom-ий бодит upload-ийг DB-ээс устгаж байсан (2026-08-26, дэлгэрэнгүй HISTORY.md). Одоо snapshot-and-restore болгож заслаа. **Ирээдүйд шинэ integration test бичихдээ**: бодит хэрэглэгчийн харах/удирдах өгөгдөл (site_media slots, бодит admin тохиргоо гэх мэт) дээр тест хийвэл заавал snapshot-and-restore хэлбэрээр бичих, эсвэл тусад нь throwaway өгөгдөл (marker-tagged) ашиглах — хэзээ ч бодит slot/мөрийг болзолгүй устгах/дарж бичихгүй байх.

## ✅ (2026-09-09) Adversarial audit — төлбөртэй/зээлтэй захиалгыг БУЦААХ (cancel/refund/late webhook) замын 4 бодит bug заслаа

Tom гадны 12 хэсэгтэй "adversarial audit" playbook илгээв. Өмнөх аудитууд (09-02, 09-06, 09-08) auth/CSRF/checkout race-ийг аль хэдийн хаасан байсан тул энэ удаа **checkout → cancel → refund → QPay webhook → analytics/loyalty** гинжийг бүхэлд нь мөрдөж, зөвхөн тестээр нотлогдсон зүйлийг тэмдэглэв. Бүрэн тайлан (4 inventory + phased plan + "NOT A PROBLEM" гэж баталгаажсан жагсаалт): **[docs/AUDIT-2026-09-09-order-unwind.md](docs/AUDIT-2026-09-09-order-unwind.md)**.

**Заслагдсан (бүгд `server/db.ts`, + `routers.ts`/`analytics.ts`):**
1. **Дэлгүүрийн зээл (store credit) цуцлах/буцаахад хэзээ ч буцааж олгогддоггүй байв** — checkout-д хасагдсан 3,000₮ захиалга цуцлагдахад алга болдог, `refundOrder` нь cash-ийг `totalMnt` (зээл хассаны ДАРААХ дүн)-ээр хязгаарладаг тул хэрэглэгч зээлийнхээ хэмжээгээр хохирдог байв. Шинэ `reverseStoreCreditForOrder` (ledger-ийн эерэг мөр = idempotency marker, cancel→refund хоёуланд нэг л удаа).
2. **`updateAdminOrder`/`refundOrder` read-then-write TOCTOU** — 2 зэрэгцээ cancel (double-click, эсвэл хэрэглэгч+warehouse зэрэг) хоёул ладдер шалгалтыг давж **stock-ийг 2 удаа сэргээдэг** байв. Одоо checkout-тэй ижил `WHERE status = <шалгасан>` + `affectedRows` guard, transaction-ий ЭХЭНД.
3. **Төлбөр төлөгдсөн (QPay) боловч дараа нь цуцлагдсан захиалга `paymentStatus='paid'` хэвээр** → орлого, loyalty lifetime spend (үнэгүй tier өсөлт), bestseller-т тоологдсоор байв, мөн буцаах боломжгүй dead end (refund зөвхөн `returned`-ээс). Шийдэл: **`settledSaleSql`** (`paid AND status<>'cancelled'`) — db.ts-ийн 8, analytics.ts-ийн 17 газар бүгд нэг л тодорхойлолт ашиглана; `refundOrder` одоо `returned` ЭСВЭЛ `cancelled` (+заавал `paid`) захиалгыг хүлээн авна.
4. **QPay webhook хаагдсан захиалгыг амилуулдаг байв** — `markQPayPaymentAttemptPaid` болзолгүй `status='confirmed'` бичдэг тул цуцлагдсан (stock аль хэдийн буцсан) захиалга дахин confirmed болж oversell, completed→confirmed ухардаг, refunded→paid эргэдэг байв. Одоо зөвхөн `unpaid` бөгөөд хаагдаагүй захиалгад л нөлөөлнө (`pending`→`confirmed`, бусад статус хэвээр), attempt мөр үргэлж бичигдэнэ. `qpayCreateInvoice` хаагдсан захиалгад invoice гаргахаас татгалзана.

**Баталгаажуулалт**: шинэ `server/order-unwind.integration.test.ts` (8 тест, бодит Aiven, throwaway мөр бүрэн устгагдсан) — засварыг `git stash`-аар түр авахад **7/8 унадаг**, засвартай **8/8** ✅. `pnpm check`/`pnpm build` цэвэр. Бүрэн `pnpm exec vitest run --no-file-parallelism`: **550/550 ✅ (60/60 файл)** — өмнөх 542 + шинэ 8, регресс 0.

**Хоёрдугаар pass, мөн өдөр ("Fix all of them!! Make it better also! Improve all!!")** — тайлангийн шийдвэр хүлээж байсан бүх зүйлийг хэрэгжүүлэв (дэлгэрэнгүй хүснэгт: тайлангийн "Second pass" хэсэг):
- **R1** `discount_codes.maxUsesPerCustomer` (migration `0056`, Aiven дээр ажилласан) — нэг хэрэглэгч (данс, зочин бол утасны сүүлийн 8 орон) кодыг N-ээс олон удаа ашиглахгүй; admin формд шинэ талбар. `NULL` = хуучин зан төлөв. ⚠️ Production-д `NEWCOMERS110` (−50%, 100 удаа) per-customer cap-гүй байна — Tom админаас 1 болгож тавих нь зүйтэй.
- **R2** `shared/orders.ts` (`isRefundOwed`/`isRefundable`/`paymentBadgeFor`) — admin Захиалгад "Буцаан олголт хүлээгдэж буй · N" шүүлтүүр+pill, цуцлагдсан-төлсөн захиалгад refund товч; Хянах самбарт анхааруулга; Profile-д pill; цуцлалтын имэйлд "төлбөрийг буцаан олгоно" мөр.
- **R3** `rate_limit_buckets` хүснэгт (migration `0057`) + `server/_core/persistentRateLimit.ts` — strict/phoneVerify tier-үүд DB дээр тоолно (олон instance-д ч хүчинтэй), fail-open. Cart/telemetry tier-үүд санаатайгаар in-memory хэвээр. ⚠️ Тестүүдэд тогтмол IP ашиглах бол per-run subnet хэрэглэ (15 минутын bucket дараагийн run-д үлддэг).
- **R4** `admin.users` server-side page+search (`{rows,total}`), `orders.mine` cursor-paged (`{orders,nextCursor,total}`, Profile-д "Өмнөх захиалгуудыг үзэх"), `admin.products` жагсаалт `description`/`galleryJson`-гүй болж, editor `admin.productDetail`-аар нэг барааг ачаална.
- **R5** orderNumber 6 санамсаргүй тэмдэгт + давхцвал transaction-ийг шинэ дугаараар дахин оролдоно (3 хүртэл). **R6** QPay `paid_amount` шалгалт — дутуу төлсөн invoice-ийг захиалга баталгаажуулахгүй, failed attempt болгож бүртгэнэ. **R7** `PUBLIC_BASE_URL` env (сонголттой) — QPay callback URL-д Host header-ийн оронд.
- **Debt**: `shared/delivery.ts` нэг хүргэлтийн дүрэм (client+server); `refundOwedSql`/`isRefundOwed` нэг тодорхойлолт; System Health картанд "Дэлгүүрийн зээлийн тэнцэл" (cache vs ledger drift, бодит DB дээр 0 зөрүү); CLAUDE.md 208KB→40KB (36 хэсэг HISTORY.md-руу бүрэн эхээр нь).
- **Cleanup**: `@hookform/resolvers` устгав; `84abf….jpg`→`docs/reference/`, `self-review.md`→`docs/`; `.playwright-mcp/` gitignore; шинэ **`scripts/db-apply-migration.ts`** (`pnpm exec tsx scripts/db-apply-migration.ts drizzle/00NN_*.sql` — Aiven дээр migration ажиллуулах албан ёсны арга, доорх "Migration-уудыг ажиллуулах тухай"-г орлоно).

**Хоёрдугаар pass-ийн баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр; шинэ тестүүд — `persistent-rate-limit.integration.test.ts` (5), `delivery-fee.test.ts` (4), `qpay.test.ts` (+6), `discount-codes` (+1 per-customer), `order-unwind` (+4: retry/users paging/orders paging/refund-owed count+drift). Бүрэн suite: **570/570 ✅ (62/62 файл)** — өмнөх 550 + шинэ 20, регресс 0. Playwright (MCP, порт 3100, face gate унтраалттай, throwaway admin/customer, дараа нь бүрэн устгасан): Хянах самбарын анхааруулга+health мөр, Захиалгын шүүлтүүр/pill/refund товч, Хямдралын кодын шинэ талбар (форм→DB→жагсаалт), Хэрэглэгчийн server pager+хайлт ("1–9/9"→"1–1/1"), Profile-ийн pill (desktop 1280 + mobile 390, overflow 0) ба load-more (20→23), console/server алдаа 0.

## ✅ (2026-09-09, орой) Deep audit #2 — "код чинь мянган алдаатай" гэсэн шаардлагаар бүх давхаргыг шалгав

Tom: "chinii hiij ugsun code edr bugd zunduu har myngan aldaa baina!! ... deep audit deep analyze hiiged bugdiin ynzaldaa". Хэрэгсэл: `tsc --noUnusedLocals --noUnusedParameters`, `pnpm audit --prod`, бүрэн vitest suite, Playwright (playwright-core + Edge) crawl — storefront 22 route × 3 дэлгэц (1233/390/320), /admin 19 хэсэг × гэрэл/харанхуй (throwaway admin, дараа нь устгасан), production build дээр ачааллын тест, серверийн лог, DB холболтын бодит шалгалт. **Storefront-ийн 66 ачаалалт: console алдаа 0, амжилтгүй request 0, эвдэрсэн зураг 0, давхар id 0, нэргүй товч 0.** Олдож засагдсан бодит алдаанууд:

1. **🔴 Aiven DB холболт ШИФРЛЭГДЭЭГҮЙ байв.** `drizzle({ connection: { uri: DATABASE_URL } })` → mysql2 нь `?ssl-mode=REQUIRED`-ийг ойлгодоггүй ("Ignoring invalid configuration option" warning boot бүрт гарч байсан) → бодит серверт `Ssl_cipher` хоосон, `require_secure_transport=OFF`. Бүх query, нууц үгийн handshake Бангалор хүртэл plaintext явж байв. Шинэ **`server/_core/dbConnection.ts`** (`planMysqlConnection`): loopback-оос бусад бүх host-д TLS; `DATABASE_CA_CERT` (эсвэл `_PATH`) байвал сертификат шалгана, байхгүй бол шифрлээд startup-д warning бичнэ (Aiven-ий CA нь project CA тул системийн root-оор шалгагдахгүй — `rejectUnauthorized:true` HANDSHAKE_SSL_ERROR өгдгийг баталгаажуулсан). Баталгаажуулалт: аппын өөрийн drizzle pool одоо `TLSv1.3 / TLS_AES_256_GCM_SHA384`. 2 script (`apply-product-image`, `reconcile-images-from-r2`) мөн адил. 8 unit тест. ⚠️ **Tom: Aiven Console → Overview → CA certificate-ийг `.env`-д `DATABASE_CA_CERT` болгож тавих** — тэгэхэд л MITM цоорхой бүрэн хаагдана.
2. **Scroll-reveal "давхцал"-ын жинхэнэ шалтгаан**: `useScrollReveal` зөвхөн Home/Shop/Profile-д дуудагддаг + анх mount хийхэд л `[data-reveal]` хайдаг байв → tRPC-ийн дараа гарч ирдэг 6 хэсэг (нүүр) болон PDP-ийн "холбоотой бараа" shelf хэзээ ч `.is-revealed` авалгүй 18px доош шилжсэн хэвээр дараагийн хэсэг дээр давхарлан зурагдаж байв (Tom-ийн screenshot: locator panel улаан band дээр). Одоо App-ийн Router-т нэг MutationObserver+IntersectionObserver — бүх route, хожуу mount хийсэн бүх хэсэг. Crawl: stuck reveal 0.
3. **18 dependency vulnerability (8 high) → 0**: `sharp` 0.35.4, `express` 4.22.2, транзитив override (qs/body-parser/path-to-regexp/lodash/postcss/nanoid/uuid) — **`package.json`-ийн `pnpm.overrides`-д** (pnpm 10.4.1 "no longer read" гэж warning бичдэг ч lockfile-д орж, graph-д бодитоор нөлөөлдөг; `pnpm-workspace.yaml`-ийн хуучин блок 2026-09-06-нд ажиллахгүй нь батлагдсан тул устгав). ⚠️ Сургамж: хязгааргүй `>=1.20.8` гэж бичсэн эхний оролдлого express 4 доор body-parser 2 + path-to-regexp 8-ыг татаж серверийг `pathRegexp is not a function`-ээр унагаасан — одоо бүх range major-оороо хязгаарлагдсан (`>=1.20.8 <2` г.м.).
4. **POS in-store sale (`recordInStoreSale`)** өөрийн 4 тэмдэгтийн Math.random дугаар үүсгэж, давхцвал retry хийдэггүй байв (R5 зөвхөн checkout-д хүрсэн) → `generateOrderNumber()` + 3 удаагийн retry, checkout-тэй ижил.
5. **Analytics "deviceTypes" давхар мөр**: GROUP BY нь NULL болон "unknown"-ыг тусад нь өгч, `?? "unknown"` дараа нь ижил label-тай 2 мөр болгож React "two children with the same key `unknown`" алдаа + админд тоо хуваагдаж харагдаж байв → label-аар нэгтгэнэ (sources-д мөн).
6. **4 brand-default fallback зураг 404** (`shared/site-media.ts`: sugi-sunrise-editorial-hero, professional-assortment, professional-family, care-retail — R2-д байхгүй): admin "BRAND DEFAULT" preview эвдэрхий, `home-stores` slot upload-гүй тул storefront дээр хоосон. Tom-ийн өөрийн upload хийсэн ижил зургууд (`site-media/1/*.webp`) руу заалгав.
7. **Checkout 320px-д 71px хэвтээ overflow** (CLAUDE.md-ийн хуучин нээлттэй зүйл): 2 шалтгаан — "баталгаажуулах." нэг үг text-5xl-д багтахгүй (→ text-4xl + overflow-wrap) ба grid item-ийн `min-width:auto` хямдралын кодын input+button-ийн min-content (334px)-ийг баганад тулгаж байв (→ `min-w-0`). Одоо overflow 0.
8. **Quick Stats infinity graph-ийн 2 label 320px-д 28px давхардаж** байв (130px fixed box) → `min(130px, 25%)`.
9. **Хуудас бүрт 2 `<h1>`**: cookie banner (Silktide vendor JS) гарчгаа h1-ээр зурдаг байв → h2 (vendor js+css patch). **Хуудас бүрийн `<title>`**: зөвхөн PostDetail тохируулдаг байсан — одоо PDP (барааны нэр + description), Shop, Journal, Legal (3), Login, Checkout, TrackOrder, ForgotPassword, NotFound, MyOrders, Profile, RoutineDetail.
10. **TinyMCE харанхуй горим**: dark content CSS import хийгдсэн ч `content_style`-д хэзээ ч өгөгдөөгүй → админ харанхуй байхад бичих талбар цагаан хэвээр байв → `isDark ? dark : light`.
11. **/favicon.ico** SPA fallback-аар index.html (text/html) буцаадаг байв → PNG icon руу 302.
12. **Admin sidebar nav**-д `min-h-0` (flex column-д scroll хийхгүй, "Гарах" товч 900px өндөрт дэлгэцээс гадуур байв).
13. Strict unused-code 18 → 2 (үлдсэн 2 нь AdminFaceGate-ийн санаатай хадгалсан liveness функцууд, мөр 626-ийн тайлбартай): Profile-ийн 5 ашиглагдаагүй import/`logout`, Home `CircleCheck`, AdminFaceGate `toast`, faceEngine type, AdminDashboardHome `canSeeAuditTrail` prop, db.ts `InsertUser`/`ENV`, security.ts/env.ts параметр. PDP-ийн үндсэн зурагт import хийгдсэн ч ашиглагдаагүй `imageSrcSet`-ийг залгав (srcset + sizes).

**Crawl-ийн false positive гэж тогтоосон (засаагүй)**: mobile-д хаалттай `.commerce-mobile-menu` (display:none-ийн доторх текст) болон cookie banner-тай "давхцал"; admin sidebar-ийн "Удирдлага" гарчиг nav-ийн scroll хэсэгт (clip хийгддэг); PnlRow-ийн note span (truncate-аар clip хийгддэг); нүүрний 3 мөр caps h1-ийн line-height .9 (дизайн). **Tom-д хэлэх**: `posts`-д "company"→"diane shampoo", "lflowadjaw"→"lofi cityaidhas" гэсэн 2 нийтлэгдсэн тестийн нийтлэл production дээр харагдаж байна; `/no-such-page` "Мэдээ олдсонгүй" гэж гардаг (catch-all нь PostDetail).

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр; `pnpm audit --prod` 0; unit+integration suite (доор тоо); post-fix crawl: stuck reveal 0, h1 1/хуудас, title хуудас бүрт, checkout overflow 0 (320), analytics console алдаа 0.

**Ачааллын тест (production build, нэг Node process, энэ laptop, 100 зэрэгцээ, 8с)**: статик HTML `/` → **5,410 req/s, p50 18ms, p99 29ms, 0 алдаа**; API (`catalog.list`, `catalog.bestsellers`) → нэг IP-ээс 300 request/15мин global limiter-т тулж 429 (limiter өөрөө 17k req/s даана). 10k хүн зэрэг орох тохиолдолд бодит хязгаар нь **DB зам**: pool `connectionLimit` 10 (mysql2 default), Aiven Бангалор RTT ~170–330ms → cache-гүй query ~30–60/с; нүүр хуудас ~11 tRPC дуудлага (batch). Дэлгэрэнгүй санал "Дараагийн ажлын санал"-д.

## 📦 Агуулахад шилжих алхмууд (Tom-д, 2026-09-11 — Phase 3 бэлэн, cutover ХИЙГДЭЭГҮЙ)

Код бэлэн, гэхдээ **автоматаар юу ч шилжээгүй** (бүх салбар одоо ч `store`, онлайн нөөц = бүх салбарын нийлбэр, үндсэн салбар = Орос элчин). Дэлгүүр хаалттай үед нэг өдөр:

1. /admin → **Салбарууд** → "Шинэ салбар нэмэх": нэр "Агуулах", **Төрөл = Агуулах** (одоохондоо үндсэн биш).
2. /admin → **Хэрэглэгч** → зөвлөхүүдэд `staff` эрх + **Ажилладаг салбар**; агуулахын ажилтанд `warehouse`.
3. /admin → **Бараа хүлээн авах → Тооллого → "Эхний үлдэгдэл"**, салбар = Агуулах, бүх барааг сканнердаж → **Батлах**.
4. Салбарууд → Агуулахыг **Онлайн захиалгын үндсэн салбар** болгоно; 4 дэлгүүрийн **"Онлайн нөөцөд тооцох"-ыг унтраана** (дэлгүүрүүд Smart POS-оор зардаг тул).
5. Дэлгүүр бүрт "Эхний үлдэгдэл" тооллого (Орос элчингийн одоогийн 18,725 гэсэн түр тоо бодит тоогоор солигдоно).
6. Хянах самбар → Системийн байдал → "Нөөцийн хөдөлгөөний бүртгэл" = таарч байна.

⚠️ 3–5-ын хооронд нийт тоо давхар тоологдоно — нэг өдөр дотор дуусгах. Дэлгүүрүүдэд онлайнаас очиж авах захиалга ирвэл бараа агуулахаас очно (систем автоматаар).

## ✅ (2026-09-11 → 09-12) Утасны push мэдэгдэл (ntfy) + нөөцийн ledger + сканнераар хүлээн авах + шилжүүлэг + нөөцийн alert + Smart Software синк — Phase 1–6 ДУУССАН

**Phase 5 (нөөцийн alert)**: салбарын **"Нөөц бага гэж анхааруулах босго"** тавьсан байршилд л борлуулалт/шилжүүлэг босгыг доошоо огтлох үед нэг удаа (өдөрт) push очно; 0 болбол "дууслаа"; нийтлэгдсэн барааны онлайн нийт 0 болбол admin+warehouse-д. Admin-ий засвар, тооллого alert өгөхгүй. Cutover-ийн дараа агуулахад босго (жишээ нь 5) тавих, дэлгүүрүүдэд Smart POS синк хүртэл хоосон үлдээх.

**Phase 4 (шилжүүлэг)**: /admin → Бараа хүлээн авах → **Шилжүүлэг**. Агуулах скан хийж "Илгээх" (агуулахаас шууд хасагдана, дэлгүүрт push) → дэлгүүр **blind** скан (илгээсэн тоо харагдахгүй) → "Хүлээн авах" (дэлгүүрт нэмэгдэнэ) → зөрүү байвал admin-д priority-5 push, admin мөр бүрийг шийднэ. Код: `server/transfers.ts`, `shared/transfer-reconcile.ts`, `client/src/components/inventory/TransfersView.tsx`. ⚠️ Бүртгэлгүй кодтой шилжүүлгийг илгээх боломжгүй (эхлээд бараа үүсгэх).

**Phase 6 (Smart Software синк, 2026-09-12)**: `server/integrations/smartSoftware.ts` нь вендорын **REST/JSON API**-тай холбогдоно (баримт: `developer.smartsoftware.mn` — Apidog тул JS-ээр зурагддаг, `llms.txt` + `/api-<id>.md`-ээр уншина). **Auth нь API key БИШ** — OAuth2 password grant (`GET|POST {host}/oauth/token`, username/password; Смарт Ложик гэрээний дараа имэйлээр илгээнэ). Хостууд: Inventory/Retail/Loyalty `https://retailapiv2.smartlogic.mn`, POS `https://smartposapi.smartapp.mn`, Accounting `https://accountingAPI.smartlogic.mn`. Ашиглаж буй: `/api/inventory/stock_locations`, `/api/inventory/products` (байршил бүрийн `count_on_hand`, баркодоор таарна).

**Урсгал**: /admin → Интеграцууд → Smart Software дээр нэр/нууц үг → "Холболт шалгах" (байршлын жагсаалт гарна) → салбар бүрт Smart POS код → "Үлдэгдэл татах" (эсвэл идэвхжүүлбэл 15 мин тутам). Үр дүн нь **нөөц шууд бичихгүй**: салбар бүрт зөвхөн зөрүүтэй мөрүүдтэй `submitted` тооллого үүсч, Бараа хүлээн авах → Тооллого дээр warehouse/admin **батлах** үед л ledger-ээр нөөц хөдөлнө. Шинэ таталт өмнөх батлагдаагүйг цуцална. ⚠️ Вендорын тоо бол **санхүүгийн үлдэгдэл** (дэлгүүрийн постлогдоогүй борлуулалтыг тооцоогүй) гэдгийг тэдний баримт өөрөө анхааруулдаг тул `scope:"partial"` — вендор илгээгээгүй барааг хэзээ ч 0 болгохгүй.

⚠️ **Borлуулалт илгээх (`POST /api/sale/sale`) нь И-БАРИМТ гаргадаг** (хариунд ДДТД/QR/сугалаа) — [EBARIMT.md](EBARIMT.md)-ийн Зам A яг энэ. Код хараахан бичээгүй: нягтлангийн (НӨАТ/НХАТ) болон вендорын (retailId/posId/cashierId, хүргэлтийн барааны код, paymentType/bankId) баталгаа шаардана.

🔴 **zod 4 урхи (2026-09-11 бодит incident)**: `.partial()` дотор `.default()` ОДОО Ч хэрэгждэг — update schema-д заавал `partialForUpdate()` (server/routers.ts) ашигла. Эс бөгөөс орхигдсон талбарууд create-ийн анхдагч утгаар дарагдана (салбар зөөхөд онлайн хүргэлт унтарч байсан; тестийн явцад бодит үндсэн салбар хэдэн минут алга болсон, сэргээсэн).

**Бүтэн төлөвлөгөө (Tom баталсан, 6 phase)**: `C:\Users\hero_\.claude\plans\https-github-com-binwiederhier-ntfy-enii-happy-avalanche.md` (гэрийн лаптоп дээр л байгаа — гол шийдвэрүүд HISTORY.md-ийн ижил нэртэй хэсэгт). **Phase 2 дууссан**: `stock_movements` ledger (migration 0063) — `branch_stock`-ийн өөрчлөлт бүр `server/stockLedger.ts`-ээр ижил transaction-д бүртгэгдэнэ. ⚠️ **`branch_stock`-д шинээр бичих код заавал `applyBranchStockDelta` / `setBranchStockAbsolute` / `recordStockMovement`-ийг ашиглана** — эс бөгөөс Системийн байдал дээр drift гарна (`scripts/stock-ledger-rebaseline.ts --apply` засна). Нөгөө лаптоп `git pull` хийхээс өмнө ажиллуулсан checkout/POS нь бүртгэлгүй өөрчлөлт хийнэ — pull хийсний дараа rebaseline dry-run ажиллуул. Үлдсэн phase: **3** агуулах байршил (`branches.kind`) + `users.branchId` + USB сканнераар бараа хүлээн авах/тооллого (A4 цаас + group chat зургийг орлоно), **4** агуулах→дэлгүүр шилжүүлэг, blind скан тулгалт, **5** салбар бүрийн бага нөөцийн alert, **6** Smart Software adapter-ийн суурь.

**Хэрхэн ажилладаг**: business код мэдэгдлийг `notification_outbox`-д **өөрийн transaction дотор** бичнэ (`enqueueNotification`, `recordNotification`) → `server/notifications.ts` dispatcher ntfy.sh руу илгээнэ. Бүлэг: admin/warehouse/finance/store (`staff` = дэлгүүрийн зөвлөх). Мессежид харилцагчийн нэр/утас/хаяг **хэзээ ч** ороохгүй (payload төрлөөр хамгаалагдсан). Admin top bar-ын **хонх** ижил мөрүүдийг харуулна (уншсан төлөв `users.lastSeenNotificationId`).

⚠️ **Чухал тохиргоо**:
- **`NOTIFICATIONS_DISPATCH=1`** тохируулсан машин л утас руу илгээнэ (хоёр лаптоп нэг DB хуваалцдаг тул opt-in). Одоо **аль ч машин дээр тохируулаагүй** — бодит захиалгын мэдэгдэл queue-д орж, 2 цагийн дараа expired болно. Hosting сонгогдмогц production дээр тохируулна. /admin → Интеграцууд → "Туршилт" товч үүнээс үл хамааран шууд илгээнэ.
- ntfy тохиргоо (token + 4 бүлгийн сэдэв) `integration_configs`-д **шифрлэгдсэн**, идэвхтэй. Tom-ийн iPhone admin сэдэвт бүртгэлтэй, **бодитоор ирж байгааг баталгаажуулсан**. Ажилтан гарвал тухайн бүлгийн сэдвийг "Шинэчлэх" дарж солино.
- `server/_test-setup.ts` нь `NOTIFICATIONS_SUPPRESS=1` тавьдаг — тест бодит Aiven дээр захиалга үүсгэсэн ч мэдэгдэл `suppressed` болж утас руу **хэзээ ч** явахгүй.
- **Dedupe түлхүүр үйл явдлын төрлөөр namespace хийгдсэн** (`outboxDedupeKey`) — нэг захиалгын "шинэ", "төлөгдсөн", "цуцлагдсан" бүгд `order:<id>`-ээр дуудагддаг; namespace-гүй бол unique index тэднийг чимээгүй залгидаг байсан (тестээр олдсон).
- Интеграцийн тохиргоо одоо **merge** хийгдэнэ (өмнө нь нэг түлхүүр хадгалахад бусад нь устдаг байв). Гадагшаа нээлттэй REST API / OAuth2 **зориуд байхгүй** (Smart Software-той бид өөрсдөө холбогддог, тэд манай руу хандахгүй).
- Шинэ admin хэсэг "Утасны мэдэгдэл" (`notifications`) — хэсэг нэмэхдээ `AdminSection` union, `adminSectionKeys`, `SECTION_ROLES`, 3 гарчгийн ternary chain, `shared/admin-tips.ts` + `server/admin-tips.test.ts` бүгдийг шинэчлэх.

## ⚠️ ХОЁР ЛАПТОП — session бүрийн эхэнд ЗААВАЛ `git fetch` (2026-09-11 бодит incident)

```powershell
git fetch --all --prune ; git status -sb
```

**Яагаад**: 2026-09-11-нд session нь remote-ыг шалгалгүй эхэлж, `origin/main`-аас **2 commit хоцорсон** branch дээр бүтэн өдрийн ажил хийсэн. Ажлын лаптоп өчигдөр push хийсэн "Top Brands + /brands" ажил (15 файл, `index.css`-ийн 397 мөр) огт харагдаагүй, улмаар **хоёр өдөр ижил CSS мөрүүдийг бие даан дахин бичсэн**. Засахын тулд өдрийн ажлыг backup хийж, `--ff-only`-оор өчигдрийн ажлыг буцааж аваад, өөрчлөлтүүдийг **дахин хэрэгжүүлэх** шаардлагатай болсон (3-way merge нь таамаглал болох байсан).

⚠️ **Хамгийн зальтай хэсэг**: Aiven DB болон R2 нь хоёр лаптопт **хуваалцсан** тул нөгөө лаптопын migration аль хэдийн бодит DB дээр ажилласан байдаг. Өөрөөр хэлбэл **DB шинэ, код хуучин** гэсэн байдал чимээгүйхэн үүсдэг (2026-09-11-нд `featured_brands.logoUrl` багана DB дээр байсан ч энэ лаптопын `drizzle/schema.ts`-д байгаагүй). Аппликейшн ажиллаж байгаа нь синк болсны баталгаа БИШ.

## ✅ (2026-09-11, орой) Гүнзгий аудит — 5 бодит асуудал заслаа, 2 дизайны бооцоо хүлээгдэж байна

Бүрэн тайлан: https://claude.ai/code/artifact/6d3cc4d4-aa77-4b9f-959c-ffe8ffc43c2c · дэлгэрэнгүй HISTORY.md

**Заслагдсан**: (1) `catalog.categoryShelves` — дуудагчгүй мөртлөө **нээлттэй public** endpoint, хүсэлт бүрт **13 query**; procedure + 2 функц устгав. (2) `getFeaturedBrands`-ийн **N+1** — брэнд бүрт нэг fallback query, 9 брэнд × 10 холболтын pool; нэг бүлэглэсэн query боллоо. (3) `products.brand` дээр **индекс байгаагүй** (migration `0060`, Aiven дээр ажилласан). (4) 9-өөс **8 хэсэг ижил eyebrow+гарчгаар** эхэлдэг байсныг 3 болгов; утгагүй "01–06" дугаарлалт устгав (ангилал бол дараалал биш). (5) import хийгддэггүй **7 компонент** устгав (544 мөр).

⚠️ **"Онцлох брэндүүд" цагаан харагдах шалтгаан**: carousel нь `brands.some(b => b.logoUrl)`-оор лого зурвас нөөцөлдөг байсан — **ганц** брэнд (Cocochi) логотой атлаа **бүх 9 карт** 100px хоосон зай үүсгэж байв. Одоо **олонх** шаардана. Жинхэнэ шийдэл: **/admin → Брэнд дээр үлдсэн 8 логог оруулах**.

⚠️ **Хийгээгүй, зөвшөөрөл хүлээж буй**: (a) display шрифт нэмэх — Golos Text ганцаараа 643 элемент бүгдийг тохируулж байна; **кирилл глифийг заавал шалгах** (2026-09-06-ны бодит урхи). (b) 9-өөс 7 хэсэг одоо ч бүтэн өргөний хэвтээ band — 2 хэсгийг bento/асимметр болгох.

**Аудитын арга (дахин ашиглах)**: import графикаар orphan модуль олох, `routers.ts`-ийн procedure бүрийг client-ийн бодит дуудлагатай тулгах, Playwright-ээр дизайны шинжийг **тоолох** (eyebrow/дугаар/CAPS шошго/тэгш grid/shadow), дараа нь л дүгнэх.

## ✅ (2026-09-11) Гэрэл багасгасан Linen палитр + босоо зайн засвар + bestseller rail

**Менежер**: "нүүр болон бүх frontend хуудас хэт гэрэлтэй, юу ч харагдахгүй". **Tom: харанхуй горим ХЭРЭГГҮЙ** — 2 цайвар хувилбараас (Paper дулаан / Linen сэрүүн) **Linen** сонгогдов.

**Хэмжсэн шалтгаан**: хуудасны дэвсгэр 91.5% luminance, карт vs суурь **1.07:1** (карт/хуудас/цагаан packshot гурав нэг цагаан хуудас мэт), мөн **2 бүтэн дэлгэцийн ханасан шар band** (`#f0b52d`, нийт 1443px өндөр) — гялбааны хамгийн том эх үүсвэр.

**Linen токенууд**: суурь `#dae0da` · ээлжлэх band `#ced5cf` · карт `#f2f5f2` · хүрээ `#b7beb9` · тайлбар текст `#545958` · жижиг улаан `--primary-text` **#b01729** · surface-tint `#d3dad4` · sky `#28537a`. Шар нь зөвхөн badge/rank/гарчгийн зураас. **Барааны зургийн тавцан цэвэр цагаан хэвээр**; `wcu-section` 2026-09-12 хүртэл харанхуй байсан; Tom-ийн лавлагаа зургаар цайвар (сайтын дэвсгэртэй ижил) болсон — хуучин хувилбар `backup/pre-wcu-redesign-2026-09-12` tag дээр. Гэрэл **20% буурав**, карт vs суурь **1.22:1**.

⚠️ **Жижиг улаан текстэд `var(--primary)` (#df1f3d) ХЭРЭГЛЭХГҮЙ** — шинэ band дээр 3.19:1. Үүнд зориулж `--primary-text` байдаг (14 газар шилжүүлсэн). **`.brands-page`/`.back-to-top` CSS нь admin theme блокийн ДООР** байрладаг тул палитр өөрчлөхдөө тэр хэсгийг мартаж болохгүй.

**Босоо зай**: band бүр 25–34% хоосон padding байсныг татав; `.editorial-heading` 82px→56px cap, `/shop` h1 96px→62px (нүүрний hero-гоос том байсан), hero 1009px→628px (h1 428→184). **Нийт нүүр 8015→6612px (−18%)**.

**Bestseller rail**: бүх DB-д ердөө **3 төлөгдсөн захиалга** байгаа тул rail ганц карт зурдаг байв. `getBestsellingProducts` одоо `getCategoryShelfProducts`-ийн гэрээг дагаж, бодит борлуулалтын дараа **admin-ий featured брэндүүдээс** (round-robin) дүүргэнэ — **хуурамч захиалга үүсгээгүй**, бодит борлуулалт гармагц filler шахагдана. `Asmy` featured brand болж нэмэгдэв (`scripts/seed-featured-brand-asmy.ts`; ⚠️ `products.brand` дээр яг **"Asmy"**, "ASMY" биш). `getRecommendedProducts`-ийн cold-start нь 2 дахин гүн хуудсын хоёр дахь хэсгийг авдаг болсон — эс бөгөөс хоёр rail ижил 6 картыг давхардуулж байв.

**Баталгаажуулалт**: 28 хослол (7 хуудас × 1440/1024/390/320) — hэвтээ overflow 0, давхцал 0, **контрастын алдаа 0** (эхэлж 55 байсныг бүгдийг заслаа, бодит computed дэвсгэр дээр хэмжсэн), эвдэрсэн зураг 0, `<h1>` хуудас бүрт 1. `pnpm check`/`pnpm build` цэвэр, bestseller+catalog тест 24/24.

## ✅ (2026-09-10) /shop-ийн барааны карт Tom-ийн лавлагаа зурган дээрх карт болов

Tom лавлагаа screenshot (SHARP шүүлтүүрийн карт) илгээж: "Build like same thing exact one!!! Even brand name thats located on left top!!" + "Make it 100% data driven and editable on ./admin page".

**Карт (`Shop.tsx` + `index.css`-ийн шинэ `.shop-product-*` блок)**: цагаан карт (radius 14px, hairline border) · зүүн дээд буланд **брэндийн нэрийн чип** · баруун дээд буланд улбар шар **-N%** badge · бараа цагаан дэвсгэр дээр **бүтнээрээ** (object-fit: contain) · 2 мөр bold гарчиг (ellipsis) · дээр нь зурсан хуучин үнэ, доор нь том улаан үнэ · баруун доод буланд **цэнхэр сагсны товч**.

**Бүх утга admin-аас удирдагдана** (шинэ талбар нэмээгүй — бүгд аль хэдийн байсан): чип = `products.brand` (**Брэнд**), badge+зурсан үнэ = **Хуучин үнэ (сонголтоор)** vs **Үнэ**, гарчиг = **Нэр**, зураг = **Зураг**, товчны идэвх = **Нөөц**. Картанд hardcode текст алга.

**Хамгийн том функциональ ялалт**: сагсны товч урьд нь `<Link>` дотор байсан **чимэглэл** байсан тул дарахад зүгээр л барааны хуудас руу үсэрдэг байв. Одоо жинхэнэ `cart.addItem` — ProductDetail-тэй ижил зам (invalidate → drawer нээх → toast). Бодитоор шалгасан: цэвэр session-д 2 удаа дарахад Aiven дээр `cart_items.quantity = 2` болсон (дараа нь тестийн 2 guest cart устгасан).

**Замдаа олдсон/заслагдсан**:
- Хөрөнгийн зурагнууд `object-fit: cover` байсан тул **дөрвөлжин болгож тайрч** байв — Япон packshot-ийн ирмэг тасардаг. Одоо contain.
- Босоо зурагтай бараа (жишээ 105x283 eyeliner) aspect-ratio блокийг сунгаж, тэр эгнээний карт **2.3 дахин өндөр** болгодог байв → зургийн давхаргыг `position:absolute` болгож дөрвөлжинг тогтоов. Одоо 1233/390/320-д бүх карт **яг ижил өндөртэй**.
- 7 placeholder SVG-ийн `#eef0ee` дэвсгэр цагаан карт дээр **саарал хайрцаг** болж харагдаж байв (зурaггүй 415 бараа) →透明 болгов.
- **Контраст (тооцоолсон, таамаглаагүй)**: лавлагааны тод улбар шар `#f2622b` дээрх цагаан = **3.20:1**, badge-ийн текст 15px bold нь WCAG-ийн "том текст" (18.66px bold) босгонд хүрэхгүй тул 4.5 шаардана → `#cf4611` (**4.63:1**). Зурсан хуучин үнэ `#9a9aa0` = **2.80:1** → `#6f7076` (**4.94:1**). Улаан үнэ 4.77:1 ✓, цэнхэр товч 7.98:1 ✓.
- `.shop-sale-badge` нь нүүрний shelf/bestseller/104px thumbnail-уудтай **хуваалцсан** класс тул томруулсан хувилбарыг зөвхөн `.shop-product-media` дотор хязгаарлав (бусад нь ижил улбар шар, жижиг хэвээр).
- Карт дотор `<button>` нь `<a>` дотор байсан (a11y алдаа) — одоо ах дүү элемент.
- Устгасан: улаан hover цагираг, "VIEW" дугуй, тайлбар мөр, байнга харагддаг нөөцийн тоо, доод талын бүтэн өргөнтэй "Шуурхай харах" мөр (лавлагаанд байхгүй). Шуурхай харах нь **hover overlay** болж үлдсэн (зөвхөн хулгана/pointer төхөөрөмж).

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр (CSS 259.5→261.0 kB); 1440/1233/900/760/390/320 зургаан өргөнд hOverflow 0, console алдаа 0, картын элементүүд хоорондоо давхцал 0, карт бүр ижил өндөр; нүүр + placeholder-тэй барааны хуудас + /shop дээр эвдэрсэн зураг 0, page error 0; /admin-д `.shop-*` класс огт ашиглагддаггүйг grep-ээр баталгаажуулсан.

⚠️ **Tom-д**: одоогоор **937 бараанаас 0-д нь "Хуучин үнэ" тавигдаагүй** тул улбар шар **-N% badge бодит сайт дээр хараахан харагдахгүй**. Badge ажиллаж байгааг нэг бараан дээр түр 309,900→30,900 тавьж (-90%) баталгаажуулаад **шууд буцаасан** (одоо дахин 19,000₮, хуучин үнэ NULL). Хямдрал харуулах бол /admin → Бүтээгдэхүүн → **Хуучин үнэ** талбарыг бөглөнө.

## ✅ (2026-09-12) Нүүр хуудас cosmekitchen-webstore.jp лавлагаагаар бүрэн шинэчлэгдэв

Tom лавлагаа сонгов: "buh design sudalj ... bugdiin huulaad hiiged uz!!! premium baih ystoi professional!!!". Playwright-ээр тэр сайтын computed style/bounding box-ыг хэмжиж (Inter; гарчиг 26px/400/.1em төвлөрсөн, доош 35px; хэсэг хооронд 80px; цагаан хуудас, cream #fafaf5, чип #f8f7ef, бэх #212121, hairline #e5e5e5, rank алт #93781e; контейнер 1108px; карт 207px, дөрвөлжин зураг, **сүүдэргүй**, radius 4; header 65px + 380×40 хайлтын мөр) нүүрийг дахин зохион байгуулав. Дэлгэрэнгүй: [HISTORY.md](HISTORY.md) "Нүүр хуудасны Cosme Kitchen редизайн".

- **Бүх засвар `client/src/index.css`-ийн ТӨГСГӨЛД нэг давхарга** ("COSME KITCHEN RESTYLE") — өмнөх дүрмүүд хэвээр, зөвхөн дарагдсан. Бүхэлд нь хасвал хуучин дизайн эргэж ирнэ. Backup tag: `backup/pre-cosmekitchen-2026-09-12`.
- ⚠️ **`:root` токен хөндөөгүй** (admin/shadcn аюулгүй). Шрифт нь `.sugi-site/.commerce-header/.site-footer`-т `--font-body/--font-display`-ыг дахин тодорхойлж сольдог; хуудас цагаан болох нь `body:has(.sugi-site)` — зөвхөн НҮҮР. /shop, барааны хуудас Linen палитраа хэвээр барина (header/footer хоёр л сайт даяар шинэчлэгдсэн).
- Hero = 3 дөрвөлжин зургийн rail (`HeroImageSlideshow` дахин бичигдсэн), доор нь төвлөрсөн гарчиг/CTA. Шинэ `KeywordChips` (slot `home-text-keywords-heading`). Bestseller/recommended нь `CarouselShelf`+`ShelfProductCard` болов — **`ShelfProductCard` ProductDetail-тэй хуваалцсан тул түүнийг өөрчилбөл 2 газар өөрчлөгдөнө**. Ангилал = 110px дугуй зураг+шошго, брэнд carousel `--fbrand-scale:1` (JS нь CSS var уншдаг). Footer cream. Sunrise ribbon нүүрнээс хасагдсан.
- **Hero слайд**: 3 хуулбартай төгсгөлгүй rail — 4 секунд тутам нэг зураг гүйнэ (хулгана/хуруу дээр нь байвал зогсоно, reduced-motion үед огт хөдлөхгүй). ⚠️ Хуулбар хоорондын үсрэлтийг зөвхөн **скролл зогссоны дараа** (140мс) хийнэ; glide явж байхад хийвэл байрлал хойш үсэрдэг (хэмжиж нотолсон). Admin дээр **6 хүртэл hero зураг** (`home-hero-4/-5/-6`, brand default-гүй — зураг оруулаагүй слайд огт харагдахгүй; тайлбар нь "Hero — N-р слайд" бүлэгт). `ContentMediaPanel` одоо `fallbackUrl: null`-ыг мэддэг (зурaггүй слотод "ЗУРАГ ОРУУЛААГҮЙ", alt хадгалах боломжгүй).
- Утсан дээр header-т зөвхөн **сагс + цэс** үлдэв: доод самбар аль хэдийн хүслийн жагсаалт/профайлыг барьдаг тул давхардаж, Tom-д "зүрх ба сагсны хооронд том зай" болж харагдсан.
- Header: `.commerce-header-inner` одоо **grid 1fr/auto/1fr** (лого | төвийн цэс | дүрснүүд), цэс `.commerce-header-left`-ээс ГАДНА байрлана; 1100px-ээс доош цэс drawer руу орно; бүх хуудсанд хайлтын мөр (`<HeaderSearch variant="inline" />`). Tom-ийн хүсэлтээр **header доорх брэндийн логоны зурвас болон "Дэлгүүр" текст линк устгагдсан**.
- Баталгаажуулалт: check/lint/build цэвэр; 1440/1024/390/320-д overflow 0, console 0, эвдэрсэн зураг 0; нүүр 6612→6010px. ⚠️ Энэ машин дээр Playwright-ийн `setViewportSize` нь бодит CSS өргөнөөс ~10% зөрдөг — хэмжихдээ `window.innerWidth`-ээр давтаж тааруул.

## ✅ (2026-09-12) Forensic аудит (Tom-ийн 27 үе шаттай playbook, "do not skip anything / deep dig") — 4 commit, бүгд тестээр нотлогдсон

Бүрэн тайлан (health score /10 хэсэг бүрээр, scaffold/AI-slop inventory, P0–P4 bug register, юу засагдсан/юу санаатай хөндөгдөөгүй, production readiness): **https://claude.ai/code/artifact/97206a4e-517c-411d-bce4-a2f3c30c18e4 · **Сайтын архитектурын визуал зураг** (давхаргууд, захиалгын аялал, ledger, эрхүүд): https://claude.ai/code/artifact/fed0a0dd-1d77-4d09-a99b-8e3f6cf0908d** · дэлгэрэнгүй HISTORY.md "Forensic аудит" хэсэг.

**Гол засварууд** (`618eeec` idle lock → `28774f3` cache → `6653fff` batch 1 → `3d3b05a` batch 2):
- 🔒 **/admin 25 минут idle → lock, царайг дахин асуух** (Tom-ийн хүсэлт). Зөвхөн бодит оролт (pointer/key/touch/scroll) тоологдоно — панелийн өөрийн polling сунгахгүй. Proof cookie = sliding idle 25 мин + absolute 8 ц; бүх tab `BroadcastChannel`-ээр хамт; lock `face_attempts.idle_locked` (migration 0068). NIST 800-63B / PCI DSS 4.0 8.2.8 / OWASP-ийн дунд.
- ⚡ **Cache**: storefront контент 30 с (бичигч бүр invalidate), session user **5 с, user id-аар** — 163→2мс, 173→2мс хэмжсэн. 🔴 Эхний хувилбар token-оор түлхүүрлэж "бүх төхөөрөмжөөс гарах"-ыг 5 с хоцроосон (P0, suite барив) — одоо session-ийн эрхийг өөрчилдөг 7 бичигч `forgetSessionUser` дуудна. **Шинэ ийм бичигч нэмбэл заавал дуудна.**
- 🧾 **Idempotency**: `orders.clientRequestId` (migration 0069) — checkout + POS хоёулаа. Timeout/resend/2 дахь tab давхар захиалга + давхар нөөц хасалт үүсгэдэг байв. **Захиалга бичдэг шинэ зам бүр энэ түлхүүрийг авна.**
- 📣 **Кампанит ажил** ижил илгээлтийг 10 минутын дотор татгалзана (CONFLICT; fingerprint audit log дээр, 2 лаптопт хүчинтэй). `qpayCreateInvoice`/`storepayCreateLoan` нээлттэй attempt-аа дахин ашиглана. QPay callback `"SUCCESS"`. SSRF guard (cloud вендор https + public host). `data-retention` job.
- 📱 390/320px: admin 4 хэсэг + /shop filter pill-ийн хэвтээ overflow 0 болов; admin `<title>`/h1; cookie banner /admin-д гарахгүй; aria-label-ууд; login redirect `//` guard.
- 🧰 **Tooling**: тест/скрипт type-check (`tsconfig.tests.json`, 90 хуучирсан fake user → `testSessionUser()`), ESLint (`pnpm lint`, CI Lint алхам), target ES2022, 3 хэрэггүй dev dep устгасан.

**Санаатайгаар хөндөөгүй**: React Compiler eslint дүрмүүд (39 ажилладаг pattern flag хийдэг); AdminFaceGate liveness функцууд; 5 junk post (Tom); ntfy token rotate (Tom).

🔴 **Idle lock-ийн бодит incident (2026-09-12, орой)** — Tom лаптопоо 2 цаг орхиод буцаж ирэхэд /admin ажилласаар байв. 2 шалтгаан, хоёулаа заслагдсан (`server/_core/faceProof.ts`): (1) **Хуучин proof cookie** — Tom 10:58-д царайгаа таниулсан, idle lock 11:37-д deploy болсон; хуучин token нь `abs` claim-гүй, 8 цагийн `exp`-тэй байсан бөгөөд шинэ код түүнийг "өөрийн хугацаа хүртэл" хүлээн зөвшөөрдөг байв → одоо `abs`-гүй token **хүчингүй** (нэг удаа камер дахин). (2) **Gate нь зөвхөн дэлгэц байв** — панель царай асуудаг ч түүний дуудаж буй tRPC procedure-ууд proof шалгадаггүй байв → одоо `panelProcedure` (admin/staff/finance/marketing/warehouse/anyStaff/inventory/*Read бүгд) `assertFaceProofForPanelRole` ажиллуулна; proof-гүй бол `FORBIDDEN` + `FACE_REQUIRED_ERR_MSG`, client тэр алдааг авмагц `faceAuth.status`-ыг invalidate хийж камер гаргана; status 60 с тутам + tab focus дээр дахин шалгана. ⚠️ **Тестэд**: `_test-setup.ts` gate-ийг `0` болгодог (caller-ууд cookie-гүй); `ENV.adminFaceGateEnabled` одоо getter тул face тестүүд өөрсдөө `"1"` тавьдаг. Шинэ admin procedure бичихдээ `protectedProcedure` биш role builder ашигла — эс бөгөөс proof шалгагдахгүй.

## ✅ (2026-09-12) SQL injection үнэлгээ (Tom: sqlmap-ээс хамгаалагдсан уу?)

Бүрэн тайлан: **[docs/SECURITY-sqli.md](docs/SECURITY-sqli.md)**. Товч: **бүтэцийн хувьд хамгаалагдсан**. sqlmap-ийн 6 техник (boolean/time-blind, error, UNION, stacked, out-of-band) бүгд аттакерын текстийг SQL syntax болгохыг шаарддаг — энд бүх query drizzle-ийн `sql` template-ээр (bind parameter) явдаг тул боломжгүй.

- Цорын ганц concatenate хийдэг primitive `sql.raw` — 7 газар (INTERVAL/LIMIT, MySQL bind param авдаггүй) — одоо бүгд **`server/_core/sqlSafe.ts` `sqlInt()`**-ээр явна (finite тоо биш бол throw). `grep -rn "sql.raw" server/` одоо зөвхөн helper өөрийг өгнө. **Шинээр `sql.raw` бичихгүй — `sqlInt` ашигла.**
- Stacked queries mysql2-т анхнаасаа хаалттай (`multipleStatements` default false); zod бүх id-г `z.number().int()`, хайлтыг `max(120)`; production-д tRPC дотоод алдааг client руу гоодуулдаггүй; `limitApiTraffic` 300/15мин scanner-ыг таслана.
- **Баталгаа**: `server/sqli-probe.integration.test.ts` — sqlmap-ийн payload-уудыг бодит хайлт руу шиднэ, DROP TABLE-ийн дараа products хүснэгт байсаар.
- ⚠ **Tom хийх ганц hardening**: апп одоо `avnadmin` (Aiven superuser)-ээр холбогддог. `scripts/aiven-least-privilege.sql`-аар зөвхөн SELECT/INSERT/UPDATE/DELETE эрхтэй `sugi_app` хэрэглэгч үүсгэж `DATABASE_URL` солих (migration нь avnadmin-аар хэвээр). Injection боломжгүй ч ч хэзээ нэгэн цагт гарвал blast radius-ыг хаана.

## ✅ (2026-09-12) `.env` сканнер бот + терминалын лог (Tom-ийн hosting лог screenshot, Reddit r/SaaS thread)

Reddit-ийн дүгнэлт: энэ бол **бүх IPv4-ийг сканнердаж буй бот, хэвийн**; хамгийн чухал нь сервер `.env`-ийг хэзээ ч өгөхгүй байх (манайх: `.env` gitignore, `dist/public`-ийн гадна, express.static dotfile-ыг өгдөггүй). Гэхдээ өмнө нь ийм зам бүр SPA fallback-аар **200 + index.html** авдаг байсан (сканнерт "энд юм байна" гэсэн дохио) бөгөөд манай логт мөр ч үлддэггүй байв.

- **`server/_core/scannerProbes.ts`** (`blockScannerProbes`, `setSecurityHeaders`-ийн шууд дараа): `.env*`, dotfile/dot-dir (`.well-known`-оос бусад), `*.php/asp/jsp`, backup/dump (`.bak/.sql/.zip/…`), `wp-admin`/`phpmyadmin`/`vendor`/`actuator`/`_profiler`, `/config.js`/`/server.js` → **шууд 404 text/plain**, app ажил хийхгүй. IP тутам тоолж, **1 цагт 5 probe → тэр IP 1 цаг 403** (in-process fail2ban). Loopback/private хаяг (127.0.0.1, 10/8, 192.168/16, 172.16/12, ::1, fd00::/8) **хэзээ ч ban болохгүй** (404 л авна) — dev дээр өөрийгөө түгжихгүй, production-д proxy client IP дамжуулаагүй бол бүх зочин нэг IP болж нэг бот сайтыг бүхэлд нь хаах эрсдэлээс сэргийлнэ. Probe бүр `[probe] <ip> GET <path> -> 404 (n/5)` гэж терминалд бичигдэнэ. 78 unit тест (probe жагсаалт + бодит замын жагсаалт хоёулаа).
- **Терминалын лог** (шинэ, dependency-гүй): `$env:LOG_REQUESTS="1"; pnpm dev` → хүсэлт бүрт nginx маягийн `[time] ip "GET /path" status bytes ms` мөр (`server/_core/requestLog.ts`; dev-д Vite-ийн модулийн хүсэлтүүд алгасагдана). `$env:LOG_SQL="1"` → SQL statement бүр bound param-тайгаа `[sql] …` гэж (admin-ийн SQL tab сүүлийн 200-г л харуулдаг, энэ бүгдийг live). Хоёулаа анхдагчаар унтраалттай.
- Hosting дээр нэмэх: Cloudflare (үнэгүй bot fight mode) урд нь, эсвэл host дээр fail2ban; nginx ашиглавал `location ~ /\.(?!well-known) { return 404; }`.

## ✅ (2026-09-12) Утсан дээр "Дараах" болон шинэ хуудас доошоо (footer руу) үсэрдэг байсныг заслаа

Tom утсаараа (192.168.88.6, LAN) туршихад /shop-ийн "Дараах" footer руу аваачдаг, шинэ хуудас нээхэд дандаа доод тал нь гардаг байв. Хоёулаа **хэмжиж** олсон (Playwright 390px): (1) хуудас солиход `catalog.list`-ийн шинэ key → `isLoading` → grid 8 картын skeleton болж унмаунт, документ 8170→4414px болж хагасаар багасахад явж байсан smooth scroll clamp/cancel болдог (Safari-д footer). (2) Route солиход scroll хэзээ ч reset хийгддэггүй байсан — /shop-ийн 7326px-ээс footer линк дарахад /privacy 884px байхад 40 болж clamp, дараа нь 5331px болж өсөхөд 4488 дээр (доод тал) үлддэг.

Засвар: `catalog.list`-д `placeholderData: keepPreviousData` (grid унмаунт болохгүй, 24 карт хэвээр), pager render-ийн ДАРАА `useEffect`-ээр **instant** scroll (`client/src/lib/scroll.ts` `scrollToNow` — `html{scroll-behavior:smooth}`-ыг нэг frame override), sticky header-ийн өндрийг хасна; `client/src/hooks/useScrollToTopOnNavigate.ts` Router-т — forward navigation бүр 0-ээс эхэлнэ, **back/forward-д хүрэхгүй** (popstate flag), hash-тай бол хүрэхгүй. Хэмжсэн: Дараах → grid header-ийн доор 75px-д тогтвортой; footer линк → /privacy scrollY 0.

## 📱 Демо / утсаар турших (2026-09-12) — `scripts/demo.ps1`

`.\scripts\demo.ps1` = production build + `NODE_ENV=production node dist/index.js` (3000 порт, LAN IP-г хэвлэнэ, access log асаалттай). `-Tunnel` нэмбэл Cloudflare quick tunnel (`https://<random>.trycloudflare.com`) — **ямар ч сүлжээнээс, HTTPS тул утсан дээр камер/царайны хаалга ажиллана**; оффисын Wi-Fi ихэвчлэн төхөөрөмж хоорондын холболтыг хаадаг тул LAN IP оффист ажиллахгүй байж болно. cloudflared суулгах (нэг удаа, Tom өөрөө): `winget install --id Cloudflare.cloudflared`. ⚠️ Tunnel нээлттэй байхад сайт интернэтэд ил (хамгаалалтууд бүгд асаалттай: face gate, rate limit, CSRF, probe blocker); demo дуусмагц `Ctrl+C`. Demo-ийн захиалгууд **бодит Aiven**-д орно — бэлнээр захиалуулж, дараа нь /admin-аас цуцлах. `pnpm start` скрипт нь bash синтакс (`NODE_ENV=…`) тул Windows дээр ажиллахгүй — demo.ps1 ашигла.

## ✅ (2026-09-12) iPhone: доод nav bar scroll хийхэд жижигэрдэг байсныг заслаа
`--mobile-sticky-bar-h` (64px) одоо контентын өндөр, safe-area нь дээр нь нэмэгдэнэ (`height: calc(64px + var(--safe-bottom))`). **Дүрэм: fixed доод элементэд `env(safe-area-inset-bottom)`-ийг өндөр ДОТОР нь биш, ДЭЭР нь нэм** — Safari toolbar эвхэгдэхэд inset өөрчлөгддөг.

## 🔴 (2026-09-12) Production дээр cookie banner 09-06-оос хойш ОГТ гарахгүй байсан — CSP inline script-ийг хааж байв

Public tunnel-ээр (production build, `script-src 'self'`) нүүрийг нээхэд console: "Executing inline script violates CSP". `index.html`-ийн inline `silktideConsentManager.init({…})` production-д хэзээ ч ажиллаагүй (CSP 09-02, inline init 09-06). Dev-д CSP байхгүй тул бүх шалгалт "ажиллаж байна" гэж харуулж байв. Засвар: текст нь `<script type="application/json" id="cookie-consent-config">` (өгөгдөл, CSP хамаарахгүй; server placeholder-оо орлуулсаар), init нь `client/public/vendor/silktide-consent-init.js` (`'self'`). Production дээр Playwright-аар banner гарч байгааг баталгаажуулсан. **Дүрэм: `index.html`-д inline `<script>` бичихгүй** (JSON/ld+json блок болно); production-only зүйлийг (CSP, compression, static) заавал `NODE_ENV=production node dist/index.js`-ээр нэг удаа шалга — `scripts/demo.ps1` яг үүнийг хийдэг.

## ⚠️ (2026-09-12) LAN/http дээр туршихад олдсон 2 алдаа — "localhost дээр ажилласан" гэдэг нь хангалтгүй

1. **`crypto.randomUUID()` зөвхөн secure context-д байдаг** (https эсвэл localhost). Утаснаас `http://192.168.88.6`-ээр /checkout нээхэд render дээр унасан. Localhost-ын бүх тест үүнийг харуулдаггүй. Одоо `client/src/lib/requestId.ts` `newRequestId()` (randomUUID → getRandomValues v4 → Math.random). **Шинэ код secure-context-only API (`randomUUID`, `navigator.clipboard`, `navigator.share`, `getUserMedia`) ашиглавал заавал fallback/guard тавь.** Царайны камер нь HTTPS-гүйгээр утсан дээр ажиллахгүй — энэ нь шийдэгдэхгүй, HTTPS л хэрэгтэй.
2. **Scanner-blocker өөрийн `/vendor/silktide-consent-manager.{js,css}`-ийг 404 болгож, cookie banner хуудас бүр дээр үхсэн байв** (`f4555cb`, нэг цаг). `vendor`-ыг ерөнхий жагсаалтаас хасав; `scripts`-ээр `client/public`-ийн 71 файлыг matcher-оор шалгахад зөвхөн `.gitkeep` л блоклогдоно (зөв). **Дүрэм: probe matcher-т шинэ pattern нэмбэл `client/public`-ийн бүх замыг `isScannerProbe`-оор дахин шалга** (тестийн REAL жагсаалтад нэм).

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
