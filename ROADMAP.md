# SUGI ASAYAKE — Олон улсын жишигт хүргэх бүрэн замын зураглал

Энэ файл `CLAUDE.md`-ийн хамтрагч баримт бичиг. Claude Code үүнийг уншаад, доорх TIER-үүдийг **дараалан, нэг нэгээр нь** ажиллах ёстой — бүгдийг нэг дор хийлгэх гэж бүү оролд, учир нь энэ бол бодитоор хэдэн долоо хоногийн ажил.

**Хэрэглэх заавар:** Claude Code-доо "TIER 0-г бүхэлд нь хий" гэж хэлээд эхэл. Тухайн TIER дуусаад bодитоор туршиж (localhost дээрээ) баталгаажуулсны дараа л дараагийн TIER рүү шилж.

---

## TIER 0 — Яаралтай, миний өөрийн хийсэн шилжилтээс үүссэн цоорхойнууд ✅ ДУУССАН (2026-08-20)

Manus-с email+password руу шилжихдээ би дараах чухал хэсгүүдийг бүтээгээгүй үлдээсэн — эдгээрийг **хамгийн эхэнд** засах ёстой, учир нь бодит хэрэглэгч нууц үгээ мартвал одоогоор сэргээх боломжгүй:

- [x] **Нууц үг сэргээх урсгал** (forgot password) — Хийгдсэн. `password_reset_tokens` хүснэгт (migration `drizzle/0010_tier0_account_recovery.sql`), `auth.requestPasswordReset`/`auth.resetPassword` procedure, `/forgot-password` ба `/reset-password/:token` хуудас. Имэйл enumeration-оос сэргийлж, бүртгэлтэй эсэхээс үл хамааран ижил "success" хариу буцаана. Token нэг удаа ашиглагдана, 1 цагийн дараа хугацаа дуусна, шинэ хүсэлт гарахад хуучин токенууд автоматаар хүчингүй болно. `BREVO_API_KEY` (email провайдер, өмнө нь Resend байсныг 2026-08-20 Brevo руу сольсон) тохируулаагүй үед холбоосыг server log-д бичдэг (`notifyOwner`-тай ижил fallback).
- [x] **Имэйл баталгаажуулалт** (email verification) — Хийгдсэн. `email_verification_tokens` хүснэгт, бүртгүүлэхэд автоматаар баталгаажуулах имэйл илгээгдэнэ (`auth.register`-д `origin` дамжуулбал), `/verify-email/:token` хуудас, `auth.resendVerificationEmail`. Баталгаажаагүй хэрэглэгчид `CommerceHeader`-т сануулга харагдана ("Дахин илгээх" товчтой). Login-г хориглохгүй — зөвхөн сонголт.
- [x] **Login/Register-д тусгайлсан rate limit** — Хийгдсэн. `server/_core/security.ts`-ийн `checkRateLimit` (bucket нэрээр тусгаарлагдсан, generic) + `server/_core/trpc.ts`-ийн `strictRateLimitedProcedure`/`strictRateLimitedProtectedProcedure` (8/15мин), IP+procedure-ээр. `auth.login`, `auth.register`, `auth.requestPasswordReset`, `auth.resetPassword`, `auth.verifyEmail`, `auth.resendVerificationEmail`, мөн `checkout.createOrder` (2026-08-20 hostile review-ийн дараа нэмэгдсэн) бүгд хамрагдсан. `cart.addItem`/`updateItemQuantity` нь илүү сул `moderateRateLimitedProcedure` (30/15мин) ашигладаг.

**Баталгаажуулалт:** `pnpm check` ✅, `pnpm test` 36/36 (шинэ 9 тест нэмэгдсэн, үүнээс 3 нь `RUN_AUTH_INTEGRATION_TESTS=1`-ээр бодит MySQL дээр ажилладаг integration тест), `pnpm build` ✅. Бодит localhost сервер дээр HTTP-ээр гараар бүрэн урсгал шалгасан: бүртгэл → баталгаажуулах имэйл (log-д гарсан) → гарах → нууц үг сэргээх хүсэлт → email log-оос token унших → шинэ нууц үг тохируулах → шинэ нууц үгээр нэвтрэх (амжилттай) → хуучин нууц үгээр нэвтрэх (татгалзсан) → token дахин ашиглах (татгалзсан) → имэйл баталгаажуулах → дахин ашиглах (татгалзсан) → 8 удаагийн буруу login-ий дараа 429 (Too Many Requests) угтсан. Бүгд ажилласан.

