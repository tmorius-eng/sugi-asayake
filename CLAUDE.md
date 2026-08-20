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

Дараагийн санал: UX-RESEARCH.md-ийн №2 (хүргэлтийн үнэ эрт харуулах), ROADMAP-ийн TIER 2 (зурган боловсруулалт, сервер талын хайлт, refund урсгал), эсвэл TIER 5-ын үлдсэн зүйлс (Sentry, staging, CDN, uptime monitoring).

**SECURITY.md, UX-RESEARCH.md** нэмэгдсэн (CLAUDE.md/ROADMAP.md-ийн хамтрагч баримт) — аюулгүй байдал болон UX/зах зээлийн судалгааны checklist тус тус.

**LAPTOP-MIGRATION.md нэмэгдсэн (2026-08-20)** — Tom ажлын компьютерээс гэрийн компьютер руу шилжихэд зориулсан бүрэн заавар (код/DB/MinIO зураг/`.env`-ийг зөөх 4 тусдаа алхам + гэрийн компьютерийн шинэ тохиргооны checklist). Бодит DB backup (`scripts/db-backup.ps1`) ажиллуулж `backups/`-т бэлэн болгосон.

**Төсөл одоо git repo** (`git init` хийсэн, GitHub-руу push хийгээгүй — хэрэглэгч өөрөө шийднэ).

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
