# SUGI ASAYAKE — Кодын бүтэн тайлбар

> **Яагаад энэ файл байдаг вэ.** Tom (2026-09-12): *"Learn your code always and create a .md file for explaining your code how they work all of them!! Do not skip even a single code structure!!"* — мөн Reddit-ийн r/nextjs дээрх хамгийн олон санал авсан сэтгэгдэл: *"AI is good at quick scaffolding but it's absolutely useless when it comes to refinement."*
>
> **[CLAUDE.md](../CLAUDE.md)** = одоогийн статус, тохиргоо, анхааруулга. **[HISTORY.md](../HISTORY.md)** = өдөр бүрийн ажлын лог, шийдвэрийн шалтгаан. **Энэ файл = систем хэрхэн АЖИЛЛАДАГ вэ**: файл бүр юу хариуцдаг, өгөгдөл хаанаас хаашаа урсдаг, ямар дүрмийг хэзээ ч зөрчиж болохгүй вэ.
>
> Файл нэмэх/өөрчлөх бүрт энэ баримтыг мөн шинэчилнэ.

---

> 🗺️ Энэ файлын визуал хувилбар (давхаргууд, нэг захиалгын аялал, нөөцийн ledger, эрхүүд, дүрмүүд): https://claude.ai/code/artifact/fed0a0dd-1d77-4d09-a99b-8e3f6cf0908d (2026-09-12)

## 0. Нэг догол мөрөөр

SUGI ASAYAKE бол **нэг Node процесс** дээр ажилладаг онлайн дэлгүүр: Express сервер нь (1) `/api/trpc` дээр tRPC API, (2) production-д статик файл / dev-д Vite, (3) хэдэн тусгай route (`/health`, төлбөрийн callback, `/cdn/*` зургийн proxy)-г үйлчилдэг. Өгөгдөл нь **Aiven дээрх MySQL** (drizzle ORM), зургийн байт нь **Cloudflare R2**. Клиент нь **React + Vite + wouter + TanStack Query (tRPC client)**. Хоёр лаптоп нэг DB, нэг R2-г хуваалцдаг.

Гурван эх сурвалжийн хавтас:

| Хавтас | Хэн ашигладаг | Дүрэм |
|---|---|---|
| `server/` | зөвхөн сервер | Node API (fs, net, crypto) ашиглаж болно |
| `shared/` | сервер БА клиент хоёул | **DOM, Node API хоёуланг нь ашиглаж болохгүй** — цэвэр TypeScript, `@shared/*` гэж import хийгдэнэ |
| `client/src/` | зөвхөн браузер | сервер модулийг шууд import хийхгүй (зөвхөн `shared/` болон tRPC-ийн ТӨРӨЛ) |

---

## 1. Процессын амьдралын мөчлөг — `server/_core/index.ts`

Серверийн цорын ганц эхлэх цэг. Дараалал нь санаатай:

1. `dotenv/config` → `.env` уншина; `NODE_ENV` тохируулаагүй бол `development`.
2. **`assertProductionSecrets()`** (`_core/context.ts`) — production-д `JWT_SECRET` байхгүй бол порт нээхээс ӨМНӨ шатна.
3. Middleware (дараалал чухал):
   - `setSecurityHeaders` → `compression()` → Honeybadger (хамгийн эхэнд байх ёстой гэрээтэй) → `limitApiTraffic` → `protectStateChangingApiRequests` (CSRF) → `express.json({ limit: "50mb" })`.
4. Тусгай route-ууд: `registerStorageProxy` (`/cdn/*`), `registerQPayCallbackRoute`, `registerStorepayCallbackRoute`, `registerVerifyMnCallbackRoute`, `/health` (DB-г бодитоор ping хийнэ), `/favicon.ico` → 302.
5. `/api/trpc` → `createExpressMiddleware({ router: appRouter, createContext })`. `onError` нь **хүлээгдэж буй** алдааг (BAD_REQUEST, UNAUTHORIZED …) Honeybadger руу илгээхгүй — үнэгүй tier-ийг validation-ий үр дүнгээр дүүргэхгүйн тулд.
6. dev бол `setupVite`, production бол `serveStatic`.
7. Порт: `PORT`-оос эхлээд 20 порт сканнердаж сул портыг олно.
8. **Background ажлууд бүртгэгдэнэ** (доорх §7) → `startScheduler()` → `startNotificationDispatcher()`.
9. `unhandledRejection` / `uncaughtException` — процессыг унагаахгүй, лог + Honeybadger.