**Мэдэгдэж буй, засаагүй үлдсэн жижиг зүйл:** `server/routers.ts`-ийн `auth.logout`-д Express-ийн `res.clearCookie(name, { maxAge: -1, ... })` дуудлага нь Express 5-д хэрэгсэхгүй болох тухай deprecation warning өгдөг (функционал зөв ажиллаж байгаа ч сервер лог дээр анхааруулга гардаг) — TIER1/3-т жижиг цэвэрлэгээ хийж болно.

**ЗАСВАР (2026-08-20, хэрэглэгчийн хүсэлтээр): холбоос (link) → 6 оронтой код (OTP)** — Дээрх "Нууц үг сэргээх"/"Имэйл баталгаажуулалт" хоёрын анхны хэрэгжилт (`/reset-password/:token`, `/verify-email/:token`, урт random token) бүрэн code-based болгож дахин бичигдсэн:
- `drizzle/0015_tier0_otp_codes.sql`: `password_reset_tokens`/`email_verification_tokens`-ийн `tokenHash`-ээс `.unique()` хассан (6 оронтой код зөвхөн 1сая хослолтой тул өөр хэрэглэгчийн код давхацах магадлал бодит — бүх lookup одоо `userId`-аар давхар шүүгддэг тул аюулгүй), `attempts` багана нэмсэн.
- `drizzle/0016_backfill_email_verified.sql`: `auth.login` одоо `emailVerifiedAt` шаарддаг болсон тул (доор) энэ өөрчлөлтөөс ӨМНӨ бүртгүүлсэн бүх хэрэглэгчийг (жишээ нь эзэмшигчийн өөрийн акаунт, хэзээ ч холбоос дараагүй) автоматаар "verified" болгож grandfather хийсэн — эс бөгөөс өөрсдийгөө түгжих эрсдэлтэй байсан.
- `auth.register` одоо шууд нэвтрүүлдэггүй — `{pendingVerification, email, codeSent}` буцаана, зөвхөн шинэ `auth.confirmRegistration({email, code})`-ийг зөв кодоор дуудсаны дараа л session (cookie) олгоно. `auth.login` одоо `emailVerifiedAt`-гүй бол FORBIDDEN буцаадаг тул баталгаажуулаагүй бүртгэлийг login-оор тойрч гарах цоорхойг хаасан.
- Шинэ `auth.resendRegistrationCode` (нэвтрээгүй, imэйл enumeration хамгаалалттай), `auth.verifyEmailCode` (нэвтэрсэн legacy хэрэглэгчид зориулсан, `auth.verifyEmail`-ийг сольсон). `auth.requestPasswordReset`/`auth.resetPassword` одоо `origin`/`token`-ийн оронд `email`+`code` авдаг.
- Код бүр 15 минут хүчинтэй, 5 удаа буруу оруулбал (rate limit-ээс тусдаа, `server/db.ts`-ийн `MAX_CODE_ATTEMPTS`) шатаж хүчингүй болно.
- Client: `Login.tsx` (бүртгэлийн 2-р алхам код оруулах маягттай), `ForgotPassword.tsx` (код+шинэ нууц үг нэг хуудсанд, `ResetPassword.tsx` устсан), `VerifyEmail.tsx` (token параметргүй, нэвтэрсэн хэрэглэгчид зориулсан код-оруулах хуудас болсон), `CommerceHeader`-ийн сануулга банер одоо `/verify-email` руу холбодог.
- **Баталгаажуулалт:** `pnpm check`/`pnpm build` ✅, `pnpm test` (`RUN_AUTH_INTEGRATION_TESTS=1`-тэй, бодит DB дээр) 47/52 ✅ (5 нь S3 тохиргоо шаардсан өөр integration тестүүд, орхигдсон) — `server/auth.account-recovery.integration.test.ts`, `server/auth.session-versioning.integration.test.ts` бүрэн шинэчлэгдсэн. Бодит dev сервер дээр (Brevo-г түр унтраагаад log fallback-аар код унших замаар) HTTP-ээр бүрэн урсгал шалгасан: register → login татгалзсан (FORBIDDEN, баталгаажаагүй) → буруу код (attempts үлдэгдэл зөв харуулсан) → зөв код (session олгосон) → login амжилттай → forgot-password → 5 буруу код (шатсан) → зөв код ч татгалзсан → шинэ хүсэлт → амжилттай сэргээлт → шинэ нууц үгээр нэвтэрсэн, хуучин нь татгалзсан → давхар бүртгүүлэх (pending, баталгаажаагүй) үед хуучин код хүчингүй болж шинэ код+нууц үгээр амжилттай баталгаажсан → жинхэнэ эзэмшигчийн акаунт (t.morius@gmail.com) энэ бүх өөрчлөлтийн дараа ч verified/unsuspended хэвээр (grandfather migration зөв ажилласан) байгааг DB-ээс баталгаажуулсан. Бүх түр тест хэрэглэгч, тэдгээрийн token мөрүүдийг дараа нь устгасан.

