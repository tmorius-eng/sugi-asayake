# SUGI ASAYAKE — Төслийн танилцуулга (Claude Code-д зориулав)

Энэ файлыг Claude Code сесс бүрийн эхэнд автоматаар уншина. Доор бичсэн бүх зүйл өмнөх Claude (chat) сессээр хийгдсэн бодит ажил — таамаглал биш, бодитоор код бичиж, шалгаж, туршсан зүйлс.

## Төслийн зорилго

Энэ бол **SUGI ASAYAKE** — Улаанбаатар дахь интерьер/skincare дэлгүүрийн онлайн худалдааны сайт (SUGI × ASAYAKE брэнд). Эзэмшигч: Tom. Анхны эх код нь **Manus AI** платформоор бүтээгдсэн байсан бөгөөд:
- Auth нь Manus-ийн OAuth-д бүрэн хамааралтай байсан
- Storage (зураг) нь Manus-ийн "Forge" gateway-ээр S3 руу дамждаг байсан
- Build tooling нь `vite-plugin-manus-runtime` (Proprietary лицензтэй) дээр хамааралтай байсан
- **10 гаруй үндсэн файл (`_core` доторх) экспортод огт ороогүй байсан** — код нь type-check ч болдоггүй байсан

## Хийгдсэн бодит ажил (баталгаажсан: `pnpm check` ✅, `pnpm build` ✅, `pnpm test` 27/27 ✅)

### 1. Manus-ээс бүрэн салгасан
- `server/_core/oauth.ts` (Manus OAuth) → **устгасан**, оронд нь `server/routers.ts`-ийн `auth` router дотор `register`/`login`/`logout`/`me` procedure бичсэн (email+password, JWT session)
- `server/_core/env.ts`, `context.ts`, `trpc.ts`, `cookies.ts`, `notification.ts`, `systemRouter.ts`, `vite.ts`, `shared/_core/errors.ts` — бүгд шинээр бичигдсэн
- `server/storage.ts`, `server/_core/storageProxy.ts` → Manus Forge-ийн оронд **бодит AWS S3-compatible bucket**-тай ажилладаг болгосон (`@aws-sdk/client-s3` ашиглана)
- `vite.config.ts` → `vite-plugin-manus-runtime`, debug-collector, `allowedHosts` хязгаарлалт бүгдийг устгасан
- `drizzle/schema.ts` дэх `users` хүснэгтээс `openId`/`loginMethod` (Manus OAuth) хассан, `passwordHash` нэмсэн — migration: **`drizzle/0009_independent_auth.sql`**
- Password hashing: Node built-in `scrypt` ашигладаг (`server/_core/password.ts`), гадны dependency нэмээгүй

### 2. Localhost дээр бодит туршилтын орчин зохион байгуулсан
- **MySQL 8** (native Windows суулгалт, Docker биш — Docker Desktop суулгах гэж оролдоход Windows boot эвдэрч, `bcdboot`-оор засварласан удаа бий, тиймээс энэ төсөлд Docker-оос зайлсхийсэн)
- **MinIO AIStor** (одоогийн үнэгүй хувилбар нь license key шаарддаг, `MINIO_LICENSE` env var-аар дамждаг)

### 3. Бодит ашиглалтаас олдсон, засагдсан bug-ууд
- **`client/src/pages/ProductDetail.tsx`** — React "Rules of Hooks" зөрчил байсан (`useMemo` нь эрт `return`-ийн ДАРАА бичигдсэн байсан тул "Rendered more hooks than during the previous render" crash өгдөг байсан). **Засагдсан** — hook-ыг бүх эрт буцалтын өмнө шилжүүлсэн.
- **Пост/мэдээ функц бүрэн дутуу байсан** — admin панель дотор пост үүсгэж "Нийтлэх" боломжтой байсан ч, олон нийтэд харуулах хуудас/route огт байхгүй байсан. **Шинээр бүтээсэн:**
  - `server/db.ts` → `getPublishedPostBySlug()` функц нэмсэн
  - `server/routers.ts` → `content.bySlug` public procedure нэмсэн
  - `client/src/pages/PostDetail.tsx` → шинэ хуудас (бүрэн бичигдсэн, CommerceHeader загвартай нийцтэй)
  - `client/src/App.tsx` → `/:slug` catch-all route нэмсэн (бусад бүх тодорхой route-уудын ард, `NotFound`-ийн өмнө)

## Локал орчны тохиргоо (чухал — эдгээрийг мэдэхгүй бол дахин цаг алдана)

```
DATABASE_URL=mysql://root:Zulaa123@127.0.0.1:3306/sugi_asayake
JWT_SECRET=local-test-secret-12345
OWNER_EMAIL=t.morius@gmail.com
S3_BUCKET=sugi-asayake
S3_REGION=us-east-1
S3_ENDPOINT=http://127.0.0.1:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_PUBLIC_BASE_URL=http://127.0.0.1:9000/sugi-asayake
PORT=3000
```

**`.env` файлыг Node/mysql2 driver зарим үед зөв уншихгүй байх тохиолдол гарсан** (яагаад нь тодорхойгүй үлдсэн) — тиймээс бид эдгээрийг PowerShell-д `$env:` байдлаар гараар зарлаж сервер асаадаг байсан:
```powershell
cd C:\Sugi-asayake
$env:NODE_ENV="development"
$env:PORT="3000"
$env:DATABASE_URL="mysql://root:Zulaa123@127.0.0.1:3306/sugi_asayake"
$env:JWT_SECRET="local-test-secret-12345"
$env:OWNER_EMAIL="owner@example.com"
$env:S3_BUCKET="sugi-asayake"
$env:S3_REGION="us-east-1"
$env:S3_ENDPOINT="http://127.0.0.1:9000"
$env:S3_ACCESS_KEY_ID="minioadmin"
$env:S3_SECRET_ACCESS_KEY="minioadmin"
$env:S3_PUBLIC_BASE_URL="http://127.0.0.1:9000/sugi-asayake"
pnpm exec tsx watch server/_core/index.ts
```
Claude Code-д зориулж: боломжтой бол `.env` яагаад уншигдахгүй байсныг олж, `pnpm dev` (package.json-ий стандарт script) шууд ажилладаг болгож засаарай — `pnpm dev`-ийн `NODE_ENV=development` prefix нь Windows PowerShell дээр (`cross-env` байхгүй тул) шууд ажилладаггүй асуудал бас байсан.

