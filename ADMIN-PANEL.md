# SUGI ASAYAKE — Admin панелийг дэлхийн жишигт хүргэх төлөвлөгөө

`CLAUDE.md`, `ROADMAP.md`-ийн хамтрагч. Энэ бол Tom-ийн олж ирсэн "world-class admin panel" жагсаалтаас SUGI ASAYAKE-ийн бодит хэмжээ (нэг брэндийн дэлгүүр, community/marketplace биш)-нд тохируулж эрэмбэлсэн хувилбар.

**Дүрэм: TIER бүр дуусаад л дараагийнхаа руу шил.** Тест хийлгүй хэд хэдэн TIER-ийг зэрэг хийлгэвэл алдаа хуримтлагдаж, оношлоход хэцүү болно.

---

## TIER 1 — Dashboard & Global Search ✅ ДУУССАН (2026-08-20)
- [x] `/admin` нэвтрэхэд шууд харагдах нүүр: KPI карт (нийт захиалга, орлого, идэвхтэй хэрэглэгч), сүүлийн 10 захиалга, "Анхаарах зүйлс" (нөөц дуусч буй бараа, амжилтгүй төлбөр)
- [x] Дээд талд нэг **Global Search** — хэрэглэгч, захиалга, бүтээгдэхүүнийг нэг цонхноос хайх

`AdminDashboardHome.tsx`, `AdminGlobalSearch.tsx`. `pnpm check`/`test`/`build` ✅, бодит DB дээр HTTP-ээр шалгасан (жинхэнэ низкий-нөөцтэй бараа зөв илэрсэн, admin бус хэрэглэгчид 403).

## TIER 2 — Хэрэглэгчийн удирдлага сайжруулах ✅ ДУУССАН (2026-08-20)
- [x] Хэрэглэгч бүрийн дэлгэрэнгүй хуудас: захиалгын түүх, нийт зарцуулалт
- [x] Admin-с хэрэглэгчийг **түр хаах (suspend)** боломж (одоогоор зөвхөн role солих л байдаг)
- [x] **Force logout** (session revoke) — SECURITY.md-ийн session-revocation зүйлтэй хамт хийгдэнэ

`drizzle/0014_tier2_user_suspension.sql` (`suspendedAt`/`suspendedReason`), `AdminUserDetailDrawer.tsx`. Suspend хийхэд идэвхтэй session шууд хүчингүй болдог (`server/_core/context.ts`), дахин нэвтрэхэд FORBIDDEN. Бодит HTTP-ээр бүрэн шалгасан: suspend→session шууд үхсэн→unsuspend→дахин нэвтэрсэн; force logout→session үхсэн; админ өөрийгөө suspend хийж чадаагүй.

## TIER 3 — Зөв хэмжээтэй RBAC ✅ ДУУССАН (2026-08-20)
- [x] Одоогийн `user`/`admin` 2 role дээр **`staff`** гэсэн гуравдахь эрх нэмэх: захиалга/бүтээгдэхүүнийг удирдах эрхтэй ч, хэрэглэгчийн эрх өөрчлөх/санхүүгийн мэдээлэл харах эрхгүй
- [x] Аль хэдийн байгаа `staff_invitations` системийг ашиглаж энэ role-ийг холбох

**Хэрэгжилт:** `drizzle/0017_tier3_staff_role.sql` — `users.role`/`staff_invitations.role` enum-д `staff` нэмсэн. `server/_core/trpc.ts`-д шинэ `staffProcedure` (admin ЭСВЭЛ staff) нэмж, бүтээгдэхүүн/ангилал/захиалга/пост/media CRUD + upload-уудыг үүн рүү шилжүүлсэн; хэрэглэгч удирдлага (`users`, `staffInvitations`, `inviteStaff`, `revokeStaffInvitation`, `updateUserRole`, `userDetail`, `suspendUser`, `unsuspendUser`, `forceLogoutUser`) `adminProcedure`-т (зөвхөн жинхэнэ admin) хэвээр үлдсэн. `dashboardSummary`/`search` staff-д нээлттэй ч `totalRevenueMnt`/`activeUsers`/`users` илэрц нь staff-д `null`/хоосон болж редакцлагддаг. Client: admin панелийн "Хэрэглэгч" таб, "Ажилтан урих" товч зөвхөн жинхэнэ admin-д харагдана; урилгын маягтад "Staff" сонголт нэмсэн (анхдагч).

