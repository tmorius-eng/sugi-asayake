# SUGI ASAYAKE — Төслийн танилцуулга (Claude Code-д зориулав)

Энэ файлыг Claude Code сесс бүрийн эхэнд автоматаар уншина. **Файлыг бага байлгахын тулд дэлгэрэнгүй өдөр бүрийн ажлын лог [HISTORY.md](HISTORY.md)-рүү зөөгдсөн** (2026-08-26) — тодорхой bug/шийдвэрийн шалтгааныг мэдэх хэрэгтэй үед л тэнд хайна. Энд зөвхөн **одоогийн статус, тохиргоо, идэвхтэй асуудал** байна.

## Төслийн зорилго
**SUGI ASAYAKE** — Улаанбаатар дахь интерьер/skincare дэлгүүрийн онлайн худалдааны сайт (SUGI × ASAYAKE брэнд). Эзэмшигч: Tom (`t.morius@gmail.com`). Анхны эх код нь Manus AI платформоор бүтээгдсэн байсныг бүрэн салгасан (JWT email+password auth, S3-compatible storage, Manus runtime хассан) — дэлгэрэнгүй шалтгаан/алхам: [HISTORY.md](HISTORY.md).

## Локал орчны тохиргоо (чухал — эдгээрийг мэдэхгүй бол дахин цаг алдана)

```
DATABASE_URL=mysql://root:Zulaa123@127.0.0.1:3306/sugi_asayake
JWT_SECRET=local-test-secret-12345
OWNER_EMAIL=t.morius@gmail.com
S3_REGION=auto
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<R2 access key>
S3_SECRET_ACCESS_KEY=<R2 secret key>
S3_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev
PORT=3000
```
(R2 бодит утгууд: Tom-оос асуух эсвэл Cloudflare dashboard → R2 → Manage R2 API Tokens. Хоёр laptop **нэг ижил R2 bucket**-ыг хуваалцдаг тул S3_* утгууд хаана ч ижил байх ёстой.)

**`pnpm dev` стандарт байдлаар ажилладаг** (2026-08-20-с хойш засагдсан) — зүгээр:
```powershell
cd C:\Sugi-asayake
pnpm dev
```
Гар `$env:` тохиргоо зөвхөн `.env`-ийн утгыг түр override хийх шаардлагатай үед л хэрэгтэй.

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

