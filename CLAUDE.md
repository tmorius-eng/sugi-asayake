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
OWNER_EMAIL=owner@example.com
S3_BUCKET=sugi-asayake
S3_REGION=Mongolia   ← АНХААР: энгийн "us-east-1" биш! MinIO серверийн region нь "Mongolia" гэж тохиргоологдсон, зөрвөл "authorization header is malformed" алдаа өгнө.
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
$env:S3_REGION="Mongolia"
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
- Admin панель: бүтээгдэхүүн үүсгэх/засах, зураг upload (S3_REGION=Mongolia тохиргоотой)
- Пост үүсгэх, нийтлэх, олон нийтэд харуулах (`/:slug`)
- Каталог/дэлгүүрийн жагсаалт, бүтээгдэхүүний дэлгэрэнгүй хуудас
- **Нууц үг сэргээх, имэйл баталгаажуулах, login/register rate limiting (TIER 0, 2026-08-20 дуусгасан)** — дэлгэрэнгүй, туршилтын бүх алхам: [ROADMAP.md](ROADMAP.md)-ийн TIER 0 хэсэг

**Шалгагдаагүй, анхаарах ёстой:**
- Checkout/захиалгын бүтэн урсгал (сагс → захиалга үүсгэх)
- QPay төлбөр (жинхэнэ merchant credential шаардана, localhost дээр бүрэн туршигдахгүй)
- Staff invitation имэйл (одоогоор `RESEND_API_KEY` тохируулаагүй тул зөвхөн server log-д бичигддэг)
- Хэрэглэгчийн удирдлага (`/admin` → Хэрэглэгч хэсэг)

## Мэдэгдэж буй бусад зүйлс (өмнөх бүрэн аудитаас, засаагүй үлдсэн)
- Drizzle schema-д foreign key constraint байхгүй (12 хүснэгтийн аль нь ч)
- QPay callback route (`/api/payments/qpay/callback`) rate limiting-д хамрагдахгүй
- Security headers дотор Content-Security-Policy байхгүй
- `ComponentShowcase.tsx` (1437 мөр), ашиглагдаагүй `AIChatBox`/`ManusDialog` — routing хийгдээгүй хэдий ч repo дотор үлдсэн dead code

## Дараагийн ажлын санал
TIER 0 (нууц үг сэргээх, имэйл баталгаажуулалт, auth rate limit) болон TIER 1 (FK constraint, CSP, QPay rate limit, session revocation, audit log coverage, XSS баталгаажуулалт) хоёулаа дууссан — дэлгэрэнгүй, туршилтын бүх алхам: [ROADMAP.md](ROADMAP.md). Дараагийн санал: TIER 5-ын CI/backup, дараа нь TIER 2/3/4 зэрэгцээ.

**`pnpm dev` одоо стандарт байдлаар ажилладаг (2026-08-20-с хойш).** Өмнө нь `package.json`/`pnpm-lock.yaml` файлууд Windows-ийн "High Mandatory Level" integrity label-тай байсан тул Claude Code засаж чадахгүй байсан бол, хэрэглэгч elevated PowerShell-ээс `icacls ... /setintegritylevel Medium` ажиллуулж зассан. Одооноос localhost дээр туршихдаа зүгээр л:
```powershell
cd C:\Sugi-asayake
pnpm dev
```
хангалттай — доорх гар `$env:` block нь зөвхөн `.env`-ийн утгыг (жишээ нь S3_REGION) түр override хийх шаардлагатай үед л хэрэгтэй.

**Мэдэгдэж буй blocker:** `C:\Sugi-asayake\package.json` болон `pnpm-lock.yaml` нь Windows "High Mandatory Level" integrity label-тай тул non-elevated Claude Code процесс тэдгээрийг засаж/хадгалж чадахгүй (`pnpm add` ч lockfile дээр EPERM өгнө). Засах бол elevated PowerShell-ээс `icacls <file> /setintegritylevel Medium` — дэлгэрэнгүй ROADMAP.md-ийн TIER 0 хэсэгт.
