# SUGI ASAYAKE — Дэлгэрэнгүй түүхэн ажлын лог

Энэ файл нь `CLAUDE.md`-г богино, session бүрт хурдан уншигдахуйц байлгах зорилгоор тусгаарласан **дэлгэрэнгүй, өдөр бүрийн narrative лог**. `CLAUDE.md` автоматаар session бүрийн эхэнд уншигддаг тул одоо зөвхөн "одоогийн статус/тохиргоо/идэвхтэй асуудал"-ыг л агуулна; энд бол бүх нарийн ширийн түүх, шалтгаан, баталгаажуулалтын алхам хадгалагдана. `CLAUDE.md` заавал шаардлагатай үед л (жишээ нь ижил төстэй bug дахин гарвал, эсвэл өмнөх шийдвэрийн шалтгааныг мэдэх хэрэгтэй үед) энд ирж хайж болно.

---

## Санал болголтын чанар: 246 зураг сэргээв, tagging дүрэм засав, 2 bug олов (2026-09-01, гэрийн лаптоп)

Tom: "ажлын лаптоп дээр хийж байсан ажлыг гэрийн лаптоп дээр үргэлжлүүл, localhost:3000 асаа, 937 tag бараг бүрэн болсон байх ёстой". Эхлээд CLAUDE.md-ийн эхний 83 мөр, `HISTORY.md`, `self-review.md`-г уншсан.

### Синк

`git fetch` хийхэд local `main` нь `origin/main`-аас **35 commit хоцорсон** байв: ажлын лаптоп бүх branch-ийг `main`-руу нэгтгээд (`home-redesign-categorymasonry-v2` remote-оос устсан, гэхдээ бүх commit нь `main`-д багтсан) дээр нь 9 шинэ commit нэмсэн байв (CategoryMasonry v8/v9/v10, Journal archive хуудас, 4 дэх салбар, Shop ribbon, Preference Profile v2 + Recommendation Engine v2). `main` руу шилжиж fast-forward хийв. `package.json`/lockfile өөрчлөгдөөгүй тул `pnpm install` шаардлагагүй байв. `.env` Aiven руу зөв заасан байсныг (`SELECT COUNT(*) FROM orders` = 4, `site_media` = 7 мөр) баталгаажуулав. `pnpm dev` асаав.

### 937/937 tag — үнэн, гэхдээ хангалтгүй

Aiven-ээс шууд query-ээр **937/937 бараа tag-тай** болохыг баталгаажуулав. Гэхдээ `self-review.md`-ийн өөрийнх нь үлдээсэн даалгаврыг ("apply-ийн дараа зөвхөн coverage хувийг биш, гарцын **бүрэлдэхүүнийг** унших") гүйцэтгэхэд өөр дүр зураг гарав. `scorePreferenceMatch`-ийг бодит каталог дээр 5 реалист профайлаар ажиллуулж, `applyDiversityCap` дараах top-8-ийн ангиллын хуваарилалтыг хэвлүүлэв:

- Реалист олон-signal профайл: 3 арьс арчилгаа + 3 үс/бие + 2 гоо сайхан — **тэнцвэртэй**, Tom-ийн өмнө барьж авсан "дандаа хүүхдийн бараа" bug эргэж ирээгүй ✅
- "Тослог арьс + батга": 937-гийн ердөө **8** бараа score > 0
- **"Хуурай үс": 0 бараа**
- **"Эрүүл мэнд & амьдрал" (wellnessInterests): 0 бараа**

Tag-ийн бодит тархалтыг хэвлүүлэхэд шалтгаан тодорхой болов: `skinType` = normal **590** / sensitive 4 / dry 1 / **oily 0** / **combination 0**; `hairType` = normal 104 / damaged 14 / **dry 0** / oily 0 / color_treated 0; `hairConcerns` **бүхэлдээ хоосон**. Өөрөөр хэлбэл дийлэнх нь Tier-2-ийн `"normal"` **placeholder**, баримт биш — quiz-ийн 5 сонголтын 2-3 нь ямар ч бараатай таарахгүй байв. 3 дахь fallback tier байдаг тул рэйл хоосон харагдахгүй, тиймээс гаднаас нь **ажиллаж байгаа мэт** харагдана — яг үүнээс болж тархалтыг шалгах шаардлагатай байсан.

### Bug 1 — `wellnessInterests` scoring-д огт ороогүй

Quiz-ийн 5-р алхам энэ талбарыг цуглуулж, 37 бараанд tag хийгдсэн, admin форм харуулдаг байсан ч `PreferenceProfile`/`ScorableProduct`/`scorePreferenceMatch`-д огт байгаагүй, `getRecommendedProducts` нь `users`-ээс уншиж ч чадахгүй байв — хэрэглэгчийн хариулт санал болголтыг **яг тэг**-ээр өөрчилдөг байв. `server/routers.ts:162`-ийн тайлбар өөрөө "hairType/hairConcerns/fragrancePreference/**wellnessInterests** are used both ways" гэж бичсэн атал код нь тэгээгүй байсан тул энэ нь санаатай дизайн биш, орхигдсон алдаа. `skinConcerns`/`hairConcerns`-тэй ижил comma-separated multi-select тул ижил `scoreTokenListMatch` (priority decay) ашиглав. 5 газарт (users select, `hasAnyPreference` gate, recommended candidates select, related viewed select, related candidates select) холбов. Бодит каталог дээр 0 → 37 бараа.

### Bug 2 — зочны нүүр хуудсанд "Танд санал болгож байна" хэсэг бүхэлдээ алга болдог байв

`curl`-ээр `catalog.recommended`-ийг зочноор дуудахад `[]` буцаж байв. Шалтгаан: `getRecommendedProducts` нь preference/history-гүй үед `if (!hasAnyPreference && !hasAnyHistory) return bestsellers();` гэж **шууд early-return** хийдэг; энэ каталогт paid захиалга ~0 тул `getBestsellingProducts` хоосон буцдаг; `RecommendedForYou.tsx` нь `if (!products.length) return null` тул хэсэг ул мөргүй алга болдог байв. Хамгийн ноцтой нь: доор нь 2026-09-01-нд тусгайлан нэмсэн 3 дахь fallback tier ("ямар ч in-stock published бараагаар дүүргэх, score claim-гүй") хүртэл **огт хүрдэггүй** байсан — early-return түүнийг бүхэлд нь тойрч гарсан. Компонентын өөрийнх нь толгойн тайлбар "Always has content now (guest and never-tagged shoppers both get a bestseller-backed fallback server-side)" гэж батлан бичсэн нь бодит байдалтай зөрчилдөж байв.

Хамгийн бага засвар: bestseller хоосон бол early-return хийхгүй, доорх урсгал руу унагаана — preference байхгүй тул бүх score 0 болж, scoring хэсэг байгалийн жамаар алгасагдаж, зөвхөн сүүлийн tier дүүргэнэ. `curl`-ээр 0 → 8 бараа болсныг баталгаажуулав.

### Tagging дүрэм — бодит өгөгдлийг эхлээд хэмжиж байж бичсэн

Дүрэм зохиохын өмнө каталогийн бодит текстийг судлав. Гол нээлт: **917/937 барааны тайлбар нь импортын үед дүрмээр автоматаар үүсгэгдсэн загвар текст** (`PRODUCT-IMPORT.md`-ийн bulk-import хэсэг) — бүгд "`<брэнд>` нь Японы жижиглэнгийн худалдаанд өргөн танигдсан `<төрөл>` бөгөөд өдөр тутмын хэрэглээнд зориулагдсан..." гэсэн ижил бүтэцтэй, дундаж урт 225 тэмдэгт. Тиймээс арьс/үсний төрлийн тухай **бодит мэдээлэл текстэд огт байхгүй**: "тослог" 1 бараа, "хуурай" 4, "sensitive" 5, "combination" 0.

Харин **найрлага** (импортын үед бодитоор олдсон: CICA/Centella 29, коллаген 11, морины тос 10, гиалурон ~9, ретинол 5, niacinamide 2) болон **барааны хэлбэр** (нэрнээс: shampoo 46, mask 91, cream 56, lotion 33, serum 28, soap 43) нь жинхэнэ, ялгах чадвартай signal байв. Дүрмийг эдгээр дээр суурилуулав.

Нэр дэвшигч түлхүүр үг бүрийн бодит таарц тоог **урьдчилан хэмжсэн** нь 3 худал эерэгийг ШИЖИХЭЭС ӨМНӨ барьж авав:
- **`"зөөлөн"` skincare-ийн 443/560 (79%)-д таарч байв** — 2026-09-01-ний "dryness 441/445" урхитай яг ижил boilerplate. Ашиглаагүй.
- **`"жин"` нь `"жинхэнэ"`** гэсэн загвар үгэнд таарч байв (wellness ангилалд 32/37) — `PRODUCT-IMPORT.md`-д аль хэдийн тэмдэглэсэн `"epa" ⊂ "rEPAir"`-тэй ижил substring урхи. Ашиглаагүй.
- **`"rice" ⊂ "price"`** тул латин "rice" ашиглаагүй, зөвхөн Монгол "будаа".

Дүрэм бичсэний дараа **гарсан tag бүрийн ард байгаа бодит барааны нэрсийг хэвлүүлж уншсан** нь дахин 2 алдаа илрүүлэв:
- **`"sebum"`** нь "арьсны байгалийн тостой (sebum) маш ойролцоо бүтэцтэй" гэсэн **тайлбар** өгүүлбэрт таарч, өөрөө "хуурай, мэдрэг арьсыг зөөлрүүлнэ" гэж бичсэн squalane тосыг **"тослог" гэж эсрэгээр нь** тэмдэглэж байв. Хассан.
- **Үсний дүрэм биеийн бүтээгдэхүүн дээр ажиллаж байв**: "Үс ба бие" ангилал нь 118 бараанаас **82 үс + 36 бие** (body milk, bie угаагч, гарын саван) бөгөөд "S-Select High Moisturizing Body Milk"-ийг "хуурай ҮС"-ний бараа гэж тэмдэглэж байв. Нэрээр (hair/shampoo/conditioner/scalp/treatment/үс/шампун) хаалт нэмж зассан.

Үр дүн: **Tier-1 хамрах хүрээ 112 → 194**. Хамгийн чухал нь **quiz-д санал болгодог мөртлөө ямар ч дүрэм үүсгэж чаддаггүй байсан 2 утга** ажиллах болов: `skinConcerns: "sensitivity"` (CICA/Centella) ба `hairConcerns: "scalp_sensitivity"`.

Шинэ регресс тест 6 (`product-tagging.test.ts` 6 → 12): CICA→sensitive, sebum худал эерэг, rice⊂price, бие≠үс, "Moist Diane ... Repair"→damaged (брэндийн нэрэнд "Moist" байсан ч repair дүрэм түрүүлж ажиллана), scalp_sensitivity. Мөн нэг одоо байсан тестийн fixture-ийг солив: "S SELECT **White Clay** Foam cleanser" нэр нь шинэ дүрмээр бодит signal (clay = тос шингээгч цэвэрлэгч) болсон тул тестийн санаа ("boilerplate тайлбар ганцаараа tag үүсгэхгүй") хэвээр байлгахын тулд signal-гүй бодит бараагаар ("S SELECT whipping net 1P") сольсон.

### 246 барааны зураг сэргээв — хамгийн том олдвор

`scripts/reconcile-images-from-r2.ts --dry-run` ажиллуулахад R2-д `catalog/products/` дор **383 барааны 399 объект** байгаа атал Aiven-д зөвхөн **147** нь `imageUrl`-аар холбогдсон байв. Өөрөөр хэлбэл өмнөх session-үүдэд websearch-ээр олж, нүдээр шалгаж, upload хийсэн **246 барааны хөдөлмөр "алдагдсан"** хэвээр байсан. Хамгийн боломжит шалтгаан нь тэр өдрийн `DATABASE_URL` incident: зургийн байт нь хуваалцсан R2 руу очсон, харин `imageUrl` нь буруу local MySQL руу бичигдсэн.

Аюулгүй байдлыг шалгасан: объектын зам нь тухайн барааны **өөрийн id**-г агуулдаг тул андуурах эрсдэлгүй; нэмээд 10 дээжийн R2 файлын нэрийг DB дэх барааны нэртэй тулгахад **бүгд яг таарч** байв (жишээ: id=1003 `club-suppin-powder` → "Club Suppin Powder"). Backup аваад apply хийв: **246 мөр шинэчлэгдэж, зурагтай бараа 147 → 393** боллоо. Сэргээсэн зургийн нэгийг `curl -L`-ээр шалгахад бодит **200 / 24,674 байт** ирж байгааг баталгаажуулав (DB дэх мөр биш, жинхэнэ файл).

### Tier-2 placeholder цэвэрлэгээ

`auto-tag-products.ts` нь зөвхөн `NULL` багана дээр бичдэг (admin-ы гараар оруулсныг хэзээ ч дарж бичихгүй) тул сайжруулсан дүрэм аль хэдийн `"normal"` бичигдсэн 590 skinType / 104 hairType дээр огт нөлөөлөхгүй байв — dry-run нь 937/937 → 937/937 (өөрчлөлтгүй) гэж харуулав. Tom зөвшөөрсний дараа эдгээр placeholder-ыг цэвэрлээд дахин бодов.