### Хүсэлтийн зам (tRPC)

```
browser → /api/trpc/<router>.<procedure>
        → createContext (_core/context.ts): cookie-оос session token уншиж user-ийг ачаална
        → procedure-ийн middleware гинж (_core/trpc.ts): эрх + rate limit
        → procedure-ийн код (server/routers.ts эсвэл дэд router)
        → домэйн модуль (db.ts, inventory.ts, transfers.ts …)
        → drizzle → MySQL (Aiven, TLS)
```

---

## 2. `server/_core/` — суурь давхарга (домэйн мэдлэггүй)

| Файл | Юу хийдэг | Мэдэх ёстой нарийн зүйл |
|---|---|---|
| `index.ts` | процессын эхлэл (§1) | ажлын бүртгэл, dispatcher энд эхэлдэг |
| `context.ts` | tRPC контекст: cookie → user | `assertProductionSecrets()` энд; session token JWT. User мөр **5 с cache** (`getSessionUserById`, түлхүүр = user id, token БИШ) — session-ийн эрхийг өөрчилдөг бичигч бүр `forgetSessionUser` дуудна (§8 дүрэм 10) |
| `trpc.ts` | procedure-ийн төрлүүд | `publicProcedure`, `protectedProcedure`, `adminProcedure`, `financeProcedure`, `staffProcedure`, **`inventoryProcedure`** (admin+warehouse+staff), `strictRateLimitedProcedure`. Эрхийн шалгалт бүхэлдээ ЭНД, дэд router-үүд өөрсдөө эрх шалгадаггүй |
| `security.ts` | header, rate limit tier, CSRF | `limitApiTraffic` (IP тутам 300/15мин), `protectStateChangingApiRequests`, `limitQPayCallbackTraffic` |
| `persistentRateLimit.ts` | strict tier-ийн тоолуур **DB дээр** (`rate_limit_buckets`) | олон instance-д ч хүчинтэй, **fail-open** (DB унавал блоклохгүй). Cart/telemetry tier нь санаатайгаар санах ойд |
| `dbConnection.ts` | `planMysqlConnection` — TLS төлөвлөгөө | loopback-оос бусад бүх host-д TLS; `DATABASE_CA_CERT` байвал сертификат шалгана, байхгүй бол шифрлээд warning |
| `crypto.ts` | AES-GCM шифрлэлт | `INTEGRATIONS_ENCRYPTION_KEY` (64 hex) шаардана, байхгүй бол шатна — интеграцийн нууц үг энүүгээр хадгалагдана |
| `password.ts` | `hashPassword` / `verifyPassword` | |
| `cookies.ts` | session cookie-ийн тохиргоо | |
| `ttlCache.ts` | процессын доторх TTL cache | `getOrSetCached`, **`invalidateCached`**. `invalidatedAt` тэмдэг: invalidation-оос ӨМНӨ тооцоолж эхэлсэн үр дүнг хадгалахгүй (write-ийн дундуур явж байсан read хуучин утгыг 30 с "царцаадаг" race). Storefront контент (`STOREFRONT_CACHE_KEYS`, 30 с) + session user (5 с) энд |
| `scheduler.ts` | цорын ганц job хуваарь | нэг `setInterval`, `scheduled_job_runs` хүснэгтээр `lastRunAt`-ыг хардаг. Cron парсер байхгүй |
| `notification.ts` | имэйл илгээх (Brevo) | `deliverEmail` нь **хэзээ ч throw хийхгүй** — үр дүнг буцаана. `notifyOwner`, `sendAccountEmail` |
| `ntfy.ts` | утасны push (ntfy.sh) | JSON POST (кирилл header найдваргүй), 5с timeout, ~3.8KB тайралт, хэзээ ч throw хийхгүй |
| `storageProxy.ts` | `/cdn/*` → R2 | |
| `imageProcessing.ts` / `imageUpload.ts` | sharp-аар хувиргалт, upload-ийн шалгалт | |
| `sanitizeHtml.ts` | админы HTML контентыг цэвэрлэх | |
| `honeybadger.ts` / `honeybadgerReadApi.ts` | алдааны хяналт | түлхүүргүй бол чимээгүй no-op |
| `sqlQueryLog.ts` | Drizzle Logger → ring buffer | админы SQL лог самбар үүнээс уншина |
| `indexHtml.ts` | SSR-гүй HTML бэлтгэх (SEO мета, салбарууд) | `getStorefrontBranches`-ийг ашиглана (агуулах харагдахгүй) |
| `vite.ts` | dev middleware / production static | |
| `env.ts` | бүх орчны хувьсагчийн нэг цэг | `notificationsDispatchEnabled`, `notificationsSuppressed`, `publicBaseUrl`, `adminFaceGateEnabled` … |