**Баталгаажуулалт:** `pnpm check`/`build` ✅, `pnpm test` (`RUN_AUTH_INTEGRATION_TESTS=1`, бодит DB) 49/54 ✅ (шинэ 2 unit тест staff-ийн зөвшөөрлийн хилийг шалгадаг). Бодит HTTP-ээр staff эрхтэй түр хэрэглэгчээр шалгасан: products/orders/posts/siteMedia — 200 (уншиж, `admin.createCategory`-аар бодит бичилт хийж, `admin_audit_logs`-д зөв actor-ээр бичигдсэнийг баталгаажуулсан); users/staffInvitations/updateUserRole/suspendUser/forceLogoutUser/inviteStaff — бүгд 403; dashboardSummary-ийн `totalRevenueMnt`/`activeUsers` `null`, search-ийн `users` хоосон массив байгааг баталгаажуулсан. Жинхэнэ эзэмшигчийн акаунт (`t.morius@gmail.com`, admin) энэ бүхний дараа ч өөрчлөгдөөгүй. Бүх түр тест өгөгдлийг устгасан.

## TIER 4 — Audit Log & Security Center ✅ ДУУССАН (2026-08-20)
- [x] `admin_audit_logs` хүснэгт **бүх** мэдрэмтгий admin үйлдэл дээр (үнэ өөрчлөх, устгах, эрх солих) бодитоор бичигдэж байгааг баталгаажуулах, дутууг нэмэх
- [x] Admin панельд Audit Log харах хуудас (шүүлттэй: огноо, admin, үйлдлийн төрөл)
- [x] Login history: амжилттай/амжилтгүй нэвтрэлт бүрийг харуулах жижиг хуудас

**Хэрэгжилт:** Аудит лог coverage-ийг шалгахад TIER1-3-ийн явцад аль хэдийн **бүх** admin/staff mutation procedure `logAdminAction` дууддаг байсныг баталгаажуулсан (зөвхөн зурган upload өөрөө лог бичдэггүй — object нь дараа нь product/site-media-д холбогдох үедээ л логддог, дангаараа upload хийх нь мэдрэмтгий бичлэг үүсгэдэггүй тул зөв). Шинэ зүйлс: `drizzle/0018_tier4_login_attempts.sql` — `login_attempts` хүснэгт (`auth.login` procedure бүр амжилттай/амжилтгүй үр дүнг imэйл, IP-ийн хамт бичдэг). Шинэ `admin.auditLogs`/`admin.loginHistory` procedure (**зөвхөн жинхэнэ admin**, staff биш), шүүлттэй (үйлдлийн төрөл, admin имэйл, огнооны хүрээ / имэйл, амжилттай эсэх). Client: `AdminSecurityCenter.tsx` (шинэ "Аюулгүй байдал" таб, зөвхөн admin-д харагдана), дотроо "Аудит лог"/"Нэвтрэлтийн түүх" гэсэн 2 дэд таб.

**⚠️ Энэ явцад чухал bug олж, засав:** `drizzle-orm`-ийн mysql `timestamp` багана MySQL session UTC гэж таамагладаг (raw утга дээр `+0000` нэмж уншдаг), гэвч локал MySQL серверийн session `time_zone = SYSTEM` (Windows-ийн local timezone, Asia/Ulaanbaatar = **UTC+8**) байсан тул `NOW()`/`defaultNow()`-ээр үүссэн бүх огноо (**бараг бүх хүснэгтийн `createdAt`/`updatedAt`**) app-ын тооцоолсон `Date`-тэй харьцуулахад **8 цагаар түрүүлж** харагддаг байсан. Энэ нь миний шинэ audit-log `dateFrom`/`dateTo` шүүлтийн тестээр илэрсэн ("ирээдүйн огноо" гэж зориуд өгсөн утга ч гэсэн бодит бичлэгийг хамруулсан). **Root cause fix:** `server/db.ts`-ийн `getDb()`-д MySQL connection pool-ийн `'connection'` event дээр `SET time_zone = '+00:00'` ажиллуулдаг болгосон — одооноос хойш DB холболт бүр UTC session ашиглана. Баталгаажуулсан: засаагүй үед `createdAt`-ийн жинхэнэ UTC-тэй харьцуулахад +8 цагийн зөрүүтэй байсан, заслын дараа 0 (`pnpm exec tsx` жижиг probe script-ээр шалгасан). Энэ засвар нь token/session expiry шалгалтад (аль хэдийн зөв ажиллаж байсан — учир нь app бичсэн, app уншсан утгууд тэгш алдаагаар цуцлагддаг байсан тул encoding зөрүү үл мэдэгдэж байсан) нөлөөгүй, зөвхөн DB-ээс шууд үүссэн (`defaultNow()`) огноог app-ын `Date.now()`-тэй шууд харьцуулах шинэ тохиолдол (яг л энэ TIER4-ийн filter feature шиг) дээр л нөлөөтэй байсан.