**Windows dev орчны нэмэлт олдвор — ЗАСАГДСАН (2026-08-20):** `pnpm dev` script (`NODE_ENV=development tsx watch ...`) нь native PowerShell дээр `'NODE_ENV' is not recognized...` гэж эвдэрдэг байсан. Учир нь `C:\Sugi-asayake\package.json` болон `pnpm-lock.yaml` файлууд "High Mandatory Level" Windows integrity label-тай байсан тул Claude Code (non-elevated процесс) тэднийг засаж чадаагүй. Хэрэглэгч elevated PowerShell-ээс `icacls <file> /setintegritylevel Medium` ажиллуулсны дараа засагдсан:
  - `server/_core/index.ts`-д `.env`-ээс NODE_ENV ирэхгүй үед `development`-ийг өгсгөл болгож тавьсан (dotenv/config-ийн дараа, бусад бүх import-ын өмнө).
  - `package.json`-ий `dev` script одоо зүгээр л `"tsx watch server/_core/index.ts"` — эвдэрсэн `NODE_ENV=development` prefix хасагдсан.
  - **Бодитоор баталгаажуулсан**: `pnpm dev` (ямар ч нэмэлт `$env:` алхамгүйгээр) шууд асаж, `Server running on http://localhost:3000/` хэвлэж, Vite HMR идэвхтэй, CSP header dev-д гараагүй (зөв), `/api/trpc/auth.me` 200 буцаж байгааг шалгасан.
  - **Одооноос `pnpm dev`-ийг стандарт байдлаар ашиглаж болно** — CLAUDE.md-ийн доорх гар `$env:` block нь зөвхөн `.env`-ийг ямар нэг шалтгаанаар (жишээ нь буруу утгатай S3_REGION гэх мэт) override хийх шаардлагатай үед л хэрэгтэй.

## TIER 1 — Аюулгүй байдал, өгөгдлийн бүрэн бүтэн байдал ✅ ДУУССАН (2026-08-20)

