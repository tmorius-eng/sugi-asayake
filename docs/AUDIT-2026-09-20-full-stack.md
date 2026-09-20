# Бүтэн стекийн гүнзгий аудит + гүйцэтгэлийн төлөвлөгөө (2026-09-20)

> Tom-ийн нэг session-д өгсөн 9 аудитын захиалгыг (full-stack takeover, production
> failure, technical waste, DB at scale, real-world performance, dev/staging/prod
> зөрүү, тестийн чанар, домэйн төлөв, AI drift) НЭГ баримтад нэгтгэв. Сүүлийн
> заавар: *"DO NOT start randomly fixing findings — prioritized plan, then implement
> ONLY the highest-priority safe changes, validate after each group, CHANGELOG."*
> Мөн technical-waste аудитын заавар: *"Do not perform deletions during this audit"*
> — тиймээс аудитын үед устгалт хийгээгүй, зөвхөн ангилсан. **Дараа нь Tom
> *"phase 6 gaas ehleed uregjluul"* гэж зөвшөөрснөөр PHASE 6 цэвэрлэгээ мөн
> хийгдсэн** (§11, §12-ийн D бүлгүүд).
>
> Нотолгооны зэрэглэл: **CONFIRMED** = кодоос шууд уншигдана; **LIKELY** = код +
> бодит орчны мэдлэг; **POTENTIAL** = нөхцөлөөс хамаарна; **NEEDS VERIFICATION** =
> хэмжилт/гадаад туршилт шаардана.

---

## EXECUTIVE SUMMARY

| Хэмжүүр | Оноо | Тайлбар |
|---|---|---|
| Overall codebase health | **7.5/10** | 65k мөр, 104 тест файл, CI ногоон, type-check/lint цэвэр. Сул тал: 2 аварга файл (`db.ts` 6.9k, `routers.ts` 3.8k), давхардал, баримтын тоо хуучирсан |
| Security | **8/10** | CSRF/CSP/HSTS/RBAC/face proof/idempotency бүгд байна. Дутуу байсан: данс тус бүрийн lockout, дотоод алдааны мессеж клиент рүү, IP-д суурилсан лимит CGNAT-д |
| Performance | **7/10** | Storefront cache + single-flight, pool 25, Cloudflare cache rules, code-split. Сул: 278 KB нэг CSS, admin analytics 29 query кэшгүй, ML загварууд 954 MB VM дээр |
| Architecture | **6.5/10** | Давхарга цэвэр (shared/server/client) ч `db.ts`/`routers.ts` god-file; 3 phone normalizer, 3 absoluteUrl, 3 slugify, 43 messageFrom |
| Maintainability | **6.5/10** | Тайлбар маш их (сайн) ч README/CODEBASE тоонууд хуучирсан; 23 env хувьсагч баримтгүй |
| UX | **7.5/10** | Урсгал бүрэн, loading/empty state байна; admin-д 30 `window.confirm`, checkout нэг мөр 5 KB JSX |
| Testing | **8/10** | 1028 тест, integration бодит DB дээр, E2E 40 тест prod build дээр. Дутуу: QPay callback route-ийн давхар дуудлага, lockout, service worker |

**Confirmed critical (PHASE 0) — 3, бүгдийг энэ session-д зассан.** Дэлгэрэнгүй доор.

> Дээрх оноонууд нь **аудитын мөчийн** байдал. Session дууссаны дараах бодит өөрчлөлт: PHASE 0/1/2 бүрэн, PHASE 3-ын #1, PHASE 4-ийн батлагдсан давхардал, PHASE 6 бүхэлдээ хийгдсэн; бүтэн E2E анх удаа нэг удаад ногоон болсон (өмнө нь дэд багцаар л ажиллуулдаг байсан тул 4 уналт нуугдаж байсан). Үлдсэн нь: PHASE 3-ын хэмжилт шаардсан зүйлс, PHASE 4-ийн том задаргаа (`db.ts`/`routers.ts`), PHASE 5 (амт/дизайн — Tom-ийнх).

---

## 0. Системийн зураглал (товч)

```
browser (React 19 + wouter + TanStack Query, tRPC httpBatchLink, sw.js PWA)
   │  /api/trpc  (superjson, x-admin-tab header, cookie session JWT 365d + sessionVersion)
   ▼
Express (server/_core/index.ts)
   setSecurityHeaders → blockScannerProbes → logRequests → compression → Honeybadger
   → limitApiTraffic (1200/15m/IP, memory; 2026-09-20-нд 300-аас) → CSRF origin check → json 20mb
   → /cdn/* 302→R2 │ /api/payments/{qpay,storepay}/callback │ /api/verify-mn/callback
   → /health (DB ping) │ /api/trpc (appRouter: 16 namespace, ~270 procedure)
   → /sitemap.xml /robots.txt /feeds/google-merchant.xml /og/product/:slug
   → serveStatic (assets immutable 1y, face-models 1w, бусад no-cache) + SPA fallback (renderIndexHtml: SEO/OG/JSON-LD/консент/лого)
   ▼
server/db.ts (264 export, drizzle) ── MySQL HeatWave (ssh tunnel, TLS, UTC session, pool 25)
server/stockLedger.ts (нөөцийн цорын ганц бичигч) │ analytics.ts │ inventory.ts │ transfers.ts
server/_core/scheduler.ts (15 мин tick, 8 job, cluster instance 0 л) │ notifications.ts (outbox → ntfy)
Гадаад: R2 (S3), Brevo (email/SMS), verify.mn (OTP), QPay, StorePay, ntfy, web-push, Facebook OAuth, Honeybadger, Anthropic (moderation, сонголттой), Smart Software (вендор)
```

Эрхийн загвар: `publicProcedure` → `protectedProcedure` → `panelProcedure` (face proof) → `admin|staff|finance|marketing|warehouse|inventory|…Procedure`. Rate limit: strict/phoneVerify DB дээр (`rate_limit_buckets`), moderate/lenient санах ойд.

---

## 1. PHASE 0 — STOP-SHIP (бүгд ЗАССАН)

### P0-1. Нэг сагсыг хоёр захиалга болгох race (CONFIRMED)
- **Problem**: `createOrderFromActiveCart` гүйлгээний төгсгөлд `UPDATE carts SET status='converted' WHERE id=?` — `status='active'` нөхцөлгүй, `affectedRows` шалгадаггүй. Хоёр tab (tab бүр өөрийн `clientRequestId` үүсгэдэг — `useRef(newRequestId())`) зэрэг "Захиалга батлах" дарвал хоёулаа идэвхтэй сагсыг уншиж, нөөцийг хоёр удаа хасаж, хоёр захиалга үүсгэнэ.
- **Evidence**: `server/db.ts` 2080-р мөр; `client/src/pages/Checkout.tsx` 86-р мөр (tab тус бүрийн ID); гарын авлагын дүрэм 9 нь "2 дахь tab" гэж бичсэн ч зөвхөн ИЖИЛ ID-тэй давталтыг л хамгаалдаг.
- **Root cause**: сагсны төлөвийн шилжилт атомик биш (бусад бүх decrement нь `WHERE … >= ? + affectedRows` идиомтой атлаа энэ нэг нь дутуу).
- **Risk of fixing**: бага — хожигдсон гүйлгээ буцаж, худалдан авагчид "сагс аль хэдийн захиалагдсан" гэсэн тодорхой мессеж очно.
- **Risk of not fixing**: давхар захиалга, давхар нөөц хасалт, буцаан олголт.
- **Files**: `server/db.ts`. **Tests**: `checkout-idempotency.integration`, `commerce.database.integration`, `checkout.guest.integration`. **Rollback**: нэг мөр буцаах.

