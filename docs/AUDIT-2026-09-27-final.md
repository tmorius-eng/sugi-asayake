# Сүүлчийн бүтэн-стек bug аудит (2026-09-24 → 09-27)

Tom: *"ене код-ын мөр бүрийг сайн уншиж deep analyze хийгээд … сүүлийн удаа нэг шалгаад өгөөч"*.

Арга: код 13 хэсэгт хуваагдаж, хэсэг бүрийг тусдаа зөвхөн-уншдаг шалгагч мөр бүрээр уншсан (routers ×3, мөнгөний цөм, auth, каталог/хайлт, нөөц/job, платформ/analytics, схем↔migration, client pages, storefront компонент, admin цөм/царай, admin панел). 09-23-ны 150+ засвар дахин мэдээлэгдээгүй. P0/P1-ийг засахаас өмнө кодоос дахин баталгаажуулсан.

Тэмдэг: ✅ засагдсан · ⏳ засагдах · 🟡 Tom-ийн шийдвэр · ➖ зориуд үлдээсэн.

Хөндлөн шалгалт (цэвэр): `sql.raw` 0, admin бүсэд `protectedProcedure` 0, гадагш fetch бүр timeout-тэй, LIKE бүр `escapeLike`, транзакц дотор `db.` 0, `window.confirm` 0, захиалгын 3 зам бүгд `clientRequestId`-тэй, tRPC бичих хүсэлт бүр Origin шалгалттай.

---

## A. Мөнгө, захиалга, төлбөр

| # | Түвшин | Олдвор | Байршил | Төлөв |
|---|---|---|---|---|
| A1 | P0 | Төлөгдөөгүй QPay/StorePay захиалгыг "дууссан" болгоход бэлгийн карт гардаг | `admin-orders.ts` updateAdminOrder, `gift-cards.ts` issueGiftCardsForPaidOrder | ✅ хоёр давхар шалгалт |
| A2 | P0 | Карт авч → ашиглаж → өөрөө цуцлах → бүтэн refund = давхар мөнгө | `customer-orders.ts` cancelOwnOrder, `admin-orders.ts` refundOrder | ✅ refund-ийг ашигласан дүнгээр хязгаарлав (картын мөр FOR UPDATE), ашигласан карттай захиалгыг self-cancel хаав |
| A3 | P0 | Цуцалсны дараа мөнгө орсон захиалгыг устгахад төлбөрийн бичлэг устдаг | `admin-orders.ts` deleteAdminOrder | ✅ |
| A4 | P1 | Цуцлагдсан захиалгад refund+restock → нөөц 2 удаа | `admin-orders.ts` refundOrder, `AdminOperationsPanel.tsx` | ✅ сервер + UI |
| A5 | P1 | Хоёр дахь төлбөр (StorePay 2 дахь зээл, QPay дутуу төлбөрийн дараах шинэ нэхэмжлэл) зөвхөн console.warn | `payments.ts` markQPayPaymentAttemptPaid | ✅ `payment.duplicate` мэдэгдэл (finance) |
| A5b | P1 | Нэхэмжлэл/зээл үүсгэх check-then-act, retry товч pending-д идэвхтэй | `routers.ts` qpayCreateInvoice/storepayCreateLoan, `Checkout.tsx` | ✅ |
| A6 | P1 | 0₮ (зээлээр бүрэн) + QPay/StorePay → мөнхөд unpaid | `cart-orders.ts`, `Checkout.tsx` | ✅ шууд paid/confirmed + карт, клиент төлбөрийн алхам алгасна |
| A7 | P1 | Төлөгдөөгүй захиалга засахад хямдрал шинэ дүнгээс давж 0₮ | `admin-orders.ts` editAdminOrder | ✅ харьцаагаар багасгана, зээлээс доош унахыг татгалзана |
| A8 | P1 | Гар захиалгад qpay/storepay сонгож болно — төлөх зам байхгүй | `routers.ts` createManualOrder | ✅ |
| A9 | P1 | `storepayCreateLoan` дурын дугаарт зээлийн хүсэлт | `routers.ts` | ✅ |
| A10 | P1 | Нэвтэрсэн хэрэглэгч дурын `customerPhone`-оор SMS илгээлгэнэ | `routers.ts` guestPhoneVerificationRequired | ✅ |
| A11 | P1 | `orders.mine/cancel/requestReturn` бүтэн мөр (adminNote г.м.) | `customer-orders.ts`, `routers.ts` | ✅ `toCustomerOrder` |
| A12 | P2 | QPay underpaid → шинэ нэхэмжлэл, хуучин нь нээлттэй | `qpay.ts` | ➖ A5-ийн мэдэгдлээр харагдана |
| A13 | P2 | Баримт PDF-ийн статусын шошго (`packed`, `refunded`) | `invoice.ts` | ✅ |
| A14 | P2 | Бэлгийн картын мөр үнэгүй хүргэлтийн босгонд тоологдоно | `shared/delivery.ts` | 🟡 |
| A15 | P2 | Зочин зөвхөн-карт сагсыг COD-оор | `Checkout.tsx`, `routers.ts` | 🟡 |
| A16 | P2 | Зээлээр карт авч хугацааг мөнхөд сунгах | `cart-orders.ts` | 🟡 |
| A17 | P2 | 0₮ refund захиалгыг `refunded` болгоно | `admin-orders.ts` refundOrder | ✅ |
| A18 | P2 | Купоны usesCount чөлөөлөлт кодоор (нэр солиход алдагдана) | `admin-orders.ts` | ➖ код нэр солих ховор |
| A19 | P2 | Харилцагчийн цуцлалт "савласан"-тай уралдана | `customer-orders.ts` | ✅ `allowedFromStatuses` |
| A20 | P2 | Англи алдааны текст storefront-д | `cart-orders.ts`, `customer-orders.ts`, `routers.ts` payments | ✅ |
| A21 | P2 | storeCreditMnt бичигч 3 зам `forgetSessionUser`-гүй | `cart-orders.ts`, `admin-orders.ts`, `ops.ts` | ✅ |
| A22 | P1 | POS борлуулалт `completedAt`-гүй | `cart-orders.ts` recordInStoreSale | ✅ |
| A23 | P1 | Хоёр дахь `updateDiscountCode` 0₮-ийн код үүсгэж болно | `routers.ts`, `discounts.ts` | ✅ |