### MySQL-тэй холбоотой чухал зүйл
Windows дээрх MySQL 8 root хэрэглэгч анхандаа `caching_sha2_password`-оор тохиргоологдсон нь Node.js-ийн `mysql2` драйвертай зөрчилддөг байсан (гэхдээ `mysql.exe` CLI-аар ажилладаг байсан тул андуурсан). Засвар:
```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'Zulaa123';
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY 'Zulaa123';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

### Migration-уудыг ажиллуулах тухай
`drizzle/meta` (drizzle-kit-ийн journal/snapshot) экспортод ороогүй байсан тул `pnpm db:push`-д бүрэн найдаж болохгүй. Migration `.sql` файлуудыг гараар ажиллуулахдаа **`--> statement-breakpoint`** мөрийг заавал устгах шаардлагатай (MySQL 8 үүнийг ойлгодоггүй, MariaDB-д асуудалгүй байсан ч MySQL 8-д алдаа өгдөг):
```powershell
(Get-Content <file>.sql -Raw) -replace '--> statement-breakpoint', '' | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p sugi_asayake
```

## Одоогийн статус — юу шалгагдсан, юу шалгагдаагүй

**Ажиллаж байгаа нь баталгаажсан:**
- Бүртгэл/нэвтрэлт (эхний хэрэглэгч автоматаар admin болдог)
- Role-based хамгаалалт (`/admin` зөвхөн admin-д)
- Admin панель: бүтээгдэхүүн үүсгэх/засах, зураг upload (S3_REGION=us-east-1 тохиргоотой — MinIO-ийн анхны region нь "Mongolia" байсан нь алдаа өгдөг байсныг 2026-08-20 бүр мөсөн `us-east-1` (MinIO/AWS S3-ийн стандарт анхны утга) болгож MinIO серверийг дахин асаасан, `.env` мөн шинэчилсэн — доорх бүх жишээ, тэмдэглэл харгалзан "Mongolia" гэсэн хуучин утгыг ашиглахгүй, зөвхөн `us-east-1`)
- Пост үүсгэх, нийтлэх, олон нийтэд харуулах (`/:slug`)
- Каталог/дэлгүүрийн жагсаалт, бүтээгдэхүүний дэлгэрэнгүй хуудас
- **Нууц үг сэргээх, имэйл баталгаажуулах, login/register rate limiting (TIER 0, 2026-08-20 дуусгасан)** — дэлгэрэнгүй, туршилтын бүх алхам: [ROADMAP.md](ROADMAP.md)-ийн TIER 0 хэсэг
- **Бүртгэл/нууц үг сэргээлт нь холбоос (link) биш 6 оронтой код (OTP)-оор ажилладаг (2026-08-20-с хойш)** — `auth.register` шууд нэвтрүүлдэггүй, зөвхөн `auth.confirmRegistration`-д кодоо баталгаажуулсны дараа л session олгодог; `auth.login` одоо `emailVerifiedAt` шаарддаг (энэ өөрчлөлтөөс өмнөх бүх хэрэглэгч `drizzle/0016_backfill_email_verified.sql`-аар автоматаар "grandfathered" verified болсон тул түгжигдээгүй). Код 15 минут хүчинтэй, буруу 5 оролдлогын дараа шатдаг (`MAX_CODE_ATTEMPTS`, `server/db.ts`). `/reset-password/:token`, `/verify-email/:token` route-ууд устсан — бүгд `/login` (бүртгэлийн 2-р алхам), `/forgot-password`, `/verify-email` (нэвтэрсэн ч баталгаажаагүй хэрэглэгчид) дотор код оруулах маягтаар ажилладаг. Бодит HTTP-ээр (Brevo-г түр унтраагаад log fallback-аар код унших замаар) бүрэн урсгал шалгасан: register→login (татгалзсан, FORBIDDEN)→буруу код (татгалзсан)→зөв код (амжилттай, session олгосон)→forgot-password→5 буруу код (шатсан)→зөв код ч татгалзсан→шинэ код хүсэлт→амжилттай сэргээлт→шинэ нууц үгээр нэвтэрсэн, хуучин нууц үгээр татгалзсан; мөн баталгаажуулаагүй имэйлээр дахин бүртгүүлэхэд (resend/retry) хуучин код автоматаар хүчингүй болдгийг баталгаажуулсан.

**Шалгагдаагүй, анхаарах ёстой:**
- Checkout/захиалгын бүтэн урсгал (сагс → захиалга үүсгэх)
- QPay төлбөр (жинхэнэ merchant credential шаардана, localhost дээр бүрэн туршигдахгүй)
- Staff invitation имэйл (email провайдер **Resend-ээс Brevo руу шилжсэн, 2026-08-20** — `server/_core/notification.ts`, `BREVO_API_KEY`/`BREVO_SENDER_EMAIL`; `BREVO_API_KEY` тохируулаагүй бол зөвхөн server log-д бичигддэг, өмнөх Resend fallback-тай ижил зарчим)
- SMS мэдэгдэл (Brevo Transactional SMS, `server/_core/notification.ts`-ийн `sendAccountSms` + `normalizePhoneForSms` — зөвхөн +976 Монгол дугаарт зориулагдсан) шинээр нэмэгдсэн ч **одоогоор ямар ч урсгалд холбогдоогүй** (зөвхөн provider-ийн API-тэй холбогдсон бэлэн функц). Brevo-ийн SMS нь имэйлээс ялгаатай — free tier-д ороогүй, зээлийн үлдэгдэл худалдаж авах шаардлагатай, Монгол улс руу route/үнийн дэмжлэгийг Brevo dashboard дотроос (Transactional SMS → Country pricing) заавал шалгах
- Хэрэглэгчийн удирдлага (`/admin` → Хэрэглэгч хэсэг)

## Мэдэгдэж буй бусад зүйлс (өмнөх бүрэн аудитаас, засаагүй үлдсэн)
- QPay callback route (`/api/payments/qpay/callback`) rate limiting-д хамрагдахгүй
- Security headers дотор Content-Security-Policy байхгүй
- `ComponentShowcase.tsx` (1437 мөр), ашиглагдаагүй `AIChatBox`/`ManusDialog` — routing хийгдээгүй хэдий ч repo дотор үлдсэн dead code

## ⚠️ Чухал bug олж заслаа: MySQL timestamp 8 цагаар зөрдөг байсан (2026-08-20, TIER4)
Локал MySQL серверийн session `time_zone = SYSTEM` (энэ машины Windows local timezone, Asia/Ulaanbaatar = **UTC+8**) байсан бол `drizzle-orm`-ийн mysql `timestamp` багана нь DB-ээс ирсэн raw утгыг **үргэлж UTC гэж таамаглаж** уншдаг (`+0000` нэмдэг). Үүний үр дүнд `NOW()`/`defaultNow()`-ээр автоматаар үүсдэг **бараг бүх хүснэгтийн `createdAt`/`updatedAt`** (users, orders, products, audit log гэх мэт бүгд) нь app-ын `new Date()`/`Date.now()`-тэй шууд харьцуулахад **бодит утгаасаа 8 цагаар түрүүлж** харагддаг байсан. Энэ нь TIER4-ийн Audit Log-ийн огнооны шүүлтүүр (`dateFrom`/`dateTo`) бичих явцад бодит DB дээрх тестээр илэрсэн. **Засаж, root cause-д нь шийдсэн:** `server/db.ts`-ийн `getDb()`-д MySQL connection pool-ийн `'connection'` event дээр `SET time_zone = '+00:00'` ажиллуулдаг болгосон — DB холболт бүр одооноос UTC session-той. `pnpm exec tsx` жижиг probe script-ээр (устгасан) заслын өмнө/дараа шалгаж баталгаажуулсан.

**Яагаад өмнөх бүх тест үүнийг олж чадаагүй бэ:** Token/session expiry шалгалт бүгд **app-аас бичигдэж, app-аас уншигддаг** утгыг (`expiresAt: new Date(Date.now()+X)`) ашигладаг байсан тул бичих/унших хоёр тал ижил (буруу ч гэсэн тогтмол) хазайлтаар давхар "цуцлагддаг" — зөвхөн **DB талаас автоматаар үүссэн** (`defaultNow()`) утгыг app-ын шинэ `Date`-тэй шууд харьцуулах үед л алдаа гарч ирдэг байсан (яг TIER4-ийн шинэ filter feature шиг). Хэрэв ирээдүйд ижил төрлийн (DB `defaultNow()` vs app `Date`) харьцуулалт хийх код бичвэл энэ засвар аль хэдийн орсон эсэхийг (`server/db.ts`-ийн `getDb()`) шалгаарай — production-д өөр MySQL хост ашиглах үед session timezone дахин өөр байж магадгүй тул энэ connection-level fix нь хостоос үл хамааран найдвартай ажиллана.

## Дараагийн ажлын санал
TIER 0, TIER 1, TIER 5-ын CI+backup (локал бэлтгэл) дууссан. **Guest checkout (UX-RESEARCH.md тэргүүлэх №1) мөн дууссан (2026-08-20)** — `cart.*`/`checkout.createOrder` одоо `publicProcedure`, `guest_cart_token` cookie-оор зочны сагс, нэвтрэхэд автомат нэгтгэгддэг. Дэлгэрэнгүй [UX-RESEARCH.md](UX-RESEARCH.md), [ROADMAP.md](ROADMAP.md).

**ADMIN-PANEL.md-ийн TIER 1–6 бүгд дууссан (2026-08-20)** — Dashboard+Global Search, хэрэглэгч suspend/force-logout, `staff` RBAC role, Audit Log+Login History (Security Center), Bulk Actions+CSV Export, DB/S3 health widget. Дэлгэрэнгүй, туршилтын бүх алхам тус бүрийн TIER-д: [ADMIN-PANEL.md](ADMIN-PANEL.md). Энэ явцад чухал timezone bug олж заслаа — дэлгэрэнгүй дээрх хэсэгт.

**Хэрэглэгчийн профайл хуудас (`/profile`) мөн дууссан (2026-08-21)** — avatar/нэр/утас засах, олон хаяг хадгалах address book, checkout-д автомат бөглөлт. Мөн энэ өдөр secondary pages (Login/ForgotPassword/VerifyEmail/AcceptInvitation/Legal/MyOrders/NotFound) болон admin sidebar-ийн бренд/дизайн шинэчлэл хийгдсэн. Дэлгэрэнгүй: [CLAUDE.md](CLAUDE.md)-ийн "2026-08-21" хэсэг, [ROADMAP.md](ROADMAP.md)-ийн TIER 2.

**Захиалгын баталгаажуулах/статус имэйл мэдэгдэл нэмэгдсэн (2026-08-25)** — `checkout.createOrder`, `admin.updateOrder`, `admin.bulkUpdateOrderStatus` бүгд Brevo-гоор захиалагчид имэйл илгээдэг (best-effort, алдаа гарвал үндсэн үйлдлийг зогсоохгүй). Мөн **PREMIUM-FEATURES.md-ийн TIER 1 (Personalization суурь) дууссан (2026-08-25)** — `products` дээр `skinType`/`skinConcerns`/`interiorStyle` tag, admin панелийн tag сонгох UI, `catalog.recommended` endpoint, Shop хуудсанд "Танд санал болгох" section + skin-type filter pill. Бүгд `pnpm check`/`pnpm test` (83/83)/`pnpm build` болон бодит HTTP-ээр баталгаажсан — дэлгэрэнгүй [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md)-ийн TIER 1 хэсэгт.

**PREMIUM-FEATURES.md-ийн TIER 2 (Reviews & Ratings) дууслаа (2026-08-25)** — `product_reviews` хүснэгт, verified-purchase gate (зөвхөн бодитоор захиалсан хэрэглэгч сэтгэгдэл бичнэ, нэг хэрэглэгч нэг бараанд нэг л удаа), бүтээгдэхүүний хуудсан дахь одон+сэтгэгдлийн жагсаалт+бичих маягт, Shop grid-ийн жижиг rating badge, admin "Сэтгэгдэл" moderation панель (нуух/сэргээх/устгах). Явцад MySQL-ийн `AVG()` string буцаадаг bug олж зассан. `pnpm test` 90/90, дэлгэрэнгүй [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md)-ийн TIER 2 хэсэгт.

**PREMIUM-FEATURES.md-ийн TIER 3 (Ingredient Transparency + Store Locator) дууслаа (2026-08-25)** — 17 нэр томьёотой найрлагын tooltip glossary (`GlossaryText.tsx`, hover+tap хоёуланд ажиллана, бодит бүтээгдэхүүний тайлбарт шууд идэвхждэг), 3 салбарын Store Locator-т ажиллах цаг (Өдөр бүр 11:00–20:00) + утасны дугаар нэмсэн. Үйлдвэрлэгчийн мэдэгдэл badge-ийг зориудаар хийгээгүй (бодит эх сурвалж байхгүй тул). `pnpm test` 90/90, дэлгэрэнгүй [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md)-ийн TIER 3 хэсэгт.

**⚠️ Bug олж заслаа: 937 бараатай болсны дараа /shop болон admin бүтээгдэхүүний жагсаалт хуудаслалтгүй, төгсгөлгүй scroll болсон (2026-08-25)** — PRODUCT-IMPORT.md-ийн 937 барааны bulk import хийгдэхээс өмнө каталог жижиг (20-иод бараа) байсан тул хуудаслалт хэрэггүй байсан ч, бодит хэмжээнд хүрэхэд Tom бодитоор ашиглаж байхдаа олж мэдсэн. **Заслаа:** `Shop.tsx` (24ш/хуудас, шүүлтүүр өөрчлөгдөхөд 1-р хуудас руу автоматаар буцна) болон `AdminWorkspace.tsx`-ийн бүтээгдэхүүний жагсаалт (25ш/хуудас) хоёуланд нь дугаартай хуудаслалт (Өмнөх/Дараах товч + "X / Y хуудас") нэмсэн — жинхэнэ "load more"/infinite scroll биш, тогтвортой, тоолж болохуйц жагсаалт. Admin-ийн "бүгдийг сонгох" bulk-action чекбокс хэвээрээ **бүх шүүлтүүрт тохирсон бараа** дээр ажиллана (зөвхөн харагдаж буй хуудсан дээр биш) — энэ нь зориудаар хэвээр үлдсэн зөв зохион байгуулалт. `pnpm check`/`pnpm build` цэвэр, `pnpm test` 90/90 (энэ засвар server код хөндөөгүй тул тест нэмээгүй), бодит HTTP-ээр 937 барааг 24/25-аар зөв хуваасныг тооцоолж баталгаажуулсан.

**PREMIUM-FEATURES.md-ийн TIER 4 (Routine Builder & Bundles) дууслаа (2026-08-25)** — admin "Routine" удирдлага (алхам дараалалтай бүтээгдэхүүний багц), `/routine/:slug` дэлгэрэнгүй хуудас + "Бүгдийг сагслах", ProductDetail дээрх cross-sell блок. Хямдрал зөвхөн үзүүлэх тоо биш — `orders.discountMnt`/`appliedRoutineId` нэмж, сагсны бодит агуулгаас (routine-ийн бүх алхам байгаа эсэх) захиалга баталгаажуулах мөчид бодитоор тооцоолж суутгадаг болгосон. `pnpm test` 93/93, дэлгэрэнгүй [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md)-ийн TIER 4 хэсэгт.

**PREMIUM-FEATURES.md-ийн TIER 5 (Loyalty & Retention) — Гишүүнчлэлийн карт дууслаа (2026-08-25)** — Tom-ийн бодит Smart POS-д ажилладаг нийт худалдан авалтын дүнгээр шатлан нэмэгддэг хямдрал (500k→3%, 1сая→5%, 10сая→10%, `shared/loyalty.ts`) яг тэр дүрмээр веб дээр хийсэн. **Гол шийдвэр:** Smart POS-той API холбоо байхгүй тул зөвхөн онлайн захиалгын түүхээр ажилладаг native систем + admin гараар "дэлгүүрт биечлэн худалдан авсан урьдчилсан дүн" нэмэх боломж (`AdminUserDetailDrawer.tsx`) — физик/онлайн системийн зөрүүг гүүрлэнэ. Хямдрал Routine хямдралтай адил бодитоор checkout дээр enforced (зөвхөн үзүүлэх тоо биш), Routine хямдралтай дараалан stack хийгддэг. `/profile`-д "Тусламж"-ийн дараа шинэ "Гишүүнчлэлийн карт" таб. `pnpm test` 99/99, дэлгэрэнгүй [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md)-ийн TIER 5 хэсэгт.

**⚠️ Bug олж заслаа: /shop-ийн доод хэсэгт "хоосон" orange блок + сагсанд 3+ бараа байхад захиалгын товч харагдахгүй болдог байсан (2026-08-25)** — Tom бодитоор ашиглаж байхдаа олсон 2 тусдаа bug, screenshot-оор баталгаажуулж заслаа:
1. **`RecentlyViewed` хэсэг хоосон үедээ ч харагддаг байсан** — шинэ зочин (browsing түүхгүй) `/shop`-ийн хамгийн доод хэсэгт очиход контентгүй, зөвхөн `#f0b52d` улбар шар дэвсгэртэй хоосон блок харагддаг байсан нь "world-class premium" бус, "basic HTML" мэт харагдаж байсан шалтгаан. **Заслаа:** `Shop.tsx`-д `effectiveRecentIds.length > 0` нөхцөл нэмж, харсан бараа байхгүй үед энэ хэсгийг **бүхэлд нь нуудаг** болгосон (placeholder харуулахгүй) — ирээдүйд ижил төрлийн "хоосон үед юу ч харуулахгүй" зарчмыг бусад хэсэгт (жишээ нь wishlist, recommended) хэрэгжүүлэхдээ энэ жишээг баримтлаарай.
2. **`CartDrawer`-ийн (сагсны drawer) дотоод жагсаалт `overflow-y-auto`/`min-h-0` тохиргоогүй байсан** — сагсанд хангалттай олон бараа (3-аас дээш, дэлгэцийн өндрөөс шалтгаална) байхад flexbox-ийн `min-height: auto` анхдагч зан төлөвөөс болж жагсаалтын `<div>` бүх контентоо багтаах хэмжээгээр өсдөг байсан тул доод талын "Захиалга үргэлжлүүлэх" улаан товч (`SheetFooter`) дэлгэцээс **бүрмөсөн гарч** харагдахгүй болдог, мөн scroll ч ажилладаггүй байсан — өөрөөр хэлбэл 3-аас дээш бараатай сагстай хэрэглэгч **захиалга хийх боломжгүй** байсан (Tom-ий тодорхой илэрхийлсэн bug). **Заслаа:** `CartDrawer.tsx`-ийн жагсаалтын `<div className="flex-1 px-6 py-6">`-д `min-h-0 overflow-y-auto` нэмсэн (стандарт "sticky footer, scrollable middle" flexbox засвар) — одоо толгой хэсэг ("YOUR CART") болон доод "Захиалга үргэлжлүүлэх" товч хоёулаа тогтмол байрандаа үлдэж, зөвхөн барааны жагсаалт дотроо scroll хийдэг болсон. Playwright+бодит Chrome-оор 6 барааны сагс үүсгэж (`cart.addItem` API-аар), drawer нээгээд, доторх жагсаалтыг scroll хийж (`scrollHeight` 1221px vs `clientHeight` 368px — жагсаалт бодитоор overflow хийж байгааг тоогоор баталгаажуулсан) сүүлийн 2 бараа гарч ирэхийг, харин толгой/товч хөдлөхгүй байгааг screenshot-оор баталгаажуулсан. `pnpm check`/`pnpm build` цэвэр, `pnpm test` 99/99 (CSS/JSX-only засвар тул шинэ тест нэмээгүй, зөвхөн бодит browser screenshot-оор баталгаажуулсан). Тестийн явцад үүссэн throwaway зочны сагс (`carts` id 190/191)-ыг DB-ээс устгаж цэвэрлэсэн.