Аюулгүй байдлын үндэслэл (таамаглаагүй, шалгасан): `suggestTagsForProduct` нь skinType/hairType-д `"normal"` утгыг **хэзээ ч үүсгэдэггүй** (дүрмүүд нь зөвхөн sensitive/oily/dry/combination ба damaged/color_treated/oily/dry гаргана) тул бүх `"normal"` нь Tier-2-ийн бичсэн placeholder гэдэг нь тодорхой; мөн bulk apply-аас хойш `updatedAt`-аар шалгахад **гараар засагдсан бараа 0** байв.

Эцсийн байдал: `skinType` sensitive 4 → **25**, oily 0 → **5**; `hairType` dry 0 → **9**; `skinConcerns` sensitivity 0 → **21**; `hairConcerns` 0 → **25**; tag coverage 937/937 хэвээр.

Apply-ийн дараа өмнө хоосон байсан профайлуудыг дахин ажиллуулав: "Хуурай үс" 0 → **9** (moisture шампунь/treatment), "Тослог арьс" 0 → **5** (charcoal scrub, clay cleanser), "Мэдрэг арьс" ~0 → **25** (CICA бүтээгдэхүүн), "Толгойн арьс мэдрэмтгий" 0 → **13** (scalp шампунь). Бүх гарцыг нэрээр нь уншиж, сэдэвт нийцэж байгааг баталгаажуулав.

### Дүрмээр цаашид засах боломжгүй хязгаар

`skinType`-ийн **combination**, `hairType`-ийн **oily/color_treated** нь 0 хэвээр, 564 бараа `skinType="normal"` placeholder хэвээр байна. Энэ бол дүрмийн сул тал биш — **өгөгдөлд тэр мэдээлэл огт байхгүй** (POS export нь баркод+нэр+үнэ, тайлбар нь автоматаар үүсгэгдсэн). Дүрмийн боломж энэ session-д дуусгагдсан; цаашид зөвхөн илүү сайн барааны өгөгдөл (websearch баяжуулалт эсвэл admin-аар гараар оруулах) л энэ тоог хөдөлгөнө.

### Тестийн дэд бүтцийн цоорхой

Бүрэн suite ажиллуулахад **22 файл "Database unavailable" / "Storage config missing"**-ээр унав. Шалтгаан: `vitest.config.ts` нь **`.env`-ийг огт ачаалдаггүй** — integration gate-үүд (`RUN_AUTH_INTEGRATION_TESTS` гэх мэт) тестийг АСААДАГ ч `DATABASE_URL`/`S3_*` байхгүй тул тэдгээр нь шатдаг. Ажлын лаптоп дээр shell-д гараар export хийж байсан бололтой. Шинэ `server/_test-setup.ts` (`import "dotenv/config"`) + `setupFiles` нэмж зассан — CI дээр `.env` байхгүй тул dotenv чимээгүй no-op болж, gate-үүд хэвээр унтарна.

`.env` ачаалагдсаны дараа **186/194 passed**, үлдсэн 8 нь бүгд `Test timed out in 5000ms`. Эдгээрийг 60с timeout-оор дахин ажиллуулахад **36/36 pass** (нэг тест 5-10с зарцуулдаг — Aiven руу олон round trip хийдэг тул) — өөрөөр хэлбэл assertion алдаа огт байгаагүй, зөвхөн сүлжээний саатал байв. `testTimeout: 30000` болгов: сүлжээнд хангалттай, гэхдээ жинхэнэ hang-ийг барихаар бага.

Хоёр засварын дараа бүрэн suite **194/194 ✅ (34/34 файл, 341с)** — ямар ч гар тохиргоогүйгээр, зөвхөн 3 gate env var-ыг өгөхөд шууд ногоон гарна.

### Анзаарсан операцийн эрсдэл

Integration suite нь **хуваалцсан бодит Aiven DB дээр** түр бараа/захиалга үүсгэдэг тул ажиллаж байх агшинд тэдгээр нь амьд `/shop` дээр зочинд харагдана. QA явцад авсан нэг screenshot дээр "Coupon Test Product 40,000₮" яг тэр агшинд орсон байсан (тест дуусмагц устсан, `orders`-т ул мөр үлдээгүй). Бодит хэрэглэгч сайтад орж эхэлсэн үед бүрэн suite-ийг production DB дээр ажиллуулах нь тохиромжгүй — ирээдүйд тусдаа test schema/DB рүү салгах нь зүйтэй.

### Үлдсэн 544 зургийн бодит дүн шинжилгээ

Зургийн ажлыг үргэлжлүүлэхээр хамгийн үнэ өндөртэй 3 бараанаас эхлэхэд **3-уулаа зураг биш, өгөгдлийн асуудал** гарав (0/3):

- **id=807 `PRIECLAT serum W` (sku 4955814711863) — SKU/нэрний зөрчил.** Албан ёсны SUGI Drug сайт дээр энэ баркод нь **クリームW (Cream W) 27g**; жинхэнэ Serum W-ийн баркод `4955814707477` нь манай каталогт id=804 гэж аль хэдийн байгаа. Каталогт `cream E` байгаа мөртлөө Cream W байхгүй нь id=807 үнэндээ Cream W гэдгийг дэмжинэ. **Нэр солих нь амьд дэлгүүрт харагдах өөрчлөлт тул зөвшөөрөлгүй хийгээгүй** — Tom-д санал болгосон.
- **id=859** (S-Select aojiru): баркодын угтвар Yuwa үйлдвэрийнх, уутны тоо (50 vs 56) таарахгүй.
- **id=725** (Uru-up Collagen): албан ёсны сав 185g / 212g≈32 хоног, манайх "42-day" — таарахгүй.

Энэ 0/3 нь санамсаргүй биш болохыг тоогоор баталгаажуулав: **үлдсэн 544-ийн 217 (40%) нь S-Select хувийн брэнд**, харин аль хэдийн зурагтай 393-ийн зөвхөн **24 (6%)** нь S-Select. Өөрөөр хэлбэл өмнөх 12 batch хялбар (брэндийн) барааг аль хэдийн түүсэн бөгөөд үлдсэн нь `image-sourcing-log.md`-ийн дахин дахин тэмдэглэсэн "онлайнд зураг байхгүй, зөвхөн бөөний нийлүүлэгчид зориулагдсан" сүүл. `PRODUCT-IMPORT.md`-ийн анхны таамаг ("~40% зураггүй үлдэж, эцэст нь дэлгүүрээс бодитоор зураг авах шаардлагатай") бодитоор биелсэн байна. Тиймээс бодит зам: **S-Select биш 327-г онлайнаас үргэлжлүүлэх, S-Select 217-г дэлгүүрт зураг авах жагсаалт болгож Tom-д өгөх**.

⚠️ **Мөн нэг цоорхой**: `backups/image-sourcing-log.md` нь `.gitignore`-т багтдаг тул **хоёр лаптоп хооронд синк болдоггүй** — нэг лаптоп дээрх ахиц нөгөөд харагддаггүй нь дээрх "246 зураг алдагдсан" нөхцөл байдалд хувь нэмэр оруулсан байх магадлалтай. Цаашид энэ ажлыг 2 лаптоп дээр үргэлжлүүлэх бол логийг tracked газар (`docs/`) зөөх нь зүйтэй.

### Зургийн эх сурвалжийн бүрэн эрэл (2026-09-01, Tom-ийн шаардлагаар)

Tom дээрх "S-Select-ийн зураг онлайнд байдаггүй" гэсэн дүгнэлтийг **татгалзаж**, "бүх зургийг сайн хай, япон хэлээр хай" гэж тодорхой шаардав. Тэр зөв байсан — нэг бүрчлэн websearch хийхийн оронд **баркодоор индексжсэн эх сурвалж** хайх нь зөв зам байв.

**Ажилласан 2 эх сурвалж:**

1. **sugi-drug.com (スギ薬局 Beauty Store)** — Shopify дэлгүүр бөгөөд `products.json` нээлттэй, хамгийн чухал нь **`handle` талбар нь яг JAN баркод** (`"handle":"4955814717902"`). Бүх каталогийг (543 бараа, бүгд зурагтай) татаж, манай `sku`-тай тааруулав → **28 таарц**, зураг нь 2000×2000 албан ёсны фото. Нэрсийг япон гарчигтай нь тулгаж баталгаажуулсан (`ハトムギ泡洗顔` = "Hatomugi Foaming Face Wash" г.м).

2. **sugi-point.jp (SUGI-гийн оноо солилцооны каталог)** — хамгийн үр дүнтэй нь байв: зургийн файлын нэр нь **шууд баркод** (`/upload/save_image/<JAN>-1_1.jpg`) тул хайлт огт шаардахгүй, SKU-гаас URL-ыг шууд угсарна. **101 бодит зураг** олдов.

**⚠️ sugi-point дээр барьж авсан ноцтой урхи**: эхний туршилтад 20/20 (100%) "олдсон" гэж гарсан — гэвч бүх файл яг ~8KB байсныг анзаарч нүдээр нээж үзэхэд **саарал "зураг байхгүй" placeholder** байв. Сайт байхгүй зурагт ч HTTP 200 буцаадаг. Placeholder-ийн яг sha256-г тооцоолж шүүсний дараа бодит тоо **101/516** болов (415 нь placeholder байсан). Зөвхөн HTTP статус/тоог харсан бол **500 гаруй хог зургийг каталогт бичих** байсан — энэ session-ий "тоо биш, бодит гарцыг үз" гэсэн загварын дахин нэг тохиолдол.

**Ажиллаагүй, дахин оролдох шаардлагагүй эх сурвалжууд** (бүгд бодитоор туршсан):
- **Rakuten** (`search.rakuten.co.jp`, `item.rakuten.co.jp`) — curl-д 43 байт буцаадаг, WebFetch timeout. JS-рендер.
- **Amazon.co.jp** — 200 буцаана ч бүтээгдэхүүний markup байхгүй (robot/JS).
- **Yahoo!ショッピング / LOHACO** — JS-рендер, статик зураг байхгүй.
- **matsukiyococokara-online.com** — 403.
- **monotaro / askul / kenko / soukai / tsuruha / welcia / sundrug** — 404 эсвэл холбогдохгүй.
- **www.sugi-net.jp/product-detail/&lt;JAN&gt;** — зөв URL хэв маягтай (Next.js) боловч `_next/data/.../<JAN>.json` нь **бүх JAN-д `product:{}` хоосон** буцаана, тэр дундаа тэдний өөрийн каталогт байгаа бараанд ч.
- **privatebrand.sugi-net.jp** — зөвхөн маркетингийн танилцуулга, каталог биш.
- **Үйлдвэрлэгчийн сайтууд** (naturelab, kumanoyushi, japangals, smilehoney) — Shopify биш, `products.json` байхгүй.
- **JAN сангууд** (jancode.xyz 403, jancode.jp 404) — хаалттай.

**kireicosme.jp — ажилласан ч ЧАНАРААР ТЭНЦЭЭГҮЙ**: Японы гоо сайхны бөөний каталог, `find[f_keyword]`-оор JAN хайлт ажилладаг, бүтээгдэхүүний хуудсанд манай яг JAN байгааг баталж болдог. 415 барааг сканердаж **20 таарц** олов. Гэвч бүх зураг нь **250×250 (зарим нь 120×120) thumbnail** бөгөөд том хувилбар нь бүгд 403 буцаана. Одоо каталогт байгаа 600–2000px зурагтай зэрэгцүүлбэл мэдэгдэхүйц муу харагдах тул **хэрэглээгүй**. Ирээдүйд энэ эх сурвалж руу дахин орох шаардлагагүй.

**Үр дүн: зурагтай бараа 147 → 522/937 (56%)**, нэг session дотор 3.5 дахин өссөн:

| Алхам | Нэмэгдсэн | Дүн |
|---|---|---|
| Эхлэл | — | 147 |
| R2-оос сэргээсэн (алдагдсан ажил) | +246 | 393 |
| sugi-drug.com Shopify | +28 | 421 |
| sugi-point.jp | +101 | **522** |

**Үлдсэн 415** — `docs/products-needing-photos.csv` (id, баркод, ангилал, брэнд, нэр, үнэ; ангиллаар эрэмбэлсэн, дэлгүүрт ажиллахад бэлэн). Ангиллаар: Арьс арчилгаа 199, Эрүүл ахуй 122, Үс ба бие 42, Ээж ба хүүхэд 22, Гоо сайхан 17, Эрүүл мэнд 13. Үүнээс S-Select 104, брэндийн бараа 311. Дээрх бүх автомат эх сурвалжийг шавхсан тул эдгээрт **дэлгүүрт өөрөө зураг авах** нь бодит цорын ганц зам (`PRODUCT-IMPORT.md` үүнийг анхнаасаа таамагласан).