## B. Auth, admin, эрх

| # | Түвшин | Олдвор | Байршил | Төлөв |
|---|---|---|---|---|
| B1 | P1 | Login lockout "locked" оролдлогыг тоолж мөнхөд сунгана — admin-ийг дурын хүн хааж чадна | `routers.ts` login/reauth, `ops.ts` countRecentFailedLoginAttempts | ✅ |
| B2 | P1 | `JWT_SECRET` хүч шалгагддаггүй | `_core/context.ts` | ✅ анхааруулга; 🟡 prod утгыг Tom шалгана |
| B3 | P2 | Царай reset хийсний дараа proof 8 ц хүчинтэй | `face.ts`, `routers.ts` | ✅ |
| B4 | P2 | Хаалга унтраалттай үед enroll нууц үггүй | `routers.ts` faceAuth.enroll | ✅ |
| B5 | P2 | Эхний хэрэглэгч auto-admin race; OWNER_EMAIL promotion гэж код байхгүй (баримт буруу) | `users.ts`, PROJECT-GUIDE | ✅ |
| B6 | P2 | Сүүлчийн admin-ийг доошлуулах хамгаалалтгүй | `routers.ts` setUserRole | ✅ |
| B7 | P2 | verify.mn-ийн алдааны текст клиентэд | `routers.ts` 3 procedure | ✅ |
| B8 | P2 | Түр хаагдсан дансны нууц үг зөв эсэх илэрнэ | `routers.ts` login | ➖ түр хаагдсан хэрэглэгч шалтгаанаа мэдэх ёстой |
| B9 | P2 | Handoff-ийн хуурамч тоо дуудлага бүрт шинэ | `faceHandoff.ts` | ✅ |
| B10 | P2 | `startFaceHandoff` tab id-гүй хүсэлт хүлээн авна | `faceHandoff.ts` | ✅ |
| B11 | P2 | Facebook нэвтрэлт, SMS reset, нууц үг солих login history-д орохгүй | `facebookAuth.ts`, `routers.ts` | ✅ |
| B12 | P2 | `updateUserProfile` `phone` параметр хэвээр | `users.ts` | ✅ |
| B13 | P2 | Facebook холболт өөр id-г чимээгүй солино | `users.ts` | ✅ |
| B14 | P2 | `faceAuth.lock` ямар ч хэрэглэгч face_attempts бичнэ | `routers.ts`, `faceAuth.ts` | ✅ |
| B15 | P2 | `inventory.updateReceipt` дурын `invoicePhotoUrl` | `inventoryRouter.ts` | ✅ |
| B16 | P2 | Баримтын зураг draft шалгалтаас өмнө R2-д | `inventoryRouter.ts` | ✅ |
| B17 | P2 | Хуучин avatar R2-оос устгагддаггүй | `routers.ts` | ✅ |
| B18 | P2 | `deleteUserAccount` бүх алдааг "агуулга үүсгэсэн" гэнэ | `users.ts` | ✅ |
| B19 | P2 | Verified OTP key-гүй орчинд хугацаа дуусдаггүй | `routers.ts` | ➖ prod амьд төлвийг шалгадаг |
| B20 | P2 | `addresses.update` `.partial()` | `routers.ts` | ✅ |
| B21 | P1 | Marketing эрх `review-reward-mnt`-ийг дурын дүнгээр тавьж store credit гаргуулна; тоон тохиргоонд хил байхгүй | `routers.ts` updateStoreSetting, `shared/store-settings.ts` | ✅ |
| B22 | P2 | `admin.search` staff/marketing-д захиалгын утас | `routers.ts` admin.search | ✅ |
| B23 | P2 | Bulk/import хариунд raw `error.message` (driver алдаа) | `routers.ts` 3 газар | ✅ |
| B24 | P2 | Сэтгэгдлийн имэйл marketing-д | `reviews.ts` / `AdminReviewsPanel.tsx` | ✅ |