**Баталгаажуулалт:** `pnpm check`/`build` ✅, `pnpm test` (`RUN_AUTH_INTEGRATION_TESTS=1`, бодит DB) **52/57** ✅ (2 шинэ unit тест RBAC хил, 2 шинэ бодит DB integration тест login_attempts бичилт+auditLogs шүүлт баталгаажуулна — эдгээрээс нэг нь яг timezone bug-ийг илрүүлсэн, засаад дахин ажиллуулж бүгд ногоон болсныг харсан). Бодит HTTP-ээр шалгасан: 2 буруу + 1 зөв нэвтрэлт → `admin.loginHistory`-д гурвуулаа зөв (`reason: "invalid_credentials"`, зөв IP, зөв UTC цаг) харагдсан; `admin.createCategory` → `admin.auditLogs({action, actorEmail})`-аар зөв олдсон; staff эрхтэй хэрэглэгч аль алинд нь 403. Бүх түр тест өгөгдлийг устгасан.

## TIER 5 — Bulk Actions & Export ✅ ДУУССАН (2026-08-20)
- [x] Бүтээгдэхүүн/захиалгын жагсаалтад checkbox сонголт + багцаар статус солих
- [x] CSV export (захиалга, бүтээгдэхүүн) — огноо/статусаар шүүх боломжтой

**Хэрэгжилт:** Server: `admin.bulkUpdateProductPublishStatus`/`admin.bulkUpdateOrderStatus` (staffProcedure, дотроо ID бүрийг дараалан хуучин single-update логикоороо (`updateAdminProduct`/`updateAdminOrder`) дамжуулдаг тул бүх business rule (захиалгын төлөв ухрахгүй, хаагдсан захиалга хөдлөхгүй) хэвээрээ хүчинтэй) — нэг batch доторх нэг буруу ID үлдсэнийг зогсоохгүй, `{succeeded, failed}` тус тусад нь буцаадаг, амжилттай бүр өөрийн `logAdminAction` бичдэг (TIER4-ийн audit coverage-той нийцтэй). Client: CSV экспорт бүрэн **client-side** (`client/src/lib/csv.ts`, `downloadCsv`) — сервер рүү шинэ хүсэлт явуулахгүй, аль хэдийн ачаалсан жагсаалтаа шүүж татдаг тул хурдан бөгөөд энгийн. Бүтээгдэхүүн: ангилал+төлөвөөр шүүх экспорт панель. Захиалга: төлөв+огнооны хүрээгээр шүүх экспорт панель. Хоёуланд нь checkbox сонголт + `AdminBulkActionBar.tsx` (шинэ, дахин ашиглагдах) харагдана.

**Баталгаажуулалт:** `pnpm check`/`build` ✅, `pnpm test` бодит DB дээр **56/61** ✅ (шинэ RBAC unit тест 1, шинэ `admin.bulk-actions.integration.test.ts` 3 тест — олон бодит бүтээгдэхүүн зэрэг нийтэлж бүгдийг нь audit-логоор баталгаажуулсан; "хаагдсан захиалга" бодитоор ORDER-ийн status-ыг ухрааж чадаагүй ч, дараагийн `pending` захиалга хэвийн шинэчлэгдсэнийг, мөн амжилтгүй ID phantom audit лог үлдээгээгүйг баталгаажуулсан). Бодит HTTP-ээр давхар шалгасан: bulk publish [2 бодит ID] амжилттай, [1 бодит + 1 хуурамч ID] хагас амжилттай тус тусдаа зөв тайлагдсан, хуучин `admin.products`/`admin.orders` эвдрээгүй.

## TIER 6 — Энгийн System Health ✅ ДУУССАН (2026-08-20)
- [x] Жижиг widget: DB холболт 🟢/🔴, S3/storage холболт 🟢/🔴 (Sentry биш, зүгээр л basic ping)

**Хэрэгжилт:** `server/db.ts`-ийн `dbPing()` (`SELECT 1`), `server/storage.ts`-ийн `storagePing()` (`HeadBucketCommand`) — хоёулаа хэзээ ч throw хийдэггүй, `{ok, error?}` буцаадаг. `admin.systemHealth` (staffProcedure, мэдрэмтгий өгөгдөл биш тул staff-д ч харагдана) хоёуланг зэрэг дуудна. Client: `AdminDashboardHome.tsx`-д жижиг "СИСТЕМ: Database 🟢/🔴  Storage (S3) 🟢/🔴" мөр нэмсэн, 60 секунд тутам автоматаар шинэчлэгддэг, улаан үед `title` attribute-аар бодит алдааны мессеж харуулна.