- [x] Drizzle schema-ийн 12 хүснэгтийн аль нэгэнд ч **foreign key constraint байхгүй** — Хийгдсэн. Бүх 15 хамаарлыг `drizzle/0011_tier1_foreign_keys.sql`-д нэмсэн (`drizzle/schema.ts`-д `.references()`). Cascade дүрэм: token/cart-item/order-item/payment-attempt хүснэгтүүд эцэг мөрөө дагаж **CASCADE** устдаг; `orders.userId`, `order_items.productId`, `staff_invitations.acceptedUserId` — эх мөр уствал **SET NULL** (захиалгын түүх, тайлан хадгалагдана); хэрэглэгчийн бичсэн агуулгатай холбоотой багана (`posts.createdByUserId`, `site_media.updatedByUserId`, `admin_audit_logs.actorUserId`, `staff_invitations.invitedByUserId`) болон `products.categoryId` — **RESTRICT** (агуулга/аудит чимээгүй алга болохгүй). Локал DB дээр орхигдсон мөр байгаа эсэхийг урьдчилан шалгаад migration-ыг амжилттай ажиллуулж баталгаажуулсан.
- [x] Security headers дотор **Content-Security-Policy байхгүй** — Хийгдсэн (`server/_core/security.ts`). Зөвхөн production-д идэвхжинэ (Vite dev-ийн HMR/inline-модуль ачааллагч strict script-src-тэй зөрчилддөг тул) — `pnpm build` + production горимд бодитоор ажиллуулж header гарч байгааг шалгасан.
- [x] QPay callback route (`/api/payments/qpay/callback`) **rate limiting-д хамрагдахгүй** байсныг засав. `limitQPayCallbackTraffic` (30 хүсэлт/мин/IP) нэмсэн.
- [x] JWT session-ийн **refresh/rotation стратеги байхгүй** — Full refresh-token rotation биш, харин "бусад бүх төхөөрөмжөөс гарах" хувилбарыг сонгосон (users.sessionVersion + JWT-д `sv` claim, mismatch бол session хүчингүй). `auth.logoutAllDevices` procedure, admin dashboard-ийн profile menu-д товч нэмсэн. Нууц үг сэргээхэд ч автоматаар бүх session хүчингүй болдог. **Бодитоор шалгасан**: хуулбарласан (stolen) cookie-г logoutAllDevices дуудсаны дараа яг тэр л токеноор дахин хандахад `null` буцаж байгааг, мөн нууц үг сэргээсний дараа хуучин session мөн адил хүчингүй болдгийг HTTP-ээр баталгаажуулсан.
- [x] `admin_audit_logs` хүснэгт бодитоор бүх admin үйлдэл дээр бичигдэж байгаа эсэхийг баталгаажуулах — Шалгаад цоорхойг олсон: `inviteStaff`, `revokeStaffInvitation`, `updateUserRole`, `createProduct`/`updateProduct`/`deleteProduct`, `createCategory`/`updateCategory` procedure-үүд огт лог бичдэггүй байсан (зөвхөн order/post/site-media л бичигддэг байсан). Бүгдэд `logAdminAction` дуудлага нэмсэн.
- [x] Хэрэглэгчийн оруулсан текст (пост агуулга, бүтээгдэхүүний тайлбар) XSS — Шалгасан: `client/src`-д зөвхөн нэг `dangerouslySetInnerHTML` байгаа (`components/ui/chart.tsx`, chart theme CSS — хэрэглэгчийн өгөгдөлтэй огт хамааралгүй). Пост/бүтээгдэхүүний контент бүгд ердийн JSX text interpolation-оор (`{post.content}`) render хийгддэг тул React автоматаар escape хийдэг — HTML огт interpret хийгддэггүй. Сервер талд ч SSR/dynamic HTML template байхгүй (`server/_core/vite.ts` статик SPA л дамжуулдаг). **Одоогийн кодод бодит XSS цоорхой алга** — код өөрчлөлт хийгээгүй, зөвхөн баталгаажуулсан.
- [x] Production дээр `.env`-ийг secrets manager-т хадгалах төлөвлөгөө — `.env`/`.env.*` аль хэдийн `.gitignore`-т орсон байгаа (шалгасан). Санал: hosting provider (Render/Railway/Fly/VPS+systemd гэх мэт)-ийн **encrypted env vars** ашиглах, эсвэл тусгай secrets manager (Doppler, 1Password Secrets Automation, AWS Secrets Manager). Жинхэнэ нээлтийн өмнө заавал сэргээх ёстой нууц зүйлс: `JWT_SECRET` (одоо `local-test-secret-12345` — dev утга!), `S3_SECRET_ACCESS_KEY`, MySQL нууц үг, `BREVO_API_KEY` (Resend-ээс Brevo руу шилжсэн, 2026-08-20 — доор), `QPAY_PASSWORD`. Энэ бол баримтжуулалт — кодоор шийдэх зүйл биш тул TODO хэвээр үлдээв (checkbox тэмдэглэсэн нь "төлөвлөгөө бичигдсэн" гэсэн утгатай).

**Баталгаажуулалт:** `pnpm check` ✅, `pnpm test` (DATABASE_URL/S3 тохируулаагүй үед) 32/32 ✅, DATABASE_URL+S3 тохируулаад бүх integration тестүүдийг оруулбал 37/38 ✅ (1 өмнөх алдаа бол зөвхөн миний нэг удаагийн туршилтын орчинд DATABASE_URL зориудаар зарлаж, dev DB-д байсан жинхэнэ бүтээгдэхүүнийг unit тест олж харснаас — TIER1-тэй хамааралгүй, `pnpm test` энгийнээр (DATABASE_URL зарлаагүй) ажиллуулахад давдаг), `pnpm build` ✅. Бодит `dist/index.js`-г `NODE_ENV=production`-оор ажиллуулж, CSP header бодитоор гарч байгааг, FK constraint-ууд (15ш) DB дээр амжилттай нэмэгдсэнийг, session-revocation (`logoutAllDevices` + password reset) хуулбарласан cookie-г бодитоор хүчингүй болгож байгааг localhost дээр HTTP-ээр баталгаажуулсан.