### P0-2. Дотоод алдааны мессеж (SQL/driver) клиент рүү гардаг (CONFIRMED)
- **Problem**: `initTRPC.create()`-д `errorFormatter` байхгүй. tRPC нь `INTERNAL_SERVER_ERROR`-ийн `error.message`-ийг (жишээ: `connect ETIMEDOUT`, `ER_LOCK_WAIT_TIMEOUT: … UPDATE product_variants …`) клиент рүү шууд илгээдэг, клиент `messageFrom(error)` → toast-оор харуулна. Мөн 71 `catch → BAD_REQUEST(error.message)` ороолт нь driver-ийн алдааг ч дамжуулна.
- **Evidence**: `server/_core/trpc.ts` 9-р мөр; `client/src/pages/*.tsx` `messageFrom`.
- **Root cause**: мессежийг "хэрэглэгчид зориулсан" гэж бүх давхаргад таамагласан.
- **Fix**: production-д `errorFormatter` — INTERNAL кодыг, мөн driver/SQL хэлбэртэй мессежийг ерөнхий монгол мессежээр орлуулна (`shared/const.ts INTERNAL_ERR_MSG`). Dev-д хөндөхгүй (stack хэрэгтэй). Цэвэр функц `maskErrorShape` unit-тестлэгдсэн.
- **Risk of fixing**: бага; хүлээгдсэн validation мессеж (монгол өгүүлбэр) өөрчлөгдөхгүй. **Files**: `server/_core/trpc.ts`, `shared/const.ts`, шинэ `server/_core/trpc-errors.test.ts`.

### P0-3. Данс тус бүрийн lockout байхгүй (CONFIRMED)
- **Problem**: login нь зөвхөн IP-д 8/15мин. `login_attempts` бичигддэг ч хэн ч уншдаггүй → олон IP-ээс (proxy, botnet, CGNAT-ийн өөр гарц) нэг дансыг хязгааргүй таана.
- **Fix**: `countRecentFailedLoginAttempts(userId, 15м)` ≥ 10 бол `TOO_MANY_REQUESTS` (нууц үгийг мөн адил шалгасны дараа — timing ялгаа гаргахгүй), оролдлогыг `reason:"locked"`-оор бүртгэнэ. Индекс `login_attempts_user_idx` аль хэдийн бий.
- **Risk of fixing**: бага, гэхдээ **шударгаар хэлэх ёстой худалдаа**: данс тус бүрийн lockout бүхэн зориудын DoS-ын гадаргуу нээдэг — халдагч тодорхой утасны дугаарыг мэдэж байвал 10 буруу оролдлогоор тэр хүнийг **15 минут** нэвтрүүлэхгүй болгож чадна. Хязгаар нь: (a) цонх нь гулсдаг, оролдлого хуучирмагц өөрөө нээгдэнэ (админы гар ажиллагаа шаардахгүй), (b) халдагч хохирогч бүрийг тусад нь, тасралтгүй хийх ёстой, (c) энэ нь хэн нэгний нууц үгийг хязгааргүй таах боломжтой байснаас хамаагүй бага эрсдэл. Илүү зөөлөн хувилбар (IP+данс хосоор, эсвэл алхам алхмаар удаашруулах) руу шилжих нь Tom-ийн шийдвэр — тоог `LOGIN_LOCKOUT_MAX_FAILURES` / `LOGIN_LOCKOUT_WINDOW_MS`-ээс нэг мөрөөр өөрчилнө.
- **Tests**: шинэ `auth.lockout.integration.test.ts` (gate-тэй, бодит DB): өөр өөр IP-ээс 10 буруу → зөв нууц үг ч `TOO_MANY_REQUESTS`; цэвэрлэсний дараа хэвийн нэвтэрнэ.

---

## 2. PHASE 1 — CRITICAL CORRECTNESS (бүгд ЗАССАН)

### P1-1. Хуваалцсан IP (CGNAT/оффис) дээр 9 дэх нэвтрэлт/захиалга блоклогдоно (LIKELY)
- **Evidence**: `strictRateLimit` = 8 оролдлого/15мин/IP, АМЖИЛТТАЙ нэвтрэлт ч тоологддог (`server/_core/trpc.ts`). Монголын үүрэн операторууд CGNAT ашигладаг тул олон хэрэглэгч нэг IP-тэй харагдана; `checkout.createOrder` мөн 8/15мин.
- **Fix**: `login` (20/15мин/IP, + P0-3 данс тус бүрийн lockout) ба `checkout` (20/15мин/IP) тусдаа DB-тэй tier. Бүртгэл/нууц үг сэргээх/enroll strict хэвээр (ховор үйлдэл). `auth.rate-limit.test.ts` босго шинэчлэгдсэн.
- **Risk of not fixing**: нээлтийн урамшууллын үеэр оффис/кампусын хэрэглэгчид 429.

### P1-2. Орхигдсон сагсны сануулга: имэйл унасан ч "илгээсэн" гэж тэмдэглэдэг (CONFIRMED)
- `server/automation.ts` 31-р мөр: `await sendAccountEmail(...); delivered = true;` — буцах утгыг үл хардаг. Brevo 4xx/5xx → харилцагч сануулгаа хэзээ ч авахгүй, мөр `reminderSentAt` бичигдэнэ. **Fix**: буцах утгыг ашиглана; Brevo огт тохируулаагүй бол (лог fallback) тэмдэглэнэ — цаг тутам давтахгүй.

### P1-3. Төлбөрийн төлөв polling төлөгдсөний дараа ч 5с тутам үргэлжилнэ (CONFIRMED)
- `Checkout.tsx` 110: `refetchInterval: qpayInvoice || storepayLoan ? 5_000 : false` — баталгаажсан дэлгэц дээр хэвээр (hook mount-той). 300/15мин IP budget-ийг иддэг. **Fix**: `paymentStatus === "paid"` бол зогсоно.

### P1-4. Service worker `/icons /images /fonts`-ыг cache-first МӨНХӨД хадгална (CONFIRMED)
- `sw.js` тайлбар "нэр нь deploy бүрт солигддог" гэдэг нь зөвхөн `/assets/`-д үнэн. Лого/дүрс солиход буцаж ирсэн зочин хуучныг харна (`CACHE_VERSION` bump хүртэл). Сервер тэдгээрт `no-cache` өгдөг ч SW тойрдог. **Fix**: hash-гүй замуудад stale-while-revalidate; `CACHE_VERSION` → v3.

---

## 3. PHASE 2 — RELIABILITY (алдааны стратегийн аудит)

Гадаад үйлдэл бүрийн стратеги (одоогийн байдал):

