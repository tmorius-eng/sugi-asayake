# SUGI ASAYAKE — Дэлхийн жишиг (premium) дэлгүүр рүү хүргэх төлөвлөгөө

`CLAUDE.md`, `ROADMAP.md`, `ADMIN-PANEL.md`-ийн хамтрагч баримт. 2026-08-25: Tom-той хамт "world-class premium cosmetics/drugstore" feature жагсаалт (Google-ээс олдсон ерөнхий checklist) дээр brainstorm хийж, SUGI ASAYAKE-ийн бодит хэмжээ/чиглэлд (skincare + интерьерийн барааны хосолсон, нэг брэндийн УБ-ийн дэлгүүр, 3 бодит салбартай) тохируулж эрэмбэлсэн хувилбар.

**Дүрэм: TIER бүр дуусаад л дараагийнхаа руу шил.** ADMIN-PANEL.md-тэй адил зарчим — тест хийлгүй хэд хэдэн TIER-ийг зэрэг хийлгэвэл алдаа хуримтлагдаж, оношлоход хэцүү болно.

---

## Яагаад анхны жагсаалтаас зарим зүйлийг бүр мөсөн хассан бэ

Эх жагсаалт нь **өнгөт cosmetics** (lipstick, foundation) томоохон брэндэд (Sephora/Ulta зэрэг) зориулагдсан ерөнхий checklist байсан. Дараах зүйлс SUGI ASAYAKE-д тохирохгүй тул энэ төлөвлөгөөнд огт ороогүй:

- **Virtual Try-On (AR)** — 3rd-party SDK-ийн сарын лиценз ($$$) + том инженерчлэл шаарддаг, зөвхөн өнгө сонгодог cosmetics-д зориулагдсан. Танай каталог skincare (тос, лосьон, эссенс) + интерьерийн бараа — өнгө "turshaad узэх" ойлголт огт тохирохгүй.
- **Shade Finder Quiz** (foundation-ий өнгө таарах) — мөн адил, зөвхөн color cosmetics-д зориулагдсан. (Skin-type/concern quiz-ийн skincare хувилбар нь ТAAРЧ байгаа тул TIER 1-д орсон — ялгааг анхаараарай.)
- **Apple Pay / Google Pay Express Checkout** — Монголд бараг ашиглагддаггүй, зах зээл бүхэлдээ QPay-д суурилсан (танай одоогийн checkout үүнийг зөв тусгасан). Америк/Европ зах зээлийн таамаглал.
- **HD Texture Video** — контент бэлтгэлийн (видео зураг авалт) хүндрэл, кодын ажил биш тул энэ жагсаалтад ороогүй (хүсвэл тусад нь контент төлөвлөгөө болгоно).
- **Dermatologist Verified Badge** — ⚠️ бодит клиникийн батламжгүйгээр ийм badge шинээр зохиох нь хууль эрх зүй/итгэмжлэлийн эрсдэлтэй. Зөвхөн БОДИТ үйлдвэрлэгчийн (Hada Labo, Shiseido гэх мэт) мэдэгдлийг харуулах л боломжтой — TIER 3-т нөхцөлтэйгээр орсон.
- **Real-time shelf inventory (салбар тус бүрийн лангуун дээрх нөөц)** — 3 салбартай жижиг дэлгүүрт хэт хэтрүүлсэн систем; энгийн байршил/цагийн мэдээлэл хангалттай (TIER 3).

---

## TIER 1 — Personalization суурь (хамгийн хямд, хамгийн өндөр өгөөжтэй) — ✅ ДУУССАН (2026-08-25)
- [x] `products` хүснэгтэд `skinType`/`skinConcerns`/`interiorStyle` төрлийн tag багана нэмэх (`drizzle/0021_product_preference_tags.sql`, `drizzle/schema.ts`) — `users`-ийн ижил гурван талбартай яг адилхан үгсийн сангаар, тусдаа tagging систем шаардалгүй intersection match хийх зорилготой
- [x] Admin панелийн бүтээгдэхүүн засварлах маягтад эдгээр tag сонгох UI нэмэх (`AdminWorkspace.tsx` — "PERSONALIZATION TAGS" хэсэг: skin-type select, skin-concerns/interior-style text input)
- [x] Server: `server/db.ts`-д `getRecommendedProducts(userId, limit)` — хэрэглэгчийн хадгалсан preference-той score-той тохирох (skinType/interiorStyle яг таарвал +2, skinConcerns тус бүр +1) нийтлэгдсэн, нөөцтэй бүтээгдэхүүнийг буцаана; `server/routers.ts`-д `catalog.recommended` (protected) endpoint
- [x] Shop хуудсанд "Танд санал болгох" section (`RecommendedForYou` component, `Shop.tsx`) — зөвхөн нэвтэрсэн хэрэглэгчид, зөвхөн тохирох бараа байвал л харагдана (одоо байгаа `RecentlyViewed`-тэй ижил visual card загвар ашигласан)
- [x] Shop хуудсанд skin-type filter pill (`shared/catalog-filter.ts`-ийн `getCatalogSkinTypes`/`filterCatalogSkinType`, зөвхөн каталогт тухайн төрлөөр tag-тай бараа байвал л pill row харагдана — categoy pill-тэй ижил UX)

