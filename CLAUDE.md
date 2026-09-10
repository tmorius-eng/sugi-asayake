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
DATABASE_CA_CERT=
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
Одоогийн бүрэн тоо (2026-09-09, орой): **578/578 ✅ (63/63 файл)** — өмнөх 570 + deep audit #2-ийн `dbConnection.test.ts` 8, регресс 0 (CI горимд gate-үүд идэвхгүй тул ихэнх integration файл skip болно — хэвийн). ⚠️ Strict rate-limit tier-үүд одоо DB дээр тоолдог (`rate_limit_buckets`) тул тестэд **тогтмол IP** ашиглавал 15 минутын дотор дахин ажиллуулахад блоклогдоно — `callerFor`-ийн санамсаргүй/per-run IP загварыг дага.

✅ **CI-ийн `INTEGRATIONS_ENCRYPTION_KEY` цоорхой ШИЙДЭГДСЭН (2026-09-01)**: `server/integrations.integration.test.ts`-ийн "encryption (unit)" 2 тест gate-гүйгээр ажилладаг ба `server/_core/crypto.ts`-ийн `getKey()` нь 64-тэмдэгт hex түлхүүргүй бол шууд шатдаг тул бодит GitHub Actions дээр улаан гарч байв. Эдгээр нь **зөвхөн round-trip болон tamper-detection шалгадаг цэвэр unit тест** бөгөөд түлхүүрийн утга нь огт хамаагүй. Тиймээс `server/_test-setup.ts` орчинд түлхүүр байхгүй үед л **түр зуурын түлхүүр өгдөг** болгов (бодит `.env` утга байвал үргэлж түүнийг хүндэтгэнэ). **Аппликейшний код (`env.ts`/`crypto.ts`) огт хөндөгдөөгүй** — жинхэнэ сервер бодит түлхүүргүйгээр юу ч шифрлэхээс татгалзсан хэвээр, өөрөөр хэлбэл аюултай "insecure dev fallback" НЭМЭЭГҮЙ. Улмаар `ci.yml`-д repo secret огт хэрэггүй болж, шинэ clone дээр `pnpm test` тохиргоогүйгээр ногоон гарна.

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

## Сүүлийн үеийн гол ажлууд — товч жагсаалт (дэлгэрэнгүй нь [HISTORY.md](HISTORY.md))

2026-09-09-нд CLAUDE.md 208KB болж session бүрт ачаалагдах хэмжээнээсээ хэтэрсэн тул доорх session бүрийн тэмдэглэлүүдийг **бүрэн эхээр нь** HISTORY.md-ийн "CLAUDE.md-ээс зөөсөн session бүрийн тэмдэглэл" хэсэгт зөөв. Гарчиг бүр тэнд яг ижил нэртэй байгаа тул хайлтаар олно. Тодорхой bug/шийдвэрийн шалтгааныг мэдэх хэрэгтэй үед л тэнд хайна.

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

## Дараагийн ажлын санал (2026-09-09-ний байдлаар НЭЭЛТТЭЙ зүйлс л — хаагдсан бүх зүйл HISTORY.md-д)
0. **10k зэрэгцээ хэрэглэгч (Tom-ийн асуулт, 2026-09-09)** — одоогийн архитектур (нэг Node process, in-memory rate limiter, mysql2 pool 10, Бангалор RTT ~174ms, cache зөвхөн /shop каталогийн 10с TTL) статик HTML-ийг даана (5.4k req/s хэмжсэн) харин DB-д хүрэх бүх зүйл ~30–60 query/с-т тулна. Дараалал: (a) нүүр/каталог/site_media/site_text/brands/bestsellers read-үүдэд 30–60с in-memory cache (`catalogPageCache` загвар) — хамгийн том ялалт, backend өөрчлөлт бага; (b) Aiven-ийг Токио руу (Console → Change cloud) + `connectionLimit` 10→25–50 (Aiven plan-ий max_connections шалгах); (c) hosting дээр Node-ийг `cluster`/PM2-ээр CPU бүрт + Cloudflare CDN (HTML "no-cache" тул зөвхөн assets, /cdn/*); (d) хэрэв олон instance бол R3-ийн in-memory tier + `catalogPageCache`-ийг Redis руу; (e) global limiter 300/15мин/IP нь оффисын NAT-ад бага байж болзошгүй — hosting дээр бодит тоогоор тааруулах. Бодит 10k-ийн өмнө staging дээр k6-ээр нүүр хуудасны бүрэн flow-г ачааллах.
1. **Барааны бодит зураг — үлдсэн 415** (`docs/products-needing-photos.csv`): автомат эх сурвалжууд шавхагдсан (HISTORY.md, "Зургийн эх сурвалжийн бүрэн эрэл"), дэлгүүрт өөрөө зураг авах л үлдсэн.
2. **Tom-ийн бизнесийн алхам шаардах зүйлс** (код бэлэн, тохиргоо/гэрээ л дутуу): QPay merchant credential (R6/R7 засвартай), eBarimt ([EBARIMT.md](EBARIMT.md)-ийн 6 асуулт), StorePay/хүргэлтийн гэрээ, Honeybadger API key (`HONEYBADGER_API_KEY` + `VITE_HONEYBADGER_API_KEY`), Brevo SMS кредит/route (mass SMS campaign-ийн өмнө), hosting сонголт (дараа нь `PUBLIC_BASE_URL`, staging/CDN/uptime, R3-ийн in-memory tier-үүдийг шаардлагатай бол Redis).
3. ⚠️ **Амьд Aiven дээрх тестийн үлдэгдэл** (устгах зөвшөөрөл хэрэгтэй, admin-д харагдаж, bestseller/recent orders-д орж байна): бараа `Telemetry Test Product`, `Order Notify Test Product` (+category); хэрэглэгч `Telemetry Test Admin`, `Order Notify Admin`, `guest-checkout-test-…-merge`; 2026-09-09-ний suite-ийн `Analytics Test *` мөрүүд байвал мөн адил.
4. ⚠️ **`a { color: inherit }` cascade-layer bug** — зөвхөн 5 баталгаажсан тохиолдол `!`-ээр засагдсан; `index.css`-ийн reset дүрмийг `@layer base`-д шилжүүлж сайт даяар засах (screenshot баталгаажуулалттай).
5. **Product Variants** — олон variant-тай бодит бараагаар Playwright screenshot баталгаажуулалт хараахан хийгдээгүй (автомат тест + DB probe л).
6. **Admin face gate** — Tom 50 хүнээр false-reject rate хэмжих; `ADMIN_FACE_LIVENESS_ENFORCED`-ийг бодит тоон дээр шийдэх. Aiven байршил Бангалор (median 174ms) → Токио (Console → Change cloud).
7. **NEWVISION §14 / PREMIUM TIER 5 үлдэгдэл**: density toggle, үнийн faceted filter, "Pairs well with" cross-sell; referral, abandoned-cart имэйл.
8. **Купоны per-customer cap race**: нэг хэрэглэгч сүүлчийн зөвшөөрөгдсөн ашиглалтыг 2 зэрэгцээ checkout-оор давж болно (global `maxUses` атомик хэвээр) — хэрэгтэй бол (code, customer, n) unique key.
9. `--a-faint` (admin жижиг uppercase шошго) гэрэл горимд 2.74:1 — WCAG AA-д хүрэхгүй (codemod-оос өмнө ч ижил байсан, регресс биш).

Дэлгэрэнгүй бүх session-ий бүрэн түүх, шалтгаан, screenshot-ын баталгаажуулалт: **[HISTORY.md](HISTORY.md)**.