| Үйлдэл | Унавал | Timeout | Хариу алдагдвал | 2 удаа | Гажиг өгөгдөл | Дүгнэлт |
|---|---|---|---|---|---|---|
| DB query | throw → tRPC INTERNAL (P0-2 маск) | connectTimeout 30с; query timeout БАЙХГҮЙ | — | — | — | OK; per-query timeout = FUTURE |
| Checkout tx | rollback (нөөц/купон/зээл) | — | `clientRequestId` replay ✅ | unique index ✅ | — | ✅ (P0-1 нэмэгдсэн) |
| QPay invoice/check | throw → BAD_REQUEST | **байхгүй байсан → 15с нэмэв** | callback re-verify ✅ | guarded UPDATE ✅ | `parseQPayPaymentCheck` null-safe ✅ | ✅ |
| QPay callback | 500 → QPay дахин дуудна | — | — | idempotent ✅ | invoice_id ≤128 ✅ | ✅ |
| StorePay | timeout 15с ✅ | ✅ | callback ✅ | ✅ | `readStorepayEnvelope` ✅ | ✅ |
| verify.mn | throw → BAD_REQUEST | **байхгүй → 15с нэмэв** | status poll | consumedAt ✅ | ✅ | ✅ |
| Brevo email/SMS | false + лог, хэзээ ч throw хийхгүй | **байхгүй → 15с нэмэв** | best-effort | — | — | ✅ |
| ntfy | outbox retry 1/5/30/30м, 5 оролдлого, 2ц expire | 5с ✅ | claim guard ✅ | dedupe key ✅ | — | ✅ жишиг хэрэгжилт |
| web-push | 404/410 → устгана, бусад лог | сангийн default | — | — | — | ✅ |
| Campaign send | **Promise.all — нэг DB алдаа бүхлийг таслаж audit мөргүй үлдээдэг → дахин илгээвэл давхардана** | — | fingerprint 10м (audit мөр байвал) | — | — | **зассан: allSettled** |
| Background job | scheduler catch + лог, дараагийн tick retry ✅ | — | — | `runningJobNames` ✅ | — | ✅; дараалсан ажиллагаа (удаан sync бусдыг хойшлуулна) = FUTURE |
| Зураг боловсруулалт | sharp алдаа → BAD_REQUEST ✅ | — | — | — | signature+decode ✅ | ✅ |
| Image safety (avatar) | загвар ачаалагдахгүй бол ТАТГАЛЗАНА (fail-closed, санаатай) | 6с | — | — | — | ✅; rate limit нэмэв |
| Text moderation | fail-open (lexical үлддэг) | 6с | — | — | — | ✅ санаатай |
| Facebook OAuth | 10с ✅ | ✅ | state cookie 10м | — | ✅ | ✅ |
| Honeybadger read API | **timeout байхгүй → 10с** | — | — | — | — | зассан |
| OG image fetch | **timeout байхгүй → 10с** | — | disk cache best-effort | — | — | зассан |
| Cache (ttlCache) | compute алдаа дуудагчид | — | single-flight ✅ | — | — | ✅ |
| Analytics pageview | fire-and-forget, хэзээ ч алдаа харуулахгүй ✅ | — | — | — | bot filter ✅ | ✅ |

Swallowed catch-ууд (`.catch(() => undefined)`) бүгд best-effort (SW register, video.play, sweep, push cleanup, OG disk cache) — зөвшөөрөгдөнө. `consumeCheckoutPhoneVerificationSession().catch()` — унавал session дахин ашиглагдах боломж (LOW, тэмдэглэв).

### P2-1. Production env fail-fast (ЗАССАН)
- Өмнө: зөвхөн `JWT_SECRET`. Одоо `assertProductionSecrets`: `DATABASE_URL` байхгүй бол шатна; `INTEGRATIONS_ENCRYPTION_KEY` (64 hex), `S3_*`, `PUBLIC_BASE_URL`, `OWNER_EMAIL` дутуу бол startup-д тод warning (шатахгүй — staging/demo-г хаахгүйн тулд).

### P2-2. Timeout-гүй outbound fetch (ЗАССАН)
- `qpay.ts` ×2, `verifyMn.ts`, `notification.ts` ×2, `honeybadgerReadApi.ts`, `ogImage.ts` → `AbortSignal.timeout`. Тестүүд `vi.stubGlobal("fetch")`-ээр init-ийг үл тоодог тул эвдрэхгүй.

### P2-3. Campaign Promise.all → allSettled (ЗАССАН). P2-4. Avatar upload → strict tier (ЗАССАН).

### Тэмдэглэсэн, ХИЙГЭЭГҮЙ (PHASE 2, дараагийн session)
- ML загварын RSS: BERT 300–500 MB + tfjs + Node суурь vs pm2 `--max-memory-restart 700M` (954 MB VM). **NEEDS VERIFICATION** — `pm2 monit`-оор нэг avatar upload + нэг сэтгэгдлийн үед RSS хэмж; 700 давбал `MODERATION_MODEL=0` эсвэл босгыг өсгө. Хэрэв давбал бүх явж буй хүсэлт тасарна — POTENTIAL HIGH.
- Scheduler дараалсан: `inventory-sync` удаашрахад бусад job хойшилно.
- ✅ ХИЙГДСЭН: `express.json` 50mb → **20mb** (upload-ийн дээд нь 14 MB base64).

---

## 4. PHASE 3 — PERFORMANCE (TOP 10; #1 ХИЙГДСЭН, бусад нь санал)

1. ✅ **ХИЙГДСЭН — Blanket 300/15мин/IP tRPC лимит** (`security.ts`). Нотолгоо нь өөрийн E2E suite мөргөсөн явдал (доорх E бүлэг). → **1200**/15мин; бодит үерийг Cloudflare-ийн 150/10с дүрэм ирмэг дээр барина.
2. 🔴 **ХЭМЖИГДСЭН, ЭЗЭМШИГЧИЙН ШИЙДВЭР ХҮЛЭЭЖ БУЙ — ML загварууд энэ VM-д багтахгүй.** Дэлгэрэнгүй §4.1.
3. **`index.css` 278 KB нэг файл** (4424 мөр, бүх хуудас + admin CSS) — эхний ачаалалтын хамгийн том CSS; admin-ий CSS-ийг тусад нь chunk болгох (Tailwind v4-д `@layer`/import хуваах). Хэмжилт хэрэгтэй.
4. **Үндсэн chunk 486 KB (152 KB gzip)** — гарын авлагад бүртгэлтэй; Home эхлээд.
5. **Admin `analyticsReport` = 29 query, кэшгүй** — financeProcedure л дууддаг; 60с cache = хялбар ялалт (FUTURE).
6. **`visitor_sessions` pageview бүрт бичилт** (зөвшөөрөлтэй үед) — оргил ачаалалд DB write; batch/sampling.
7. **`getAdminProducts` 940 мөр бүтнээр** (heavy багана хасагдсан ✅) — 5k+ барааны үед хуудаслалт хэрэгтэй.
8. **Job applications / posts / reviews unbounded** admin жагсаалт — өсөхөөр хуудаслах.
9. **Face-models 33 MB** origin-оос (1 долоо хоног cache ✅, Cloudflare respect-origin ✅) — OK.
10. **Hero preload + fonts self-host ✅**, OG image disk cache ✅ — сайн.

DB pool 25 × 4 процесс = 100/200 ✅. Compression ✅. Assets immutable ✅.

### 4.1 🔴 ML загварын санах ой — VM-д багтахгүй (ХЭМЖИГДСЭН, 2026-09-20)

Аудитын үед энэ нь "NEEDS VERIFICATION" байсан. Одоо бодит тоо байна (production build, `node dist/index.js`, Windows лаптоп дээр хэмжсэн — VM дээр бага зэрэг өөр байж болох ч дараалал нь ижил):

| Төлөв | RSS |
|---|---|
| Сервер сул зогсож байхад (хоёр warm-up ажилласны дараа) | **535 MB** |
| Текстийн toxicity загвар ачаалагдахад (цэвэр probe: 102 → 470) | **+368 MB** |
| Дээр нь зургийн NSFW загвар (probe: 470 → 683) | **+213 MB** |
| Хоёулаа хэрэглэгдсэн процессын тогтвортой түвшин | **680–800 MB** |
| Production хост | **954 MB VM**, pm2 `--max-memory-restart 700M`, дээр нь staging ч ажилладаг |

**Үр дагавар**: boot-ийн дараах эхний сэтгэгдэл (эсвэл буцаалтын шалтгаан, эсвэл барааны асуулт) текстийн загварыг ачаалж, процессыг pm2-ийн хязгаараас хальгана → **pm2 хүсэлтийн дундуур restart хийж, тэр үед явж байсан бүх хүсэлт тасарна**.

⚠️ **Хамгийн чухал нарийн ширийн**: кодын тайлбарт "idle-ийн дараа сулруулдаг тул процесс суурь RAM руугаа буцна" гэж бичигдсэн нь **бодитоор үнэн биш**. `dispose()` нь tensor-уудыг чөлөөлдөг ч RSS үйлдлийн систем рүү буцдаггүй (onnxruntime/tfjs-ийн arena үлддэг): хэмжилтэд "сулруулсны" дараа ч 535 MB хэвээр байв. Тиймээс:
- idle хугацааг богиносгох нь санах ой ХЭМНЭХГҮЙ (эхэндээ 3 минут болгосноо буцаалаа) — зөвхөн дахин ачаалалтын түр оргил (683 → 799 MB ажиглагдсан) нэмнэ;
- цорын ганц бодит хөшүүрэг нь **тухайн процесст загвар огт ачаалагдах эсэх**.

