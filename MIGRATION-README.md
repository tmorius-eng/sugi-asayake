# SUGI ASAYAKE — Manus-с тусгаарлаж, бие даасан болгосон тайлан

**Огноо:** 2026-08-18
**Баталгаажуулалт:** `pnpm check` ✅ 0 алдаа · `pnpm build` ✅ амжилттай · `pnpm test` ✅ 27/27 (2 нь бодит DB шаарддаг тул зориудаар skip)

Энэ бол зөвхөн санал биш — бодитоор код бичигдэж, ажилладаг эсэхийг шалгасан хувилбар юм.

---

## Юу солигдсон вэ (10 дутуу байсан файл бүрэн бичигдлээ)

| Хуучин (Manus, дутуу байсан) | Шинэ, чиний эзэмшдэг хувилбар |
|---|---|
| `server/_core/oauth.ts` — Manus OAuth | **Устгагдсан.** Оронд нь `auth.register`/`auth.login` tRPC procedure (доор) |
| `server/_core/storageProxy.ts` — Forge proxy | Өөрийн S3 bucket руу чиглэсэн redirect |
| `server/storage.ts` — Forge-ээр S3 рүү дамждаг байсан | AWS SDK-аар шууд өөрийн S3 bucket руу upload хийдэг |
| `server/_core/env.ts` | Зөвхөн өөрийн орчны хувьсагчид (Manus-ийн юу ч алга) |
| `server/_core/context.ts`, `trpc.ts` | JWT session-д суурилсан шинэ auth систем |
| `server/_core/cookies.ts` | Same-origin session cookie (`SameSite=Lax`) |
| `server/_core/notification.ts` | Resend email, эсвэл серверийн log fallback |
| `server/_core/systemRouter.ts` | Placeholder (клиент код үүнийг хэзээ ч дуудаагүй) |
| `server/_core/vite.ts` | Стандарт Vite↔Express dev/prod холболт |
| `shared/_core/errors.ts` | Энгийн error классууд |
| `client/src/_core/hooks/useAuth.ts` | Шинэ email+password session-тэй ажилладаг hook (гадаад интерфейс өөрчлөгдөөгүй) |
| `client/src/pages/Login.tsx` | **Шинэ.** Manus-ийн OAuth портал руу чиглүүлдэг байсныг орлуулсан өөрийн нэвтрэх/бүртгүүлэх хуудас |

### Өгөгдлийн сан (`drizzle/schema.ts`)
`users` хүснэгтээс `openId`/`loginMethod` (Manus-ийн OAuth-д зориулагдсан) хассан, `passwordHash` баганыг нэмсэн, `email`-г заавал бөглөх+давхцахгүй болгосон. Миграцийг **`drizzle/0009_independent_auth.sql`**-д бичсэн — файлын дотор яагаад гараар ажиллуулах ёстойг тайлбарласан (учир нь Manus-ийн экспортод drizzle-kit-ийн migration journal/snapshot алдагдсан байсан тул автоматаар генерац хийх найдваргүй байсан).

### Build tooling
- `vite-plugin-manus-runtime` (npm дээр "Proprietary" лицензтэй) болон `@builder.io/vite-plugin-jsx-loc` — устгагдсан
- `vite.config.ts`-ийн `allowedHosts` (зөвхөн `*.manus.computer` домэйнд хязгаарлагдаж байсан) — арилгасан, одоо ердийн Vite тохиргоо
- `client/public/__manus__/` (debug collector скрипт) — устгасан
- `main.tsx`-ийн "manus-cookie" iframe cookie bridge (зөвхөн Manus-ийн preview iframe дотор хэрэгтэй байсан) — арилгасан, учир нь чиний сайт цаашид Manus-ийн iframe дотор биш, бие даан ажиллана
- `template.json` (Manus-ийн дотоод scaffold файл, аль ч кодоос ашиглагддаггүй байсан) — устгасан

### Функц дээр НЭГ Ч ӨӨРЧЛӨЛТ ОРООГҮЙ
Каталог, сагс, захиалга, admin CRUD, QPay интеграци, staff invitation, site media — эдгээрийн бизнес логик, UI, route бүгд **шилжихээс өмнөх адилхан**. Зөвхөн auth/storage-ийн "яаж" хийгддэг механизм солигдсон, "юу хийдэг" нь өөрчлөгдөөгүй.

---

## ЧУХАЛ: Deploy хийхээсээ өмнө хийх ёстой зүйлс

1. **`.env` файл үүсгэ** — хавсаргасан `.env.example`-г хуулаад бөглө:
   - `JWT_SECRET` — `openssl rand -hex 32`
   - `DATABASE_URL` — MySQL 8+ (VPS дээрээ суулгах, эсвэл PlanetScale/Aiven гэх мэт)
   - `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` — өөрийн AWS S3 (эсвэл Cloudflare R2) bucket
2. **Миграц ажиллуул** — эхлээд хуучин 0000-0008 migration-уудыг (хэрэв DB чинь хоосон бол drizzle-kit-оор, эсвэл гараар), дараа нь `drizzle/0009_independent_auth.sql`-ийг MySQL client-аараа шууд ажиллуул.
3. **Зурган материал шилжүүлэх** — одоогийн амьд сайт дээрх зургууд (лого, hero зураг гэх мэт) Manus-ийн storage-д байгаа. Эдгээрийг татаж аваад өөрийн S3 bucket-руу **яг ижил файлын нэрээр** (жишээ нь `sugi-logo-transparent-clean_b392050b.png`) upload хийвэл URL-үүд өөрчлөгдөхгүйгээр ажиллана. Эсвэл /admin-аар дахин upload хийж болно (шинэ URL үүснэ).
4. **Анхны админ бүртгэл** — deploy хийсний дараа `/login`-с "Бүртгүүлэх" дараад анхны акаунтаа үүсгэ — **хамгийн эхний бүртгэл автоматаар admin эрхтэй болно.**
5. Домэйн шийдэгдсэний дараа `client/index.html`-ийн canonical/OG URL-ийг (`sugi-mongo-detasex2.manus.space`) шинэ домэйнаараа солих.

---

## Хараахан хийгдээгүй (аудитаас давхардуулахгүйн тулд товч дурдъя)
Өмнөх бүрэн аудит тайланд байсан бусад зөвлөмжүүд (foreign keys, CSP header, QPay callback-д rate limit, CI/CD, monitoring) энэ шилжилтэд **хамрагдаагүй** — учир нь чиний энэ удаагийн даалгавар зөвхөн "Manus-с салгах, feature бүгдийг хэвээр үлдээх" байсан тул би түүнд л төвлөрсөн. Дараагийн ээлжид тэдгээрийг хийж болно.