---

## 3. `server/` — домэйн модулиуд

### 3.1 `db.ts` (5,528 мөр) — өгөгдлийн үндсэн давхарга
Бүх бизнес query энд. Гол бүлгүүд:

- **Хэрэглэгч/auth**: `createUserWithPassword` (⚠️ хамгийн эхний хэрэглэгч эсвэл `OWNER_EMAIL`-тэй таарвал л admin болно), `findUserByPhone`, session, нууц үг сэргээх, `recordLoginAttempt`.
- **Каталог**: бүтээгдэхүүн/variant/ангилал/брэнд, FULLTEXT хайлт, `getBestsellingProducts` (бодит борлуулалт дуусмагц featured брэндээр дүүргэдэг), `getRecommendedProducts`.
- **Сагс/checkout**: `createOrderFromActiveCart` — энэ функц бол **системийн зүрх**. Хямдралын дараалал: routine → coupon → loyalty → дараа нь дэлгүүрийн зээл (мөнгөтэй адил, хамгийн сүүлд). Нөөцийг `WHERE stockQuantity >= ?` + `affectedRows` шалгалтаар атомикоор хасна; захиалгын дугаар давхцвал 3 хүртэл дахин оролдоно.
- **Idempotency** (2026-09-12): `orders.clientRequestId` (unique) — checkout болон POS (`recordInStoreSale`) хоёулаа browser-ийн UUID авч, ижил түлхүүрт ижил захиалга буцаана (`replayed:true`). `findOrderForClientRequest(db, key, expectedUserId)` эхэнд + `orders_client_request_unique` dup-key дээр (race-ийн алдагч). `findRecentCampaignSend(fingerprint, minutes)` — кампанит ажлын давхар илгээлтийн хамгаалалт (audit log дээр).
- **Захиалгын буцалт**: `updateAdminOrder`, `cancelOwnOrder`, `refundOrder`, `reverseStoreCreditForOrder`. **`settledSaleSql`** (`paid AND status<>'cancelled'`) — орлого гэж юуг тооцохын ЦОРЫН ГАНЦ тодорхойлолт (db.ts 8 газар, analytics.ts 17 газар).
- **Төлбөрийн оролдлого**: `createQPayPaymentAttempt`, `createStorepayPaymentAttempt`, `markQPayPaymentAttemptPaid` (нэр нь түүхэн — **provider-аас хамааралгүй**: хаагдсан/цуцлагдсан захиалгыг сэргээхээс татгалздаг хамгаалалт нь QPay, StorePay хоёуланд хүчинтэй).
- **Салбар/нөөц**: `getStorefrontBranches` (зөвхөн `kind='store'`), `setBranchStock`, `setFulfillmentBranchStock`, `deleteBranch`-ийн хамгаалалт.
- **Интеграц**: `getAdminIntegrations` (талбар бүрийн `isSet`, secret хэзээ ч буцахгүй), `getIntegrationSettings`, `getActiveIntegrationConfig`, `updateAdminIntegration` (**merge** семантик).
- **Мэдэгдэл**: `recordNotification`, `getNotificationFeed`, `markNotificationsSeen`, `purgeNotificationOutbox`.
- **Ledger унших**: `getStockMovementsForVariant`, `getStockLedgerHealth` (drift).