## TIER 2 — Э-commerce-ийн үндсэн бүрэн бүтэн байдал

- [ ] **Зурган боловсруулалт байхгүй** — upload хийсэн зураг шууд хадгалагддаг, thumbnail/compress/resize хийдэггүй (`sharp` package нэмэх санал болгож байна). Энэ нь page load хурдад шууд нөлөөлнө
- [ ] **Хайлт зөвхөн клиент талд** (аль хэдийн ачаалсан жагсаалтыг JS-ээр шүүдэг) — каталог томрох тусам удаашрана. Сервер талын full-text search руу шилжих (жишээ нь MySQL FULLTEXT index, эсвэл каталог 500+ бараа болбол Meilisearch/Algolia гэх мэт)
- [ ] Захиалга цуцлах/буцаах (refund) урсгал — админ талд `updateAdminOrder` бий ч, буцаалтын логик (нөөц буцаах, төлбөр буцаах) бүрэн шалгагдаагүй
- [ ] Захиалгын баталгаажуулах имэйл, хүргэлтийн статус мэдэгдэл — `server/_core/notification.ts`-ийн `sendAccountEmail`/`sendAccountSms` (Brevo, 2026-08-20-с холбогдсон) бэлэн, `checkout.createOrder`/`admin.updateOrder`-т дуудалт хийгээгүй л байна — дараагийн ажил
- [x] Зочин (guest) checkout боломж — ДУУССАН (2026-08-20), дэлгэрэнгүй [UX-RESEARCH.md](UX-RESEARCH.md)
- [ ] Хямдралын код/купон систем — байхгүй бол нэмэх эсэхийг шийдэх
- [ ] Бүтээгдэхүүний сэтгэгдэл/үнэлгээ (reviews) — олон улсын жишиг дэлгүүрт түгээмэл, одоогоор байхгүй

## TIER 3 — Frontend чанар, хэрэглэгчийн туршлага

- [ ] **Хандалт (accessibility)**: alt text бүх зурган дээр, keyboard navigation, color contrast (WCAG AA), aria-label-ууд — бүрэн audit хийгээгүй
- [ ] Бүх хуудсанд ачаалах/алдааны төлөв нэгдсэн, тогтвортой байдлаар харагдаж байгааг шалгах
- [ ] Гар утасны дэлгэц дээр бүх урсгалыг (checkout, admin панель) дахин шалгах
- [ ] Код форматлалт — `prettier` аль хэдийн devDependency-д байгаа тул `pnpm exec prettier --write .` ажиллуулж, JSX-ийн нягт бичлэгийг цэгцлэх
- [ ] **Хэрэглэгддэггүй код устгах**: `ComponentShowcase.tsx` (1437 мөр!), ашиглагдаагүй `AIChatBox.tsx`, `ManusDialog.tsx`, `AdminPreview.tsx` — routing хийгдээгүй ч repo-г хүндрүүлж байна
- [ ] SEO: бүтээгдэхүүн бүрийн meta tag, structured data (Product schema.org), sitemap автоматаар шинэчлэгддэг эсэхийг шалгах
- [ ] Performance: зураг lazy-load хийгдэж байгаа эсэх, bundle size, Lighthouse score

## TIER 4 — Тест, чанарын баталгаажуулалт

- [ ] **E2E тест байхгүй** (Playwright/Cypress) — одоогоор зөвхөн vitest unit/integration тест (27ш). Гол урсгалуудад (бүртгэл→нэвтрэлт→сагслах→захиалга, admin CRUD) E2E тест нэмэх
- [ ] Тестийн хамрах хүрээг (coverage) нэмэгдүүлэх

## TIER 5 — Дэд бүтэц, үйл ажиллагаа (жинхэнэ нээлтийн өмнө заавал)