**Мөн засварласан өгөгдлийн алдаа**: `id=807` нь `PRIECLAT serum W` гэж нэрлэгдсэн атал баркод нь (`4955814711863`) албан ёсны SUGI Drug каталогаар **クリームW (Cream W) 27g** байв; жинхэнэ Serum W (`4955814707477`) нь id=804 гэж аль хэдийн байсан (давхардал). Tom зөвшөөрснөөр `PRIECLAT Cream W` болгож нэр/slug/тайлбарыг зассаад албан ёсны зургийг нь хэрэглэв.

### Баталгаажуулалт

`pnpm check` бүх checkpoint дээр цэвэр. Unit: `catalog-filter.test.ts` 18/18, `product-tagging.test.ts` 12/12. Бүрэн suite `.env` ачаалагдсан үед 186/194, latency-ийн 8-ыг 60с-т дахин ажиллуулахад 36/36. Playwright (түр суулгаад дараа нь бүрэн хассан): нүүр (1440/390px), Shop, бүтээгдэхүүний хуудас — **эвдэрсэн зураг 0**, хэвтээ overflow 0, console алдаа 0; нүүр хуудасны "Танд санал болгож байна" хэсэг 6 бодит зурагтай гарч байгааг, Shop дээр сэргээсэн зураг (LoveLiner) бодитоор харагдаж байгааг нүдээр баталгаажуулав.

---

## Preference Profile v2 + Recommendation Engine v2 + Admin Analytics segment view (2026-09-01)

Tom Profile хуудасны "Хувийн профайл" таб хэт basic, "Гоо сайхны & Гэрийн профайл" хэсэг хэт богино гэж мэдэгдэж, дараах бүгдийг нэг зэрэг шаардав: (1) бүрэн хувийн мэдээлэл (хаяг/дүүрэг/ажил/нас/хүйс), (2) олон сегмент-тэй өргөтгөсөн "Гоо сайхны & Гэрийн профайл", (3) 937 барааны каталогоос бодитоор тохирсон бараа санал болгох систем ("судалгаа гаргасан дизайн болон шинэ дата систем"), (4) `/admin` Analytics-ийг ("хэт oldschool") нэгэн зэрэг шинжлэх. Тодорхой websearch/судалгаа хийхийг шаардсан.

**Судалгаа/төлөвлөлт**: 3 Explore agent зэрэг ажиллуулав (1: одоогийн Profile preferences + recommendation engine кодын байдал, 2: одоогийн admin Analytics-ийн бүрэн inventory, 3: websearch — Curology/Typology/The Ordinary/Ulta/Function of Beauty/Glossier-ийн quiz UX pattern, home-goods personalization, recommendation engine best-practice, 2026 admin analytics trend). Дараа нь Plan agent (**бодит Aiven DB-ээс шууд query асуусан**: 937 барааны зөвхөн 4 нь tag-тай, 0 interior бараа байгаа, 767/937 (82%) generic shortDescription-той гэдгийг олж, эдгээр бодит тоо дээр үндэслэсэн боловсронгуй төлөвлөгөө гаргав). AskUserQuestion-оор 3 чухал шийдвэрийг Tom-оос тодорхой асуув: (a) UI хэлбэр — **quiz wizard** (segmented card биш) сонгов, (b) `catalog.recommended` **public** (guest-д ч bestseller fallback) болгохыг сонгов, (c) bulk auto-tag script-ийг **эхлээд dry-run тайлан үзүүлж, "za" гэсний дараа** бодит Aiven дээр ажиллуулахыг сонгов.

**Хэрэгжүүлэлт** (дэлгэрэнгүй файл жагсаалт CLAUDE.md-д):
- Migration 0038: 8 шинэ `users` талбар, 4 шинэ `products` талбар (mirror).
- `shared/catalog-filter.ts`-д recommendation engine v2-ийн цэвэр scoring функцууд (`scorePreferenceMatch`/`scorePriceBandAffinity`/`applyDiversityCap`/`computeCategoryAffinity`) + бүх шинэ vocabulary/label/option — Profile.tsx-ийн хуучин локал массивуудыг эндээс дахин ашигладаг болгосон (label drift багасгасан).
- `shared/product-tagging.ts` (шинэ): rule-based keyword `suggestTagsForProduct` — таамаглахгүй, зөвхөн бодит signal олдвол л tag санал болгоно.
- `server/db.ts`-ийн `getRecommendedProducts` бүрэн v2 (preference match backbone + захиалгын түүхийн category affinity + үнийн зурвас + wishlist-adjacency + diversity cap + cold-start/thin-result bestseller fallback), шинэ `getRelatedProducts`+`catalog.related` (ProductDetail-ийн шинэ related-products хэсэг).
- `client/src/components/ProfileQuizWizard.tsx` (шинэ, 6 алхам+review), `RecommendedForYou.tsx` (Shop.tsx-аас extract, Home.tsx-д мөн ашигласан).
- `AdminWorkspace.tsx`-ийн PERSONALIZATION TAGS блок 4 шинэ талбар + admin-д зориулсан dismissible санал chip.
- `server/analytics.ts`-ийн `getPreferenceSegmentBreakdown`/`getRecommendationCoverage` + `AdminAnalyticsPanel.tsx`-ийн шинэ "Тохиргооны сегмент"/"Санал болгох хамрах хүрээ" секц.
- `scripts/auto-tag-products.ts` (шинэ, 2-tier: keyword match + category-level default) — dry-run горимд л ажилласан, бодит `--apply` хараахан хийгдээгүй.

**🔴 Playwright QA-ийн үеэр Tom өөрөө localhost:3000 дээр амьдаар ажиглаж байхдаа олсон bug**: "юу сонгосон ч дандаа хүүхдийн бараа гарч байна" гэж шууд мэдэгдэв. Шалтгаан: `hasYoungChildren` scoring жин (+3) нь skinType/hairType exact match-тай (+3) яг ижил байсан бол, production дээрх tagging coverage 4/937 л байсан тул бусад бүх signal хоосон гарч, энэ ганц signal л жагсаалтыг бүхэлд нь дарж авчихсан байв. Жинг +3→+1 (fragrancePreference-тэй ижил "зөөлөн" signal), diversity cap-ыг maxPerCategory 4→3 болгож засаад, Tom-ийн бодит хадгалсан тохиргоогоор шууд дахин шалгаж (3 арьс арчилгаа + 3 Ээж/хүүхэд) баталгаажуулав.

Мөн энэ явцад **Tom "937/937 tagged болго" гэж тодорхой шаардаж**, анхны Tier-1-single 113/937 хангалтгүй гэж татгалзсан — `auto-tag-products.ts`-д Tier 2 (category-level default, зөвхөн admin chip-д харагдахгүй, зөвхөн bulk script-д) нэмж 937/937 dry-run гаргав.