**Хийсэн зүйл** (зан төлөв аюулгүй):
- `warmUpImageSafety` нь boot дээр загвараа ачаалаад **10 минут санах ойд үлдээдэг** байсан (`touch()`), текстийнх нь шууд сулруулдагтай зөрчилдсөн асимметр — одоо хоёулаа шалгаад шууд сулруулна.
- `moderationModel.ts` boot дээр хостын RAM-ыг хараад 1.5 GB-аас бага бол **`pm2 logs`-д тод сэрэмжлүүлэг** бичнэ (хэмжсэн тоо + 3 сонголт). Цэвэр функц `lowMemoryWarning` нь gate-гүй unit тесттэй — 954 MB дээр заавал ажиллахыг бэхэлсэн.

**Tom-ийн шийдэх 3 сонголт**: (1) VM-ийн RAM нэмэх (хамгийн цэвэр), (2) `MODERATION_MODEL=0` — локал BERT унтарна, монгол хэлний lexical шүүлт (гол хэрэгцээ) хэвээр, `ANTHROPIC_API_KEY` байвал олон хэлний давхарга ч хэвээр, (3) pm2-ийн хязгаарыг 850M болгож ухамсартайгаар эрсдэл хүлээх (VM 954 MB тул OOM-ийн зай багасна).

---

## 5. DB аудит (сая мөрийн масштабаар)

**DATA INTEGRITY**: мөнгө бүгд `int` MNT (float байхгүй ✅); хямдрал `Math.round` нэг газар бүрт ✅; UTC session ✅; `timestamp` секундын нарийвчлал (дүрэм баримтад ✅). FK-гүй: `users.branchId`, `discount_code_redemptions.orderId` (LOW). Soft delete: `posts.deletedAt` — 9 `from(posts)`-оос 3 нь шүүнэ (бусад нь admin trash/restore, шалгасан — OK). Enum-ууд DB түвшинд ✅; `paymentStatus=paid ∧ status=cancelled` ЗӨВШӨӨРӨГДӨНӨ — санаатай ("refund owed" төлөв, `shared/orders.ts`).

**CONCURRENCY**: атомик guard-ууд: нөөц ✅, купон ✅, per-customer купон (unique slot) ✅, зээл ✅, захиалгын дугаар retry ✅, payment callback ✅, verify.mn session ✅, notification claim ✅. **Дутуу байсан**: сагсны conversion (P0-1 зассан). `findRecentCampaignSend` CHECK→SEND (10 минутын цонх; audit мөр гэрч) — давхар товшилтод хангалттай, зэрэгцээ хоёр admin-д биш (LOW). `updateProductVariant stockQuantity: quantity` (5432) — admin абсолют утга, ledger-ээр дамждаг эсэхийг PHASE 2-т шалгах.

**PERFORMANCE**: индексүүд бүрэн (98); `orders(userId)`+PK cursor ✅; `login_attempts(userId, createdAt)` composite байвал lockout query илүү (одоо userId индекс + шүүлт — 12 сарын retention-той тул OK). `findUserByPhone` fallback REGEXP full-scan зөвхөн legacy мөрөнд ✅. Offset pagination: admin users (OK), catalog list (940 → OK).

**MIGRATION**: `drizzle/meta` байхгүй (гараар, баримттай); staging-д гараар (дүрэм ✅); `schema-drift-check.ts` ✅.

**SCHEMA DESIGN**: үнэ хоёр газар (`products.priceMnt` + `product_variants.priceMnt`, дүрэм баримттай) — урт хугацаанд variants л эх сурвалж байх ёстой; `login_attempts.email` багана утас хадгалдаг (нэр хуучирсан, LOW).

---

## 6. Dev / staging / production зөрүү

| Зүйл | Dev | Prod | Эрсдэл |
|---|---|---|---|
| CSP | байхгүй (Vite inline) | nonce-тэй бүрэн | inline script-ийн алдаа зөвхөн prod-д — `demo.ps1`/E2E prod build дээр ✅ |
| Порт | 20 порт сканнердана | тогтмол, завгүй бол унана ✅ | — |
| Cookie secure | `req.protocol` (trust proxy 1, cloudflared X-Forwarded-Proto) | ✅ | — |
| Callback URL | Host header fallback | `PUBLIC_BASE_URL` | P2-1 warning нэмэв |
| Secrets | random dev fallback (JWT), throw (crypto) | `assertProductionSecrets` (P2-1 өргөтгөв) | ✅ |
| Face gate | `.env`-д 1 байж болно | 1 | E2E `E2E_FACE_GATE` тусдаа ✅ |
| Dev-only route | `/__admin-preview` (`import.meta.env.DEV` — tree-shake ✅), `?historyQa` (DEV ✅) | байхгүй | ✅ |
| Test-only env | `GUEST_CHECKOUT_OTP=0` (аппын код уншдаг!) | тавихгүй | ⚠️ prod `.env`-д санамсаргүй `0` тавибал зочны OTP унтарна — баримтад нэмэв |
| Staging migration | — | гараар | дүрэм ✅ |
| Баримтгүй env | 23 хувьсагч (QPAY_*, BREVO_*, VAPID_*, FACEBOOK_*, MODERATION_*, …) | | README-д хүснэгт нэмэв |

`localhost` hardcode: зөвхөн dev лог/`isPrivateHost`. Permissive CORS: байхгүй (same-origin; CORS header огт тавьдаггүй ✅). Mock API: байхгүй. Test account: байхгүй (ci-seed зөвхөн салбар).

---

## 7. Тестийн аудит

- 94 vitest файл (57 gate-тэй integration, бодит DB), 40 E2E (prod build, staging схем), mock ердөө 13 файлд (env/db/notification/web-push) — mock хэтрээгүй ✅. Skip: 3 (нөхцөлт, зөв). Сул assertion: 7 `toBeDefined()` (LOW).
- Хамрагдсан өндөр эрсдэл: auth (OTP, session version, logout), RBAC матриц (`rbac.integration`), checkout idempotency, order unwind/refund/self-cancel, stock ledger, transfers, gift card, discount cap race, verify.mn race, face idle/handoff, notifications claim.
- **Дутуу байсан** (энэ session-д нэмсэн): данс lockout; tRPC алдааны маск. **Дутуу хэвээр** (санал): QPay callback route-ийн HTTP түвшний давхар дуудлага (одоо зөвхөн pure `decideCallbackOutcome` + db idempotency тусдаа); sendCampaign-ийн хэсэгчилсэн алдаа; SW cache стратеги (Playwright-аар offline/SWR); `assertProductionSecrets` unit.
- Хамгийн бага өндөр үнэ цэнэтэй багц: `rbac`, `checkout-idempotency`, `order-unwind`, `stock-ledger`, `auth.session-versioning`, `auth.lockout`, `qpay`+`storepay` unit, `face-idle`, E2E `cart`+`admin`.

---

## 8. Домэйн төлөв ба зөрчил