**Маркетингийн попап/banner систем нэмэгдлээ (2026-08-25)** — Tom-ий шууд хүсэлтээр ("ad popup ch ymuu new product popup geh metchlin promotion popup geh met"). Admin "Урамшуулал" таб дотроос гарчиг/мессеж/зураг/товч+холбоос/эхлэх-дуусах огноог бүрэн гараар удирддаг, хуурамч яаралтай мэдэгдэл (fake urgency) огт ашигладаггүй попап/banner. Явцад Home хуудасны fixed header banner-ийн доор "нуугдаж" харагддаг байсан bug олж, `position: sticky` + CSS хувьсагч (`--promo-banner-offset`) ашиглан засав. `pnpm test` 106/106, дэлгэрэнгүй [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md)-ийн TIER 5 хэсэгт.

Дараагийн санал: PREMIUM-FEATURES.md-ийн TIER 5-ын үлдсэн зүйлс (referral, abandoned-cart имэйл), UX-RESEARCH.md-ийн №2 (хүргэлтийн үнэ эрт харуулах), ROADMAP-ийн TIER 2-ын үлдсэн зүйлс (зурган боловсруулалт, сервер талын хайлт, refund урсгал), эсвэл TIER 5-ын үлдсэн зүйлс (Sentry, staging, CDN, uptime monitoring). Мөн Tom-ий илэрхийлсэн ерөнхий санал зөрөлдөөн: "heseg hesegeer worldclass premium feeling uguhgui" — сайтыг бүхэлд нь дахин үзэж, ижил төрлийн (basic/unstyled харагдах) бусад хэсгүүдийг олж засах эсэхийг Tom-той тодруулах хэрэгтэй.