## C. Storefront API

| # | Түвшин | Олдвор | Байршил | Төлөв |
|---|---|---|---|---|
| C1 | P1 | `push.subscribe` дурын URL, `sendNotification` timeout-гүй (админы төлөв солих гацна) | `routers.ts`, `_core/webPush.ts` | ✅ |
| C2 | P1 | Устгасан сэтгэгдлийн урамшуулал дахин олгогдоно | `routers.ts` reviews.create | ✅ |
| C3 | P1 | Сагсны алдаа англиар | `cart-orders.ts` | ✅ |
| C4 | P2 | Эхний add-to-cart race → 2 идэвхтэй сагс | `cart-orders.ts` | ✅ |
| C5 | P2 | like/review давхар товшилт → INTERNAL | `reviews.ts` | ✅ |
| C6 | P2 | redeemGiftCard commit-оос өмнө cache цэвэрлэнэ | `gift-cards.ts` | ✅ |
| C7 | P2 | `reviews.create` rate-limit-гүй | `routers.ts` | ✅ |
| C8 | P2 | SMS OTP утас тус бүрийн хязгааргүй | `routers.ts`, `verifyMn.ts` | ✅ |
| C9 | P2 | Careers утас `"--------"` зөвшөөрнө | `routers.ts` | ✅ |
| C10 | P2 | Зочны сагс merge уналтад cookie устгагдана | `routers.ts` | ✅ |
| C11 | P2 | CV `/cdn/*`-ээр хүрэх боломжтой | `_core/storageProxy.ts` | ✅ |
| C12 | P2 | `returned`+`paid` урамшуулалд тэнцэнэ | `customer-orders.ts` isOrderSettled | ✅ |
| C13 | P2 | Зочны cookie token шалгагдаагүй | `routers.ts` | ✅ |
| C14 | P2 | Купоны fixed/min дүн хилгүй | `routers.ts` | ✅ |
| C15 | P1 | Захиалгын push 4/7 загвар хэзээ ч ажиллахгүй (enum-д байхгүй нэр); packed/out_for_delivery/returned push явахгүй | `_core/webPush.ts` PUSH_STATUSES | ✅ |

## D. Каталог, variant, контент, хайлт