**Захиалга** `pending→confirmed→packed→out_for_delivery→completed`, `cancelled` (completed-оос биш), `returned` (completed-оос) — `updateAdminOrder` forward-only ladder + `shouldRestoreStock`. Төлбөр `unpaid→paid→refunded`. Зөвшөөрөгдсөн "зөрчилтэй" хослол = бизнесийн бодит төлөв: `cancelled+paid` (refund owed), `returned+paid` (refundable). `completed+unpaid` (COD-оор хүргэсэн ч төлбөр бичээгүй) — DB зөвшөөрнө, UI `PaymentStatePill` харуулна (тэмдэглэв, LOW).
**Мөнгөний эх сурвалж**: сервер (`createOrderFromActiveCart`) цорын ганц; клиент бүх preview-г серверээс асуудаг (routine/coupon/loyalty), хүргэлтийн дүрэм `shared/delivery.ts` нэг ✅. Орлого = `settledSaleSql` ✅. Нөөц = ledger ✅.
**Зөрчил олдсон**: (1) утасны дугаарын нормчлол 4 хэрэгжилттэй — `normalizePhoneForVerifyMn` (server), `normaliseMongolianMobile` (shared), `normalizePhoneForSms` (Brevo формат), `Checkout.tsx digitsOf` — ижил оролтод ижил үр дүн өгөх ёстой ч тус тусдаа (PHASE 4). (2) `Shop.tsx` хайлтын горимд category/skin/stock/sort клиент дээр, энгийн горимд сервер дээр — хоёр хэрэгжилт, `catalog.search` 200 мөрийн cap-тай (санаатай, баримттай).

---

## 9. AI drift / давхардал (PHASE 4 — батлагдсан 3 нь ХИЙГДСЭН, үлдсэн нь санал)

| Дэд систем | Current source of truth | Duplicate/legacy | Санал |
|---|---|---|---|
| Утасны нормчлол | `shared/mobile.ts` байх ёстой | `verifyMn.ts`, `notification.ts`, `Checkout.tsx` | нэг shared функц + формат хувиргагч |
| Slug | `shared/slugify.ts` | `AdminWorkspace`, `AdminBranchesPanel`, `AdminRoutinesPanel` 3 хуулбар | shared-ийг импортлох |
| skinTypeLabels | `shared/catalog-filter.ts` | `AdminWorkspace.tsx:151` | импорт |
| absoluteUrl | нэг байх ёстой | `indexHtml.ts`, `routeMeta.ts`, `ogImage.ts` | `_core/publicUrl.ts` |
| Escape | — | `escapeAttribute`, `escapeXml`, `merchantFeed` escape, `site-documents escapeHtml` | `shared/escape.ts` |
| Upload boilerplate | `_core/imageUpload.ts` | `routers.ts` ×4 + avatar + receipt | `readImageUpload(input, maxBytes)` |
| Callback limiter | `checkRateLimit` | `limitQPayCallbackTraffic`/`limitVerifyMnCallbackTraffic` copy-paste; StorePay QPay-ийнхийг хуваалцдаг (тайлбар "тусдаа" гэдэг нь худал) | нэг factory |
| Алдааны мессеж | — | `messageFrom` 43 файлд | `client/src/lib/errors.ts` |
| Сервер entry | `server/_core/index.ts` | **`server/index.ts`** (Manus-ийн хуучин, API-гүй static сервер, хэн ч импортлодоггүй) | устгах (PHASE 6) |

Хуучирсан тайлбар/баримт: README (43 хүснэгт/61 migration/578 тест/"Aiven"), CODEBASE.md (55 хүснэгт, db.ts 5,528 мөр, routers 2,970, 83 тест файл) — бодит: 65 хүснэгт, 87 migration, 104 тест файл, db.ts 6,894, routers.ts 3,757. README-г засав; CODEBASE тоог засав.

---

## 10. PHASE 5 — UX/A11y (санал; амт/дизайны шийдвэр Tom-ийнх тул хийгээгүй)
- Admin-д 30 `window.confirm` — ажиллана, гэхдээ гар/скрин-ридерт тохиромжгүй, загваргүй; нэг `ConfirmDialog` (Radix Dialog аль хэдийн байна).
- `Checkout.tsx` 246-р мөр = 5 KB нэг мөр JSX; validation зөвхөн toast (талбар тус бүрийн алдаа байхгүй).
- `ProductDetail` route param байхгүй үед hardcode slug fallback (`hada-labo-…`) — 404 руу явах ёстой (LOW).
- Skip link, aria-live, focus — байна ✅; pinch-zoom ✅; контраст AA хэмжигдсэн ✅.

---

## 11. PHASE 6 — CLEANUP (Tom: *"phase 6 gaas ehleed uregjluul"* → ХИЙГДСЭН)

Устгал бүр дөрвөн давхаргаар батлагдсан: (1) статик импорт, (2) **хувьсагч/template-тэй динамик `import()`** — репо даяар 0 олдсон тул импортын мод бүрэн эрх мэдэлтэй, (3) config / script / e2e / `components.json` / HTML-ийн мөр лавлагаа, (4) баримтын лавлагаа (хуучирсныг нь тэмдэглэв).

| Зүйл | Нотолгоо | Ангилал | Төлөв |
|---|---|---|---|
| `server/index.ts` | хэн ч импортлодоггүй; build/dev хоёул `_core/index.ts`. Manus-ийн үеийн API-гүй статик сервер | SAFE | ✅ устгав |
| `client/public/sitemap.xml` | Manus host заасан статик; `/sitemap.xml` динамик route статикаас ӨМНӨ бүртгэгддэг. **Ажиллаж буй production сервер дээр батлав**: устгасны дараа `/sitemap.xml` → 200 `application/xml`, 1020 `<loc>`, `sugi.karkaron.com` | SAFE | ✅ устгав |
| `careers-small.png` (root) | commit 2366e01-д санамсаргүй; лавлагаа 0 | SAFE | ✅ устгав |
| `admin/AdminDeltaPill.tsx`, `home/SectionEyebrow.tsx`, `hooks/useComposition.ts`, `hooks/useMobile.tsx` | импорт 0. `SectionEyebrow`-ийн хэв маягийг 2026-09-11-нд нүүрнээс "буулгасан" (NEWVISION.md §2) — файл нь үлдчихсэн байв | SAFE | ✅ устгав |
| `.section-heading` / `.section-heading-light` CSS (9 мөр) | ЗӨВХӨН `SectionEyebrow.tsx` бичдэг байв; CSS-ийн тайлбар "CategoryMasonry/StoreLocator ашигладаг" гэсэн нь ХУДАЛ (тэд хоёул `SectionHeading` → `.editorial-heading`). Админы HTML `class` атрибут авч явдаггүй (`sanitizeHtml`-д зөвшөөрөгдөөгүй) тул аль ч замаар хүрэхгүй | SAFE | ✅ устгав |
| `shared/const.ts AXIOS_TIMEOUT_MS` | axios dependency биш; импорт 0 | SAFE | ✅ устгав |
| `@assets` alias → `attached_assets/` | хавтас байхгүй; `@assets` импорт 0 (`vite.config.ts`, `vitest.config.ts`) | SAFE | ✅ устгав |
| `patches/wouter@3.7.1.patch` + `patchedDependencies` | patch нь `window.__WOUTER_ROUTES__` цуглуулдаг; тэр глобалыг УНШДАГ газар репо даяар 0 | PROBABLY SAFE | ✅ устгав (`pnpm install`; `node_modules/wouter` унпатчлагдсаныг + routing-ийг E2E-ээр батлав) |
| `next-themes` | зөвхөн `ui/sonner.tsx`; гэхдээ next-themes-ийн Provider апп-д **огт mount хийгддэггүй** тул `useTheme()` үргэлж `undefined` → `theme="system"` байсан | PROBABLY SAFE | ✅ устгав (sonner-т `theme="system"` тогтмолоор — зан төлөв байт-ижил) |
| `@types/google.maps` | `google.maps` хэрэглээ 0 | SAFE | ✅ устгав |
| `autoprefixer`, `postcss` (devDeps) | Tailwind v4 (`@tailwindcss/vite`); `postcss.config.*`, `tailwind.config.*` хоёулаа байхгүй | SAFE | ✅ устгав (`pnpm.overrides`-ийн `postcss` floor ҮЛДСЭН — transitive хувилбар 8.5.28 хэвээр) |
| `shared/job-application-form.ts` (284 мөр) | импорт 0; толгойд "БЭЛЭН ТОДОРХОЙЛОЛТ, ЗАЛГААГҮЙ" (2026-09-15, 3 алхмын төлөвлөгөөтэй) | **KEEP** | хэвээр |
| `archive/*.md` (10), root-ийн 13 `.md` (HISTORY 710 KB) | баримт; кодод нөлөөгүй | **KEEP** | хэвээр (docs/ руу зөөх нь Tom-ийн шийдвэр) |
| `login_attempts.email` нэр (утас хадгалдаг) | rename = migration + бүх уншигч | **KEEP** | хэвээр |
| `.env.example` | README холбодог ч файл БАЙХГҮЙ; туслах `.env*` бичих эрхгүй (permission deny) | **Tom үүсгэнэ** | README-д бүх хувьсагчийг жагсаав |