**Өрсөлдөгчийн шинжилгээ (asahi.mn) + цоорхой засалт (2026-08-25)** — Tom-ий хүсэлтээр Монголын өрсөлдөгч [asahi.mn](https://asahi.mn/)-г Playwright+бодит Chrome-оор screenshot авч дүн шинжилгээ хийсэн (WebFetch-ийн markdown хувилбар CSS/JS-ээр удирдагддаг элементүүдийг (badge, popup) орхигдуулдаг тул screenshot илүү үнэн зөв). Тэндээс олдсон: (1) яг бидний өмнөх сессид хийсэн `SitePromo` (попап/banner) системтэй адилхан зарчимтай "Admin's Special Birthday Month" promotional popup — санаа зөв чиглэлтэй байгааг баталгаажуулсан, (2) "-X%" улаан badge + хуучин үнэ (strikethrough) бүтээгдэхүүний картан дээр. Үүнээс сэдэвлэн:
- **`compareAtPriceMnt` баганыг storefront дээр анх удаа бодитоор харуулав** — энэ багана нь schema/admin/db.ts-д аль хэдийн бүрэн бэлэн байсан ч (өмнөх session-үүдэд нэмэгдсэн) `getPublishedCatalog()` query-д сонгогдоогүй, `Shop.tsx`/`ProductDetail.tsx`/`QuickViewDialog.tsx` алинд нь ч рендэр хийгдээгүй байсан жинхэнэ bug байсныг олж, гурван газарт нь (strikethrough үнэ + улаан "-X%" badge) нэгэн зэрэг холбов. `shared/catalog-filter.ts`-д `getSalePercent()` нэмэв.
- **ProductDetail-д "Зөвхөн N ширхэг үлдсэн" анхааруулга нэмэв** (`LOW_STOCK_THRESHOLD=5`) — Shop.tsx-ийн grid карт дээр бодит нөөцийн тоо аль хэдийн харагддаг байсан ч дэлгэрэнгүй хуудсан дээр байхгүй байсан тул нэмсэн.
- **`client/index.html`-ийн canonical URL хуучин Manus preview домэйн (`sugi-mongo-detasex2.manus.space`) рүү заасан хэвээр байсан bug засав** — жинхэнэ домэйнтэй болмогц солих TODO тэмдэглэсэн.
- **Шинэ: Захиалгын хямдралын код (coupon code) систем** — дэлгэрэнгүй PREMIUM-FEATURES.md-ийн TIER 5 хэсэгт.

`pnpm test` 114/114, дэлгэрэнгүй [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md)-ийн TIER 5 хэсэгт.

**⚠️ Том bug олж заслаа: header logo болон 900 гаруй барааны placeholder зураг бүгд "broken image" харагдаж байсан (2026-08-25, Tom бодитоор ашиглаж байхдаа зурагтай screenshot-оор илрүүлсэн)** — Tom `/shop`-ийн header дээрх лого харагдахгүй байгааг зурагтай илгээсний дараа гүнзгий шалгав. **Root cause:** энэ компьютер дээрх MinIO (`C:\minio\data`) шинэ, хоосон орчноор эхэлсэн (LAPTOP-MIGRATION.md-д урьдчилан анхааруулсанчлан) — хуучин компьютерийн бодит зурган файлууд хэзээ ч зөөгдөөгүй. Бодитоор bucket-ийг S3 API-аар шалгахад ердөө **2 файл** л байсан (`sugi-logo-transparent-clean_fee66cad.png`, `sugi-symbol_0a534a76.png`), гэтэл код дотор **7 өөр** файлын нэрийг (`_b392050b` лого хувилбар, `sugi-professional-*`, `sugi-sunrise-editorial-hero-*`, `sugi-care-retail-*`) хатуу бичсэн байсан бөгөөд эдгээр нь бүгд 404 өгдөг байв (`curl`-аар нэг бүрчлэн шалгаж баталгаажуулсан). Мөн бүх файлын хайлт (`Get-ChildItem -Recurse`) хийж эдгээр файлууд компьютер дээр огт байхгүйг (backup zip-үүд ч зөвхөн MySQL dump, MinIO зураггүй) баталгаажуулсан — өөрөөр хэлбэл эдгээр яг тэр файлууд сэргээх боломжгүй, зөвхөн шинэ зурагтай солих л шийдэл. **Заслаа:**
1. `CommerceHeader.tsx`/`AdminPreview.tsx`-ийн лого зам хуучин (байхгүй) `_b392050b`-ээс Home.tsx-ийн ажиллаж байгаа `_fee66cad` рүү сольсон — одоо `/shop` болон бусад бүх хуудсан дээр лого зөв харагдана.
2. **937 барааны 925-ийг нь хамарсан** `fallbackImage` (бараа өөрийн зурагтай биш үед ашигладаг) 404 өгч байсан тул шинэ, **local bundled SVG placeholder** (`client/public/product-placeholder.svg` — брэндийн улаан өнгийн лонхны icon, ямар ч storage/орчны нөхцөлөөс үл хамааран найдвартай ажиллана) үүсгэж, 9 файлд (Shop/ProductDetail/QuickView/HeaderSearch/CartDrawer/Checkout/Profile/RoutineDetail/SeasonalCampaignCarousel) солив.
3. Home.tsx-ийн жинхэнэ амьдралын зураг (hero/family/store) 4 slot (`home-hero`, `home-categories`, `home-family`, `home-stores`, `summer-slide-1/3`) одоо байхгүй тул тэдгээрийн код-level fallback-ыг `null` болгож, `.hero-image`/`.care-image`/`.location-image`/`.seasonal-image` CSS-д зөөлөн градиент (broken биш, дизайнтай харагдах) нөхцөлт нэмсэн. **Эдгээр slot-ууд бол admin `/admin` → "Content & Media" хэсгээс шууд бодит зураг upload хийхэд л шууд засагдана** (систем аль хэдийн бэлэн, зөвхөн зураг дутуу байгаа).

Playwright-ээр `/shop` (лого), Home hero (градиент), Shop grid (placeholder icon бүх картан дээр) screenshot-оор баталгаажуулсан. `pnpm test` 114/114, `pnpm check`/`pnpm build` цэвэр.

**⚠️ Цоорхой олж заслаа: хайлтын цонх зөвхөн `/shop`-д байсан, бусад бүх хуудаснаас хайх боломжгүй байсан (2026-08-25)** — `HeaderSearch.tsx` шинээр бүтээж CommerceHeader (Shop/ProductDetail/Checkout/Profile) болон Home-ийн `.site-header`-т хоёуланд нь mount хийв. Бичихэд шууд 6 хүртэлх тохирох бүтээгдэхүүнийг зураг+үнэтэйгээр нь dropdown-оор харуулна (шинэ server endpoint шаардлагагүй, client талд аль хэдийн ачаалагдсан `catalog.list` дата дээр ажиллана), "Бүгдийг харах" дарахад `/shop?q=...`-руу зөв шилжиж Shop.tsx автоматаар тэр хайлтаар шүүгдсэн байдлаар нээгддэг. Playwright-оор бодит HTTP/browser дээр баталгаажуулсан. Дэлгэрэнгүй [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md)-ийн TIER 6 хэсэгт.

**Бодит POS каталог (937 бараа) бүрэн импортлогдлоо (2026-08-25)** — Tom-ийн 3 салбарын Smart POS системээс гаргасан бодит бараа материалын жагсаалт (баркод/нэр/үнэ) бүрэн сайт дээр орлоо: 6 бодит ангилал үүсгэсэн, баркод бүрийг `sku`-д хадгалсан, Монгол тайлбар бичсэн (эхний 20-ийг websearch-ээр дангаар судалж, үлдсэн 917-ыг дүрэмд суурилсан generator-оор). Барааны зураг (одоогоор ердөө 12/937), бодит нөөцийн тоо (бүгд placeholder) дараагийн ажил хэвээр байна — дэлгэрэнгүй [PRODUCT-IMPORT.md](PRODUCT-IMPORT.md).

**SECURITY.md, UX-RESEARCH.md** нэмэгдсэн (CLAUDE.md/ROADMAP.md-ийн хамтрагч баримт) — аюулгүй байдал болон UX/зах зээлийн судалгааны checklist тус тус.

**LAPTOP-MIGRATION.md нэмэгдсэн (2026-08-20)** — Tom ажлын компьютерээс гэрийн компьютер руу шилжихэд зориулсан бүрэн заавар (код/DB/MinIO зураг/`.env`-ийг зөөх 4 тусдаа алхам + гэрийн компьютерийн шинэ тохиргооны checklist). Бодит DB backup (`scripts/db-backup.ps1`) ажиллуулж `backups/`-т бэлэн болгосон.

**Төсөл одоо GitHub private repo дээр байна** (`tmorius-eng/sugi-asayake`, `main` branch) — commit бүрийг гараар (эсвэл хэрэглэгчийн зөвшөөрсний дараа) push хийж байна, CI (`.github/workflows/ci.yml`) push/PR бүр дээр type-check+test+build ажилладаг.

**`pnpm dev` одоо стандарт байдлаар ажилладаг (2026-08-20-с хойш).** Өмнө нь `package.json`/`pnpm-lock.yaml` файлууд Windows-ийн "High Mandatory Level" integrity label-тай байсан тул Claude Code засаж чадахгүй байсан бол, хэрэглэгч elevated PowerShell-ээс `icacls ... /setintegritylevel Medium` ажиллуулж зассан. Одооноос localhost дээр туршихдаа зүгээр л:
```powershell
cd C:\Sugi-asayake
pnpm dev
```
хангалттай — доорх гар `$env:` block нь зөвхөн `.env`-ийн утгыг (жишээ нь S3_REGION) түр override хийх шаардлагатай үед л хэрэгтэй.

**Мэдэгдэж буй blocker:** `C:\Sugi-asayake\package.json` болон `pnpm-lock.yaml` нь Windows "High Mandatory Level" integrity label-тай тул non-elevated Claude Code процесс тэдгээрийг засаж/хадгалж чадахгүй (`pnpm add` ч lockfile дээр EPERM өгнө). Засах бол elevated PowerShell-ээс `icacls <file> /setintegritylevel Medium` — дэлгэрэнгүй ROADMAP.md-ийн TIER 0 хэсэгт.

## ⚠️ Admin эрх хэн авдаг вэ — bootstrap логик (`server/db.ts`-ийн `createUserWithPassword`)

Шинээр бүртгүүлж буй хэрэглэгч **admin** эрхтэй болдог ЗӨВХӨН дараах 2 тохиолдолд:
1. Тэр бол `users` хүснэгт хоосон үед бүртгүүлж буй **хамгийн ЭХНИЙ** хэрэглэгч (`isFirstUser`) — фрэш deployment бүр наад зах нь 1 admin-тай байхын тулд, ГАРААР DB заслах шаардлагагүй.
2. Тухайн имэйл `.env`-ийн `OWNER_EMAIL`-тэй **яг таарч** байвал (`isOwnerEmail`) — эзэмшигчийн имэйл (`t.morius@gmail.com`) DB дахин цэвэрлэгдсэн ч (жишээ нь шинэ компьютерт шинээр суулгах үед) үргэлж admin болохын баталгаа.

**Бусад бүх шинэ бүртгэл** (2-р, 3-р... хэрэглэгч, `OWNER_EMAIL`-тэй тохирохгүй) → энгийн `"user"` эрхтэйгээр л бүртгэгдэнэ, admin биш. `staff`/`admin` эрхийг зөвхөн одоо байгаа admin `/admin`-аас гараар (эсвэл `admin.updateUserRole`/`admin.inviteStaff` procedure-оор) л оноож болно.

⚠️ **Production/deploy хийхээсээ өмнө заавал шалгах:** `.env`-ийн `OWNER_EMAIL=t.morius@gmail.com` байх ёстой (placeholder `owner@example.com`-оор биш) — эс тэгвэл (1)-р дүрэм л ажиллана (зөвхөн хамгийн эхний бүртгэл admin болно, дараа нь эзэмшигчийн имэйл ч onцгой эрхгүй энгийн user болно).

## 2026-08-20: Гэрийн (хувийн) лаптоп дээр амжилттай асуулгасан

Ажлын компьютерээс `LAPTOP-MIGRATION.md`-ийн дагуу шилжиж, GitHub private repo-оос clone хийгээд (`C:\Users\hero_\Documents\Projects\sugi-asayake`) Node.js/pnpm/MySQL 8/MinIO AIStor-ийг шинэ лаптоп дээр бүрэн шинээр суулгаж, `pnpm dev` ажиллуулж, `t.morius@gmail.com`-ээр анхны (admin) акаунт бүртгүүлж баталгаажуулсан. Тэмдэглэх зүйлс:
- **pnpm build-script figuration**: шинэ pnpm (`onlyBuiltDependencies`) тохиргоог `package.json`-ий `"pnpm"` field-ээс уншихаа больсон тул **`pnpm-workspace.yaml`**-д зөөсөн (`packages: ['.']` + `onlyBuiltDependencies: [@tailwindcss/oxide, esbuild]`) — эс тэгвэл `pnpm install`-ийн дараа native build scripts (esbuild, tailwindcss/oxide) ажиллаагүй үлдэнэ, `pnpm approve-builds` interactive тул CI/скрипт орчинд ашиглах боломжгүй.
- **Migration 0009 (`drizzle/0009_independent_auth.sql`)-ийн `DROP INDEX \`openId\`` мөр бодит DB дээр ажиллахгүй байсан** — drizzle-ийн бодит auto-generated индексийн нэр `users_openId_unique` байсан (`openId` биш). Гараар зассан (`ALTER TABLE users DROP INDEX users_openId_unique;`). Хэрэв ирээдүйд ижил migration-ыг шинэ DB дээр ажиллуулбал энэ мөрийг заавал шалгаарай.
- MySQL/MinIO-ийн бодит өгөгдөл (backups zip, `C:\minio\data`) энэ лаптоп руу хараахан зөөгдөөгүй — хоосон орчноор эхэлсэн, шаардлагатай үед `LAPTOP-MIGRATION.md`-ийн §2/§3-ийн дагуу зөөнө.

## 2026-08-21: UI/UX бренд шинэчлэл (secondary pages + admin sidebar) + Хэрэглэгчийн профайл хуудас (бүрэн шинэ feature)

### 1. Бренд шинэчлэл — дэлгэрэнгүй `git log`-оос харагдана (commit: "Brand overhaul: unify secondary pages + fix unstyled admin sidebar")
Гол олдвор: `/admin`-ийн sidebar яагаад "загваргүй" харагдаж байсан бэ гэвэл — shadcn Sidebar-ийн ашигладаг `--sidebar-*` CSS токенууд (`bg-sidebar`, `text-sidebar-foreground` гэх мэт) `index.css`-д **хаана ч тодорхойлогдоогүй** байсан тул unstyled fallback-аар л харагдаж байжээ (код өөрөө буруу байгаагүй, зөвхөн нэг мөр тохиргоо дутуу байсан). Мөн Login/ForgotPassword/VerifyEmail/AcceptInvitation/Legal/MyOrders/NotFound бүгд Home/Shop-ийн editorial дизайн системийг ашиглаагүй, generic Tailwind/shadcn (`rounded-3xl bg-white shadow`, англи NotFound) байсныг шинэ `.auth-shell/.auth-card`, `.doc-shell/.doc-section`, `.order-card`, `.notfound-*` CSS class-уудаар нэгтгэсэн.

### 2. Хэрэглэгчийн профайл хуудас (`/profile`) — бүрэн шинэ, world-class ecommerce жишигт нийцүүлсэн
Хэрэглэгчийн хүсэлт: нэвтэрсэн хэрэглэгч профайл зураг, нэр, утас, гэрийн хаягаа хадгалж, хожим хүргэлтэд ашиглах боломжтой болгох; `/shop`-ийн header-т "Дэлгүүр"-ийн хажууд профайл icon.

**Backend (бүрэн шалгагдсан):**
- `drizzle/schema.ts` / `drizzle/0019_customer_profile.sql`: `users`-д `phone`/`avatarUrl`, шинэ `user_addresses` хүснэгт (олон хаяг хадгалах address book — label/recipientName/phone/addressLine/isDefault). Migration локал MySQL дээр бодитоор ажиллуулж баталгаажуулсан.
- `server/db.ts`: `updateUserProfile`, `updateUserAvatar`, `getUserAddresses`, `createUserAddress`/`updateUserAddress`/`deleteUserAddress` (эхний хаяг автоматаар "үндсэн" болно; үндсэнг устгахад дараагийнх нь автоматаар "үндсэн" болно; бусдын хаягт хандахыг `userId` давхар шүүлтээр хориглосон).
- `server/routers.ts`: шинэ `profile` router (`update`, `uploadAvatar`/`removeAvatar` — `admin.uploadProductImage`-тэй ижил base64+signature-шалгалттай upload, `addresses.list/create/update/delete`). Утасны дугаарын validation `checkout.createOrder`-тэй яг адил regex ашигладаг (`phoneSchema`).
- **Тест**: `server/profile.integration.test.ts` (6 тест, бодит MySQL+MinIO дээр — CRUD, default-хаяг автомат солигдол, өөр хэрэглэгчийн хаягт хандахыг NOT_FOUND-оор хориглодгийг баталгаажуулсан) + `server/commerce.router.test.ts`-д нэвтрээгүй хэрэглэгчийг бүх profile procedure-оос хориглодгийг шалгах тест нэмсэн. `RUN_AUTH_INTEGRATION_TESTS=1 COMMERCE_INTEGRATION_TESTS=1 RUN_MEDIA_INTEGRATION_TESTS=1`-тэйгээр бүрэн 70/70 тест ✅.

**Frontend:**
- `client/src/pages/Profile.tsx` (шинэ): avatar upload/remove (4MB хүртэл), нэр/утас засах маягт, хаягийн жагсаалт+нэмэх/засах/устгах/үндсэн болгох.
- `client/src/components/CommerceHeader.tsx`: "Дэлгүүр"-ийн хажууд профайл icon (нэвтэрсэн бол avatar/эхний үсэг, эсвэл generic icon) нэмсэн, mobile дээр ч (текст нуугдсан ч) icon харагдана.
- `client/src/pages/Checkout.tsx`: нэвтэрсэн хэрэглэгчийн профайл мэдээлэл (нэр/утас/имэйл) болон үндсэн хаяг автоматаар (зөвхөн хоосон талбарт) бөглөгддөг болсон + "Профайлаас засах" холбоос.
- `client/src/App.tsx`: `/profile` route.

**MinIO тохиргооны олдвор**: энэ лаптоп дээр `sugi-asayake` MinIO bucket огт үүсээгүй байсан (шинэ лаптоп, өгөгдөл шилжээгүй тул) — avatar upload тест анх "The specified bucket does not exist" алдаа өгсөн. Bucket-ийг гараар (`CreateBucketCommand`) үүсгэж засав. **Энэ нь зөвхөн энэ profile feature-т биш, ямар ч зураг upload (жишээ нь admin-ий бүтээгдэхүүний зураг)-д хамаарна** — хэрэв дахин шинэ орчинд суулгах бол bucket-ээ анхнаасаа үүсгэсэн эсэхээ шалгаарай.

**Хажуугаар олсон, засагдсан pre-existing bug**: `server/checkout.guest.integration.test.ts`-ийн "merges a guest's cart into their account the moment they register" тест OTP бүртгэлийн 2-алхамт урсгал (TIER 0, 2026-08-20) нэвтэрсний дараа хуучирсан хэвээр үлдэж, зочны сагс cart merge-ийг `auth.register`-ийн дараа шууд шалгадаг байсан ч бодит merge одоо зөвхөн `auth.confirmRegistration`-ий дараа болдог тул тест бодитоор эвдэрсэн байсан. **CI үүнийг хэзээ ч олж чадаагүй** — учир нь энэ бол `COMMERCE_INTEGRATION_TESTS=1`-ээр л ажилладаг gated тест, CI intentionally DB стенд босгодоггүй (`.github/workflows/ci.yml`-ийн тайлбарт бичсэнчлэн). Тестийг `confirmRegistration`-ийг код оруулж дуудах шинэ 2-алхамт урсгалд тохируулж засав (production код өөрчлөгдөөгүй — зөвхөн тест хуучирсан байсан).

### Websearch-ийн үр дүн (Монголын онлайн дэлгүүрийн профайл хуудасны талаар)
shoppy.mn зэрэг Монголын том дэлгүүрүүдийн профайл хуудасны нарийн UI бүтцийг public search-ээр олж дэлгэрэнгүй харах боломжгүй байсан (нэвтрэх шаардлагатай хуудаснууд). Харин олон улсын ecommerce профайл хуудасны best-practice-ууд (avatar upload+crop, олон хаяг хадгалах address book, checkout-д автомат бөглөх) дээрх хэрэгжилттэй нийцэж байгааг баталгаажуулсан.

### 3. ⚠️ Bug олж заслаа: MinIO дээр upload амжилттай ч зураг browser дээр харагдахгүй байсан (2026-08-21)
Хэрэглэгч avatar upload хийхэд MinIO console дээр файл орсон ч `/profile` хуудсан дээр зураг харагдаагүй (хоосон улаан дугариг). **Шалтгаан:** `server/_core/storageProxy.ts`-ийн `/manus-storage/*` route нь файлыг сервер талаас дамжуулдаггүй, зүгээр л browser-ийг шууд MinIO-ийн public URL руу **302 redirect** хийдэг (`res.redirect(302, `${S3_PUBLIC_BASE_URL}/${key}`)`). Upload өөрөө сервер-талын (authenticated) `PutObjectCommand`-аар амжилттай болдог тул MinIO console дээр файл харагддаг, гэвч browser-ийн дараагийн unauthenticated GET хүсэлт **bucket public-read policy тохируулаагүй** тул 403-аар цохигддог байв. Энэ session-д (өмнөх тестийн зорилгоор) шинээр үүсгэсэн `sugi-asayake` bucket дээр policy тохируулаагүй байсан нь шалтгаан. **Засвар:** `PutBucketPolicyCommand`-аар `s3:GetObject`-ийг public болгосон, `curl`-аар 200 буцааж байгааг баталгаажуулсан.

**⚠️ Энэ бол зөвхөн profile-т биш, ямар ч зураг (бүтээгдэхүүний зураг, site media гэх мэт)-д адилхан хамаарна.** Ирээдүйд шинэ орчинд (production, өөр компьютер) MinIO/S3 bucket шинээр байгуулах бүрт эдгээр 2 алхмыг хийхээ мартаж болохгүй:
1. `CreateBucketCommand` (bucket үүсгэх)
2. `PutBucketPolicyCommand` (public-read policy тохируулах, эс тэгвэл **бүх зураг browser дээр 403-аар харагдахгүй байх болно**, зөвхөн admin-ий upload өөрөө "амжилттай" гэж харагдана)

### 4. Профайл хуудсыг дэлхийн жишигт (SSENSE/Sephora/Net-a-Porter загварчлалын) хэмжээнд өргөтгөв
Хэрэглэгчийн жагсаасан 8 хэсэгт (Dashboard, Order History, Beauty/Home Profile, Wishlist, Address Book, Payment Methods, Notifications, Support) тулгуурлан **шатлалтайгаар** (тухайн өдөр бодитоор хийж болох, гадны нөөц/шийдвэр шаардахгүй хэсгүүдийг эхлээд) хэрэгжүүлсэн:

**Backend (бүрэн шалгагдсан, `drizzle/0020_profile_expansion.sql`):**
- `users`-д `skinType`/`skinConcerns`/`interiorStyle` (Beauty & Home profile — одоогоор зөвхөн хадгалагдана, каталогт tag-матчлагдах recommendation engine хараахан байхгүй тул хараахан юуг ч шүүж/эрэмбэлж ашиглаагүй, ROADMAP TIER 2-т тэмдэглэсэн), `emailOptIn`/`smsOptIn` (мэдэгдлийн тохиргоо).
- Шинэ `wishlist_items` хүснэгт (userId+productId unique, `notifyOnRestock` boolean) — "Хүслийн жагсаалт" + back-in-stock мэдэгдэл.
- `server/routers.ts`-ийн `profile` router-т нэмэгдсэн: `updatePreferences`, `updateNotifications`, `changePassword` (одоогийн нууц үг шалгаад session-г **дахин гаргалгүйгээр** шинэчилдэг — бусад бүх session/төхөөрөмж хүчингүй болно, харин одоогийн таб шинэ cookie аваад амьд үлддэг), `deleteAccount` (зөвхөн `role === "user"`-д зөвшөөрдөг — admin/staff-ийг блоклосон, учир нь тэдний үүсгэсэн aguulga/лог `RESTRICT` FK-аар хамгаалагдсан тул устгалт бодит DB алдаа өгнө), `wishlist.list/toggle`.
- `admin.updateProduct`-д back-in-stock hook нэмсэн: нөөц 0→>0 болоход хүслийн жагсаалтад "Ирэхээр мэдэгдэх" гэж тэмдэглэсэн бүх хэрэглэгчид имэйл (`sendAccountEmail`, Brevo тохируулаагүй бол log fallback) илгээгээд notify flag-ийг цэвэрлэдэг (нэг удаагийн мэдэгдэл, дахин subscribe хийх шаардлагатай).
- `getOrdersForUser`-д `productId` нэмсэн (Дахин захиалах товчинд шаардлагатай) + N+1 биш, харин **бүх order_items хүснэгтийг бүтнээр нь уншдаг байсан хэрэгцээгүй query-г** тухайн хэрэглэгчийн захиалгын id-аар scope хийсэн (жижиг гэхдээ бодит performance засвар).
- **Тест**: `server/profile.integration.test.ts`-д 6 шинэ тест нэмэгдсэн (нийт 12) — preferences, notifications, нууц үг солих (буруу/зөв, session cookie дахин олгогдох), акаунт устгах (буруу нууц үг, admin/staff блоклогдох, бодит устгалт), wishlist CRUD, **back-in-stock hook бодитоор `admin.updateProduct` дуудаад notify flag цэвэрлэгдэж байгааг баталгаажуулсан**. `commerce.router.test.ts`-д DB шаардахгүй auth-хамгаалалтын тестүүд нэмэгдсэн. Бүгд бодит MySQL+MinIO дээр баталгаажуулсан: 77/77 ✅ (бүх gate идэвхтэй үед), 46 passed/31 skipped (CI-тэй ижил, gate идэвхгүй үед).

**Frontend (`client/src/pages/Profile.tsx` — бүхэлд нь sidebar+tab архитектурт дахин зохион байгуулсан):**
- **Тойм**: мэндчилгээ, статистик (захиалга/wishlist/хаяг тоо), сүүлийн захиалгын карт.
- **Захиалга**: одоо байгаа order-card-ууд дээр visual timeline (Хүлээгдэж байна→Баталгаажсан→Бэлтгэсэн→Хүргэлтэд→Хүргэгдсэн) + "Дахин захиалах" товч (бүх мөрийг `cart.addItem`-ээр дахин нэмнэ, устсан бүтээгдэхүүнийг алгасна).
- **Хувийн профайл**: нэр/утас маягт + Гоо сайхны/Гэрийн профайл (арьсны төрөл, санаа зовдог асуудал multi-select, интерьерийн хэв маяг).
- **Хүслийн жагсаалт**: grid карт, "Сагслах" эсвэл (нөөцгүй бол) "Ирэхээр мэдэгдэх" checkbox. `Shop.tsx`-ийн бүтээгдэхүүний карт бүр дээр ч зүрхэн (♥) товч нэмэгдсэн (нэвтрээгүй бол login руу чиглүүлнэ) — хайж яваад шууд хадгалах боломжтой.
- **Хаяг**: өмнөх session-ий address book (өөрчлөгдөөгүй).
- **Мэдэгдэл**: email/SMS toggle switch (яг одоогоор зөвхөн back-in-stock мэдэгдэлд хамаарна гэдгийг тодорхой тэмдэглэсэн — захиалгын баталгаажуулах имэйл систем хараахан байхгүй тул).
- **Аюулгүй байдал**: нууц үг солих, "Бүх төхөөрөмжөөс гарах" (аль хэдийн байсан `auth.logoutAllDevices`-г эндээс ч дуудна), "Danger zone" акаунт устгах (нууц үг баталгаажуулалттай, зөвхөн энгийн хэрэглэгчид харагдана).
- **Тусламж**: FAQ accordion + холбоо барих (жинхэнэ `9450-9911`/`asayake0307@gmail.com`, Home.tsx footer-с олсон — анх зохиомол домэйн зохиочихсон байсныг олж, жинхэнэ мэдээллээр сольсон).
- `CommerceHeader.tsx`, `Checkout.tsx`, `App.tsx` — өмнөх session-д аль хэдийн холбогдсон.

### ⚠️ Хойшлуулсан хэсгүүд (Payment Methods, Google Maps, 2FA, PDF нэхэмжлэх, Урамшууллын оноо) — эзэмшигчийн шийдвэр/нөөц шаардана
Хэрэглэгчийн жагсаасан 8 хэсгээс дараах 5 зүйлийг **зориуд хийгээгүй**, учир нь тэдгээр нь код бичихээс илүү бизнесийн шийдвэр эсвэл гадны эрх (credential) шаарддаг:
- **Төлбөрийн хэрэгсэл хадгалах (Payment Methods vault)** — жинхэнэ картын дугаар хадгалах нь PCI-DSS comply-ийн ноцтой асуудал үүсгэдэг тул **зөвлөмж биш**. QPay merchant API нь өөрөө tokenized "saved card" дэмждэг эсэхийг судлах хэрэгтэй (одоогоор QPay merchant credentials ч тохируулагдаагүй байгаа — ROADMAP TIER 2). Харин "Store Credit" (буцаалтаас бий болсон дансны үлдэгдэл) нь аюулгүй, хурдан хийж болох fast-follow.
- **Google Maps дээр хаяг зоох** — жинхэнэ Google Maps API key + billing account шаардана (эзэмшигчээс авах ёстой).
- **2FA (2-step verification)** — боломжтой ч (TOTP+QR+backup codes) тодорхой хэмжээний ажил, хийх эсэхийг шийдэх хэрэгтэй.
- **PDF нэхэмжлэх/баримт татах** — шинэ PDF library (жишээ нь `pdfkit`) нэмэх шаардлагатай, fast-follow.
- **Урамшууллын оноо/VIP зэрэглэл (Loyalty)** — хэдэн худалдан авалтад хэдэн оноо, ямар шатлал VIP болгохыг бизнесийн дүрэм болгож шийдэх хэрэгтэй, кодоор өөрөө шийдэх зүйл биш.

Дараагийн ажлын хувьд эдгээрээс алийг нь хэзээ хийхийг эзэмшигчтэй ярилцаж тодруулах хэрэгтэй.

## 2026-08-25 (үргэлжлэл): "10 жилийн туршлагатай auditor" гүнзгий шинжилгээ + Цэвэрлэгээ + Хүргэлтийн үнэ + Зурган боловсруулалт + Server-side хайлт

Энэ өдрийн эхэнд ажлын компьютер дээрх сессээс `git pull`-аар асар их шинэ ажил (хямдралын код, урамшуулал, сэтгэгдэл, routine builder, loyalty, header хайлт) орж ирсэн. Тэдгээрийг локал MySQL/MinIO дээр бүрэн тохируулж (6 шинэ migration ажиллуулж, MinIO-г буруу замаас засаж) баталгаажуулсны дараа, Tom-ий хүсэлтээр **бүх codebase-ийг гүнзгий шинжилж, дутагдалтай/давхардсан/цэвэрлэх шаардлагатай зүйлсийг олж, брэйнсторм хийсний эцэст** дараах 4 чиглэлээр ажилласан (websearch-ээр баталгаажуулсан судалгаатай хамт — Монголын курьерийн үйлчилгээ (UBCab Express г.м.), 48%-ийн cart abandonment шалтгаан нь хожимдсон хүргэлтийн үнэ гэдэг судалгаа, QPay recurring дэмждэггүй гэдгийг баталгаажуулсан):

**1. Цэвэрлэгээ** — 1868 мөр үхсэн код (`ComponentShowcase.tsx`, `AIChatBox.tsx`, `ManusDialog.tsx`, `AdminPreview.tsx` — App.tsx-д route ч байгаагүй) устгасан. 9 хуучин Manus-эриний баримт бичгийг (`sugi-mongo-detasex2.manus.space`, OAuth flow зэрэг өнөөдөр байхгүй зүйлс дурддаг байсан) `archive/README.md`-тай хамт `archive/` фолдер руу зөөсөн (устгаагүй — түүхэн лавлагаанд). **`prettier --write .` зориудаар хийгээгүй** — энэ хэмжээний codebase дээр бүх файлыг дахин форматлах нь маш том, хянахад хэцүү diff үүсгэх, мөн одоогийн зарим хуудасны (Shop.tsx, Legal.tsx гэх мэт) нягт нэг мөрийн JSX хэв маяг нь **зориудаар сонгосон код хэв маяг** (multi-line болгож задлах нь стилийн том өөрчлөлт, алдаа гарах эрсдэлтэй) тул алгассан.

**2. Хүргэлтийн үнэ эрт харуулах** (UX-RESEARCH.md-ийн #2, websearch-ээр баталгаажсан) — `shared/const.ts`-д `UB_DELIVERY_FEE_MNT = 5000` тогтмол нэмж, өмнө нь зөвхөн Checkout дээр л дурдагддаг байсныг **`/shop`-ийн hero badge**, **CartDrawer-ийн footer**, **ProductDetail-ийн trust badge** гурван газарт нэмж эрт харуулдаг болгосон.

**3. Зурган боловсруулалт** (`sharp` package, `pnpm add sharp -w`) — Шинэ `server/_core/imageProcessing.ts`: `processUploadedImage()` нь upload хийсэн зургийг (авах хэвээр нь эсвэл томруулахгүйгээр) хамгийн ихдээ тодорхой хэмжээгээр (product: 1600px, site-media: 1920px, avatar: 512px) багасгаж, quality 82-оор дахин шахдаг. Гурван upload procedure (`admin.uploadProductImage`, `admin.uploadSiteMediaImage`, `profile.uploadAvatar`) бүгд холбогдсон. `processUploadedImageOrThrow` wrapper нь sharp-ийн decode алдааг цэвэр Монгол BAD_REQUEST мессеж болгодог. **Явцад чухал олдвор**: `server/profile.integration.test.ts`/`server/site-media.integration.test.ts`-ийн PNG тестийн fixture-үүд зөвхөн `assertImageSignature`-ийн magic-byte шалгалтыг өнгөрөөхөд хангалттай урттай байсан ч **бодит libpng decode хийхэд гэмтэлтэй** гэдгийг sharp өөрөө илрүүлсэн (metadata() түвшинд ч "хүчинтэй" мэт харагддаг байсан) — sharp-аар шинээр үүсгэж, **бүтэн pipeline-аар** (зөвхөн metadata() биш) баталгаажуулсан fixture-ээр сольсон. Шинэ `server/_core/imageProcessing.test.ts` (4 тест) — resize, upscale хийхгүй байх, PNG transparency хадгалагдах, WebP хадгалагдахыг баталгаажуулсан.

**4. Server-side хайлт** (MySQL FULLTEXT, ROADMAP TIER 2) — `drizzle/0027_catalog_fulltext_search.sql`: `products(name, brand, shortDescription)` дээр FULLTEXT index. `server/db.ts`-ийн `searchPublishedCatalog()` — BOOLEAN MODE + prefix wildcard (`+үг*`) ашиглаж, өмнөх клиент талын "хаа ч байх substring" хайлттай ойролцоо (бүрэн ижил биш — MySQL-ийн `innodb_ft_min_token_size` (3) хэмжээнээс богино ганц үсэг таарахгүй, гэхдээ бодит бүтээгдэхүүн/брэндийн нэр бараг үргэлж хангалттай урт). Шинэ `catalog.search` public procedure. `Shop.tsx`: 2+ тэмдэгтийн хайлтыг 300мс debounce-ээр `catalog.search`-руу дамжуулж, харагдаж буй grid зөвхөн серверийн үр дүнг ашигладаг болсон (ангилал/арьсны төрлийн pill, "Таны сүүлд үзсэн" хэсэг хэвээрээ бүрэн каталог дээр тулгуурлана — хайлтын явцад хумигдахгүй). `server/catalog-search.integration.test.ts` (6 тест) — брэнд/нэрээр таарах, **Монгол кирилл үгээр (`чийгшүүлэгч`) таарахыг бодитоор баталгаажуулсан**, нийтлэгдээгүй бараа хэзээ ч гарахгүй, тохирохгүй хайлт хоосон буцаах, 2-оос богино хайлтыг цуцлах.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр, `pnpm test` бүх gate идэвхтэй үед **124/124** ✅, CI-тэй ижил горимд 57 passed/67 skipped (regression алга).

**И-баримт, QPay, StorePay идэвхжүүлэлт зориудаар хийгээгүй** — Tom-ий шийдвэрээр эдгээрийг **бодит deploy хийх үедээ компанийн удирдлагатайгаа ярилцаж, эрх авсны дараа** хийнэ (бизнесийн шийдвэр, код бичих ажил биш). Дэлгэрэнгүй [EBARIMT.md](EBARIMT.md).

## 2026-08-25 (үргэлжлэл 2): Дахин гүнзгий audit — bug, feature-хоорондын зөрчил олж заслаа

Tom-ий шууд хүсэлтээр (git file size-ийг шалгах + гүнзгий code review) хийсэн:

**Git file size** — бодитоор шалгасан (`.git` = 1.1MB, хамгийн том file 306KB pnpm-lock.yaml, зөвхөн 1 SVG л tracked зураг, `node_modules`/`.env` зөв `.gitignore`-д орсон): **цэвэрлэх зүйл олдсонгүй.** Хуурамч "асуудал" зохиож устгуулахаас татгалзсан.

**Олсон, заасан 3 бодит bug/зөрчил:**
1. **Хүргэлтийн үнэ давхар hardcode байсан** — өнөөдрийн эрт хийсэн `UB_DELIVERY_FEE_MNT` тогтмолыг зөвхөн клиент талд (Checkout.tsx) ашигласан байсан бол `server/db.ts`-ийн `createOrderFromActiveCart` (жинхэнэ захиалга бүртгэх функц) дотор **тусад нь дахин `5000` hardcode** байсан. Хоёр газар зөрж эхэлбэл (жишээ нь зөвхөн нэгийг нь өөрчилбөл) захиалгын жинхэнэ дүн клиентэд харуулсан дүнгээс өөр болох эрсдэлтэй байсан. Одоо хоёулаа ижил `shared/const.ts`-ийн тогтмол ашигладаг.
2. **Loyalty хямдралын томьёо клиент дээр давхар хэрэгжсэн байсан** — `Checkout.tsx` server-ийн `getApplicableLoyaltyDiscount`-ийн яг адилхан `Math.round(...)` томьёог өөрөө дахин бичсэн байсан (routine/coupon хямдрал server-ийн бодит preview endpoint ашигладаг байтал loyalty нь ганцаараа үгүй байсан). Шинэ `cart.applicableLoyaltyDiscount` protected procedure нэмж, клиентийн давхар тооцооллыг устгасан — одоо "захиалга баталгаажуулахаас өмнө харагдах дүн" ба "бодитоор суутгагдах дүн" хооронд ямар ч drift-ийн эрсдэлгүй (шинэ integration тестээр баталгаажуулсан: preview яг charge-тэй тэнцүү).
3. **`HeaderSearch.tsx` (бүх хуудсанд байдаг header хайлт) `/shop`-той таарахгүй болсон байсан** — өнөөдөр `/shop`-ийн хайлтыг server-side FULLTEXT рүү шилжүүлсэн ч `HeaderSearch.tsx`-ийг мартаж, хуучин client-side substring хайлтаараа үлдээсэн байсан (**өөрийн миний өнөөдрийн ажлаас шууд үүссэн зөрчил**). Жишээ нь "рем" гэж бичихэд header дээр "крем" гарч ирээд, "бүх дэлгүүрээс харах" дарахад `/shop` дээр юу ч олдохгүй байх боломжтой байсан. Одоо хоёул яг ижил `catalog.search` (FULLTEXT) ашигладаг болгож, `HeaderSearch`-ийн бүх каталог (937 бараа) урьдчилан ачаалдаг байсныг мөн арилгасан.

**Product reviews-ийн бага зэргийн race condition тэмдэглэв (засаагүй, эрсдэл бага)**: `createProductReview`-д "давхар сэтгэгдэл шалгах → insert" хооронд race бий, гэхдээ DB талд `product_reviews_user_product_idx` UNIQUE INDEX бодитоор хамгаалдаг тул өгөгдлийн бүрэн бүтэн байдал алдагдахгүй, зөвхөн бага магадлалтай тохиолдолд raw MySQL алдаа (найрсаг Монгол мессежийн оронд) харагдах эрсдэлтэй.

**Reddit/сайтын судалгаа**: tRPC+Drizzle+Zod том codebase дээр TypeScript compile хурд удаашрах нь (энэ session-д мэдэгдэхүйц болоогүй), React Query-ийн `enabled` toggle бүрт cache байгаа ч дахин fetch хийдэг зан төлөв (Shop.tsx/HeaderSearch.tsx-ийн debounce+enabled дизайнд тохирсон, асуудал биш) зэргийг баталгаажуулсан.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр, `pnpm test` 125/125 (бүх gate идэвхтэй), 57 passed/68 skipped (CI-тэй ижил горим).