### 3.2 `routers.ts` (2,970 мөр) — API-ийн гадаргуу
`appRouter` = 16 нэрийн зай: `auth`, `catalog`, `loyalty`, `routines`, `promotions`, `reviews`, `content`, `cart`, `checkout`, `telemetry`, `orders`, `profile`, `payments`, `faceAuth`, `admin`, + дэд router `notifications` (`notificationsRouter.ts`), `inventory` (`inventoryRouter.ts`).

🔴 **zod 4 урхи**: `.partial()` дотор `.default()` ХЭРЭГЖДЭГ. Update schema бүр `partialForUpdate()`-ийг ашиглах ёстой — эс бөгөөс илгээгээгүй талбар create-ийн анхдагчаар дарагдана (2026-09-11-нд бодит үндсэн салбарыг хэдэн минут алга болгосон).

### 3.3 Нөөцийн гинж (хамгийн чухал инвариант)

```
аливаа нөөцийн өөрчлөлт
   └─ server/stockLedger.ts   applyBranchStockDelta / setBranchStockAbsolute / recordStockMovement
        ├─ branch_stock (тавиурын тоо)          ┐ НЭГ transaction дотор
        ├─ stock_movements (өөрчлөлт бүрийн мөр) ┘
        ├─ recomputeVariantStockTotal  → зөвхөн countsTowardOnlineStock салбаруудыг нэмнэ = онлайн нөөц
        └─ stock alert (shared/stock-alerts.ts: зөвхөн ДООШОО огтлох үед)
```

⚠️ **`branch_stock`-д шууд бичих код бичиж болохгүй.** Бичвэл Системийн байдал дээр drift гарна (`scripts/stock-ledger-rebaseline.ts --apply` засна).

| Файл | Хариуцах зүйл |
|---|---|
| `stockLedger.ts` | дээрх helper-үүд, `StockShortageError`, `getStockLedgerDrift` |
| `inventory.ts` | хүлээн авалт (`stock_receipts`), тооллого (`stock_counts`), `resolveCodes` (баркод → variant), `getSkuIndex` (937 мөрийг нэг удаа), `assertCanOperateOnBranch` (staff зөвхөн өөрийн салбар), **`createSnapshotCount`** (Smart POS-ын үлдэгдлээс батлах тооллого) |
| `transfers.ts` | агуулах→дэлгүүр шилжүүлэг: draft → sent (`transfer_out`) → blind скан → received (`transfer_in`), зөрүүг admin шийднэ |
| `inventoryRouter.ts` | дээрхийн tRPC гадаргуу (`inventoryProcedure`) |

**Тооллогын дельта** = тоолсон − *анх скан хийсэн үеийн* систем тоо. Ингэснээр тооллогын явцад гарсан борлуулалт алдагдахгүй. `scope:"full"` нь уншуулаагүй барааг 0 болгоно, `"partial"` болгохгүй.

### 3.4 Мэдэгдлийн гинж

```
бизнес код (transaction дотор) → enqueueNotification/recordNotification → notification_outbox
   → server/notifications.ts dispatcher (60с тутам)
       → guarded claim: UPDATE … WHERE status='pending' + affectedRows
       → _core/ntfy.ts → ntfy.sh
       → амжилтгүй бол 1м / 5м / 30м, 5 оролдлого; 2 цагаас хойш expired
```