**Бодит хэмжсэн үр дүн** (тооцоо биш): үндсэн JS chunk **498.46 → 497.46 kB** (gzip 157.69 → 157.28), CSS 284.47 kB хэвээр (9 мөр нь хэмжигдэхээргүй), **файл −9**, **шууд dependency −4** (`next-themes`, `@types/google.maps`, `autoprefixer`, `postcss`), **patch −1**, config −3 мөр. Хамгийн үнэ цэнэ нь байтад биш: хоёр дахь сервер entry, үхсэн sitemap, худал CSS тайлбар, дуудагддаггүй 4 компонент/hook нь дараагийн уншигчийг (хүн ч бай, AI ч бай) төөрүүлэх эрсдэл байв.

---

## 12. CHANGELOG (энэ session-д ХИЙСЭН өөрчлөлт)

Бүлэг бүрийн дараа `pnpm check` + `pnpm lint` + холбогдох тест бодит DB дээр; төгсгөлд `pnpm build` + E2E.

**Бүлэг A — аюулгүй байдал / өгөгдөл (PHASE 0 + P1-1)**
| Файл | Өөрчлөлт |
|---|---|
| `server/db.ts` | `createOrderFromActiveCart`: `carts` `active→converted` UPDATE-д `status='active'` guard + `affectedRows` шалгалт (P0-1); шинэ `countRecentFailedLoginAttempts(userId, windowMs)` (P0-3) |
| `server/_core/trpc.ts` | `errorFormatter` + экспортлогдсон цэвэр `maskErrorShape` (P0-2); шинэ `loginRateLimitedProcedure` (20/15м), `checkoutRateLimitedProcedure` (20/15м) (P1-1) |
| `shared/const.ts` | `INTERNAL_ERR_MSG` |
| `server/routers.ts` | `auth.login` → login tier + данс lockout (10 буруу/15м, `reason:"locked"`); `checkout.createOrder` → checkout tier; `profile.uploadAvatar` → strict tier (P2-4) |
| `server/auth.rate-limit.test.ts` | босго 8→20 (тайлбартай) |
| `server/_core/trpc-errors.test.ts` (шинэ) | маскын 4 тест: INTERNAL, driver/SQL хэлбэр ×8, хэрэглэгчийн мессеж хэвээр ×5, dev-д хөндөхгүй |
| `server/auth.lockout.integration.test.ts` (шинэ) | өөр өөр IP-ээс 10 буруу → зөв нууц үг ч TOO_MANY_REQUESTS; цэвэрлэсний дараа хэвийн |

Шалгалт: `pnpm check` ✅ · `pnpm lint` ✅ · 8 файл / 201 тест ✅ (trpc-errors, auth.rate-limit, auth.lockout, checkout-idempotency, commerce.database, checkout.guest, router-shape, rbac) — 121 с.

**Бүлэг B — найдвартай байдал (PHASE 1/2)**
| Файл | Өөрчлөлт |
|---|---|
| `server/_core/context.ts` | `assertProductionSecrets`: `DATABASE_URL` шатна; `INTEGRATIONS_ENCRYPTION_KEY`/`S3_*`/`PUBLIC_BASE_URL`/`OWNER_EMAIL` warning (P2-1) |
| `server/qpay.ts` (×2), `server/verifyMn.ts`, `server/_core/notification.ts` (×2), `server/_core/honeybadgerReadApi.ts`, `server/_core/ogImage.ts` | `AbortSignal.timeout` 15с / 10с (P2-2) |
| `server/automation.ts` | орхигдсон сагс: `sendAccountEmail` буцах утгыг ашиглана; Brevo тохируулаагүй бол лог fallback-ийг "илгээсэн"-д тооцно (P1-2) |
| `server/routers.ts` | `sendCampaign`: `Promise.all` → `allSettled` (P2-3) |

**Бүлэг C — клиент (PHASE 1)**
| Файл | Өөрчлөлт |
|---|---|
| `client/src/pages/Checkout.tsx` | `refetchInterval` функц хэлбэр: paid болмогц зогсоно (P1-3) |
| `client/public/sw.js` | `CACHE_VERSION` v3; зөвхөн `/assets/` cache-first; `/fonts /icons /images` stale-while-revalidate (P1-4). ⚠️ Эхний хувилбарт `event.waitUntil` дутуу байсныг өөрийн дахин уншилтаар олж зассан: түүнгүйгээр хөтөч кэшлэгдсэн хариуг өгмөгц service worker-ээ зогсоож, шинэчлэлт тасарч болох тул энэ нь **бодитоор cache-first хэвээр үлдэх** эрсдэлтэй байв — өөрөөр хэлбэл засвар нь өөрөө ажиллахгүй байж магадгүй байсан |

Шалгалт B+C: `pnpm check` ✅ · `pnpm lint` ✅ · 9 файл / 42 тест ✅ (qpay, storepay, verifyMn ×2, notification, automation, campaigns, order-notifications, context, checkout-otp) — 44 с · `pnpm build` ✅ (18.5 с) · E2E desktop `cart`+`storefront`+`pwa-install` 16/16 ✅ (35 с, staging схем).

**Баримт**: README тоонууд (65 хүснэгт / 87 migration / 281 procedure / 107 тест файл), HeatWave; CODEBASE.md (мөрийн тоо, tier, errorFormatter, 2 шинэ дүрэм); PROJECT-GUIDE.md (session бичлэг + 4 дүрэм); HISTORY.md (энэ session).