Явцад бас **өөрөө олж заасан 2 дахь bug** (Tom харахаас өмнө): auto-tag-ийн keyword matcher "чийгшүүлэх" төрлийн boilerplate-аас болж 441/445 (99%) skincare барааг "dryness" гэж дүрмээр tag хийж байсныг dry-run гарцыг өөрөө нягталж олж, зөвхөн тодорхой ингредиент/хэллэгээр солив.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` олон checkpoint дээр цэвэр. Шинэ unit тестүүд: `catalog-filter.test.ts` (+17, scoring функцууд), `product-tagging.test.ts` (6, dryness-bug-ийн regression тест орсон) — бүгд ✅. `profile.integration.test.ts`-д +2 шинэ тест (v2 талбарууд, invalid enum rejection) — 14/14 ✅. Playwright-ээр (throwaway staff→admin эрхтэй хэрэглэгчээр, дараа нь DB-ээс бүрэн устгасан): wizard бүрэн 6 алхам+review дуусгаж, reload хийсний дараа ч хадгалагдсан хэвээр байгааг баталгаажуулсан; Shop/Home "Танд санал болгож байна", ProductDetail related-products бүгд render хийж байгааг баталгаажуулсан; admin Analytics шинэ секц, catalog product edit-ийн шинэ талбарууд бүгд ажиллаж байгааг баталгаажуулсан; console алдаагүй.

**✅ Дуусав**: commit/push + CLAUDE.md/HISTORY.md + self-review.md-г Tom-ийн шаардсан дараалалаар дуусгасны дараа Tom эцсийн "за"-г AskUserQuestion-оор өгсөн. `scripts/db-backup.ps1`-ээр backup аваад (`backups/defaultdb_2026-09-01_194214.zip`), `scripts/auto-tag-products.ts --apply` бодит Aiven дээр ажиллуулж **937/937 бараа tag-тай болгов**, шууд DB query-ээр давхар баталгаажуулав.

**Apply хийх явцад олдсон 3 дахь bug**: цэвэр ганц signal-тэй хэрэглэгчид (жишээ нь зөвхөн "Хуурай үс") `getRecommendedProducts` 0 үр дүн буцааж байсан — Tier 2 category-default ихэнх hair барааг "normal"-аар л tag хийсэн (яг "dry" тохирох цөөн) + production дээр 0 paid захиалга байгаа тул bestseller fallback ч хоосон — 2 fallback tier зэрэг хоосон гарсан. 3 дахь, эцсийн fallback tier (ямар ч нийтлэгдсэн, нөөцтэй бараагаар дүүргэх, score claim-гүй) нэмж section хэзээ ч бүрэн хоосон харагдахгүй болгов. `pnpm check`/`pnpm build` дахин цэвэр, throwaway хэрэглэгчээр (2 өөр реалист профайл) apply-ийн дараа шууд дахин баталгаажуулав.

---

## Quick Stats infinity graph — зочны төлөвт огт харагдаагүй bug, reference fidelity засвар (2026-08-31)

Tom нүүр хуудасны Quick Stats хэсгийг reference зурагтай харьцуулаад "too basic" гэж татгалзсан, "Claude AI Pro олон удаа буруу хийсэн" гэж мэдэгдсэн. Plan mode-т орж, зөвхөн код унших замаар (dev server ажиллуулахгүйгээр) `InfinityGraph.tsx`/`QuickStatsSection.tsx`-ийг master-prompt баримт бичгийн §16-тай нэг мөр нэгээр харьцуулж, 6 тодорхой mismatch (Finding A-F) олов. Хамгийн том нь: **Finding F — зочны төлөвт infinity graph огт харагдаагүй**, зөвхөн 4 талбарын box харагддаг байсан. Tom баталгаажуулав: тэрбээр яг зочны төлөвөөр харьцуулж байсан тул энэ нь гол шалтгаан байв.

Хийсэн засвар:
1. Зочны төлөвт `shared/loyalty.ts`-ийн бодит функцээс тооцоолсон жишээ утгаар (₮600,000 → Хүрэл 3%) мөн адил InfinityGraph харуулж, дэлгэц дээр тод "ЖИШЭЭ ХАРУУЛАЛТ" шошго нэмэв.
2. Гарчиг "Илүү их худалдан авалт..." (монгол хэллэг)-ээс "Quick Stats" (reference-ийн яг өөрийнх нь текст) болгож, монгол тайлбарыг доор нь subtitle болгож нэмэв — master prompt §16.5-ийн тодорхой заавар.
3. `InfinityGraph.tsx`-д SVG `<linearGradient>` нэмж flat өнгийг gradient болгов; шинэ `--graph-copper`/`--graph-copper-light`/`--graph-charcoal`/`--graph-gold-muted` token нэмж, брэндийн тод vermilion/gold-ыг ашиглахгүй болов (master prompt: "muted terracotta, not bright red").
4. Geometry: 2 тойргийн зайг 140px→166px болгож (R=88 хэвээр), 36px давхцлыг ~10px pinch болгов — жинхэнэ ∞ crossing шиг.
5. `formatMntCompact` нэмж ("1.1M₮" загвар, master prompt §16.7) infinity graph доторх урт тоог товчлов.
6. Screenshot хийх явцад олдсон, холбоогүй bug: `.eyebrow` class (`display:inline-flex`, сайт даяар ашиглагддаг) зочны төлөвт `.qs-cta`-той нэг мөрөнд наалдаж байсныг `.qs-copy > .eyebrow { display: flex; }` (scoped, глобал биш) засвараар шийдэв.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр, Playwright түр суулгаад 1440/768/375px дээр зочны screenshot, throwaway хэрэглэгч+захиалгаар authenticated screenshot (Мөнгөн 5%, 1.1M₮ зарцуулалт, 24,000₮ хэмнэлт, Алтан хүртэл 8,924,000₮ дутуу — бүгд зөв), дараа нь бүх throwaway өгөгдлийг устгаж баталгаажуулав. Playwright бүрэн хасав.

---

## Нүүр хуудасны premium reference-driven редизайн (2026-08-28)

Бүх Home.tsx-ийг (302 мөрийн монолит) `client/src/components/home/*.tsx` section-компонент болгож задалсан: `HeroSection`, `TrustStrip`, `QuickStatsSection`+`InfinityGraph` (шинэ, гишүүнчлэлийн infinity graph, зочин/нэвтэрсэн 2 төлөвтэй), `CategoryMasonry`, `WhyChooseUs` (шинэ, харанхуй 3 карт), `JournalSection` (staggered restyle, 1/2/3-post тохиолдол тус бүрт), `StoreLocatorSection` (3-бүсийн зохион байгуулалт, static SVG газрын зураг — Google Maps API key байхгүй тул `Map.tsx`-ийг холбоогүй). Backend: `server/db.ts`-ийн `getUserLoyaltyStatus`-д шинэ `totalLoyaltySavingsMnt` талбар (зөвхөн `paymentStatus="paid"` захиалгын `loyaltyDiscountMnt` нэгтгэдэг), 4 шинэ тест `server/loyalty.integration.test.ts`-д. `AdminAnalyticsPanel.tsx`-ийн `polarPoint`/`arcPath` SVG arc math-ыг `client/src/lib/svg-arc.ts`-руу зөөж хуваалцав.

**Баталгаажуулалт** (Playwright түр суулгаад дараа нь бүрэн хассан): 1440–320px бүх breakpoint дээр хэвтээ overflow 0; жинхэнэ throwaway хэрэглэгч+захиалгаар authenticated Quick Stats infinity graph screenshot аваад тоо мат зөв болохыг баталгаажуулж (Мөнгөн 5%, ₮1,076,000 зарцуулалт, ₮24,000 хэмнэлт, Алтан хүртэл ₮8,924,000 дутуу), дараа нь бүх throwaway өгөгдлийг DB-ээс устгасан. Нэг CSS bug засав (mobile category card текст сум icon-той давхцаж байсан).

**⚠️ Чухал нээлт**: энэ (гэрийн) лаптопын `.env` аль хэдийн Aiven shared DB руу заасан байсан (937 бараа, бодит захиалга баталгаажлаа) — өмнөх "гэрийн лаптоп дээр 0 бараа" тэмдэглэл хуучирсан байв.

**Дараа нь Tom Categories хэсгийг reference зурагтай нарийн харьцуулаад татгалзсан** (grid-мэт харагдаж байгаа, overlap/staggered/photo-led card байхгүй гэж). Дэлгэрэнгүй audit + v3 fix spec: `C:\Users\Inspiron\.claude\plans\the-attached-image-is-virtual-kite.md`. `CategoryMasonry.tsx` бүтэн дахин бичигдэж (`.cat-mosaic-top` 2-багана мөр heading+anchor, `.cat-mosaic-grid` 6 картын 3x2 grid доор нь, 2 карт image-led+overlap, 2 карт staggered offset) — session tokens дуусаж, баталгаажуулалт хийгдээгүй commit+push хийгдсэн.

### CategoryMasonry v2 баталгаажуулалт дуусав (гэрийн лаптоп, дараагийн session)
Playwright-аар screenshot + `getBoundingClientRect()` pixel-хэмжилт хийж 3 бодит bug олж засав:
1. **Overlap card бодитоор давхцаагүй байсан** (0px/-8px, шаардсан 24-40px биш) — `margin-top`/`translateY` тооцоо буруу байсныг pixel хэмжилтээр олж зассан → баталгаажсан **32px/26px** бодит overlap.
2. **Anchor-ийн "Ойр салбараа олох" линк overlap card-д халхлагдаж байсан** — `bottom: 24px→64px` болгож зассан.
3. **Category placeholder SVG-үүдэд (`category-placeholder-*.svg`, `product-placeholder.svg`) far "SUGI ASAYAKE" watermark текст шингэсэн байсныг** (`grep`-ээр SVG эх файлаас олов, y=335/400≈84%) `background-size:cover`-ээр card дүүргэхэд ил гарч байгааг олж, scrim gradient тохируулж (icon бүрэн харагдаж, зөвхөн watermark нуугдахаар) шийдэв — эхний хувилбарт scrim хэт хүчтэй болж icon-ийг бүхэлд нь нуучихсан алдааг мөн олж дунд зэргийн тэнцвэрт хувилбар олов.
4. **Mobile 2-багана дээр "Эрүүл мэнд" картын гарчиг icon-той давхцаж байсныг** min-height нэмэгдүүлж, гарчгийг 1-мөрөнд clamp хийж зассан.

Бүх засвар `pnpm check`/`pnpm build` цэвэр, 1440/1024/768/430/375px screenshot + pixel-хэмжилтээр баталгаажсан.

---

## Navigation state fix (2026-08-28)
- Applied the catalog URL-state fix to the main working copy: page number and category/search state survive product navigation and refresh.
- Prevented the initial loading state from clamping a restored page back to page 1 before the catalog query finishes.
- Added working product breadcrumbs and an Admin sidebar homepage link.

---

## Shared Aiven MySQL migration (2026-08-28)
- Local MySQL data was imported into the empty Aiven MySQL `defaultdb` service so both laptops can share the same `site_media`, products, and order metadata while Cloudflare R2 continues to store image bytes.
- Aiven connectivity was verified over TLS with the MySQL client and the imported database contains the existing 937 products.
- `scripts/db-backup.ps1` and `scripts/db-restore.ps1` now accept Aiven URIs with `?ssl-mode=REQUIRED` and pass `--ssl-mode=REQUIRED` to the MySQL tools.
- Credentials remain local-only in `.env`; no password or certificate was added to the repository.
- Windows Task Scheduler-ийн `SUGI ASAYAKE Daily DB Backup` task-ийг 23:30-аас **19:00** болгож шинэчилсэн (өдөр бүр, 14 backup хадгална).
- Aiven-ийн 30 хоногийн trial дуусахаас өмнө хамгийн сүүлийн бүрэн `.zip` backup-ийг татаж авч, тусдаа төхөөрөмж/cloud drive дээр хадгалах болон `db-restore.ps1`-ээр буцаан сэргээх төлөвлөгөөг баримтжуулсан.

---

## Манус-ээс салгах явц, эхний bug-ууд (2026-08-20-аас өмнөх)

### 1. Manus-ээс бүрэн салгасан
- `server/_core/oauth.ts` (Manus OAuth) → **устгасан**, оронд нь `server/routers.ts`-ийн `auth` router дотор `register`/`login`/`logout`/`me` procedure бичсэн (email+password, JWT session)
- `server/_core/env.ts`, `context.ts`, `trpc.ts`, `cookies.ts`, `notification.ts`, `systemRouter.ts`, `vite.ts`, `shared/_core/errors.ts` — бүгд шинээр бичигдсэн
- `server/storage.ts`, `server/_core/storageProxy.ts` → Manus Forge-ийн оронд **бодит AWS S3-compatible bucket**-тай ажилладаг болгосон (`@aws-sdk/client-s3` ашиглана)
- `vite.config.ts` → `vite-plugin-manus-runtime`, debug-collector, `allowedHosts` хязгаарлалт бүгдийг устгасан
- `drizzle/schema.ts` дэх `users` хүснэгтээс `openId`/`loginMethod` (Manus OAuth) хассан, `passwordHash` нэмсэн — migration: `drizzle/0009_independent_auth.sql`
- Password hashing: Node built-in `scrypt` ашигладаг (`server/_core/password.ts`), гадны dependency нэмээгүй

### 2. Localhost дээр бодит туршилтын орчин зохион байгуулсан
- **MySQL 8** (native Windows суулгалт, Docker биш — Docker Desktop суулгах гэж оролдоход Windows boot эвдэрч, `bcdboot`-оор засварласан удаа бий, тиймээс энэ төсөлд Docker-оос зайлсхийсэн)
- **MinIO AIStor** (одоогийн үнэгүй хувилбар нь license key шаарддаг, `MINIO_LICENSE` env var-аар дамждаг) — хожим (2026-08-26) Cloudflare R2 руу шилжсэн, доор үзнэ үү

### 3. Бодит ашиглалтаас олдсон, засагдсан bug-ууд
- **`client/src/pages/ProductDetail.tsx`** — React "Rules of Hooks" зөрчил байсан (`useMemo` нь эрт `return`-ийн ДАРАА бичигдсэн байсан тул "Rendered more hooks than during the previous render" crash өгдөг байсан). Засагдсан.
- **Пост/мэдээ функц бүрэн дутуу байсан** — admin панель дотор пост үүсгэж "Нийтлэх" боломжтой байсан ч, олон нийтэд харуулах хуудас/route огт байхгүй байсан. Шинээр бүтээсэн: `getPublishedPostBySlug()`, `content.bySlug` public procedure, `PostDetail.tsx`, `/:slug` catch-all route.

---

## ⚠️ Чухал bug: MySQL timestamp 8 цагаар зөрдөг байсан (2026-08-20, TIER4)
Локал MySQL серверийн session `time_zone = SYSTEM` (Asia/Ulaanbaatar = UTC+8) байсан бол `drizzle-orm`-ийн mysql `timestamp` багана нь DB-ээс ирсэн raw утгыг үргэлж UTC гэж таамаглаж уншдаг (`+0000` нэмдэг). Үүний үр дүнд `defaultNow()`-ээр автоматаар үүсдэг бараг бүх хүснэгтийн `createdAt`/`updatedAt` нь app-ын `new Date()`-тэй шууд харьцуулахад бодит утгаасаа 8 цагаар түрүүлж харагддаг байсан. TIER4-ийн Audit Log-ийн огнооны шүүлтүүр бичих явцад илэрсэн. **Засаж, root cause-д нь шийдсэн:** `server/db.ts`-ийн `getDb()`-д MySQL connection pool-ийн `'connection'` event дээр `SET time_zone = '+00:00'` ажиллуулдаг болгосон.

Яагаад өмнөх бүх тест үүнийг олж чадаагүй бэ: Token/session expiry шалгалт бүгд app-аас бичигдэж, app-аас уншигддаг утгыг ашигладаг байсан тул бичих/унших хоёр тал ижил хазайлтаар давхар цуцлагддаг байсан — зөвхөн DB талаас автоматаар үүссэн утгыг app-ын шинэ `Date`-тэй шууд харьцуулах үед л алдаа гарч ирдэг байсан.

---

## Feature-ийн явц (огноогоор)

**TIER 0/1/5 CI+backup, Guest checkout (2026-08-20)** — `cart.*`/`checkout.createOrder` `publicProcedure`, `guest_cart_token` cookie-оор зочны сагс, нэвтрэхэд автомат нэгтгэгддэг. Дэлгэрэнгүй UX-RESEARCH.md, ROADMAP.md.

**ADMIN-PANEL.md TIER 1–6 (2026-08-20)** — Dashboard+Global Search, хэрэглэгч suspend/force-logout, `staff` RBAC role, Audit Log+Login History, Bulk Actions+CSV Export, DB/S3 health widget. Дэлгэрэнгүй ADMIN-PANEL.md.

**Профайл хуудас (`/profile`, 2026-08-21)** — avatar/нэр/утас засах, address book, checkout автомат бөглөлт. Secondary pages (Login/ForgotPassword/VerifyEmail/AcceptInvitation/Legal/MyOrders/NotFound) + admin sidebar брэнд шинэчлэл.

**Захиалгын имэйл мэдэгдэл + Personalization TIER 1 (2026-08-25)** — `checkout.createOrder`/`admin.updateOrder`/`admin.bulkUpdateOrderStatus` Brevo-гоор имэйл илгээдэг. `skinType`/`skinConcerns`/`interiorStyle` tag, `catalog.recommended`.

**Reviews & Ratings TIER 2 (2026-08-25)** — `product_reviews`, verified-purchase gate, admin moderation. MySQL `AVG()` string буцаадаг bug олж зассан.

**Ingredient Transparency + Store Locator TIER 3 (2026-08-25)** — 17 нэр томьёотой glossary tooltip, 3 салбарын ажиллах цаг+утас.

**⚠️ Bug: 937 бараатай болсны дараа pagination-гүй болсон (2026-08-25)** — `Shop.tsx` (24ш/хуудас) болон `AdminWorkspace.tsx` (25ш/хуудас) хоёуланд дугаартай хуудаслалт нэмсэн.

**Routine Builder & Bundles TIER 4 (2026-08-25)** — admin "Routine" удирдлага, `/routine/:slug`, `orders.discountMnt`/`appliedRoutineId` бодит суутгал.

**Loyalty (Гишүүнчлэлийн карт) TIER 5 (2026-08-25)** — Tom-ийн бодит Smart POS-той адил шатлалт хямдрал (500k→3%, 1сая→5%, 10сая→10%, `shared/loyalty.ts`), native систем + admin гар нэмэлт (`AdminUserDetailDrawer.tsx`).

**⚠️ Bug: /shop-ийн хоосон orange блок + CartDrawer-ийн scroll bug (2026-08-25)** — `RecentlyViewed` хоосон үед бүхэлд нь нуух, `CartDrawer.tsx`-д `min-h-0 overflow-y-auto` нэмж 3+ барааны сагстай хэрэглэгч захиалга хийж чадахгүй байсныг зассан.

**Маркетингийн попап/banner систем (2026-08-25)** — Admin "Урамшуулал" таб, `SitePromo`, `position: sticky` + `--promo-banner-offset` fix.

**Өрсөлдөгчийн шинжилгээ (asahi.mn) + цоорхой засалт (2026-08-25)** — `compareAtPriceMnt` анх удаа storefront дээр харуулав (strikethrough + "-X%" badge), ProductDetail "Зөвхөн N ширхэг үлдсэн", canonical URL Manus домэйн засвар, coupon code систем нэмэгдсэн.

**⚠️ Том bug: header logo + 900 гаруй placeholder зураг "broken image" (2026-08-25)** — Шинэ компьютерийн MinIO хоосон эхэлсэн тул код доtorh хатуу бичсэн 7 файлын нэр бодит storage-д байхгүй байсан. Лого зам зассан, `client/public/product-placeholder.svg` (local bundled SVG) 9 файлд нэвтрүүлсэн, Home.tsx-ийн байхгүй зурган slot-уудад CSS градиент fallback нэмсэн.

**Header хайлт бүх хуудсанд (2026-08-25)** — `HeaderSearch.tsx` CommerceHeader болон Home-д mount хийсэн.

**937 барааны бодит POS каталог импорт (2026-08-25)** — Tom-ийн 3 салбарын Smart POS-оос бодит бараа material, 6 ангилал, sku=баркод. Дэлгэрэнгүй PRODUCT-IMPORT.md.

**"10 жилийн туршлагатай auditor" гүнзгий шинжилгээ (2026-08-25)** — Цэвэрлэгээ (1868 мөр үхсэн код устгасан, 9 Manus-эриний баримт `archive/`-руу зөөсөн), хүргэлтийн үнэ эрт харуулах (`UB_DELIVERY_FEE_MNT`), зурган боловсруулалт (`sharp`, `server/_core/imageProcessing.ts`, product 1600px/site-media 1920px/avatar 512px, quality 82), server-side хайлт (MySQL FULLTEXT, `catalog.search`, Монгол кирилл баталгаажсан). `pnpm test` 124/124.

**Дахин гүнзгий audit (2026-08-25 үргэлжлэл 2)** — Git file size цэвэр (цэвэрлэх зүйл олдсонгүй). 3 bug олсон: (1) хүргэлтийн үнэ `server/db.ts`-ийн `createOrderFromActiveCart`-д давхар hardcode байсныг нэгтгэсэн, (2) Loyalty хямдралын томьёо клиент дээр давхар хэрэгжсэнийг `cart.applicableLoyaltyDiscount` procedure-оор арилгасан, (3) `HeaderSearch.tsx` FULLTEXT рүү шилжээгүй байсныг зассан. Product reviews race condition тэмдэглэсэн (засаагүй, эрсдэл бага — UNIQUE INDEX хамгаалдаг). `pnpm test` 125/125.

**World-class UI/UX polish (2026-08-25 үргэлжлэл 3)** — Захиалгын celebration хуудас (`OrderConfirmation.tsx`), product zoom/lightbox (`ImageLightbox.tsx`), skeleton loading (`Skeleton.tsx`, Shop/ProductDetail/Profile бүх таб), гишүүнчлэлийн картны tier дизайн (`.tier-bronze/silver/gold`). `pnpm test` 125/125.

**matsukiyococokara-online.com-оос санаа авсан homepage шинэчлэл (2026-08-26)** — Sugi/Asahi Japan meeting-ийн өмнө. Playwright+Edge-ээр өрсөлдөгчийн homepage screenshot судалгаа. Нэмэгдсэн: `.membership-strip` (3-panel promo), `.bestseller-section` (бодит захиалгын түүхээр, `getBestsellingProducts()`, fan-out bug-аас зайлсхийхийн тулд 2 тусдаа query), `.home-news-section` (blog rail), `.category-icon-badge` (lucide icon, бодит зураг биш), wishlist icon header-т. `pnpm test --no-file-parallelism` 128/128.

**⚠️ Орчны асуудал тэмдэглэв (засаагүй)**: Бүх integration gate идэвхтэй үед `pnpm test`-ийг vitest-ийн анхдагч параллель горимоор ажиллуулахад тогтмол бус ~3 файл (`routine-discount`, `discount-codes`, `bestsellers`) унадаг — 20 гаруй тусдаа integration test файл нэг локал MySQL/MinIO instance-ыг зэрэг hammer хийхэд гарч ирдэг pre-existing race. **`--no-file-parallelism`-ээр тогтвортой ажилладаг тул одооноос энэ flag-тай ажиллуулах.**

## Object storage: локал MinIO → Cloudflare R2 (2026-08-26)
Tom "хоёр laptop MinIO датаг автоматаар хуваалцах" гэж хүссэн — Google Drive sync-ийн эрсдэлийг (амьд DB-style дата sync хийх нь эвдрэл үүсгэж болзошгүй) тайлбарлаж, оронд нь **нэг ижил cloud storage** руу шилжсэн (Tom R2 сонгосон). Код талд өөрчлөлт хэрэггүй байсан (`s3Region` анхдагч утга нь аль хэдийн `"auto"`). `scripts/migrate-storage-to-r2.ts` нэмсэн (дахин ажиллуулахад аюулгүй, key давхцвал алгасна). Гэрийн laptop: 39/39 объект амжилттай. Ажлын laptop: `SOURCE_S3_REGION` override нэмэх шаардлагатай байсан (хуучин "Mongolia" region bug), 88/88 объект амжилттай. Одоо хоёр laptop нэг R2 bucket ашиглаж байна. `pnpm test --no-file-parallelism` 128/128 (хоёуланд).

## Хүргэлтийн үнэ 10,000₮ + И-баримт схем бэлтгэл (2026-08-26)
`UB_DELIVERY_FEE_MNT` 5000→10000 (ганц тогтмол өөрчлөхөд хангалттай байсан). StorePay/карт/эльч хүргэлт бүгд олон нийтэд нээлттэй API байхгүй (Tom өөрөө компанитай гэрээ хийх ёстой) — код бичээгүй. eBarimt-ийн хувьд зөвхөн инерт схем: `drizzle/0028_ebarimt_receipt_fields.sql` (`ebarimtStatus`/`ebarimtReceiptId`/`ebarimtQrData`/`ebarimtLotteryNumber`), admin-д зөвхөн уншихад зориулсан мөр. EBARIMT.md-д Tom SmartSoftware нийлүүлэгчтэйгээ тодруулах 6 асуулт бичсэн. `pnpm test --no-file-parallelism` 128/128.

## Admin "Интеграцууд" панель (2026-08-26)
karkaron.com жишээ prompt-оос ялгаж авсан 3 цоорхойн эхнийх: `integration_configs` хүснэгт (ebarimt/storepay/card_golomt/courier_ebuuhia), `server/_core/crypto.ts` (AES-256-GCM, `INTEGRATIONS_ENCRYPTION_KEY`), нууц утга хэзээ ч клиент рүү буцдаггүй, `adminProcedure` (staff биш). QPay-г зориудаар оруулаагүй (аль хэдийн `.env`-ээс ажилладаг). ⚠️ Тест явцад Tom-ийн бодит `/admin` ашиглалттай давхацсан bug (script нь Tom-ийн бичсэн утгыг дарж бичсэн) — илрүүлж, `integration_configs`-ийг 0 мөр рүү буцааж, зөвхөн өөрийн debris-ийг устгасан (Tom-ийн audit log хөндөөгүй). `pnpm test --no-file-parallelism` 134/134.

## Brevo API IP хязгаарлалт + Product Variants PHASE 1 (2026-08-26)
`GET /v3/account` 401 "unrecognised IP address" — IPv4/IPv6 хоёул Brevo dashboard-ийн Authorised IPs-д ороогүй. Tom dashboard дээрээ IP хязгаарлалтыг унтраахаар сонгосон (хараахан баталгаажаагүй — идэвхжсэний дараа шалгах хэрэгтэй).

Product Variants PHASE 1: `product_variants` хүснэгт (`drizzle/0030_product_variants.sql`), 937 бараа backfill (937 variant, бүгд isDefault=true). `products.priceMnt`/`stockQuantity`/`sku` ХЭВЭЭРЭЭ cart/checkout/order-ийн цорын ганц эх сурвалж (0 эрсдэл). Admin-д variant CRUD UI нэмэгдсэн, storefront/cart хараахан хөндөгдөөгүй (PHASE 2 — тусад нь). Migration-аас өмнө DB backup авсан. `pnpm test --no-file-parallelism` 141/141.

## Product Variants PHASE 2 (2026-08-26, үргэлжлэл 5): storefront/cart бодитоор variantId ашиглаж эхэлсэн
Tom "Brevo IP-г dashboard-аас unтраа" гэсэн зааврыг өгсний дараа шууд "одоо Phase 2 руу шилжье" гэж хүссэн (Brevo-ийн бодит "IP хязгаарлалт унтраах" товч байдаггүйг тодруулсан — доор бичсэн шинэ blocker-ийг үзнэ үү). PHASE 1-ийн `productVariants` schema comment-д өөрөө тодорхой зааж өгсөн төлөвлөгөөг дагаж хэрэгжүүлэв:

- **Migration** (`drizzle/0031_product_variants_phase2.sql`): `cart_items.productId` → `variantId` (NOT NULL, `product_variants.id`-руу FK, unique index `(cartId, variantId)` болгож сольсон — ижил барааны 2 өөр variant сагсанд тусдаа мөр болж орох боломжтой болсон) — өмнөх бүх идэвхтэй сагсны мөрийг тухайн барааны default variant рүү backfill хийсэн (0 nullable үлдсэн). `order_items`-д `variantId` (nullable, SET NULL, `productId`-тэй ижил зарчим) нэмж, өмнөх захиалгын мөрүүдийг мөн адил backfill хийсэн. Бодит DB (937 бараа, бодит захиалга) дээр ажиллуулахын өмнө `scripts/db-backup.ps1`-ээр backup авсан, ажиллуулсны дараа 0 nullable variantId-г SQL-ээр баталгаажуулсан.
- **Cart/checkout/order бүхэлдээ variant-level рүү шилжсэн**: `addCartItem` одоо `productId` (хуучин, барааны default variant рүү автоматаар шийддэг — Shop/Routine/Profile-ийн бүх одоо байгаа дуудлага өөрчлөгдөөгүй хэвээр ажиллана) эсвэл `variantId` (шинэ, бодит сонголт хийсэн үед) хоёрын аль нэгийг авдаг болсон. `createOrderFromActiveCart`-ийн нөөц хасалт, захиалга цуцлахад нөөц сэргээх хоёул одоо variant мөр дээр ажиллана (`products.stockQuantity` биш). **Явцад жинхэнэ bug олж заслаа**: `order_items.sku`-д өмнө нь `item.slug` (барааны URL slug) буруу бичигдэж байсан (cart query-д бодит sku огт сонгодоггүй байсан учраас) — одоо variant-ийн жинхэнэ sku зөв бичигдэнэ.
- **Admin-ийн энгийн (ганц variant-тай) бараа засах урсгал өөрчлөгдөөгүй мэт хэвээр ажиллана**: шинэ `syncSoleVariantFromProduct` helper — `admin.updateProduct` барааны үнэ/нөөц/sku өөрчлөхөд, тухайн бараа яг 1 variant-тай л байвал (дийлэнх 936/937 тохиолдол) тэр variant рүү автоматаар mirror хийдэг (2 variant-тай болмогц зогсоно — аль variant гэдэг нь тодорхойгүй болдог тул). `createAdminProduct` (шинэ бараа үүсгэх) одоо шинэ барааны яг адил default variant-ыг нэг transaction дотор автоматаар үүсгэдэг болсон (өмнө нь энэ дутуу байсан — 0030 migration-ий дараа admin-аас шинээр үүсгэсэн ямар ч бараанд variant огт байхгүй үлдэх байсан жинхэнэ цоорхой байсныг олж, шууд заслаа).
- **Frontend**: шинэ `VariantPicker.tsx` — зөвхөн барааны variant тоо >1 үед л харагдана (ганц variant-тай 936 бараанд ямар ч харагдах өөрчлөлт алга). `ProductDetail.tsx`/`QuickViewDialog.tsx` variant сонгогдоход үнэ/нөөц/sku шинэчлэгдэнэ. `CartDrawer.tsx`/`Checkout.tsx`/`OrderConfirmation.tsx` сонгосон variant-ийн шинж чанарыг ("Хэмжээ: 400мл") жижиг тайлбар мөрөөр харуулна.
- **Тест**: шинэ `server/product-variants-phase2.integration.test.ts` (8 тест) — productId→default variant, variantId→тодорхой variant, нэг барааны 2 variant тусдаа мөр, variant тус бүрийн нөөц тусад нь хязгаарлагддаг, checkout зөв variant-ийн нөөцийг хасаж зөв sku бичдэг (slug-bug-ийн regression шалгалт), цуцлахад зөв variant-ийн нөөц сэргэдэг, зочны сагс нэгтгэхэд variantId хадгалагддаг, `admin.updateProduct` ганц variant-ыг mirror хийдэг. Мөн 5 хуучин integration test файлд (checkout.guest, loyalty, discount-codes, routine-discount, order-notifications, commerce.database) шинэ variantId багана шаардсан fixture нэмсэн (productId-ээр шууд `products` хүснэгтэд raw insert хийдэг байсан тул `createAdminProduct`-ийн шинэ auto-variant логикт хамрагдаагүй байсан).

**Баталгаажуулалт**: Migration-аас өмнө бодит DB backup. `pnpm check`/`pnpm build` цэвэр. `pnpm exec vitest run --no-file-parallelism` (бүх gate идэвхтэй) **149/149 цэвэр**. Бодит running dev server-ийн DB дээр throwaway probe script-ээр (шууд `server/db.ts`-ийн функц дуудаж, дараа нь бүрмөсөн устгасан) жинхэнэ бараа (id=67, "BA-YU Horse Oil Non-Silicone Shampoo") дээр 2 дахь variant нэмж, `getPublicProductVariants`-ийн буцаах утга зөв 2 мөр болж байгааг, цэвэрлэсний дараа буцаад 1 мөр болж байгааг баталгаажуулсан. Бүтэн Playwright browser screenshot (visual) баталгаажуулалт **энэ удаад цаг хугацааны шалтгаанаар хийгдээгүй** — backend/money-path нь 149 автомат тестээр (үүнээс 8 нь яг энэ Phase 2-т зориулагдсан) бүрэн баталгаажсан, frontend нь `pnpm build` цэвэр бөгөөд шинэ `VariantPicker` chunk зөв bundle хийгдсэнийг харсан.

**Дараагийн алхам**: Brevo IP хязгаарлалтын жинхэнэ механизмыг тодруулах (доорх blocker), дараа нь mass SMS/Email campaign эсвэл Product Variants-ийн frontend-ийг бодит олон variant-тай бараагаар screenshot-оор баталгаажуулах.

## Бодит барааны зураг — ангилал бүрийн placeholder + pilot batch (2026-08-26, үргэлжлэл 6)
Brevo баталгаажсны дараа Tom 937 барааны бодит зураг (1080p-тэй ойролцоо чанартай) websearch хийж олоод R2 рүү oруулахыг хүссэн. **Чухал тодруулга өгсөн**: энэ орчинд зураг **generate хийх AI загвар/tool байхгүй** — зөвхөн websearch+татаж авах боломжтой, олдохгүй бол зөвхөн code-ээр зурсан SVG icon л хийж чадна (фото зураг зохиомлоор "generate" хийх боломжгүй). Мөн 937 барааг нэг зэрэг, нэг бүрийг баталгаажуулалгүй хийх нь өндөр эрсдэлтэй (буруу бараанд буруу зураг наалдах) гэдгийг тайлбарлаад, Tom-той 2 асуулт тодруулсан: (1) pilot (24 бараа, 4/ангилал)-аас эхэлье, (2) олдохгүй бол ангилалд тохирсон generic icon.

**1. Ангиллаас тохирсон placeholder (бүх 937 бараанд шууд нөлөөлнө):** Өмнө нь **ганц** ерөнхий улаан лонхны SVG (`product-placeholder.svg`) бүх 925 зурагтугй бараанд адилхан харагддаг байсан. Одоо 6 бодит ангилал тус бүрдээ өөрийн SVG icon-той: Арьс арчилгаа (дусаалуурт лонх — хуучин ерөнхий icon-той адил), Гоо сайхан (уруулын будаг), Эрүүл мэнд (эмийн лонх+загалмай), Эрүүл ахуй (соап помп лонх), Үс ба бие (шампунь лонх), Ээж ба хүүхэд (хүүхдийн сүүний лонх). `shared/catalog-filter.ts`-ийн `getCategoryPlaceholderImage(categorySlug)` функц, `Shop.tsx`/`ProductDetail.tsx`/`QuickViewDialog.tsx`-д (хамгийн их ашиглагддаг 3 газарт) холбогдсон. `getRecommendedProducts` (db.ts) query-д дутуу байсан `categorySlug` сонголтыг нэмсэн.

**2. Pilot batch — 24 бараанаас 6-г нь бодитоор бүрэн дуусгасан (ангилал бүрээс үнэ өндөртэй эхний 4-ийг нь window function-оор сонгосон):**
- Cell Cure 4T PLUSPLUS/4T PLUS (BELEGA, албан ёсны belega-cellcure.com сайтаас, transparent PNG, өндөр чанартай)
- Prieclat Radiant Power Serum (Скалда Sugi Drug Store (Япон, санамсаргүй ижил нэртэй) private-label брэндийн албан ёсны cdn зураг, 1946x1946, маш өндөр чанартай)
- AMOMA Milk Up/Through Blend, Maternity Oil (cosme.net-ээс, зөв бараа мөн ч зөвхөн 180x180 бага нягтралтай — цаашид илүү сайн эх сурвалж олдвол сольж болно)

Урсгал бүрийг: WebSearch (барааны нэр+баркод) → WebFetch (жинхэнэ зурган URL олох) → curl татах → **Read tool-оор нүдээр шалгаж баталгаажуулах (зөв бараа мөн эсэх)** → `processUploadedImage` (admin upload-той ЯГ ижил pipeline: rotate+resize 1600px max+re-compress) → `storagePut` R2 рүү → `products.imageUrl` DB шинэчлэлт. Зам: `catalog/products/<productId>/<slug>.<ext>` (одоо байгаа `admin.uploadProductImage`-ийн uploader-id-based замаас ялгаатай, гэхдээ ижил `catalog/products/` эх namespace дор — барааны ID-аар эрэмбэлэгдсэн тул R2 console-оос харахад илүү ойлгомжтой). Throwaway script-ээр (устгасан) хийсэн. Playwright+Edge screenshot-оор ProductDetail (жинхэнэ зураг, бага нягтралтайг хамт), Shop grid (placeholder-той хольцолдсон), ангилал placeholder зөв ялгаатай (Ээж ба хүүхэд-ийн лонх vs Арьс арчилгааны дусаалуур) харуулж баталгаажуулсан.

## ⚠️ Гэрийн лаптоп дээр DB хоосон байсныг илрүүлсэн (2026-08-26, үргэлжлэл 8)
Гэртээ ирээд "server iig asaa, 937 barааны зураг update хий" гэсэн хүсэлтээр эхлэхэд `products: 0` (бүрэн хоосон) байгааг олов — MySQL нь машин бүрд тусдаа (R2 л хуваалцдаг), 937 барааны бодит өгөгдөл хэзээ ч энэ лаптоп руу орж ирээгүй байсан бөгөөд GitHub-т ч байхгүй (DB backup `.gitignore`-д, бодит харилцагчийн мэдээлэл агуулдаг тул зориудаар). Шийдэл: ажлын лаптопоос `scripts/db-backup.ps1`-ээр авсан хамгийн сүүлийн backup zip-ыг физикээр (USB/cloud) энэ лаптоп руу зөөгөөд `db-restore.ps1 -Force`-ээр сэргээх ёстой — **энэ алхам хараахан хийгдээгүй, дараагийн шаардлагатай алхам хэвээр байна.**

## Admin Analytics/CRM dashboard — борлуулалт, дүүрэг, харилцагчийн мэдээлэл, Excel/PDF export (2026-08-26, үргэлжлэл 9)
Tom-ий шууд хүсэлтээр ("data analyst, ямар хүн ямар бараа авсан, аль дүүргээс захиалж байна, Excel/Word/PDF-ээр татаж болгодог болго"). Websearch-ээр Shopify Analytics-ийн бүтцийг судалж (sales/customer/geography/product reports) баримт болгосон. Гурван том хэсгийг зэрэг (нэг түвшинд) хийсэн:

1. **Schema** (`drizzle/0032_customer_analytics.sql`): `users.birthYear`/`users.occupation` (заавал биш, sign-up-д асуудаггүй, зөвхөн профайл дээрээ сайн дураараа өгвөл), `user_addresses.district`/`orders.deliveryDistrict` (Улаанбаатарын 9 дүүргийн бүтэцтэй enum, `shared/districts.ts`). `orders.deliveryDistrict` бол snapshot (`customerName`-тэй адил зарчим) — хаяг дараа засагдсан ч захиалгын түүх өөрчлөгдөхгүй. `scripts/backfill-order-districts.ts` — байгаа захиалгуудын чөлөөт бичвэр хаягаас (Cyrillic бүтэн нэр + товчлол ХУД/БЗД г.м. + latin аль алиныг таньдаг) дүүргийг таамаглаж backfill хийдэг, зөвхөн NULL мөрийг л хөндөнө (давхар ажиллуулахад аюулгүй).
2. **`server/analytics.ts`** (шинэ файл): `getSalesOverview`/`getRevenueTimeseries`/`getTopProducts`/`getTopCategories`/`getDistrictBreakdown`/`getCustomerDemographics`/`getLoyaltyTierBreakdown` — бүгд зөвхөн `paymentStatus="paid"` захиалгаас. **Насны/мэргэжлийн мэдээлэл зөвхөн сайн дураараа өгсөн хэрэглэгчээр хязгаарлагдана** тул хариу нь үргэлж "N/M хэрэглэгч мэдээлэл өгсөн" гэдгийг дагалдуулдаг (хэзээ ч бүрэн дүүрэн юм шиг үзүүлэхгүй). Дүүргийн задаргаа бол ЗАХИАЛГЫН (order-based) өгөгдөл — вэбсайт ЗОЧЛОЛТЫН (traffic/visit) өгөгдөл биш, тийм infrastructure энэ сайтад алга (WebSearch-ээр Shopify-гийн жишээгээр баталгаажуулсан ялгаа).
3. **Excel/PDF export** (`exceljs`, `pdfkit` шинэ dependency): `admin.analyticsExport` procedure base64 файл буцаана, клиент `downloadBase64File` (`client/src/lib/fileDownload.ts`)-ээр татна. **Чухал bug олж заслаа**: pdfkit-ийн built-in фонт (Helvetica) Cyrillic үсэг огт дэмждэггүй (зөвхөн Latin, PDF стандартын жишиг 14 фонтын хязгаарлалт) — анхны тест PDF **бүрэн эвдэрсэн тэмдэгтүүд** (mojibake) харуулсан. Засаж: `dejavu-fonts-ttf` npm package-аас DejaVu Sans/Bold TTF файлыг `server/assets/fonts/`-т хуулж (npm dependency-г устгаад, зөвхөн файлыг нь repo-д шууд хадгалсан), pdfkit-д `registerFont`-оор бодитоор embed хийдэг болгосон. `import.meta.dirname`-ээр зам тооцоолдог тул dev (`tsx`, `server/assets/...`) болон prod (esbuild bundle, `dist/assets/...`) хоёуланд адилхан ажиллана — `package.json`-ий `build` script-д `server/assets` → `dist/assets` хуулах алхам нэмсэн. Засварын дараа PDF-ийн Монгол кирилл текст бүрэн зөв харагдахыг screenshot-оор баталгаажуулсан.
4. **`client/src/components/AdminAnalyticsPanel.tsx`** (шинэ): огнооны хугацаа сонгогч (7 хоног/30/90/энэ сар/бүх цаг), KPI tile (орлого/захиалга/AOV/шинэ-давтан), `recharts`-аар орлогын line chart + дүүргийн bar chart + насны bar chart, их зарагдсан бараа/ангиллын хүснэгт (CSV export товчтой), гишүүнчлэлийн түвшингийн тоо. `AdminWorkspace.tsx`-д admin-only ("Хэрэглэгч"/"Аюулгүй байдал"/"Интеграцууд"-тай ижил түвшинд) шинэ "Аналитик" таб.
5. **Checkout.tsx/Profile.tsx**: хүргэлтийн хаягийн дэргэд дүүрэг сонгох dropdown (сонголтоор), профайл дээр төрсөн он/мэргэжил талбар (сонголтоор, тодорхой "заавал биш" тайлбартай).

**Тест**: шинэ `server/analytics.integration.test.ts` (4 тест) — staff хориглогдох, борлуулалт/бараа/дүүргийн тооцоо бодит өгөгдөөр зөв гарах, Excel/PDF (`%PDF` magic byte хүртэл) бодитоор үүсэх, `createOrderFromActiveCart`-ийн `guessDistrictFromAddress` бодитоор ажиллаж байгааг (ХУД → khan_uul) баталгаажуулсан.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр (`dist/assets/fonts/`-т фонт зөв хуулагдсаныг баталгаажуулсан), `pnpm exec vitest run --no-file-parallelism` бүх gate идэвхтэй **153/153 цэвэр**. Гэрийн лаптоп дээр 937 бодит бараа/захиалга байхгүй тул визуал dashboard-ыг бодит өгөгдлөөр screenshot аваагүй — DB backup сэргээгдсэний дараа Tom өөрөө шалгаж, шаардлагатай засвар хийлгэх шаардлагатай.

**Явц ба цаашдын шийдвэр (937 барааны зураг):** 24-ийн 6 нь бүрэн дууссан, 18 нь **websearch-оор олдоогүй эсвэл зураг чанар хангалтгүй байсан тул одоохондоо алгассан** (тэдгээр нь ангиллын placeholder-оо хэвээр авна). 937-ийн үлдсэн 913-ыг ижил түвшний нарийвчлалтайгаар (нэг бүрийг websearch+нүдээр шалгах) хийхэд маш их цаг/tool call шаардана — Tom-той цаашид үргэлжлүүлэх хурд/цар хүрээг (жишээ нь: илүү олон бараагаар үргэлжлүүлэх, эсвэл нийлүүлэгчийн бодит зургаар солих, эсвэл placeholder-ыг л хангалттай гэж үзэх) тодруулах хэрэгтэй.

`pnpm check`/`pnpm build` цэвэр.

## ⚠️ Ноцтой bug олж заслаа: миний ӨӨРИЙН integration test жинхэнэ `home-hero` контентыг test ажиллуулах БҮР устгадаг байсан (2026-08-26, үргэлжлэл 7)
Tom `/admin` → Content & Media-аас нүүр хуудасны гол (`home-hero`) зурган дээр бодит, өндөр чанартай зураг upload хийсэн ч, дараа нь "сервер restart хийх бүрт зураг алга болоод байна" гэж мэдэгдэв. Мөн "937 барааны data алга болсон" гэж санаа зовсон.

**Шалгалт (баримт баримтаар):**
- `SELECT COUNT(*) FROM products/product_variants` → **937/937, бүрэн бүтэн** — барааны өгөгдөл огт алдагдаагүй.
- R2 bucket-ийг S3 API-аар шууд жагсаахад: Tom-ий upload хийсэн жинхэнэ, 4.1MB-той, 1920x1440 хэмжээтэй (`processUploadedImage`-ийн 1920px pipeline-ээр зөв боловсруулагдсан), маш өндөр чанартай hero зураг **бодитоор R2-т байсан**, гэхдээ `site_media` хүснэгтэд `home-hero` мөр огт байхгүй байв.
- **Жинхэнэ шалтгаан олдов**: `server/site-media.integration.test.ts` нь `slotKey = "home-hero"` гэсэн **БОДИТ, ХЭРЭГЛЭГЧИЙН production slot-ыг** (санамсаргүй/тест-only slot биш!) шууд ашигладаг байсан бөгөөд `afterEach`-д **болзолгүйгээр** `clearSiteMedia({ slotKey: "home-hero" })` дуудаж, `site_media` хүснэгтээс тухайн мөрийг бүрмөсөн УСТГАДАГ байв. Энэ session-ий турш `RUN_MEDIA_INTEGRATION_TESTS=1`-тэй бүх-gate `pnpm test`-ийг хэд хэдэн удаа ажиллуулсан (Product Variants Phase 2, зурган ажлын баталгаажуулалтын хэсэгт) — **тест ажиллуулах БҮРТ Tom-ий жинхэнэ upload-ийг DB-ээс устгаж байсан** (upload өөрөө R2-т амьд үлдсэн ч DB reference нь тасарсан). Энэ бол "server restart" биш, харин **миний өөрийн тестийн код Tom-ий бодит контентыг дайран устгаж байсан** явдал байв.
- Мөн R2-оос жижиг (68-96 byte) `media-integration-*.png` нэртэй **42 ширхэг test-debris файл** олдов (тест бүр ажиллах бүрд шинэ tiny 1-pixel PNG upload хийдэг байсан, хэзээ ч устгагддаггүй байсан) — persistent R2 руу шилжсэнээс хойш (2026-08-26-ны эрт үеийн session) хуримтлагдсаар байсан.

**Заслаа:**
1. `site_media`-ийн `home-hero` мөрийг Tom-ий бодит upload хийсэн зургийн URL руу шууд сэргээв (throwaway script, дахин upload хийх шаардлагагүй — файл өөрөө R2-т байсан хэвээр).
2. `site-media.integration.test.ts`-ийг **snapshot-and-restore** зарчимд шилжүүлэв: тест ажиллуулахын өмнө `home-hero`-ийн ОДООГИЙН (бодит) утгыг хадгалж аваад, тестийн дараа яг тэр утгыг (эсвэл анхнаасаа хоосон байсан бол хоосон болгож) буцаан тавьдаг болгосон — цаашид ямар ч тест ажиллуулалт бодит контентыг дайрахгүй.
3. Хуримтлагдсан 42 test-debris файлыг R2-оос бүрмөсөн устгасан.
4. `admin.uploadAvatar`/бүтээгдэхүүний зурган тестүүд ч мөн адил R2-т орфан файл үлдээдгийг (`removeAvatar` зөвхөн DB-ийн `avatarUrl`-ыг null болгодог, S3 object-ыг устгадаггүй) тэмдэглэв — эдгээр нь **бодит контентыг дайрдаггүй тул эрсдэлгүй, зөвхөн диск зай бага зэрэг үрдэг** асуудал, энэ удаад заасангүй (ирээдүйн cleanup-д нэмэх).

**Тодруулга Tom-д зориулж**: Таны "937 барааны data алга болсон" гэсэн санаа зовнил дэмий байлаа — бараа 100% бүтэн байсан. Харин "зураг upload хийвэл алга болоод байна" гэсэн ажиглалт бол **бодит, ноцтой bug байсан**, зөв илрүүлсэн байна — баярлалаа. Ирээдүйд ижил зурган slot-уудад (нэн ялангуяа `home-hero`) upload хийхэд ийм зүйл дахин тохиолдохгүй.

**Баталгаажуулалт**: Тест-ийг ганцаараа ажиллуулж (1/1 ✅), дараа нь DB-ээс `home-hero` бодит утгаараа хэвээр байгааг баталгаажуулсан. Бүх gate идэвхтэй бүрэн suite: `pnpm exec vitest run --no-file-parallelism` **149/149 цэвэр**. `pnpm check` цэвэр.

**⚠️ Home.tsx-ийн hero/collection/care зурган (CSS `background-image`) бодит browser дээр screenshot-оор ХАРАГДАЖ БАЙГААГ баталгаажуулж чадсангүй** — Playwright+Edge (headless) дээр `content.siteMedia` query зөв утга буцааж, `getComputedStyle` бүх талаараа зөв (`background-image` URL, `background-size: cover`, `background-position: center`, ямар ч filter/mask/blend алга) харуулсан ч, screenshot дээр бодит зураг харагдахгүй, зөвхөн CSS градиент харагдсан хэвээр байв. **Гэхдээ ижил зураг шууд URL-аар нь navigate хийхэд, мөн `<img>` tag-аар (ProductDetail) харагдахад бүрэн зөв харагдсан** — зөвхөн энэ тодорхой CSS `background-image` + headless screenshot хослолд л гарч байгаа зүйл (магадгүй зөвхөн миний screenshot tool-ийн хязгаарлалт, өөр АЛЬ Ч (Aug 20-с хойш "аль хэдийн ажилладаг" гэж тэмдэглэгдсэн `home-categories` зэрэг) слот дээр ч ижил шинж тэмдэг ажиглагдсан тул **энэ бол шинэ bug биш**, зөвхөн миний одоогийн screenshot pipeline-ийн орхигдол). Өгөгдлийн түвшинд (DB + R2 + network) бүрэн баталгаажсан тул Tom өөрийн жинхэнэ browser-оос (hard refresh, Ctrl+Shift+R) шалгаж баталгаажуулах хэрэгтэй.

## Лаптоп хооронд шилжилт (2026-08-20, 2026-08-26)
**Гэрийн лаптоп анх удаа асуулгасан (2026-08-20)**: GitHub-аас clone, Node/pnpm/MySQL/MinIO шинээр суулгасан. `pnpm-workspace.yaml`-д `onlyBuiltDependencies: [@tailwindcss/oxide, esbuild]` зөөх шаардлагатай байсан (шинэ pnpm package.json-ий `"pnpm"` field уншихаа больсон). Migration 0009-ийн `DROP INDEX openId` бодит индексийн нэр (`users_openId_unique`) буруу байсан тул гараар зассан.

**Ажлын лаптоп R2 руу шилжилт (2026-08-26)**: дээрх "Object storage" хэсэгт нэгтгэсэн.

`pnpm dev` одоо стандарт байдлаар ажилладаг (2026-08-20-с хойш) — өмнө нь `package.json`/`pnpm-lock.yaml`-ийн Windows "High Mandatory Level" integrity label-ийг elevated PowerShell-ээс `icacls ... /setintegritylevel Medium`-ээр зассан.

## Admin Analytics — Tier B/C: ашиг/маржин, сагс орхилт, нөөц, суваг, эх сурвалж/төхөөрөмж (2026-08-26, үргэлжлэл 10)

Tom Geckoboard-ийн жишиг dashboard screenshot + стандарт e-commerce KPI-ийн жагсаалт (Conversion Rate, AOV, Cart Abandonment, CAC, New vs Returning, Device, Traffic Source, Best Sellers, Return Rate, Inventory) илгээгээд **"ямар ч тайлбар/хойшлуулалт хэрэггүй, шууд tier-ээр хуваагаад хий"** гэж тодорхой зааварчилсан — тайлбаргүйгээр шууд хэрэгжүүлсэн:

- **Schema** (`drizzle/0033_analytics_expansion.sql`): `products.costMnt` (admin-аас гараар оруулдаг, заавал биш — ашиг/маржин зөвхөн энэ талбарыг бөглөсөн бараагаар л тооцоологдоно, "N/M зарагдсан ширхэгт cost мэдээлэлтэй" гэдгийг үргэлж дагалдуулна, demographics-ийн адил зарчим), `orders.trafficSource`/`orders.deviceType` (захиалга хийх мөчид л бичигдэнэ, хуучин захиалгад хэзээ ч backfill хийгдэхгүй).
- **`server/analytics.ts`**-д 5 шинэ функц: `getOrdersByChannel` (хүргэлт/төлбөрийн хэлбэрээр), `getCartAbandonment` (бодит `carts`/`cart_items`-аас — `carts.status`-ийн ашиглагдаагүй "abandoned" enum-д биш, харин бараатай+24ц+ идэвхгүй+хэзээ ч захиалга болоогүй сагсаар тооцдог), `getInventorySnapshot` (нөөцийн үнэ цэн/дууссан/бага үлдэгдэлтэй), `getProfitOverview` (доод тал нь ашиг — зөвхөн cost мэдээлэлтэй мөрөөр), `getTrafficBreakdown`. Бүгд `getAnalyticsReport`/Excel/PDF export руу холбогдсон.
- **Excel export**-д "Суваг" болон "Эх сурвалж, Төхөөрөмж" гэсэн 2 шинэ sheet нэмсэн. **Явцад жинхэнэ exceljs bug олж заслаа**: sheet нэрэнд `/` тэмдэгт байж болохгүй (Excel-ийн өөрийнх нь дүрэм) — "Эх сурвалж/Төхөөрөмж" нэрийг shipped-ын өмнөх интеграцийн тестээр илрүүлж "Эх сурвалж, Төхөөрөмж" болгож зассан.
- **`shared/deviceType.ts`**: `parseDeviceType(userAgent)` — mobile/tablet/desktop/unknown, тодорхойгүй бол таамаглалгүй "unknown".
- **`client/src/lib/trafficSource.ts`**: browser session бүрийн эхний хуудас ачаалалт дээр л (`main.tsx`) нэг удаа тэмдэглэгддэг "эх сурвалж" — utm_source/medium байвал тэрийг, эсвэл жинхэнэ external referrer-ийн hostname-ыг, эсвэл "Шууд орсон". Захиалга хийх мөчид (`document.referrer` аль хэдийн өөрийн сайтын өмнөх хуудас болчихсон байдаг тул) биш, зөвхөн эхний хуудсан дээр л барих ёстой гэдгийг тайлбарласан comment-той.
- `checkout.createOrder` одоо `ctx.req.headers["user-agent"]`-ээс `deviceType`-г серверийн талд өөрөө parse хийж, клиентээс ирсэн `trafficSource`-ыг хүлээж авдаг — хоёул `customerName`/`deliveryDistrict`-тэй адил захиалга дээр л snapshot хийгддэг.
- `admin.createProduct`/`updateProduct`-д `costMnt` (admin-only, `/admin`-аас гадна хэзээ ч харагдахгүй) талбар нэмсэн, `AdminWorkspace.tsx`-ийн бүтээгдэхүүний форм дээр "Хуучин үнэ"-ийн хажууд шинэ талбар.
- `AdminAnalyticsPanel.tsx`-д 3 шинэ KPI tile (ашиг/маржин, сагс орхилт, нөөцийн үнэ цэн) + 2 шинэ хэсэг (хүргэлт/төлбөрийн суваг, эх сурвалж/төхөөрөмж).

**Тест**: `server/analytics.integration.test.ts` 4→5 болж өргөжсөн — profit/channel/inventory/cartAbandonment бодит fixture дээр шалгагдсан, мөн шинэ тест `checkout.createOrder`-ийг бодит mobile User-Agent header-тэйгээр дуудаж, DB-д `deviceType="mobile"` бичигдэж байгааг, мөн `getAnalyticsReport`-ийн `traffic` хэсэгт тэр захиалга бодитоор гарч ирж байгааг (зөвхөн функц шууд дуудахгүй, бүтэн router round-trip-ээр) баталгаажуулсан.

**Баталгаажуулалт**: `pnpm check`/`pnpm build` цэвэр. Бүх gate идэвхтэй `pnpm exec vitest run --no-file-parallelism` **154/154 цэвэр**. CI-тэй ижил горим (gate унтраасан): 59 passed/95 skipped, регресс алга. Commit+push хийсэн.

**⚠️ Хажуугаар олдсон, засаагүй (энэ ажилтай холбоогүй, урьд байсан) цоорхой**: `server/integrations.integration.test.ts`-ийн нэг "unit" тест `INTEGRATIONS_ENCRYPTION_KEY` env var-гүй үед шатдаг ба энэ var нь `.github/workflows/ci.yml`-д тохируулагдаагүй — өөрөөр хэлбэл **жинхэнэ GitHub Actions CI дээр энэ тест улаан гарч байж магадгүй**. `git log`-оор шалгахад энэ бол өнөөдрийн ажлаас **өмнө** (49b513e commit, Admin Integrations панел) байсан асуудал. Шийдвэрлээгүй — нууцлалын түлхүүрийн шинж чанартай тул dev fallback нэмэхийн өмнө Tom-той зөвшилцөх нь зөв гэж үзсэн.

**Дараагийн боломжит алхмууд (Tom-той тодруулаагүй)**: CAC (маркетингийн зардал admin-аас гараар оруулах талбар шаардана), Return Rate (шинэ "буцаасан" захиалгын статус эсвэл тусдаа returns tracking шаардана) — эдгээрийг хийхийн тулд шинэ өгөгдлийн эх сурвалж (admin-ийн гараар оруулах мэдээлэл) шаардлагатай тул код зөвхөн бичихээр шийдэгдэхгүй.

## Admin Analytics — Geckoboard дизайн (Tier D) + Conversion Rate/CAC/Return Rate/paymentStatus fix (Tier E/F/G/I) (2026-08-27)

Tom Geckoboard-ийн жинхэнэ dark KPI dashboard screenshot (sparkline KPI tile, "vs өмнөх" delta, P&L statement card, "sales by X" ranked list, AOV gauge, channel bar) илгээгээд, дээрх Tier B/C-ийн жагсаалтаас дутуу үлдсэн (шинэ өгөгдлийн эх сурвалж шаардсан учир хойшлуулагдсан) 3 metric-ийг заавал дуусгахыг, **бас "тайлбар/хойшлуулалт бүү хий, зүгээр tier-ээр хуваагаад одоо хий" гэдгээ дахин маш тодорхой шаардсан**. Plan mode-оор эхэлж (2 Explore agent — codebase судалгаа + gauge/sparkline/session-tracking-ийн зөв аргачлалын websearch, дараа нь 1 Plan agent), таван тиер болгож дараалан бүгдийг дуусгасан.

### Tier D — Geckoboard дизайны шинэчлэл

`AdminAnalyticsPanel.tsx`-ийн дээд KPI хэсэг бүхэлдээ харанхуй "command center" дизайнтай болов (зөвхөн энэ component-ийн өөрийн hardcoded палитр, сайтын global dark mode-той (ашиглагдаагүй, идэвхгүй) огт хамааралгүй):
- `server/analytics.ts`: `getPeriodComparison` (одоогийн vs өмнөх ижил хугацааны цонх — "Бүх цаг үе" сонголтод боломжгүй тул `available:false`, хэзээ ч зохиомол харьцуулалт хийхгүй), `getPnlOverview` (**зөвхөн бодит талбар** — Geckoboard жишээний "Referer cut"/"Paypal transactions" шиг энэ бизнест байхгүй зүйл зохиомлоор оруулаагүй; хүргэлтийн орлого/хямдрал нь "нийт дүнд аль хэдийн шингэсэн" тайлбартай мэдээллийн мөр, давхар хасалт хийгээгүй), `getTrafficBreakdown`-д `revenueMnt` нэмэгдэв (District breakdown-той адил "sales by referer" ranked-$ list болгохын тулд).
- Шинэ component: `Sparkline` (recharts AreaChart, 2 цуврал — өдрийн offset-оор зэрэгцүүлсэн, sparse өгөгдлийг 0-ээр дүүргэсэн), `AovGauge` (**гараар зурсан SVG** semicircle+needle — recharts-д gauge component байхгүй, RadialBarChart-ийн дотоод cx/cy-г буцааж тооцоолохоос гар SVG-ээр needle байрлалыг нарийн удирдах нь илүү найдвартай гэж шийдсэн), `DeltaBadge` (сум icon + тэмдэгтэй хувь, өнгө дангаараа хэзээ ч биш), `PnlCard`, `RankedDollarCard`, `ChannelBarsCard`.
- **Явцад AdminWorkspace.tsx-ийн urьдын bug олж заслаа**: "Аналитик" таб дээр header/subtitle text "Хэрэглэгч ба эрх" (Users-ийн текст) гэж буруу харагдаж байсан — section ternary chain-д "analytics" branch байгаагүй тул fallback руу унадаг байжээ.
- **QA-гийн явцад 2 жинхэнэ CSS bug олж заслаа** (Playwright + бодит synthetic order өгөгдлөөр screenshot; getBoundingClientRect/elementFromPoint-оор DOM зөв гэдгийг нотолсны дараа): (1) CSS grid item-д `min-w-0` байхгүй бол дотор нь `justify-between` flex мөр багана гаднаа "blowout" хийж зэргэлдээ карт руу орж болдог (карт-ийн түвшинд БОЛОН PnlCard/RankedDollarCard/ChannelBarsCard-ийн дотоод `grid`-ээр shrхэгдсэн мөр бүрийн түвшинд — хоёул засах шаардлагатай байсан). (2) `bg-white/5` (тунгалаг) card background нь headless screenshot pipeline дээр visual ghosting артефакт үүсгэдэг байсан (msedge болон chromium аль алинд, GPU disable хийсэн ч арилаагүй) — `#1f2126` (opaque) болгож бүрэн шийдсэн, мөн илүү цэвэрхэн харагдав.

### Tier I — pre-existing, том нөлөөтэй bug: cash_on_delivery захиалга хэзээ ч "paid" болдоггүй байсан

Return Rate-ийг төлөвлөж байх явцад олдсон: `orders.paymentStatus` нь **зөвхөн QPay webhook-ийн `markQPayPaymentAttemptPaid`-д л** "paid" болдог байсан. `createOrderFromActiveCart` ч, `updateAdminOrder` ч хэзээ ч `paymentStatus` бичдэггүй байв. QPay одоохондоо production дээр ажиллаагүй тул **бэлэн мөнгө/банкны шилжүүлгийн (энэ дэлгүүрийн жинхэнэ гол төлбөрийн арга) захиалга хэзээ ч "paid" болохгүй, `analytics.ts`-ийн бараг бүх функц (`paymentStatus="paid"`-аар filter хийдэг) бодит өгөгдөл дээр 0/хоосон харуулах эрсдэлтэй байсан**. Засав: `updateAdminOrder` нь QPay-гүй захиалгыг "Дууссан" болгоход автоматаар `paymentStatus="paid"` болгодог болов (жинхэнэ ертөнцөд хүргэлт/төлбөр хүлээн авсан мөч).

### Tier G — Return Rate

`orders.status`-д `"returned"` нэмэгдэв (зөвхөн "completed"-ээс шилждэг), `orders.returnedAt` timestamp. **`updateAdminOrder`-ийн хуучин guard-т ноцтой bug олдов**: `currentStatus === "cancelled" || currentStatus === "completed"` бол ЯМАР Ч status update-ийг хориглодог байсан тул буцаалт хийх боломж угаасаа код дотор байгаагүй — бүрэн дахин зохиосон. Нөөц автоматаар сэргээхгүй (буцаасан барааны борлуулж болох эсэх тодорхойгүй тул), `paymentStatus`-д хүрдэггүй (буцаан олголтын урсгал тусдаа, энэ ажлын хүрээнд ороогүй) — хоёул тодорхой comment-оор тэмдэглэсэн, зохиомлоор шийдээгүй. `getReturnRateOverview` нь харьцааны хоёр талыг АДИЛ `orders.createdAt`-аар цонхойлгодог (бусад бүх analytics функцтэй адил талбар) — `returnedAt`-ыг нэг талд нь холиход харьцаа утгагүй болно (100%-с давж эсвэл 0-той ойрхон гарч болно зөвхөн шинэ захиалгууд буцаагдах цаг завгүй байгаагаас болж). **Мөн явцад `AdminOperationsPanel.tsx`-ийн `updateOrder`/`bulkUpdateOrderStatus` mutation-д `onError` огт байгаагүйг олж заслаа** — татгалзсан шилжилт өмнө нь UI дээр огт мэдэгдэлгүй чимээгүй бүтэлгүйтдэг байжээ.

### Tier F — CAC

Шинэ `marketing_spend` хүснэгт (сар тутам admin гараар оруулдаг зар сурталчилгааны зардал, `site_media`-ийн upsert загвартай яг адил). `getCacOverview` нь тухайн хугацааны хамарсан **БҮХ** сард зардал орсон үед л жинхэнэ CAC тооцоолно — нэг ч сар дутуу бол "тодорхойгүй" (хэзээ ч ₮0 гэж таамаглахгүй). CAC tile дээр шууд inline сар+дүн editor (тусдаа тохиргооны хуудас биш).

### Tier E — Conversion Rate (хамгийн том хэсэг)

Энэ site-д урьд байгаагүй жинхэнэ 1st-party visitor/session tracking:
- Шинэ `visitor_sessions` хүснэгт (**зориудаар зөвхөн 1 хүснэгт** — Umami/Plausible/GoatCounter-ийн session+pageview хос биш, энэ site-д page-view-ийн нарийн түвшний тайлан хэрэггүй тул `pageViewCount` session мөр дээрээ хангалттай).
- `server/routers.ts`-д public `telemetry.pageview` procedure (шинэ `lenientRateLimitedProcedure` tier, 600/15мин/IP — бодит худалдан авагчийн cart/checkout-ийн ерөнхий rate limit-тэй хэзээ ч өрсөлдөхгүй байхаар тусад нь), `shared/deviceType.ts`-д `isLikelyBot` (User-Agent substring blocklist).
- `client/src/lib/pageviewTracking.ts` — route бүр солигдох үед 1 удаа beacon илгээдэг (`App.tsx`-д mount хийсэн), алдаа гарвал хуудсанд хэзээ ч харагдахгүй (fire-and-forget).
- Session cookie нь auth/guest-cart cookie-той тусдаа, урт тогтмол хугацаатай — жинхэнэ 30 минутын "session" зааг нь `lastSeenAt`-ийн серверийн шалгалт дээр л байдаг (cookie өөрөө дуусахад биш) — нэг удаагийн урт хугацааны айлчлал хэд хэдэн session болж хуваагдахаас сэргийлдэг.
- `checkout.createOrder` нь session-г cookie-оос **серверийн талд өөрөө** уншиж (`trafficSource`-той адилгүй, клиентээс дамжуулах шаардлагагүй) захиалга дээр хадгална. `getConversionOverview` = захиалга ÷ session (Shopify-ийн албан ёсны томъёо), хэзээ ч хэмжигдэж эхлээгүй хугацаанд "тодорхойгүй" гэж мэдэгдэнэ (0% гэж зохиомлоор харуулахгүй).

### Тест ба баталгаажуулалт

Шинэ `server/telemetry.integration.test.ts` (4 тест): bot UA чимээгүй алгасдаг, шинэ дуудлага token/cookie/session мөр үүсгэдэг, ижил token-той давтан дуудлага шинэ session үүсгэлгүй `lastSeenAt`/`pageViewCount`-ыг л ахиулдаг, бүтэн `checkout.createOrder` round-trip session-г захиалга дээр зөв холбож `getConversionOverview` үүнийг "хөрвүүлсэн" гэж тоолдгийг баталгаажуулсан. `server/analytics.integration.test.ts`-д 3 шинэ тест (period-comparison тооцоо, CAC сарын coverage логик, "completed→returned" зөвшөөрөгдөж "pending→returned" татгалзагддаг + Tier I-ийн paid-on-complete fix). `pnpm check`/`pnpm build` цэвэр, `pnpm exec vitest run --no-file-parallelism` бүх gate идэвхтэй **161/161 цэвэр** (өмнөх 154-өөс +7). CI-тэй ижил горим: 59 passed/102 skipped, регресс алга.

Playwright-ээр (throwaway `visual-qa-admin@example.invalid` акаунт + synthetic order/session/marketing_spend өгөгдлөөр, Tom-ийн бодит өгөгдөлд хэзээ ч хүрээгүй) бүтэн дашбордыг нүдэн дээр шалгасан — CAC хадгалах товч, sparkline/gauge бодит хөдөлгөөнтэй өгөгдлөөр, бүх шинэ tile clean харагдаж байгааг баталгаажуулсан. Ажлын төгсгөлд бүх throwaway өгөгдлийг (products/orders/visitor_sessions/marketing_spend/QA admin/admin_audit_logs мөр) устгаж, DB-г яг өмнөх (0 бараа/захиалга) төлөвт нь буцаасан.

Commit+push (2 commit: `Tier D` тусад нь, `Tier E/F/G/I` хамт).