**Ажиллаж байгаа нь баталгаажсан:** бүртгэл/нэвтрэлт (OTP 2-алхамт, эхний хэрэглэгч auto-admin), role-based хамгаалалт, admin панель (бүтээгдэхүүн/зураг/post/routine/coupon/promo/integrations/variants), каталог+server-side FULLTEXT хайлт (`catalog.search`), guest checkout, loyalty/routine хямдрал, reviews, wishlist, profile (address book, preferences, security), захиалгын имэйл мэдэгдэл (Brevo), Cloudflare R2 storage (хоёр laptop хуваалцдаг), **Product Variants PHASE 1+2 (variant сонголттой худалдан авалт, доор дэлгэрэнгүй)**, **Admin Analytics/CRM dashboard (Geckoboard маягийн харанхуй KPI самбар: sparkline/gauge/P&L card/ranked list-үүд, + борлуулалт/дүүрэг/харилцагчийн мэдээлэл/ашиг/маржин/сагс орхилт/нөөц/суваг/эх сурвалж/**хөрвүүлэлтийн хувь (Conversion Rate, бодит visitor session tracking)**/**CAC**/**буцаалтын хувь (Return Rate)** + Excel/PDF export, доор дэлгэрэнгүй — Playwright-ээр throwaway өгөгдлөөр screenshot баталгаажсан, бодит 937 барааны өгөгдлөөр хараахан үзээгүй)**. Дэлгэрэнгүй бүх TIER-ийн баталгаажуулалт: [HISTORY.md](HISTORY.md), [ROADMAP.md](ROADMAP.md), [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md), [ADMIN-PANEL.md](ADMIN-PANEL.md).

**Шалгагдаагүй/хараахан идэвхгүй:**
- QPay төлбөр (жинхэнэ merchant credential шаардана, localhost дээр бүрэн туршигдахгүй)
- **Brevo имэйл/SMS** — доорх "Идэвхтэй blocker" хэсэгт
- eBarimt, StorePay, шууд карт төлбөр, эльч (eBuuhia) хүргэлт — бүгд Tom-ийн биечлэн хийх бизнесийн алхам шаардана, код бэлэн биш (eBarimt зөвхөн inert schema бэлэн — [EBARIMT.md](EBARIMT.md))
- **Product Variants — PHASE 1 болон PHASE 2 хоёулаа дууссан (2026-08-26)** — худалдан авагч ProductDetail/QuickView дээр 2+ variant-тай бараанаас сонголт хийж, тухайн variant-ийн үнэ/нөөц/sku-гоор бодитоор захиалж болно. Ганц variant-тай (одоогийн 936/937) бараанд ямар ч харагдах өөрчлөлт алга. **Бодит Playwright screenshot баталгаажуулалт хараахан хийгдээгүй** (зөвхөн 149 автомат тест + `pnpm build` + throwaway DB probe script-ээр баталгаажсан) — дэлгэрэнгүй [HISTORY.md](HISTORY.md)-ийн "Product Variants PHASE 2" хэсэгт.
- Хэрэглэгчийн удирдлага (`/admin` → Хэрэглэгч хэсэг)

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

## ⚠️ Идэвхтэй blocker: гэрийн лаптопын DB хоосон
Энэ (гэрийн) лаптопын MySQL-д **0 бараа** байна — 937 барааны бодит өгөгдөл (болон бодит захиалга) хэзээ ч энд орж ирээгүй (MySQL машин бүрд тусдаа, зөвхөн R2 (зураг) хуваалцдаг). GitHub-т ч байхгүй (DB backup зориудаар `.gitignore`-д). **Шаардлагатай алхам**: ажлын лаптопоос `C:\Sugi-asayake\backups\`-ийн хамгийн сүүлийн `.zip`-ыг физикээр (USB/cloud) энэ лаптоп руу зөөгөөд `pwsh scripts/db-restore.ps1 -BackupFile <path> -Force` ажиллуулах. Үүнийг хийхээс өмнө: Admin Analytics dashboard, 937 барааны зураг ажил зэрэг бодит өгөгдөл шаардсан юуг ч бодитоор шалгах боломжгүй.

## Дараагийн ажлын санал
1. **DB backup сэргээх** (дээрх blocker) — үүнгүйгээр дараагийн зүйлсийг бодитоор шалгах боломжгүй
2. **Admin Analytics dashboard**-ыг (Geckoboard дизайн + Conversion Rate/CAC/Return Rate хамт, бүх Tier A-I) бодит 937 барааны/захиалгын өгөгдлөөр нүдэн дээр шалгах — код бэлэн, 161 автомат тест+Playwright throwaway QA-гаар баталгаажсан ч гэрийн лаптоп дээр бодит өгөгдөл байхгүй тул бодит дата дээр screenshot аваагүй
3. **Барааны бодит зураг — pilot-ийн үлдсэн хэсэг / цар хүрээ шийдэх** (24-ийн 6 нь дууссан, 18 нь placeholder дээрээ үлдсэн; 937-ийн үлдсэн 913-ыг мөн адил хийх эсэхийг Tom-той тодруулах — дэлгэрэнгүй [HISTORY.md](HISTORY.md)-ийн сүүлийн хэсэгт)
4. **Mass SMS/Email campaign** (email тал одоо бодитоор ажиллаж байгаа нь баталгаажсан — дээрх Brevo хэсгийг үзнэ үү; SMS-ийг эхлэхийн өмнө Tom-оос кредит/route баталгаажуулах хэрэгтэй)
5. Product Variants-ийн frontend-ийг бодит олон variant-тай бараагаар Playwright screenshot-оор нүдэн дээр баталгаажуулах (PHASE 1+2 код бэлэн, 149 автомат тест+DB probe-оор баталгаажсан ч бодит browser screenshot хараахан аваагүй)
6. eBarimt — Tom SmartSoftware POS нийлүүлэгчтэйгээ [EBARIMT.md](EBARIMT.md)-ийн 6 асуултыг тодруулах ёстой (код бичих ажил биш)
7. PREMIUM-FEATURES.md TIER 5 үлдсэн (referral, abandoned-cart имэйл), ROADMAP TIER 2 үлдсэн (refund урсгал), TIER 5 үлдсэн (Sentry, staging, CDN, uptime monitoring)
8. Tom-ий тодруулаагүй асуулт: "heseg hesegeer worldclass premium feeling uguhgui" — сайтыг бүхэлд нь дахин үзэж, unstyled/basic харагдах бусад хэсгүүд байгаа эсэхийг шалгах
9. ⚠️ CI дээр магадгүй улаан гарч буй `INTEGRATIONS_ENCRYPTION_KEY` тестийн цоорхой (дээр дурдсан) — шийдэхийн өмнө Tom-той зөвшилцөх

Дэлгэрэнгүй бүх session-ий бүрэн түүх, шалтгаан, screenshot-ын баталгаажуулалт: **[HISTORY.md](HISTORY.md)**.