**Бүтэн suite** (`RUN_AUTH…=1 COMMERCE…=1 RUN_MEDIA…=1`, `--no-file-parallelism`, 1028 с): 107 файл, **1030 passed / 5 skipped**, эхний run-д 1 уналт + 1 файлын алдаа — хоёулаа шинжлэгдэж зассан, хоёуланд нь suite-ийг сулруулаагүй:
- `server/_core/context.test.ts` — "JWT_SECRET тавигдсан бол шидэхгүй" тест нь ENV mock-доо `databaseUrl` өгдөггүй байв; шинэ гэрээгээр (P2-1) `DATABASE_URL` мөн заавал. Mock-ыг шинэчилж, **2 шинэ тест** нэмэв: `DATABASE_URL`-гүй бол шиднэ; сонголттой 4 хувьсагч дутуу бол яг 4 warning мөр.
- `server/admin-today-roundtrip.integration.test.ts` — хатуу бичсэн утас `"88110077"` (`users.phone` UNIQUE) 2026-09-17-ны тасарсан run-ий үлдэгдэл мөртэй (users #7540, `rtmu5naabg-c@example.invalid`, prod DB) мөргөлдөв. Тестийг per-run утастай болгов (гарын авлагын "хатуу бичсэн ID" дүрэм). ⚠️ Үлдэгдэл мөр #7540-ийг устгаагүй — Tom `scripts/test-residue-purge.ts`-ээр эсвэл гараар.

**Бүлэг D1 — PHASE 6 файлын цэвэрлэгээ** (Tom зөвшөөрсний дараа; §11-ийн нотолгоо)
| Файл | Өөрчлөлт |
|---|---|
| `server/index.ts`, `client/public/sitemap.xml`, `careers-small.png`, `admin/AdminDeltaPill.tsx`, `home/SectionEyebrow.tsx`, `hooks/useComposition.ts`, `hooks/useMobile.tsx` | устгав (`git rm`) |
| `client/src/index.css` | `.section-heading` / `.section-heading-light` 9 мөр устгав; яагаад үхсэн байсныг тайлбарлах тэмдэглэл үлдээв |
| `shared/const.ts` | `AXIOS_TIMEOUT_MS` устгав |
| `vite.config.ts`, `vitest.config.ts` | `@assets` alias устгав (`attached_assets` хавтас байхгүй) |

Шалгалт D1: `pnpm check` ✅ · `pnpm lint` ✅ · `pnpm build` ✅ (7.2 с).

**Бүлэг D2 — PHASE 6 dependency цэвэрлэгээ**
| Файл | Өөрчлөлт |
|---|---|
| `client/src/components/ui/sonner.tsx` | `next-themes`-ийн `useTheme()` → `theme="system"` тогтмол (Provider огт mount хийгддэггүй тул зан төлөв байт-ижил) |
| `package.json` | `next-themes`, `@types/google.maps`, `autoprefixer`, `postcss` хасав. `pnpm.overrides`-ийн `postcss` floor ҮЛДСЭН |
| `pnpm-workspace.yaml`, `patches/` | `patchedDependencies: wouter@3.7.1` + patch файл устгав |
| `pnpm-lock.yaml` | `pnpm install` (patchedDependencies, 4 багц хасагдсаныг баталсан) |

Шалгалт D2: `pnpm check` ✅ · `pnpm lint` ✅ · `pnpm build` ✅ · **ажиллаж буй production сервер** (staging схем, порт 3106) дээр 10 route ✅ — `/sitemap.xml` 200/`application/xml`/1020 `<loc>`, `/robots.txt` 200, `/favicon.ico` 302, `/`, `/shop`, `/product/*`, `/admin`, `/journal`, үл мэдэгдэх зам бүгд 200 HTML · бүтэн E2E (desktop + mobile) — wouter унпатчлагдсаны дараах routing бүгд ажилласан, гэхдээ ЭНЭ run дээр **4 тест унасан** нь тусдаа, өмнөөс байсан хоёр асуудлаас үүдэлтэй байв (доорх E бүлэг).

**Баримт (D)**: audit §11 бүрэн дахин бичигдсэн (нотолгоо + төлөв + бодит хэмжилт), CODEBASE.md hooks жагсаалт, NEWVISION.md §2 тэмдэглэгээ, PROJECT-GUIDE session бичлэг, HISTORY "PHASE 6" хэсэг.

**Бүлэг E — PHASE 6-ийн бүтэн E2E run илрүүлсэн хоёр зүйл**

D2-ийн дараа E2E-г анх удаа **бүтнээр** (desktop + mobile, 80 тест) ажиллуулахад 4 тест унав. Шалгасны эцэст хоёулаа **миний өөрчлөлтөөс БИШ**, өмнөөс байсан нуугдмал алдаа болох нь тогтоогдов:

1. **Аппын өөрийн blanket rate limit өөрийнх нь тест багцыг блоклож байв** (PHASE 3 #1-ийн бодит нотолгоо). 3 mobile тест `429 Too Many Requests` → клиент `"Unable to transform response from server"` (429-ийн JSON нь tRPC envelope биш). Mobile project нь desktop-ийн ДАРАА ижил IP-ээс ажилладаг тул 300/15мин budget дундуур нь дуусдаг. Баталгаа: серверийг дахин асааж (санах ойн bucket цэвэр) тэр 3 тестийг ажиллуулахад **бүгд давсан**.
   → `server/_core/security.ts`: `MAX_REQUESTS` 300 → **1200**/15мин/IP. Үндэслэл кодын тайлбарт: (a) өөрийн suite мөргөсөн нь CGNAT-ийн бяцхан хувилбар, (b) telemetry tier 600/15мин зөвшөөрдөг атлаа нийт таг 300 байсан нь дотоод зөрчил, (c) Cloudflare ирмэг дээр 150/10с блоклодог. Нэвтрэх/checkout/OTP-ийн чанга, DB дээр тоологддог tier-үүд хөндөгдөөгүй.
2. **`e2e/admin-delete-order.spec.ts` сонгогчийн алдаа** (зөвхөн mobile). `getByPlaceholder(/хайх/i).first()` нь тухайн хэсгийн хайлт биш **глобал командын цонхны** талбарыг олж, түүнд бичихэд панель дахин mount хийгдэж view mode "жагсаалт" → "самбар" руу буцдаг; устгах товч зөвхөн жагсаалт горимд байдаг тул карт олдохгүй. Хуудасны snapshot-оор Kanban багануудыг (ХҮЛЭЭГДЭЖ БАЙНА 4 … ЦУЦАЛСАН 1) харж батлав. → сонгогчийг `getByPlaceholder("Дугаар, хэрэглэгч, утас хайх")` болгов (assertion сулраагүй, эсрэгээрээ `if visible` хамгаалалтыг хассан тул бодит регресс баригдана).

3. **ESLint нь Playwright-ийн тайлангийн вендор bundle-уудыг шалгаж эхэлдэг байв.** Уналттай run нь trace-ийг хадгалахдаа trace viewer-ийн 32 minified JS-ийг `playwright-report/trace/`-д хуулдаг; ESLint `.gitignore`-ийг уншдаггүй тул дараагийн `pnpm lint` **3,977 худал алдаа** өгөв (`'define' is not defined`, `'self' is not defined` …). Өмнө нь сэжиггүй байсан учир нь энэ session хүртэл бүх E2E run ногоон дуусч, trace огт үүсээгүй.
   → `eslint.config.js`-ийн `ignores`-д `playwright-report/**`, `test-results/**`, `blob-report/**` (гурвуулаа `.gitignore`-д аль хэдийн бий). Дүрэм огт сулруулаагүй — зөвхөн вендорын гаралтыг хассан.

⚠️ Үүнээс гарах дүгнэлт: **E2E-г бүтнээр нь нэг удаад ажиллуулж байж л ногоон гэж хэлж болно** — дэд багцаар (`--project=desktop <файл>`) ажиллуулахад эдгээрийн аль нь ч илрэхгүй байв. Мөн **уналттай E2E run-ий ДАРАА lint дахин ажиллуулж үзэх** нь энэ config цоорхойг илрүүлсэн.

**Бүлэг F — PHASE 4-ийн БАТЛАГДСАН давхардал (зан төлөв хөндөгдөөгүй)**

Зөвхөн үсэг үсгээрээ ижил болохыг нь тулгаж баталсан хуулбаруудыг нэгтгэв:

| Давхардал | Байсан | Болсон |
|---|---|---|
| `slugify` | `AdminWorkspace`, `AdminBranchesPanel`, `AdminRoutinesPanel` — гурван ижил inline хуулбар | `@shared/slugify` (сервер талд аль хэдийн ашиглагддаг байсан) |
| `skinTypeLabels` | `AdminWorkspace`-ийн `Record<string,string>` хуулбар | `@shared/catalog-filter`-ийн `Record<SkinType,string>` (нэг дуудлагад `as SkinType` — `any` БИШ) |
| `absoluteUrl` | `indexHtml.ts`, `routeMeta.ts`, `ogImage.ts` — гурван хуулбар | шинэ `server/_core/publicUrl.ts` (`absoluteUrl` + `publicOrigin`); `routeMeta`/`ogImage`-ийн хэрэгцээгүй болсон `ENV` импорт мөн хасагдсан |

⛔ **Утасны нормчлолыг НЭГТГЭЭГҮЙ** — тулгаж үзэхэд дөрвүүлээ өөр, ЗОРИУДЫН гэрээтэй нь батлагдав: `normaliseMongolianMobile` (`shared/mobile.ts`) зөвхөн жинхэнэ гар утас (`[5-9]` prefix) хүлээн авч 976-г яг 11 оронтой үед хасдаг; `normalizePhoneForVerifyMn` нь ДУРЫН 8 орон (суурин дугаар ч) хүлээн авдаг — нэвтрэлтийн identity тэрнээс хамаардаг; `normalizePhoneForSms` нь эсрэгээрээ E.164 (976 угтвартай 11 орон) ГАРГАДАГ. Нэгтгэвэл зарим хэрэглэгч нэвтэрч чадахгүй болох эрсдэлтэй тул зөвхөн баримтжуулав (§9-д үлдэв).

Шалгалт F: `pnpm check` ✅ · `pnpm lint` ✅ · `pnpm build` ✅ (497.46 kB хэвээр) · vitest 5 файл / 63 тест ✅ (index-html, sitemap, router-shape, catalog-validation, site-documents) · **бүтэн E2E 82 passed / 2 skipped / 0 failed** ✅.

**Бүлэг H — commit/push хийх үед илэрсэн: uptime монитор үхсэн байв**

Commit-ийн дараа CI-г шалгах явцад `uptime` workflow **2026-09-18-аас хойш run бүр унаж** байсан нь харагдав (10 минут тутам). Логийг уншихад шалтгаан нь сайт БИШ: Cloudflare-ийн Bot Fight Mode нь GitHub-ийн дата төвийн IP-ээс ирэх probe-д `"Just a moment…"` managed challenge (HTTP 403) буцаадаг. Тэр мөчид бодит сайтыг гараар шалгахад **эрүүл** байв (`/health` → 200, `{"ok":true,"database":"up"}`, 0.57 с).

Өөрөөр хэлбэл хоёр хоногийн турш: (a) бодит мониторинг байхгүй, (b) `NTFY_URL` secret тохируулсан бол Tom-ийн утас руу 10 минут тутам худал "DOWN" дохио явсан. Худал дохио өгдөг монитор нь монитор байхгүйгээс дор — жинхэнэ доголдлыг үл тоомсорлох зуршил суулгадаг.

**Хийсэн** (`.github/workflows/uptime.yml`): probe нь challenge-ийг таньж (`__cf_chl`, `Just a moment`) `blocked=1` гэж тэмдэглэн, мэдэгдлийн гарчиг/биед **"мониторыг хаасан, төлөв ҮЛ МЭДЭГДЭХ"** гэж үнэн зөвөөр бичдэг болов; тайлбарласан User-Agent нэмэв (curl-ийн анхдагч нь хамгийн хүчтэй бот дохио). ntfy-ийн гарчгийг ASCII-гаар үлдээв — репогийн өөрийн `_core/ntfy.ts` "кирилл header найдваргүй" гэж тэмдэглэсэн.

⚠️ **Энэ нь мониторингийг СЭРГЭЭХГҮЙ** — зөвхөн худал дохиог зогсоож, шалтгааныг ил болгоно. Бодит сэргээлт нь Cloudflare-ийн тохиргоо эсвэл мониторингийн чиглэлийг эргүүлэх шийдвэр тул Tom-ийнх (PROJECT-GUIDE §15).

---

### ЭЦСИЙН ГЭРЧИЛГЭЭ (бүх бүлгийн дараа, 2026-09-20)

| Гарц | Үр дүн |
|---|---|
| `pnpm check` (апп + тест/скрипт tsc) | ✅ цэвэр |
| `pnpm lint` | ✅ цэвэр |
| `pnpm build` | ✅ 7.4 с; үндсэн chunk 497.46 kB (gzip 157.28) |
| **Бүтэн vitest** (3 gate идэвхтэй, `--no-file-parallelism`) | ✅ **1038 passed / 2 skipped / 0 failed**, 107 файл БҮГД ажилласан, 1066 с (G бүлгийн дараах эцсийн run) |
| **Бүтэн E2E** (desktop + mobile) | ✅ **82 passed / 2 skipped / 0 failed**, 2.9 мин |
| Ажиллаж буй production сервер (staging схем) | ✅ 10 route, `/sitemap.xml` 1020 `<loc>` |
| `sw.js`-ийн `waitUntil` засварын дараа | ✅ build-д шингэсэн, PWA+storefront E2E 26/26 |
| G бүлгийн дараа (ML санах ой, 20mb, residue) | ✅ check/lint/build цэвэр · moderation+image+media 27 тест · **бүтэн E2E дахин 82 passed / 0 failed** |

**Бүлэг G — хэмжилт, production-ий цэвэрлэгээ (Tom: *"za hiih ystoi zuil baiwal hii"*)**

| Ажил | Үр дүн |
|---|---|
| ML загварын RSS хэмжилт | §4.1 — 🔴 VM-д багтахгүй нь батлагдсан; `warmUpImageSafety`-ийн 10 минутын хадгалалт арилсан; boot дээр сэрэмжлүүлэг + `lowMemoryWarning` unit тест; idle 10 минут хэвээр (богиносгох нь буруу гэдгийг хэмжилт харуулсан) |
| `express.json` 50mb → **20mb** | хамгийн том зөвшөөрөгдсөн бие 14 MB base64; 954 MB хостод 50mb нь зөвхөн эрсдэл байв |
| **Production DB-ийн тестийн үлдэгдэл** | `scripts/test-residue-report.ts` → **4 хэрэглэгч** (бүгд `@example.invalid`), гурав нь `admin` эрхтэй. Эрсдэлийн үнэлгээ: гурван admin мөр нь **нэвтрэх боломжгүй** (утас нь `handoff-…` гэсэн үсэгтэй мөр эсвэл NULL; нэвтрэлт 8 оронтой утас шаарддаг тул zod түвшинд татгалзана), харин `#7540` нь утастай (`88110077`) бөгөөд нууц үг нь тестийн файлд ил бичээстэй — **репо уншсан хүн production-д хэрэглэгчээр нэвтрэх боломжтой байв**. Репогийн өөрийн `test-residue-purge.ts`-ээр (dry run → `--apply`) 4 мөр + 322 дарагдсан мэдэгдэл цэвэрлэгдэж, тайлан бүрэн хоосон болов |
| Junk захиалгын асуулт | Гарын авлагад "бэлгийн картын код үүссэн эсэхийг шалга" гэж бичсэн асуултад хариулав: **`#6802`-д карт үүсээгүй** (төлөгдөөгүй тул). `#6655` нь аль хэдийн устсан байв. `#6802`-ыг устгах нь Tom-ийнх — аппын өөрийн хамгаалалт цуцлагдаагүй захиалгыг устгуулдаггүй |

⚠️ **Үндсэн шалтгаан (тэмдэглэв, засаагүй)**: vitest-ийн integration suite нь `.env`-ийн `DATABASE_URL`-ээр **бодит дэлгүүрийн схемд** (`defaultdb`) бичдэг тул тасарсан run бүр үлдэгдэл үлдээдэг. E2E-г 2026-09-16-нд яг үүний улмаас `sugi_staging` руу зөөсөн. Vitest-ийг мөн зөөх нь боломжтой ч staging-д migration гараар очдог (гарын авлагын дүрэм) тул схемийн синк эхлээд шийдэгдэх ёстой — тусдаа ажил.

**Хийгээгүй, санаатай**: `db.ts`/`routers.ts`-ийн задаргаа, `messageFrom` ×43, upload boilerplate, callback limiter factory, escape helper-үүд (§9); `express.json` limit; ML RSS хэмжилт; `shared/job-application-form.ts`; PHASE 5-ийн амт/дизайны шийдвэрүүд (Tom-ийнх — 2026-09-09-ний "чиглэлгүй редизайн" татгалзлын дагуу).