- Бүлэг: `admin`, `warehouse`, `finance`, `store` (`staff` = дэлгүүрийн зөвлөх).
- **Мессежид харилцагчийн нэр/утас/хаяг ХЭЗЭЭ Ч ОРОХГҮЙ** — `shared/notification-events.ts`-ийн payload төрөл нь ийм талбаргүй тул компилятор өөрөө хамгаална.
- **Dedupe түлхүүр төрлөөр namespace хийгдсэн** (`outboxDedupeKey`): нэг захиалгын "шинэ"/"төлөгдсөн"/"цуцлагдсан" бүгд `order:<id>` ашигладаг тул namespace-гүй бол unique index тэднийг залгина.
- `NOTIFICATIONS_DISPATCH=1` тохируулсан машин л илгээнэ; тестэд `NOTIFICATIONS_SUPPRESS=1`.

### 3.5 Төлбөр

| Файл | Урсгал |
|---|---|
| `qpay.ts` | Basic auth → `/v2/auth/token` → `/v2/invoice` → харилцагч төлнө → callback (`POST`/`GET`, **`"SUCCESS"` биетээр хариулна**) → `checkQPayPayment`-ээр **бид өөрсдөө шалгана** → `decideCallbackOutcome` (дутуу төлбөрийг хэзээ ч баталгаажуулахгүй) |
| `storepay.ts` | 2 хос credential (query дээр app хос, Basic-д үндсэн хос) → `/user/possibleAmount` (checkout дээр сонгомогц боломжит дүнг асууна) → `/merchant/loan` → харилцагч StorePay апп дээрээ зөвшөөрнө → callback → `/merchant/loan/check/{id}`-ээр бид өөрсдөө шалгана. ⚠️ **HTTP 200 = амжилт биш**: `status` талбарыг шалгана (`readStorepayEnvelope`) |

Хоёулаа: **callback-ийн биед хэзээ ч итгэхгүй** — тэр зөвхөн "аль гүйлгээг шалгах вэ" гэдгийг л хэлнэ.

### 3.6 Интеграцууд (`server/integrations/`)

- **`inventorySync.ts`** — вендороос хамааралгүй "гэрээ" + бүртгэл. Урсгалууд: `push` (манай хөдөлгөөн → вендор, 2 минутын хоцролт, `refType='external'` эргэж явахгүй), `sales` (вендорын борлуулалт → манай ledger, `external_refs`-ээр нэг удаа), **`snapshot`** (вендорын үлдэгдэл → **батлах хүлээсэн тооллого**, нөөц хэзээ ч шууд бичигдэхгүй). Бүх функц `SyncOptions {namespace, lagSeconds}` авдаг тул тест бодит cursor-ыг хөндөхгүй.
- **`smartSoftware.ts`** — бодит adapter. OAuth2 password grant; `fetch` БИШ `node:http(s)` (баримтын token дуудлага GET дээр body явуулдаг); token cache; `listLocations`, `pullStockSnapshot`. Вендорын POS API-д **борлуулалтын жагсаалт байхгүй** тул `pullSales` хэрэгждэггүй — шударгаар тэмдэглэсэн.

### 3.7 Бусад
`analytics.ts` (29 экспорт: борлуулалт, дүүрэг, ашиг, CAC, хөрвүүлэлт, буцаалтын хувь, Excel/PDF export), `faceAuth.ts` (админы царайны хаалга — proof cookie 2 deadline-тай: sliding idle 25 мин `exp` + absolute 8 ц `abs`; `refreshFaceProof` зөвхөн бодит оролтын heartbeat-аар, `lockFaceSession` → `face_attempts.idle_locked`; descriptor л сервер рүү ирнэ, гадны API байхгүй), `verifyMn.ts` (SMS баталгаажуулалт), `storage.ts` (S3/R2), `automation.ts` (доорх §7), `notificationOutbox.ts`, `notificationsRouter.ts`, `catalog-validation.ts`, `commerce-lifecycle.ts`.

---

## 4. `shared/` — хоёр талын нэг эх сурвалж