**Баталгаажуулалт:** `pnpm check`/`build` ✅, `pnpm test` бодит DB+S3 (MinIO)-той **57/62** ✅ (шинэ RBAC unit тест 1). Бодит HTTP-ээр **бүрэн урсгал** шалгасан (MinIO-г зориудаар унтраа/асаах замаар): 1) хоёулаа ажиллаж байхад `{db:{ok:true}, storage:{ok:true}}` ✅ 2) MinIO-г зогсоосны дараа `{db:{ok:true}, storage:{ok:false, error:"connect ECONNREFUSED..."}}`— **бодит алдааны мессежтэйгээр** ✅ 3) энэ үед `admin.dashboardSummary`/`admin.products` зэрэг бусад endpoint бүгд хэвийн 200 буцсан (S3 унтарсан ч admin панель бүхэлдээ унасангүй) ✅ 4) MinIO-г дахин асаахад автоматаар дахин ногоон болсон ✅. Энэ TIER-ийн хажуугаар хэрэглэгчийн хүссэнээр S3_REGION="Mongolia" гэсэн хуучирсан утгыг бүх docs-оос хайж (`grep -rn "S3_REGION"`) `us-east-1`-тэй бүрэн нийцүүлсэн (`CLAUDE.md`), мөн MinIO-г бодитоор `MINIO_SITE_REGION=us-east-1`-ээр асааж, admin панелиар **бодит зураг upload хийж, буцаад татаж авч** ("authorization header is malformed" алдаа гараагүй) баталгаажуулсан.

## Контентын панелууд — Брэнд (`AdminBrandsPanel`) ✅ (2026-09-04, өргөтгөсөн 2026-09-10/11)

TIER 1–6 нь admin-ий **дэд бүтэц** (RBAC, audit, bulk, health). Энэ хэсэг нь storefront-ийн контентыг удирддаг панелуудын нэг — эхлээд Брэнд, учир нь 2026-09-11-нд нүүр хуудасны **хоёр** хэсгийг нэг дор тэжээдэг болсон.

**Хүснэгт**: `featured_brands` (`drizzle/schema.ts`) — `brandName`, `tagline`, `photoUrl`, **`logoUrl`** (2026-09-10, migration `0058_featured_brand_logo.sql`), `sortOrder`, `isActive`.

**`brandName` нь чөлөөт текст биш**: admin UI зөвхөн `admin.distinctRealBrands`-аас буцаж ирсэн **бодит `products.brand` утгуудын `<select>`**-ийг санал болгодог тул тайл нь хэзээ ч тэг бараатай брэнд рүү заахгүй. ⚠️ Утга нь **яг тэр том/жижиг үсгээр** хадгалагдана — жишээ нь бодит өгөгдөл дээр `"Asmy"` (`"ASMY"` биш), `"PRIECLAT"`, `"Cocochi"`. Буруу бичвэл join нь хоосон буцаана.

**Хаана харагддаг вэ (2 газар)**:
1. **"Онцлох брэндүүд" carousel** (`FeaturedBrandsCarousel.tsx`, 2026-09-10, Matsuya Ginza лавлагаа) — `sortOrder`-оор эрэмбэлнэ. `logoUrl` хоосон бол логоны зай хэвээр үлдэж, эвдэрсэн зураг биш **зориудын хоосон зай** мэт харагдана; `photoUrl` хоосон бол тухайн брэндийн хамгийн сүүлийн нийтлэгдсэн, зурагтай бараагаар автоматаар орлуулна.
2. **Нүүрний "Их зарагддаг бараанууд" rail-ийн сул слотууд** (2026-09-11) — `getBestsellingProducts` нь бодит борлуулалтаар дүүрээгүй үлдсэн слотуудыг идэвхтэй featured брэндүүдээс **round-robin**-оор дүүргэдэг (нөөцтэй + зурагтай бараа л орно). Бодит борлуулалт гармагц filler автоматаар шахагдана.

⚠️ **Лого (2026-09-11)**: 9 идэвхтэй брэндээс **ганц нь** (Cocochi) `logoUrl`-тэй. Carousel нь лого зурвасыг зөвхөн **олонх** брэнд логотой үед л нөөцөлдөг — эс бөгөөс ганц лого бүх картад 100px хоосон зай тулгадаг байв (бодит алдаа, засагдсан). **8 лого оруулбал зурвас өөрөө эргэж ирнэ.** Лого байхгүй брэндэд зөвшөөрөгдөөгүй wordmark бичихгүй гэсэн Tom-ийн дүрэм хүчинтэй хэвээр.

**Тиймээс**: аль брэнд нүүр хуудсан дээр гарахыг удирдах ганц газар бол **/admin → Брэнд**. Брэндийг нуух бол `isActive`-ыг унтраа; эрэмбийг өөрчлөх бол `sortOrder`.
