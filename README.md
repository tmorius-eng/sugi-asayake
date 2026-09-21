# SUGI ASAYAKE

Улаанбаатар дахь интерьер / skincare дэлгүүрийн **бүрэн ажиллагаатай онлайн худалдааны платформ** — каталог, сагс, төлбөр, захиалгын урсгал, харилцагчийн данс, болон дэлгүүрийн бүх өдөр тутмын үйл ажиллагааг хамарсан админ самбартай.

> ### 📘 Эзэмшигч / худалдан авагчид зориулсан баримтууд
>
> Энэ README бол **хөгжүүлэгчид** зориулсан. Системийг эзэмших, ажиллуулах,
> худалдаж авах талаас нь уншихыг хүсвэл:
>
> 1. **[docs/SUGI-ASAYAKE-HANDOVER-MANUAL.pdf](docs/SUGI-ASAYAKE-HANDOVER-MANUAL.pdf)** — 72 хуудас: доорх бүгдийг нэгтгэсэн, хэвлэхэд бэлэн бүрэн лавлагаа (функц бүрийн тайлбартай)
> 2. [docs/SALES-BRIEF.md](docs/SALES-BRIEF.md) — товч танилцуулга: юу байна, ямар тоо
> 3. [docs/OWNER-HANDOVER.md](docs/OWNER-HANDOVER.md) — данс шилжүүлэх, нууцууд, лиценз, хүлээлцэх акт
> 4. [docs/OPERATIONS.md](docs/OPERATIONS.md) — deploy, нөөцлөлт, migration, мониторинг, `.env` загвар
> 5. [docs/ADMIN-MANUAL.md](docs/ADMIN-MANUAL.md) — дэлгүүрийн ажилтны өдөр тутмын заавар (25 хэсэг)
>
> PDF-ийг дахин үүсгэх: `python docs/manual/extract.py && python docs/manual/build_pdf.py`

Ганц Node.js процесс дээр ажилладаг монолит: React SPA-г Express сервэр түгээж, өгөгдөл нь end-to-end typed tRPC API-аар урсдаг.

| | |
|---|---|
| **Каталог** | 984 бараа, 68 хүснэгт, 92 migration |
| **Код** | 19 хуудас, 125 компонент, 281 API procedure |
| **Тест** | 1094 vitest тест / 112 файл (unit + бодит DB-тэй integration) + 156 Playwright E2E |
| **Хэл** | Бүх интерфейс монгол хэл дээр, үнэ ₮ (MNT) |

---

## Агуулга