| Файл | Юу |
|---|---|
| `notification-events.ts` | үйл явдал → бүлэг/priority/tag, Монгол мессеж, **PII-гүй payload төрлүүд**, `ubDateKey` |
| `integrations.ts` | provider-ийн жагсаалт + талбарын тодорхойлолт (`INTEGRATION_META`), `validateIntegrationSettings`, `mergeIntegrationSettings` |
| `stock-alerts.ts` | `classifyStockCrossing` — зөвхөн доошоо огтлоход л alert |
| `stock-movements.ts` / `scan-session.ts` / `transfer-reconcile.ts` | хөдөлгөөний Монгол нэр, сканы reducer, шилжүүлгийн тулгалт |
| `barcode.ts` | `normaliseBarcode` (сканнерын tab/CR, зай, зураас), `createScanBuffer` (50мс түлхүүрийн зайгаар сканнерыг хүнээс ялгана) |
| `catalog-filter.ts`, `search-synonyms.ts`, `product-tagging.ts` | хайлт/шүүлт/таг |
| `site-text.ts`, `site-media.ts`, `store-settings.ts`, `legal-documents.ts`, `admin-tips.ts` | админаар засварлагддаг бүх текст/зураг/тохиргоо |
| `delivery.ts`, `districts.ts`, `orders.ts`, `loyalty.ts`, `format.ts`, `slugify.ts` | нэг мөр бизнес дүрэм тус бүр |
| `mobile.ts` | `normaliseMongolianMobile` — checkout StorePay-ийн хариуг бичсэн дугаартай тулгадаг тул хоёр тал ижил дүрэмтэй байх ёстой |
| `face-auth.ts` | descriptor-ийн зай тооцоолол (браузер+сервер ижил) |

---

## 5. `client/src/`

- **`App.tsx`** — wouter route + нэг MutationObserver/IntersectionObserver (scroll reveal) бүх route-д.
- **`pages/`** — Home, Shop, ProductDetail, Checkout, Profile (914 мөр: хаягийн дэвтэр, тохиргоо, аюулгүй байдал), Login, ForgotPassword, MyOrders, TrackOrder, Journal/PostDetail, RoutineDetail, Brands, Legal, NotFound, **AdminDashboard** (→ `AdminWorkspace`).
- **`components/`**
  - Дэлгүүрийн нүүр: `home/*` (HeroImageSlideshow, QuickStatsSection, CategoryMasonry, FeaturedBrandsCarousel, JournalSection, StoreLocatorSection …).
  - Админ: `AdminWorkspace.tsx` (816 мөр — хэсгүүдийн router), `admin/AdminSidebar.tsx`, `admin/AdminTopBar.tsx`, `admin/AdminNotificationBell.tsx`, `admin/AdminCommandPalette.tsx`, `admin/GenericListView.tsx`, панель бүр (`AdminProductsPanel`, `AdminOrdersPanel`, `AdminIntegrationsPanel`, `AdminReceivingPanel`, `AdminAnalyticsPanel`, `AdminSecurityCenter`, `AdminPosPanel` …).
  - Нөөц: `inventory/ScanSession.tsx` (сканы дэлгэц), `inventory/TransfersView.tsx`.
  - `ui/*` — shadcn маягийн суурь элементүүд.
- **`hooks/`** — `useBarcodeScanner` (⚠️ input дээр focus байхад зогсдог), `useScanDraft` (localStorage + 700мс сервер рүү хадгалалт), `useSiteText`, `useStoreSetting`, `useScrollReveal`, `useCategories`, `useMobile`, `useComposition`, `usePersistFn`, `useShopContact`.
- **`lib/`** — `trpc.ts` (client), `faceEngine.ts`, `pageviewTracking.ts`, `trafficSource.ts`, `cookieConsent.ts`, `csv.ts`, `adminTheme.ts`, `scanSounds.ts` …

**Шинэ админ хэсэг нэмэх** = 6 газар: `AdminSection` union, `adminSectionKeys`, `SECTION_ROLES`, 3 гарчгийн ternary, `shared/admin-tips.ts`, `server/admin-tips.test.ts`.

---

## 6. Өгөгдлийн сан — 55 хүснэгт