**Тест хийсэн байдал:**
- `pnpm check` цэвэр (0 алдаа)
- `pnpm test` бүх integration flag-тай: 19 файл, 83/83 тест ✅ (шинээр нэмсэн `getCatalogSkinTypes`/`filterCatalogSkinType`-ийн 2 unit тест орсон)
- `pnpm build` амжилттай
- Бодит HTTP-ээр (throwaway admin + shopper аккаунт, dev server `pnpm dev` ажиллаж байх үед): бүтээгдэхүүнийг admin-аар tag хийсэн → `catalog.list` public endpoint tag-ыг харуулсан → tag хийхийн өмнө `catalog.recommended` хоосон `[]` буцаасан → `profile.updatePreferences`-ээр тохирох preference хадгалсны дараа яг тэр бүтээгдэхүүнийг (зөв `stockQuantity`/`categoryName`-тай, `QuickViewProduct` төрөлд бүрэн нийцтэй) буцаасныг баталгаажуулсан. Тест дууссаны дараа бүтээгдэхүүн (`Diane shampoo`, id=1)-ийг яг анхны төлөвт нь (`stockQuantity=0`, бүх tag хоосон) сэргээж, throwaway 2 аккаунтыг `admin_audit_logs`-той хамт устгасан.

## TIER 2 — Итгэлийн систем: Reviews & Ratings — ✅ ДУУССАН (2026-08-25)
- [x] `product_reviews` хүснэгт (`drizzle/0022_product_reviews.sql`) — rating 1-5, сэтгэгдэл (заавал биш), **verified purchase**: `server/db.ts`-ийн `createProductReview`-д цуцлагдаагүй, тухайн барааг агуулсан захиалгыг шалгадаг (`findVerifyingOrderId`), `(userId, productId)` unique index-ээр нэг хэрэглэгч нэг бараанд ганцхан удаа сэтгэгдэл бичнэ
- [x] `server/routers.ts`-ийн `reviews` router (`list` public, `eligibility`/`create` protected) + `admin.reviews`/`admin.updateReviewApproval`/`admin.deleteReview` (staffProcedure — admin-аас гадна staff ч модерац хийж болно)
- [x] Бүтээгдэхүүний хуудас (`ProductDetail.tsx`): гарчгийн дор одон дундаж + сэтгэгдлийн тоо, доод хэсэгт бүх сэтгэгдлийн жагсаалт ("Баталгаажсан худалдан авалт" тэмдэгтэй), зөвхөн худалдан авсан/нэвтэрсэн хэрэглэгчид харагдах сэтгэгдэл бичих маягт (3 төлөв: бичих боломжтой / аль хэдийн бичсэн / эрхгүй)
- [x] Shop grid-ийн карт бүрт жижиг одон+тоо badge (`.shop-product-rating`, зөвхөн сэтгэгдэлтэй бол харагдана)
- [x] Admin "Сэтгэгдэл" (`AdminReviewsPanel.tsx`) — жагсаалт, төлвөөр шүүх (Бүгд/Идэвхтэй/Нуугдсан), Нуух/Сэргээх + Устгах товч тус бүр audit log-той

**Гол техникийн дэлгэрэнгүй:** `catalog.list`/`catalog.bySlug` дээр `AVG(rating)`/`COUNT(*)` LEFT JOIN + GROUP BY (per-row subquery биш, 937 барааны хэмжээнд хямд байлгах зорилготой), зөвхөн `isApproved=1` сэтгэгдэл л дундаж тооцоонд орно. **Бодит bug олж зассан:** MySQL/mysql2 драйвер `AVG()`-ийн үр дүнг string ("4.0000") хэлбэрээр буцаадаг тул TypeScript-ийн `number` төрөл худал байсан — `.mapWith(Number)`-ээр засав, засаагүй бол frontend дээр `.toFixed()` ажиллахгүй байх байсан.

**Шалгасан байдал:** `pnpm check`/`pnpm build` цэвэр, `pnpm test` 90/90 (шинэ 7 тест: 5 RBAC unit test `commerce.router.test.ts`-д, 2 бодит MySQL дээрх E2E integration test `product-reviews.integration.test.ts`-д). Мөн бодит HTTP-ээр (dev server ажиллаж байх үед) бүтэн урсгал гараар шалгасан: худалдан авалтын өмнө сэтгэгдэл бичихийг татгалзах → бодит `checkout.createOrder`-ээр захиалга хийх → сэтгэгдэл бичих → давхар бичихийг татгалзах → `catalog.list`/`catalog.bySlug` дундаж шинэчлэгдэх → admin нуух → дундаж 0 болох → admin сэргээх → admin устгах → дахин бичих боломжтой болох. Бүх throwaway тестийн өгөгдөл цэвэрлэгдсэн.