- [Юу ажилладаг вэ](#юу-ажилладаг-вэ)
- [Технологийн стек](#технологийн-стек)
- [Архитектур](#архитектур)
- [Суулгах ба ажиллуулах](#суулгах-ба-ажиллуулах)
- [Орчны хувьсагчид](#орчны-хувьсагчид)
- [Өгөгдлийн бааз ба migration](#өгөгдлийн-бааз-ба-migration)
- [Тест](#тест)
- [Production руу гаргах](#production-руу-гаргах)
- [Аюулгүй байдал](#аюулгүй-байдал)
- [Лиценз ба гуравдагч талын эрх](#лиценз-ба-гуравдагч-талын-эрх)
- [Баримт бичиг](#баримт-бичиг)

---

## Юу ажилладаг вэ

### Дэлгүүр (storefront)

- **Каталог** — server-side FULLTEXT хайлт, ангилал, шүүлтүүр, хуудаслалт (бүгд URL-д хадгалагддаг тул refresh/буцахад төлөв сэргэдэг)
- **Бүтээгдэхүүний хуудас** — галерей, variant сонголт (хэмжээ/өнгө), нөөцийн төлөв, холбоотой бараа, сэтгэгдэл/үнэлгээ
- **Сагс ба checkout** — зочноор (guest) захиалах боломжтой, хямдралын код, дэлгүүрийн зээл, хүргэлтийн дүүргийн үнэ, QPay/бэлнээр
- **Харилцагчийн данс** — захиалгын түүх, хаягийн дэвтэр, хүсэлтийн жагсаалт, арьс/үсний preference profile, аюулгүй байдлын тохиргоо
- **Loyalty** — хуримтлагдсан зарцуулалтаар tier, routine-д суурилсан хямдрал
- **Контент** — нүүр хуудас бүхэлдээ админаас засварлагддаг (текст, зураг, дугаарлалт), мэдээ/нийтлэл, брэндийн лавлах, дэлгүүрийн байршил
- **Баркод уншуулах** — дэлгүүрийн компьютерт залгасан USB сканнераар бараа уншуулахад тухайн барааны хуудас шууд нээгдэнэ (каталогийн 937 бараа бүгд жинхэнэ JAN баркодтой). Хайлтын талбарт баркод бичихэд ч олдоно.
- **Захиалга хянах** — нэвтрэхгүйгээр захиалгын дугаараар

### Админ самбар (`/admin`)

- **Бүтээгдэхүүн** — CRUD, variant, олон зураг, брэнд, ангилал, нөөц, хуучин үнэ (хямдрал)
- **Захиалга** — статусын урсгал, цуцлалт, буцаан олголт, "буцаан олголт хүлээгдэж буй" шүүлтүүр
- **Аналитик / CRM** — борлуулалт, дүүрэг, харилцагч, ашиг/маржин, сагс орхилт, нөөц, суваг, траффикийн эх сурвалж, хөрвүүлэлтийн хувь, CAC, буцаалтын хувь → Excel/PDF export
- **Маркетинг** — хямдралын код (нэг харилцагчид хязгаартай), промо, имэйл/SMS кампанит ажил
- **Контент** — WordPress маягийн мэдээний editor, routine, нүүр хуудасны бүх текст/зураг
- **Хэрэглэгч** — server-side хуудаслалт + хайлт, эрхийн удирдлага
- **Эрхийн түвшин** — `admin`, `staff`, `finance`, `marketing`, `warehouse` (API procedure бүр дээр таслагдсан)
- **POS** — дэлгүүр дотор бэлнээр зарсан борлуулалтыг бүртгэх, баркод уншуулахад бараа шууд худалдаанд нэмэгдэнэ

### Интеграц

| Үйлчилгээ | Юунд | Төлөв |
|---|---|---|
| **Oracle HeatWave MySQL** (2026-09-13 хүртэл Aiven) | Үндсэн бааз | ✅ Ажиллаж байгаа (ssh тунель + TLS + CA шалгалттай) |
| **Cloudflare R2** | Зургийн сан (S3-совместимый) | ✅ Ажиллаж байгаа |
| **Brevo** | Захиалгын имэйл, SMS | ✅ Имэйл ажиллаж байгаа / SMS кредит дутуу |
| **verify.mn** | Бүртгэлийн SMS OTP | ✅ Ажиллаж байгаа |
| **Honeybadger** | Алдаа хянах | ✅ Код бэлэн, API key хүлээж байна |
| **QPay** | Онлайн төлбөр | ⚙️ Код бүрэн (webhook, дутуу төлөлт шалгах) — merchant гэрээ хүлээж байна |
| **eBarimt** | Татварын баримт | ⚙️ Зөвхөн schema — [EBARIMT.md](EBARIMT.md) |
| **StorePay / карт / эльч хүргэлт** | — | ❌ Хэрэгжээгүй (бизнесийн гэрээ шаардана) |

---

## Технологийн стек

**Frontend** — React 19 · Vite 7 · TypeScript 5.9 · Tailwind CSS 4 · wouter (routing) · TanStack Query · Recharts · TinyMCE 8 (админы editor)

**Backend** — Node.js (ESM) · Express 4 · tRPC 11 · Drizzle ORM · MySQL 8 · Zod 4 (бүх input validation)

**Дэд бүтэц** — Oracle HeatWave MySQL (TLS) · Cloudflare R2 (`@aws-sdk/client-s3`) · Vitest (тест) · Playwright (визуал шалгалт)

Гадны UI framework/template ашиглаагүй — бүх компонент энэ репозитор дотор.

---

## Архитектур

```
client/src/        React SPA
  pages/           16 route (Home, Shop, ProductDetail, Checkout, Profile, Admin …)
  components/      125 компонент (home/, admin/, ui/)
  lib/             tRPC client, форматлагч, траффикийн эх сурвалж

server/
  _core/           bootstrap, env, tRPC context, auth, rate limit, crypto, DB холболт
  db.ts            өгөгдлийн бүх хандалт (Drizzle query)
  routers.ts       281 API procedure, эрхийн түвшингээр таслагдсан
  analytics.ts     аналитикийн aggregate query
  integrations/    Brevo, QPay, verify.mn, R2

shared/            Клиент+сервер хоёулаа импортлодог цорын ганц эх сурвалж
                   (үнийн формат, хүргэлтийн дүрэм, захиалгын төлөв, CMS slot)

drizzle/           schema.ts + 87 гар бичмэл .sql migration
scripts/           backup/restore, migration ажиллуулагч, өгөгдөл зөв эсэх шалгагч
```

**Гол шийдвэрүүд:**

- **tRPC, REST биш** — API гэрээ нь TypeScript-ийн төрлөөр илэрхийлэгддэг тул сервер талын өөрчлөлт клиент дээр шууд compile алдаа өгдөг. Гар бичмэл API документ/type хэрэггүй.
- **`shared/` фолдер** — хүргэлтийн үнэ, захиалга буцаах эсэх, валютын формат зэрэг бизнесийн дүрэм клиент/сервер дээр **хоёр удаа** бичигдэхээс сэргийлнэ (өмнө нь `formatMnt` 21 файлд хуулагдсан байсан).
- **Гар бичмэл SQL migration** — `drizzle-kit push`-д найддаггүй; migration бүр хянагдсан, тайлбартай, `scripts/db-apply-migration.ts`-ээр аппын өөрийн холболтоор ажилладаг.
- **Нүүр хуудас өгөгдлөөр удирдагддаг** — текст (`site_text`), зураг (`site_media`) бүгд баазад; код байрлуулахгүйгээр админ өөрчилнө.

---

## Суулгах ба ажиллуулах

**Шаардлага:** Node.js 20.19+ (эсвэл 22.12+), pnpm 10.4.1, MySQL 8 хандалт (үүлэн дээрх ч болно).

```bash
git clone <repo-url>
cd sugi-asayake
pnpm install

cp .env.example .env      # Windows: copy .env.example .env
# .env дотор жинхэнэ утгуудаа бөглөнө — доорх хэсгийг үзнэ үү

pnpm dev                  # → http://localhost:3000
```

Сервер асахад ийм мөр гарвал бааз зөв холбогдсон:

```
[db] MySQL: TLS to <host>, server certificate verified against DATABASE_CA_CERT.
Server running on http://localhost:3000/
```

**Эхний админ эрх:** `users` хүснэгт хоосон байхад бүртгүүлсэн **хамгийн эхний хэрэглэгч** автоматаар `admin` болно. Эсвэл `.env`-ийн `OWNER_EMAIL`-тэй яг таарсан имэйлээр бүртгүүлнэ. Бусад бүх бүртгэл энгийн `user` эрхтэй.

| Команд | Юу хийдэг |
|---|---|
| `pnpm dev` | Хөгжүүлэлтийн сервер (hot reload) |
| `pnpm check` | TypeScript шалгалт |
| `pnpm build` | Production build (`dist/`) |
| `pnpm start` | Build хийсэн хувилбарыг ажиллуулах |
| `pnpm format` | Prettier |
| `pnpm exec vitest run --no-file-parallelism` | Бүх тест |

Цоо шинэ Windows компьютер дээр алхам алхмаар: **[docs/SHINE-LAPTOP-SETUP.md](docs/SHINE-LAPTOP-SETUP.md)**

---

## Орчны хувьсагчид

Бүрэн жагсаалт доор; орчны хувьсагч бүрийн тайлбар нь `server/_core/env.ts`-д кодтойгоо хамт байна. Товчхондоо:

**Заавал** (2026-09-20-оос production-д `JWT_SECRET`, `DATABASE_URL` байхгүй бол сервер порт нээхээс ӨМНӨ шатна; `INTEGRATIONS_ENCRYPTION_KEY`, `S3_*`, `PUBLIC_BASE_URL`, `OWNER_EMAIL` дутуу бол startup-д тод warning):

| Хувьсагч | Юу вэ |
|---|---|
| `DATABASE_URL` | `mysql://user:pass@host:port/db?ssl-mode=REQUIRED` |
| `JWT_SECRET` | Сешн cookie шифрлэх түлхүүр — production-д урт санамсаргүй утга |
| `OWNER_EMAIL` | Энэ имэйлээр бүртгүүлэгч автоматаар admin болно |
| `S3_*` (5 мөр) | Cloudflare R2 — зургийн сан |
| `INTEGRATIONS_ENCRYPTION_KEY` | Яг 64 тэмдэгт hex; интеграцийн түлхүүрүүдийг баазад шифрлэнэ |

**Сонголттой** — байхгүй бол тухайн функц л унтарна: `VERIFY_MN_API_KEY` (⚠️ байхгүй бол **бүртгэл шууд алдаа өгнө**), `BREVO_*`, `QPAY_*`, `VAPID_*` (web push), `FACEBOOK_APP_*`, `HONEYBADGER_API_KEY` / `HONEYBADGER_PERSONAL_AUTH_TOKEN`, `PUBLIC_BASE_URL`, `DATABASE_CA_CERT`, `ADMIN_FACE_GATE_ENABLED`, `MODERATION_MODEL`, `NOTIFICATIONS_DISPATCH`, `SMS_CAMPAIGNS_ENABLED`, `ANTHROPIC_API_KEY` (moderation), `DB_POOL_SIZE`, `RUN_BACKGROUND_JOBS`, `LOG_REQUESTS` / `LOG_SQL`, `DEV_ALLOWED_HOSTS`. ⚠️ `GUEST_CHECKOUT_OTP=0` нь ЗӨВХӨН тестийн хувьсагч — production `.env`-д тавибал зочны OTP чимээгүй унтарна.

> ⚠️ **Production-д `DATABASE_CA_CERT`-ыг заавал тохируулна.** Байхгүй бол холболт шифрлэгдэх ч серверийн сертификат шалгагдахгүй (сервер асахад анхааруулга бичнэ).

---

## Өгөгдлийн бааз ба migration

Schema нь `drizzle/schema.ts`-д (65 хүснэгт), өөрчлөлт бүр `drizzle/NNNN_*.sql` гар бичмэл файлаар.

```bash
pnpm exec tsx scripts/db-apply-migration.ts drizzle/0060_products_brand_index.sql
```

Энэ script аппын өөрийн холболтоор ажилладаг тул TLS, UTC session, query log бүгд production-тай ижил. `drizzle-kit push` ашиглахгүй (`drizzle/meta` экспортод ороогүй).

**Backup / restore:**

```powershell
pwsh scripts/db-backup.ps1  -DatabaseUrl "<uri>"                     # .zip үүсгэнэ
pwsh scripts/db-restore.ps1 -DatabaseUrl "<uri>" -BackupFile "<zip>" -Force
```

Өдөр бүр 19:00 цагт автоматаар backup авдаг Windows Task Scheduler task бий (14 хувилбар хадгална), Aiven-ий өөрийн өдөр тутмын backup-аас гадна.

---

## Тест

1030+ тест / 107 файл (`pnpm exec vitest run --no-file-parallelism`), дээр нь 40 Playwright E2E (`pnpm build ; pnpm e2e`, staging схем дээр). Ихэнх integration тест **бодит MySQL болон S3 хандалт шаарддаг** тул орчны gate-ээр хамгаалагдсан — gate-гүй үед автоматаар skip болно (CI дээр ингэж ажилладаг).

```powershell
# Зөвхөн unit тест (гадны хамааралгүй)
pnpm test

# Бүгд — бодит бааз шаардана
$env:RUN_AUTH_INTEGRATION_TESTS="1"; $env:COMMERCE_INTEGRATION_TESTS="1"; $env:RUN_MEDIA_INTEGRATION_TESTS="1"
pnpm exec vitest run --no-file-parallelism
```

> ⚠️ `--no-file-parallelism` **заавал**. Vitest-ийн анхдагч параллель горимд 20+ файл нэг MySQL-ийг зэрэг дарах тул тогтмол бус унадаг.

Integration тестүүд throwaway өгөгдөл үүсгэж, дуусмагц устгадаг; бодит контентод хүрдэг тест (`site_media`) snapshot-and-restore хийдэг.

---

## Production руу гаргах

```bash
pnpm build      # → dist/index.js (сервер) + client/dist (статик)
pnpm start      # NODE_ENV=production node dist/index.js
```

Гаргахын өмнө:

1. `.env` — `OWNER_EMAIL` жинхэнэ утга, `JWT_SECRET` санамсаргүй урт утга, `DATABASE_CA_CERT` бөглөгдсөн
2. `PUBLIC_BASE_URL` — QPay callback үүнийг ашиглана (Host header биш)
3. Шинэ S3/R2 bucket үүсгэсэн бол **хоёр** алхам хийнэ: `CreateBucket` **ба** `PutBucketPolicy` (`s3:GetObject` public) — эс бөгөөс зураг upload "амжилттай" ч browser дээр 403 өгнө
4. Migration-уудыг ажиллуулна

**Хэмжсэн гүйцэтгэл** (нэг Node процесс, 100 зэрэгцээ холболт): статик HTML **5,410 req/s, p50 18ms**. Бодит хязгаар нь баазын зам — mysql2 pool-ийн анхдагч 10 холболт + баазын RTT. Их ачаалал хүлээж байвал: каталог/нүүр хуудасны read-үүдэд cache, `connectionLimit` нэмэх, баазыг ойр бүсэд байрлуулах, Node-г `cluster`/PM2-ээр CPU бүрт.

---

## Аюулгүй байдал

- **Нууц үг** — Node-ийн `scrypt` (memory-hard KDF) + санамсаргүй salt, `timingSafeEqual`-аар харьцуулна. Гуравдагч талын hashing сан ашигладаггүй.
- **Сешн** — `httpOnly` cookie, JWT. `JWT_SECRET` байхгүй бол сервер **асахаас татгалзана** (dev fallback байхгүй).
- **Эрх** — API procedure бүр `public` / `protected` / `admin` / `staff` / `finance` / `marketing` / `warehouse` gate-ийн аль нэгээр таслагдсан; role шалгалт middleware-т төвлөрсөн.
- **Input validation** — бүх параметртэй procedure Zod schema-тай (урт, төрөл, мужийн хязгаартай).
- **Rate limiting** — олон түвшин; нэвтрэх/бүртгэл/SMS зэрэг эмзэг зам нь баазад тоолдог (`rate_limit_buckets`) тул олон instance дээр ч хүчинтэй.
- **Тээвэрлэлт** — баазын холболт TLS, `DATABASE_CA_CERT`-ээр сертификат шалгагддаг.
- **Нууц утга** — код дотор hardcode хийгдээгүй; `.env` хэзээ ч git-д ороогүй (түүхээр шалгасан).
- **Интеграцийн түлхүүр** — баазад AES-ээр шифрлэгдэж хадгалагдана (`INTEGRATIONS_ENCRYPTION_KEY`).

Хийгдсэн аудитууд: [docs/AUDIT-2026-09-09-order-unwind.md](docs/AUDIT-2026-09-09-order-unwind.md), болон [HISTORY.md](HISTORY.md)-д тэмдэглэгдсэн 2026-09-02 / 09-06 / 09-08 / 09-09-ний pass-ууд.

---

## Лиценз ба гуравдагч талын эрх

Энэ репозиторын **өөрийн код** `package.json`-д `MIT` гэж тэмдэглэгдсэн.

Гуравдагч талын 385 production dependency-ийн лицензийн задаргаа: **300 MIT · 34 Apache-2.0 · 27 ISC · 12 BSD · бусад зөвшөөрөмжтэй**. Дараах 2 зүйлийг л тусад нь анхаарна:

| Пакет | Лиценз | Юуг анхаарах |
|---|---|---|
| **`tinymce` 8.9** | **GPL-2.0-or-later ЭСВЭЛ Tiny-гийн арилжааны лиценз** | Админы мэдээний editor. Клиент build-д **шууд багцлагдсан** тул арилжааны лиценз аваагүй тохиолдолд GPL-2-ийн нөхцөл хамаарна. Арилжааны хэрэглээнд: Tiny-гээс лиценз авах, эсвэл MIT-лицензтэй editor-оор солих. |
| **`sharp` / libvips** | Apache-2.0 **AND** LGPL-3.0-or-later | Зөвхөн сервер талд, динамикаар холбогддог. Арилжааны түгээлтэд ерөнхийдөө асуудалгүй. |

**Фонт** — Golos Text, Google Fonts-оор (SIL Open Font License).
**Icon** — `lucide-react` (ISC).

> ⚠️ **Бүтээгдэхүүний фото зураг** нь энэ репозиторт биш, Cloudflare R2-д хадгалагддаг. 522 зургийн нэлээд хэсэг нь Японы гуравдагч талын каталогуудаас баркодоор олсон **үйлдвэрлэгчийн зураг** бөгөөд зохиогчийн эрх нь тухайн брэнд/жижиглэнгийн эзэмшигчид хамаарна. Кодыг гуравдагч талд шилжүүлэх үед эдгээр зургийг тусад нь авч үзэх шаардлагатай.

---

## Баримт бичиг

| Файл | Агуулга |
|---|---|
| [PROJECT-GUIDE.md](docs/PROJECT-GUIDE.md) | Одоогийн статус, орчны тохиргоо, идэвхтэй асуудал |
| [HISTORY.md](HISTORY.md) | Өдөр тутмын дэлгэрэнгүй ажлын лог, шийдвэрийн шалтгаан |
| [ROADMAP.md](ROADMAP.md) | Төлөвлөсөн ажлууд |
| [ADMIN-PANEL.md](ADMIN-PANEL.md) | Админ самбарын бүрэн боломжууд |
| [PREMIUM-FEATURES.md](PREMIUM-FEATURES.md) | Premium түвшний функцүүд |
| [EBARIMT.md](EBARIMT.md) | eBarimt интеграцийн бэлтгэл, нээлттэй асуултууд |
| [docs/SHINE-LAPTOP-SETUP.md](docs/SHINE-LAPTOP-SETUP.md) | Шинэ компьютер дээр тэглэхээс эхлэх заавар |