| Бүлэг | Хүснэгтүүд |
|---|---|
| Хэрэглэгч | `users`, `userAddresses`, `wishlistItems`, `loginAttempts`, `passwordResetTokens`, `emailVerificationTokens`, `phoneVerificationSessions`, `staffInvitations`, `storeCreditLedger` |
| Каталог | `productCategories`, `products`, `productVariants`, `featuredBrands`, `productReviews`, `routines`, `routineSteps` |
| Нөөц | `branches`, `branchStock`, **`stockMovements`**, `stockReceipts(+Lines)`, `stockCounts(+Lines)`, `stockTransfers(+Lines)` |
| Худалдаа | `carts`, `cartItems`, `orders`, `orderItems`, `paymentAttempts`, `discountCodes`, `sitePromotions`, `loyaltyTiers` |
| Контент | `posts`, `postCategories(+Links)`, `postTags(+Links)`, `mediaLibrary`, `siteMedia`, `siteText`, `siteDocuments`, `storeSettings` |
| Аналитик | `visitorSessions`, `marketingSpend` |
| Систем | `integrationConfigs`, `notificationOutbox`, `externalRefs`, `integrationSyncState`, `scheduledJobRuns`, `rateLimitBuckets`, `adminAuditLogs` |
| Царайны хаалга | `faceEnrollments`, `faceChallenges`, `faceAttempts` |

**Migration**: `drizzle/00NN_*.sql`-ийг гараар бичээд `pnpm exec tsx scripts/db-apply-migration.ts drizzle/00NN_*.sql`. `drizzle/schema.ts`-ийг мөн адил гараар шинэчилнэ. ⚠️ Хоёр лаптоп нэг DB хуваалцдаг тул **DB шинэ, код хуучин** байдал чимээгүй үүсдэг.

---

## 7. Background ажлууд (`server/automation.ts` + `_core/scheduler.ts`)

| Ажил | Давтамж | Юу хийдэг |
|---|---|---|
| `abandoned-cart-reminder` | 1 цаг | 24ц+ хөдөлгөөнгүй сагсанд имэйл |
| `low-stock-owner-digest` | 20 цаг | бага нөөцийн имэйл + `stock.low_digest` push (UB өдрөөр dedupe) |
| `stock-ledger-drift` | 1 цаг | ledger ≠ тавиур бол admin-д мэдэгдэнэ |
| `stale-transfer-reminder` | 6 цаг | 48ц хүлээн аваагүй шилжүүлэг |
| `inventory-sync-smartsoftware` | 15 мин | Smart POS-ын үлдэгдэл → батлах тооллого (идэвхтэй үед л) |
| `data-retention` | 24 цаг | `visitor_sessions` 24 сараас, `login_attempts` 12 сараас хуучин мөрийг устгана (`purgeStaleTelemetry`) |
| `notification-outbox-purge` | 20 цаг | тестийн болон 90 хоногоос хуучин мөрүүд |

---

## 8. Хэзээ ч зөрчиж болохгүй дүрмүүд

1. **Нөөц** — зөвхөн `stockLedger.ts`-ээр (§3.3).
2. **Орлого** — зөвхөн `settledSaleSql`-ээр тодорхойлогдоно.
3. **Мэдэгдэлд PII байхгүй** (§3.4).
4. **Гадны төлбөрийн "төлөгдсөн" гэдэгт callback-аар итгэхгүй** (§3.5).
5. **Нууц утга клиент рүү буцахгүй** — `getAdminIntegrations` зөвхөн `isSet` өгнө; ntfy topic нь өөрийн бүлгийн гишүүнд л харагдана.
6. **Update schema бүр `partialForUpdate()`** (zod 4 урхи).
7. **Integration тест бодит мөрийг устгахгүй** — snapshot-restore, эсвэл throwaway marker.
8. **Тестийн өгөгдөл `%test%`-ээр хайж болохгүй** — каталогт жинхэнэ `Honey amproom tester` бий (`scripts/test-residue-report.ts`).
9. **Захиалга бичдэг шинэ зам бүр `clientRequestId` авна** (checkout, POS шиг) — эс бөгөөс timeout/resend/2 дахь tab давхар захиалга, давхар нөөц хасалт үүсгэнэ.
10. **`users` мөрийн эрх/sessionVersion/suspend-ийг өөрчилдөг шинэ функц бүр `forgetSessionUser(id)` дуудна** — эс бөгөөс "бүх төхөөрөмжөөс гарах" 5 с хоцорно (2026-09-12-нд бодитоор гарсан P0).
11. **Cloud вендорын URL https + public host** (`validateIntegrationSettings`, `isPrivateHost`) — ntfy л LAN-д зөвшөөрөгдөнө.