- [x] **CI pipeline** — ДУУССАН (2026-08-20, зөвхөн локал бэлтгэл, GitHub-руу push хийгээгүй). Төсөл анх удаа git repo болсон (`git init`, Git суулгасан — өмнө нь огт суугаагүй байсан). `.github/workflows/ci.yml` нэмсэн: push/PR бүрд `pnpm check && pnpm test && pnpm build` ажиллана (MySQL/S3 service шаардахгүй, учир нь DB-gated integration тестүүд өөрсдөө env var байхгүй үед skip хийдэг — баталгаажсан, TIER 0/1-ийн тэмдэглэл харна уу). **Дараагийн алхам (хэрэглэгч өөрөө хийх ёстой):** GitHub дээр repo үүсгэж `git remote add origin ... && git push -u origin main` хийвэл л Actions идэвхжинэ.
- [ ] Staging орчин (prod-с тусдаа)
- [ ] Алдааны хяналт (Sentry эсвэл ижил төстэй)
- [ ] Бүтэцтэй logging
- [x] **Автомат DB backup + сэргээх төлөвлөгөө** — ДУУССАН (2026-08-20, локал dev DB-д зориулав). `scripts/db-backup.ps1` (`mysqldump` → zip, `DATABASE_URL`-аас холбогдоно, сүүлийн 14 backup хадгална) болон `scripts/db-restore.ps1` (**анхдагч байдлаараа `<db>_restore_drill` нэртэй тусдаа DB рүү сэргээдэг — жинхэнэ өгөгдлийг санамсаргүй дарахгүй**, зөвхөн `-Force`-той үед жинхэнэ DB рүү бичдэг). **Windows Task Scheduler**-д `SugiAsayake-DbBackup` нэртэй, өдөр бүр 03:00 цагт ажилладаг task бүртгэгдсэн (`Register-ScheduledTask`, System32-ийн `powershell.exe`-ээр — `pwsh.exe` нь WindowsApps багцын хязгаарлалтаас болж Task Scheduler-т ажилладаггүйг олж, засав). **Бодитоор бүрэн шалгасан**: backup → drill DB руу restore → эх болон сэргээсэн DB-ийн бүх хүснэгтийн бодит мөрийн тоо (COUNT(*), FK constraint 15ш) яг таарч байгааг баталгаажуулсан; Task Scheduler-ээр гар аргаар нэг удаа асааж (`Start-ScheduledTask`) `LastTaskResult=0`, шинэ backup файл бодитоор үүссэнийг харсан. **Жинхэнэ нээлтийн production төлөвлөгөө** (одоогоор prod host сонгогдоогүй тул зөвхөн баримтжуулалт): hosting provider-ийн managed MySQL байвал түүний built-in автомат backup (жишээ нь daily snapshot + PITR) ашиглах; өөрөө удирддаг VPS бол дээрхтэй адилхан script-ийг systemd timer-ээр (`crontab`-ын оронд) ажиллуулж, backup файлыг **тухайн серверээс тусдаа** байршилд (S3/R2 bucket, эсвэл өөр серверт rsync) хадгалах ёстой — ганцхан серверт л байгаа backup нь диск бүтэн эвдрэхэд юу ч хамгаалахгүй. Сар тутам сэргээх drill хийж, script бодитоор ажиллаж байгаа эсэхийг баталгаажуулж байх санал.
- [ ] S3/R2-ийн өмнө CDN тавих (зурган ачаалалт хурдасгах)
- [ ] Uptime/health monitoring
- [ ] Жинхэнэ нээлтийн өмнө load testing

## TIER 6 — Хууль эрх зүй, нийцэл (Монголын дэлгүүрт зориулсан)

- [ ] Privacy/Terms/Returns хуудсуудын агуулга **бодитоор хуулийн зөвлөгөө авсан эсэхийг** шалгах (би энэ талаар хуульч биш, зөвлөгөө өгөх боломжгүй — тусгай хуульчаас шалгуулах санал болгож байна)
- [ ] Хэрэглэгчийн өгөгдөл устгах/экспортлох хүсэлтийг зохицуулах бодлого (хэрэглэгч эрх зүйн шаардлагаас үл хамааран сайн дадал)

---

## Тэргүүлэх дараалал (санал)

1. ~~**TIER 0**~~ ✅ дууссан (2026-08-20)
2. ~~**TIER 1**~~ ✅ дууссан (2026-08-20)
3. ~~**TIER 5-ын CI + backup**~~ ✅ дууссан (2026-08-20, локал бэлтгэл — GitHub push, Sentry, staging, CDN, uptime monitoring, load testing зэрэг TIER 5-ийн бусад зүйлс хэвээрээ үлдсэн)
4. **TIER 2, 3, 4** — зэрэгцээ, тэргүүлэх ач холбогдлоороо
5. **TIER 6** — бизнес жинхэнэ нээгдэхээс өмнө