| # | Түвшин | Олдвор | Байршил | Төлөв |
|---|---|---|---|---|
| D1 | P1 | Default variant-ыг засахад үргэлж "SKU ашиглагдсан" | `variants.ts` variantSkuExists | ✅ |
| D2 | P1 | Default-ийг унтраахад бараа захиалах боломжгүй болно | `variants.ts` updateAdminProductVariant | ✅ |
| D3 | P0 | Variant устгахад нөөцийн дэвтэр cascade-аар устаж, барааг устгах хаалга нээгдэнэ; цуцлалт нөөц буцаахгүй | `variants.ts` deleteAdminProductVariant, `admin-catalog.ts` deleteAdminProduct | ✅ |
| D4 | P1 | Variant засвар НИЙЛБЭР үлдэгдлийг үндсэн салбарт бичнэ (09-23 #12-ийн хоёр дахь газар) | `AdminProductVariantsPanel.tsx` | ✅ |
| D5 | P1 | Олон variant-тай барааны `stockQuantity` ledger-ээс гадуур бичигдэнэ (маягт, CSV) | `admin-catalog.ts` updateAdminProduct | ✅ |
| D6 | P2 | Кэшийг бичихээс ӨМНӨ цэвэрлэдэг (каталог/сайт/нийтлэл) | `admin-catalog.ts`, `site.ts`, `posts.ts` | ✅ |
| D7 | P2 | `storefront:boughtTogether:*` хэзээ ч цэвэрлэгддэггүй | `catalog.ts` | ✅ |
| D8 | P2 | `updateProductVariant` өөр барааны `productId`-г хүлээн авна | `routers.ts`, `variants.ts` | ✅ |
| D9 | P2 | Хайлтын статистик UTC өдрөөр | `search/searchAnalytics.ts` | ✅ |
| D10 | P2 | Нийтлэлийн tag том/жижиг үсэг → INTERNAL | `posts.ts` | ✅ |
| D11 | P2 | Admin Q&A 200-аар таслагдана | `questions.ts` | ⏳ UI хуудаслалт хэрэгтэй |
| D12 | P2 | Bestseller тэнцвэргүй эрэмбэ → rail давхцана | `catalog.ts` | ✅ |
| D13 | P2 | `getRoutineForProduct` ORDER BY-гүй | `routines-promotions.ts` | ✅ |
| D14 | P2 | Нийтлээгүй барааны сэтгэгдэл/Q&A уншигдана | `reviews.ts`, `questions.ts` | ✅ |
| D15 | P2 | Нийтлэлийн preview marketing/finance/warehouse-д 404 | `posts.ts`, `routers.ts` | ✅ |
| D16 | P2 | `canAnswerQuestion` өөрийн тайлбартай зөрнө | `questions.ts` | ✅ |
| D17 | P2 | Синонимын concept-ийг байгаа concept руу солиход INTERNAL | `search/dictionaries.ts` | ✅ |
| D18 | P2 | Брэндийн alias өөр брэндийнхийг чимээгүй дарна | `search/dictionaries.ts` | ✅ |
| D19 | P2 | Сэтгэгдэл нуухад каталогийн үнэлгээ 10 с хуучин | `reviews.ts` | ✅ |
| D20 | P2 | Site media URL-ийн схем шалгагддаггүй | `routers.ts` | ✅ |
| D21 | P2 | Featured brand бичигч bestseller кэшийг цэвэрлэдэггүй | `site.ts` | ✅ |
| D22 | P2 | Идэвхгүй салбарын нөөц онлайн нөөцөд тоологдсоор | `stockLedger.ts`, `site.ts` | ⏳ нөөцийн засварчинд |
| D23 | P2 | `saveLoyaltyTier` хуучин id → INTERNAL | `site.ts` | ✅ |
| D24 | P2 | Анкет устгахад CV R2-д үлдэнэ | `routers.ts` | ✅ |
| D25 | P2 | Ажлын байрны `applyUrl` дурын схем | `routers.ts` | ✅ |
| D26 | P2 | Хилгүй тоон талбарууд (setBranchStock, sortOrder, maxUses, monthKey) | `routers.ts` | ✅ |
| D27 | P2 | Кампанит ажлын 10 минутын цонхны зааг + `campaign.started` хэзээ ч бичигддэггүй | `ops.ts`, `routers.ts` | ✅ |
| D28 | P2 | SMS кампанит ажлын бие 5 000 тэмдэгт (72 сегмент × 2 000) | `routers.ts` | ✅ |

## E. Схем ба migration

| # | Түвшин | Олдвор | Төлөв |
|---|---|---|---|
| E1 | P1 | `posts.content`, `site_documents.contentHtml` TEXT (64 KB), zod 200 000 → урт нийтлэл хадгалагдахгүй | ✅ |
| E2 | P1 | `orders.appliedLoyaltyTierName` 40 < зэрэглэлийн нэр 60 → checkout унана | ✅ |
| E3 | P2 | 6 хүснэгтийн `updatedAt` ON UPDATE байхгүй | ⏳ |
| E4 | P2 | `gift_cards.recipientName` 120 < `customerName` 160 → карт гарахгүй | ✅ |
| E5 | P2 | `orders.pickupBranch` 120 < салбарын нэр 160 | ✅ |
| E6 | P2 | Салбар устгахад draft баримт/тооллого/шилжүүлэг cascade-аар устна | ✅ |
| E7 | P2 | Данс устгахад store credit дэвтэр cascade | 🟡 |
| E8 | P2 | TIMESTAMP 2038 хязгаар, огнооны оролтод дээд хилгүй | ✅ |
| E9 | P2 | `staff_invitations.role` хуучин enum (үхсэн код) | ➖ |
| E10 | P2 | `schema-drift-check` зөвхөн баганын нэрийг харьцуулна | ⏳ |
| E11 | P2 | `db-apply-all-migrations` `schema_migrations` бичдэггүй | ⏳ |
| E12 | P2 | `orders_delivery_district_idx` schema.ts-д байхгүй | ✅ |
| E13 | P2 | `users.passwordHash DEFAULT ''` | ✅ |
| E14 | P2 | `login_attempts.email` нь утас хадгална (нэр төөрөгдүүлнэ) | ➖ |
| E15 | P2 | Халуун query-ийн 3 индекс дутуу | ✅ |
| E16 | P2 | `push_subscriptions` endpoint(255) prefix unique | ⏳ |

## F. Admin клиент

| # | Түвшин | Олдвор | Байршил | Төлөв |
|---|---|---|---|---|
| F1 | P1 | Бүртгэлийн дараах 60 с refetch камерын урсгалыг тасалж сонголтын дэлгэц рүү унагана | `AdminFaceGate.tsx` | ✅ |
| F2 | P1 | QR токен `/login?redirect=` дамжин Meta Pixel рүү | `vendor/analytics-init.js` | ✅ |
| F3 | P1 | QR хэвлэх production-д ажиллахгүй (CSP inline script) | `admin/ProductQrModal.tsx` | ✅ |
| F4 | P1 | Жагсаалтын сонголт хайлт солиход үлдэж, харагдахгүй мөрүүдэд bulk үйлдэл | `admin/GenericListView.tsx`, `AdminOperationsPanel.tsx` | ✅ |
| F5 | P1 | Кампанит ажил илгээсний дараа дахин илгээх боломжтой хэвээр | `admin/AdminCampaignsPanel.tsx` | ✅ |
| F6 | P1 | Вендорын факт талбарын сонголт зөвхөн харагдац | `admin/VendorCatalogPanel.tsx`, `vendorCatalog.ts` | ✅ |
| F7 | P1 | Баримт бичгийн editor хадгалсан текстийг fallback-аар дарна | `AdminDocumentsPanel.tsx` | ✅ |
| F8 | P1 | Салбарын нөөцийн талбарыг хоослоход 0 бичнэ | `AdminBranchStockEditor.tsx` | ✅ |
| F9–F27 | P2 | "Энэ сар" 1-ний өдөр, canvas leak, capture timeout, lockingRef, idle timer reset, CV popup, chooser flash, reach cap, import dialog, handoffContext GET, салбарын ▲▼, variant үнэ 0, төлөв сонгоход confirm, баримтын зураг шахалтгүй, тооллогын confirm хоцрох, POS засвар pending-д, POS баркод нормчлол, store credit confirm, өөрийгөө гаргах, интеграцийн утга trim, холболт шалгах хадгалаагүй утгаар, промо файл reset, скан "−" мөр устгана, шилжүүлгийн from=to, media alt, 0% сагс орхилт, нийтлэл ноорог болгох | олон | ✅ |

## G. Платформ, analytics, SEO

| # | Түвшин | Олдвор | Байршил | Төлөв |
|---|---|---|---|---|
| G1 | P1 | Хараалын шүүлт энгийн үгсийг татгалзана ("шаардлагатай", "хаягаар", "бүрхүүл", "хогийн уут", "оймс", 操作, ばかり, trash bags) — ажиллуулж баталгаажсан | `_core/moderation.ts` | ✅ |
| G2 | P1 | Analytics-ийн `min(createdAt)` мөрийг VM-ийн орон нутгийн цагаар уншина → 8 ц зөрүү, шинэ/буцаж ирсэн харилцагч, CAC буруу | `analytics.ts` 4 газар | ✅ |
| G3 | P1 | BreadcrumbList ангиллын slug-аар (бусад бүгд нэрээр) | `_core/routeMeta.ts` | ✅ |
| G4 | P2 | Нийтлэлийн meta description entity давхар escape | `_core/routeMeta.ts` | ✅ |
| G5 | P2 | index.html-ийн 60 с кэш single-flight-гүй | `_core/indexHtml.ts` | ✅ |
| G6 | P2 | SIGTERM handler байхгүй — deploy хийхэд дундуур хүсэлт тасарна | `_core/index.ts` | ✅ |
| G7 | P2 | SQL лог push subscription-ийн нууцыг масклахгүй | `_core/sqlQueryLog.ts` | ✅ |
| G8 | P2 | Access log query string-ийг (QR токен, OAuth code) бичнэ | `_core/requestLog.ts` | ✅ |
| G9 | P2 | Брэнд нэрэндээ орсон барааны орчуулга ажиллахгүй | `shared/product-i18n.ts` | ✅ |
| G10 | P2 | OG зураг дурын URL-ээс татна (blind SSRF) | `_core/ogImage.ts` | ✅ |
| G11 | P2 | Сайтын нэр `<`-тэй бол гарчиг давхар escape | `_core/indexHtml.ts` | ✅ |
| G12 | P2 | Хуваалцсан кэшийн Map-д canonical бичнэ (далд) | `_core/indexHtml.ts` | ✅ |

## H. Storefront клиент

| # | Түвшин | Олдвор | Байршил | Төлөв |
|---|---|---|---|---|
| H1 | P1 | Гурав дахь hero зураг ("Салбар олох") React-ийн дараа ажиллахгүй (hash холбоос wouter Link-ээр) | `home/HeroImageSlideshow.tsx` | ✅ |
| H2 | P1 | /shop дээр байхад цэс/footer-ийн ангиллын холбоос юу ч хийхгүй (URL өөрчлөгдөхийг сонсохгүй) | `pages/Shop.tsx` | ✅ |
| H3 | P1 | Сөрөг/бутархай/буруу `minPrice`, `page` → бүх каталог "интернэтээ шалгана уу" | `pages/Shop.tsx` | ✅ |
| H4 | P1 | QPay/StorePay захиалсны дараа хураангуй "Сагс хоосон", "Нийт 0₮" | `pages/Checkout.tsx` | ✅ |
| H5 | P2 | Footer-ийн газрын зураггүй салбар хоосон таб | `SiteFooter.tsx` | ✅ |
| H6 | P2 | Quick view дууссан default variant-ыг сонгоно | `QuickViewDialog.tsx`, `ProductDetail.tsx` | ✅ |
| H7 | P2 | Сэтгэгдлийн like давхар товшилт буцааж унтраана | `ReviewThread.tsx` | ✅ |
| H8 | P2 | SPA шилжилтэд tab-ын гарчиг солигдохгүй (GA-д буруу гарчиг) | `lib/useDocumentMeta.ts` | ✅ |
| H9 | P2 | Промо popup Esc/focus trap-гүй | `SitePromo.tsx` | ✅ |
| H10 | P2 | Асуулга эрт хаахад шинэ хариултыг хуучинаар дарна | `ProfileQuizWizard.tsx` | ✅ |
| H11 | P2 | Брэндийн карусель чирэлт гацаж autoplay зогсоно | `home/FeaturedBrandsCarousel.tsx` | ✅ |
| H12 | P2 | AVIF-гүй зураг хуулбар бүрт 404 | `ResponsivePicture.tsx` | ✅ |
| H13 | P2 | TranslateSurface хэрэглэгчийн текстийг орчуулж, мутаци бүрт бүтэн body-г алхана | `TranslateSurface.tsx` | ✅ |
| H14 | P2 | Толгойн хайлтын "бүгдийг харах" бүтэн хуудас reload | `HeaderSearch.tsx`, `home/CarouselShelf.tsx` | ✅ |
| H15 | P2 | Аюултай confirm OK товч дээр autofocus | `ConfirmDialog.tsx` | ✅ |
| H16 | P2 | Glossary hover нээж, click хаана | `GlossaryText.tsx` | ✅ |
| H17 | P2 | Cookie зөвшөөрсөн хуудасны pageview тоологдохгүй | `lib/pageviewTracking.ts` | ✅ |
| H18 | P2 | CategoryRail click-suppression pointercancel-д үлдэнэ | `home/CategoryRail.tsx` | ✅ |
| H19 | P2 | Checkout/Login/TrackOrder/хаягийн клиент шалгалт серверээс сул → талбарын алдаа гарахгүй | pages | ✅ |
| H20 | P2 | Бэлгийн картыг нөөцөөр хаадаг (сервер нөөц шалгадаггүй) | `ProductDetail.tsx`, `Shop.tsx` | ✅ |
| H21 | P2 | "Дахин захиалах" default variant-ыг нэмнэ | `Profile.tsx`, `customer-orders.ts` | ✅ |
| H22 | P2 | Арьсны төрлийн chip англи түлхүүр | `Shop.tsx` | ✅ |
| H23 | P2 | Буцаагдсан захиалгын timeline бүгд саарал | `Profile.tsx` | ✅ |
| H24 | P2 | Journal алдааны төлөвгүй, хуудас солиход гүйлгэхгүй | `Journal.tsx` | ✅ |
| H25 | P2 | Төлбөрийн polling алдаан дээр зогсохгүй | `Checkout.tsx` | ✅ |
| H26 | P2 | Push асаах серверийн алдаан дээр browser subscription үлдэнэ | `Profile.tsx` | ✅ |
| H27 | P2 | Lazy route fallback dark горимд цагаан анивчина | `App.tsx` | ✅ |
| H28 | P2 | ThemeContext `.dark` класс (хориотой), storage try/catch-гүй — үхсэн код | `contexts/ThemeContext.tsx` | ✅ |
| H29 | P2 | Routine/Post хуудасны гарчиг | `RoutineDetail.tsx`, `PostDetail.tsx` | ✅ |
| H30 | P2 | Нэвтэрсэн хэрэглэгчид /login маягт | `Login.tsx` | ✅ |

## I. Нөөц / job / интеграц

| # | Түвшин | Олдвор | Байршил | Төлөв |
|---|---|---|---|---|
| I1 | P0* | Scheduler DB claim-гүй → хоёр процесс ижил вендорын snapshot-ийг хоёр удаа хэрэглэж нөөц +1 давхарлана (*Smart асаалттай үед) | `_core/scheduler.ts`, `inventorySync.ts` | ✅ |
| I2 | P0* | Вендорын snapshot онлайн борлуулалтыг 15 мин тутам буцаана (push урсгал байхгүй) — онлайн нөөцтэй салбарыг холбохыг хаах | `inventorySync.ts` | 🟡 холбохыг зөвшөөрнө, snapshot гараар батлагдана — Tom шийднэ |
| I3 | P1 | Бүтэн тооллого бэлгийн картыг 0 болгоно → карт каталогоос алга | `inventory.ts` | ✅ |
| I4 | P1 | Автомат тооллого (`count_adjust`) хэзээ ч `stock.low/out` сэрэмжлүүлэхгүй | `stockLedger.ts`, `inventory.ts` | ✅ |
| I5 | P1 | Гар горимд вендорын sync 15 мин тутам push (өдөрт ~96) | `inventorySync.ts` | ✅ |
| I6 | P1 | Шилжүүлэг хүлээн авахад транзакцаас гадуур уншсан тоо | `transfers.ts` | ✅ |
| I7 | P1 | Бага нөөцийн имэйл claim-гүй (I1-ээр) | `automation.ts` | ✅ |
| I8 | P1 | Staging бодит харилцагчид имэйл/push илгээх job ажиллуулж болно | `clusterRole.ts`, deploy | ✅ |
| I9 | P1 | Dispatcher-гүй үед `pending` outbox мөнхөд өснө | `notifications.ts`, `db/notifications.ts` | ✅ |
| I10 | P1 | Салбарын `countsTowardOnlineStock` солиход олон variant-тай барааны нийлбэр хуучирна | `stockLedger.ts` | ✅ |
| I11 | P1 | `postCount` кодыг дахин шийддэггүй | `inventory.ts` | ✅ |
| I12 | P1 | Back-in-stock суваггүй мөрийг эзэмшиж "илгээсэн" гэнэ | `automation.ts`, `users.ts` | ✅ |
| I13 | P1 | Орхигдсон сагсны push `.catch`-гүй | `automation.ts` | ✅ |
| I14 | P1 | Smart token 401 дээр дахин оролддоггүй | `smartSoftware.ts` | ✅ |
| I15 | P1 | "order.paid" мэдэгдэл StorePay-г "QPay" гэнэ | `notification-events.ts`, `payments.ts` | ✅ |
| I16–I31 | P2 | Шилжүүлгийн push блайнд тоог задална, snapshot тэмдэглэлийн цаг UTC, drift тоо дутуу, бүтэн тооллогын unscanned tx-гүй, `shelfCounts` pool db, эхний auto-apply урт цоож, ntfy 401 мөнхөд алга, Brevo sender-гүй "илгээсэн", node:http нийт timeout-гүй, EAN/UPC, скан 50 мс, sales claim entityId 0, total_out variant тус бүр, амжилтгүй snapshot baseline, вендорын үнэ транзакцгүй, staff submitted тооллого цуцлах | олон | ✅ |

---

## Засварын засвар — бие даасан diff шалгалт (4 шалгагч)

Бүх засварыг 4 тусдаа шалгагч diff-ээр уншиж **27 асуудал** олсон, бүгд засагдсан. Гол нь:
- Кирилл нэртэй хоёр tag нэг түлхүүрт нийлж нийтлэл хадгалагдахгүй болох (slug кирилд хоосон).
- Migration 0097-гүй DB дээр scheduler-ийн БҮХ job зогсох → багана байхгүй бол claim-гүй горимд буцна.
- `new Date(0)` TIMESTAMP-ийн хилээс гадуур → шинэ job хэзээ ч due болохгүй.
- Буцаан олголт ба цуцлалт эсрэг дарааллаар цоожилж deadlock → захиалгын мөрийг эхлээд.
- Нууц үг сэргээх SMS-ийн хязгаар дугаар бүртгэлтэй эсэхийг задлах → noop хариу.
- Сүүлчийн admin-ы хамгаалалт уралдааныг барихгүй → FOR UPDATE транзакц.
- 0₮ захиалгад "төлбөр орсон" push ирэхгүй, OTP-ийн утас нормчлоогүй, кампанит claim өнчин мөр.
- Клиент: en/ja гарчиг орчуулагдахгүй, /shop хайлтын зай идэгдэх, /login хэмжигдэхгүй, Back мухардах, footer стиль, variant 0₮ үнэ.
- Smart Software-ийн онлайн салбарыг холбох хориг Tom-ийн "автомат нөөц" зорилтыг хаадаг байсныг сэрэмжлүүлэг болгов (🟡 I2).

## Баталгаажуулалт (2026-09-29)

| Шалгалт | Дүн |
|---|---|
| `pnpm check`, `pnpm lint`, `pnpm build` | ногоон |
| Unit тест | 737+ passed; 66 уналт бүгд DB холболт (TLS) |
| Integration, E2E, migration 0096/0097 | ⛔ ажиллуулаагүй — энэ лаптопоос DB-ийн TLS сертификат шалгалт амжилтгүй |

## Засварын дараалал

1. P0 (A1–A3 ✅, D3) → P1 мөнгө/эрх (A8–A10, A22–A23, B1, B2, B21, C1, C2, C15, D1, D2, D4, D5) → P1 бусад → migration (E1, E2, E5, E13, E15, E3) prod + `sugi_staging` → P2.
2. Бүлэг бүрийн дараа `pnpm check` + `pnpm lint` + хөндсөн integration тест (`sugi_staging`).
3. Эцэст нь diff-ийг тусдаа шалгагчаар уншуулна (09-23-нд 18 регресс ингэж баригдсан), `pnpm build` → бүтэн `pnpm e2e`.