## TIER 3 — Итгэл ба контент: Ingredient Transparency + Store Locator
- [ ] Найрлагын нэр томьёоны (жишээ нь Hyaluronic Acid, Retinol) tooltip glossary component — skincare бүтээгдэхүүний тайлбарт hover/tap хийхэд тайлбар харуулах
- [ ] Байршил (Store Locator) хуудас/хэсэг — одоо байгаа 3 бодит салбар (Орос элчингийн, Их наяд плаза, Яармаг FOOD CITY) тус бүрийн хаяг, ажиллах цаг, утасны дугаар, газрын зураг
- [ ] (Нөхцөлтэй) Үйлдвэрлэгчийн бодит мэдэгдэл badge — зөвхөн танд бодит эх сурвалж байгаа бол (жишээ нь "Hada Labo — Japan dermatologist tested" гэх мэт брэндийн өөрийнх нь мэдэгдэл)

## TIER 4 — Routine Builder & Bundles
- [ ] Admin: "Routine" (арчилгааны дараалал) үүсгэх — алхам дараалалтай бүтээгдэхүүний багц (Алхам 1: Цэвэрлэгч → Алхам 2: Тонер → ...)
- [ ] Харилцагчийн тал: Routine дэлгэрэнгүй хуудас, "Бүгдийг сагслах" нэг товчлуур + багцын хямдрал
- [ ] ProductDetail хуудсанд "Хамт авбал тохирно" / "Routine-оо дуусга" cross-sell блок

## TIER 5 — Байнгын үйлчлүүлэгч бий болгох (Loyalty & Retention)
- [ ] Урамшууллын оноо систем (худалдан авалт бүрт оноо, хямдралд сольж болно)
- [ ] Найз урих (referral) хөнгөлөлт — энгийн хувилбар
- [ ] Brevo-г ашигласан маркетингийн автомат имэйл: сагсанд орхисон бараа сануулах (abandoned cart), худалдан авалтын дараах follow-up (нөөцөд эргэн орох мэдэгдэл аль хэдийн бий)

## TIER 6 — Хайлт ба нээлт (ROADMAP.md TIER 2-той давхцдаг тул зөвхөн лавлагаа)
- [ ] Сервер талын бүрэн текст хайлт (MySQL FULLTEXT эсвэл ижил төстэй) — дэлгэрэнгүй ROADMAP.md TIER 2
- [ ] Үнийн хязгаар slider, олон сонголттой tag filter (TIER 1-ийн tag дата дээр суурилна)

## TIER 7 — Захиалгын давталт (Subscriptions) — нөхцөлтэй, судалгаа шаардана
- [ ] ⚠️ Эхлээд **QPay (эсвэл өөр Монголын payment gateway) давтан төлбөр (recurring billing) дэмждэг эсэхийг судлах** — энэ бол код бичих ажил биш, provider-ийн баримт бичиг судлах ажил
- [ ] Хэрэв дэмждэг бол: "Subscribe & Save" UI, давтамжтай захиалга

---

# Claude Code-д зориулсан бэлэн prompt

```
CLAUDE.md, ROADMAP.md, ADMIN-PANEL.md, PREMIUM-FEATURES.md файлуудыг уншаад эхэл.

Даалгавар: PREMIUM-FEATURES.md-ийн TIER-үүдийг дараалан хий. Дараах дүрмийг чанд баримтла:

1. Нэг удаад ЗӨВХӨН нэг TIER дээр ажилла. Дараагийн TIER рүү бүү шилж.
2. TIER-ийн бүх checkbox-ийг код бичиж дуусгасны дараа:
   - `pnpm check` ажиллуулж type error байхгүй эсэхийг баталгаажуул
   - `pnpm test` (боломжтой бүх integration flag-тай) ажиллуулж бүх тест унасан эсэхийг шалга
   - Dev серверийг асааж, шинэ функц бүрийг өөрөө бодитоор хөтчөөр/curl-аар туршиж, ажиллаж байгааг батал
   - Хуучин функцууд (бүртгэл, checkout, admin CRUD, гэрийн компьютерийн нэмсэн profile/wishlist) эвдрээгүй эсэхийг дахин хурдан шалга
3. Дээрх бүгд ЗӨВХӨН амжилттай болсны дараа надад: "TIER [X] дууслаа, дараах зүйлсийг шалгасан: [жагсаалт]. TIER [X+1] рүү шилжих үү?" гэж асууж, миний зөвшөөрлийг хүлээ.
4. Алдаа/tradeoff гарвал (жишээ нь миний зааснаас өөр арга илүү зөв гэж бодвол) намайг асуулгүйгээр өөрчлөлгүй, эхлээд надад тайлбарлаад асуу.
5. Ажлаа дуусгасны дараа commit хийж, `git push` хийхийн өмнө **эхлээд `git pull` хийж**, гэрийн/ажлын компьютерийн аль нэгэн дээр зэрэгцээ ажил байгаа эсэхийг шалга.

TIER 1-ээс эхэл.
```