---

## 9. Тест (83 файл, 774 тест — 2026-09-12, `3d3b05a`, 17.1 минут)

```powershell
$env:RUN_AUTH_INTEGRATION_TESTS="1"; $env:COMMERCE_INTEGRATION_TESTS="1"; $env:RUN_MEDIA_INTEGRATION_TESTS="1"
pnpm exec vitest run --no-file-parallelism   # ~17 минут, бодит Aiven дээр
pnpm check   # tsc (app) + tsc -p tsconfig.tests.json (тест/скрипт) — 2026-09-12-оос тестүүд ч type-check хийгдэнэ
pnpm lint    # ESLint flat config: typescript-eslint recommended + react-hooks (rules-of-hooks, exhaustive-deps). CI-д ч ажиллана
```

**`server/_test-helpers.ts` `testSessionUser({id, ...overrides})`** — appRouter.createCaller-т өгөх бүрэн session user. Тест бүр өөрийн fake user бичдэг байсан нь `users`-т багана нэмэгдэх бүрт хоцордог байв (type-check асаахад 90 алдаа). Шинэ integration тест ЭНИЙГ ашиглана.

Хоёр төрөл: **unit** (gate-гүй, сүлжээгүй — `ntfy.test.ts`, `smart-software.test.ts`, `storepay.test.ts`, `qpay.test.ts`, `scan-session.test.ts`, `transfer-reconcile.test.ts`, `stock-alerts.test.ts` …) ба **integration** (env gate-тэй, бодит DB — `inventory.integration.test.ts`, `inventory-sync.integration.test.ts`, `stock-ledger.integration.test.ts`, `transfers.integration.test.ts`, `order-unwind.integration.test.ts` …). Integration файл бүр өөрийн throwaway өгөгдлийг `afterAll`-д устгана.

---

## 10. Скриптүүд (`scripts/`)

`db-apply-migration.ts` (migration), `db-backup.ps1` / `db-restore.ps1`, `stock-ledger-rebaseline.ts` (drift засах), `test-residue-report.ts` / `test-residue-purge.ts` (амьд DB-ийн тестийн үлдэгдэл), `schema-drift-check.ts` (`drizzle/schema.ts` vs бодит `information_schema` + FK индекс — нөгөө лаптопын migration-ыг илрүүлнэ), `tmp-*.ts` (gitignore, нэг удаагийн), зураг/брэндийн seed скриптүүд.

---

## 11. Одоо ажиллаж БАЙГАА vs зөвхөн тохиргоо хадгалдаг

| Интеграц | Төлөв |
|---|---|
| ntfy (утасны мэдэгдэл) | ✅ бодитоор ажиллаж байгааг Tom-ийн iPhone дээр баталгаажуулсан |
| Smart Software | ✅ код бэлэн — нэвтрэх нэр/нууц үг хүлээж байна |
| StorePay | ✅ код бэлэн — 7 утга хүлээж байна |
| QPay | ✅ код бэлэн — merchant (эсвэл sandbox) эрх хүлээж байна |
| Brevo имэйл, verify.mn SMS, R2, Honeybadger | ✅ `.env`-ээр |
| И-баримт, Голомт карт, eBuuhia | ⏸ зөвхөн тохиргоо хадгалдаг (`wiredUp:false`) — бизнесийн шийдвэр хүлээж байна ([EBARIMT.md](../EBARIMT.md)) |
