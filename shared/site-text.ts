/**
 * Admin-editable homepage copy, the text-equivalent of site-media.ts's
 * image slots. Tom asked (2026-08-31, alongside the CategoryMasonry v7
 * anchor-scrim fix) for the homepage's "related/associated text" to be
 * editable from /admin next to Content & Media, and confirmed scope covers
 * the whole homepage (Home.tsx and every client/src/components/home/*.tsx
 * section it renders), not just CategoryMasonry.
 *
 * Same shape and same rules as site-media.ts:
 *  - `key` is a stable slotKey stored in the site_text table (varchar(80),
 *    not an enum -- no migration needed to add more slots later).
 *  - `fallbackValue` is the CURRENT real copy already live on the site
 *    (copied verbatim from the component it came from), not new/invented
 *    marketing language -- editing a slot overrides it, clearing it
 *    restores this exact original text.
 *  - A 2-or-3-line heading's fallbackValue joins its lines with "\n" (one
 *    slot, one textarea in the admin UI) instead of a separate slot per
 *    line -- each component splits on "\n" and re-applies its own
 *    <br/>/<em>/<strong> treatment around the two plain-text lines. This
 *    keeps the admin UI to one intuitive multi-line box per heading rather
 *    than two disconnected single-line fields, at the cost of a small
 *    fixed simplification: a couple of headings that originally
 *    italicized only PART of one line (e.g. the care section's "Багахан
 *    <em>итгэл.</em>") now italicize a whole line instead -- documented at
 *    each call site, not a functional change.
 *
 * Deliberately NOT covered by this system (left as code, not a slot):
 *  - Anything that doubles as a functional key/link, where free-text
 *    editing could silently break behavior: category card `title` (also
 *    used as the exact-match /shop?category= filter value -- see
 *    shared/catalog-filter.ts), phone-number CTAs whose text embeds the
 *    literal number next to a tel: href, branch name/hours/address (real
 *    structured data from locations-data.ts).
 *  - Real, server-computed numbers and the sentences built around them
 *    (loyalty tier names/percentages, savings amounts, review counts,
 *    prices) -- these come from the DB via tRPC, same "never show a fake
 *    number" rule as everywhere else in this app.
 *  - Anything already covered by an existing real CMS: post titles/
 *    excerpts (content.latestPosts / the Posts admin panel), product
 *    names/descriptions (the Products admin panel).
 */
export const siteTextSlots = [
  // ---- Hero -------------------------------------------------------------
  {
    key: "home-text-hero-eyebrow",
    group: "Hero",
    label: "Дээд жижиг тэмдэглэгээ",
    description: "Hero хэсгийн дээд талын жижиг эйброу текст.",
    fallbackValue: "SUGI ASAYAKE / MONGOLIA",
  },
  {
    key: "home-text-hero-heading",
    group: "Hero",
    label: "Гол гарчиг (3 мөр)",
    description: "Hero хэсгийн том гарчиг. 3 мөр -- мөр бүрийг шинэ мөрөнд бичнэ үү.",
    fallbackValue: "ГЭР БҮЛИЙН\nГИШҮҮН БҮРТ\nЯПОН ЧАНАР",
  },
  {
    key: "home-text-hero-description",
    group: "Hero",
    label: "Тайлбар өгүүлбэр",
    description: "Гол гарчигийн доорх тайлбар мөр.",
    fallbackValue: "Японоос баталгаат бүтээгдэхүүнүүдийг албан ёсны эрхтэйгээр танд хүргэж байна.",
  },
  {
    key: "home-text-hero-badge-label",
    group: "Hero",
    label: "\"800+\" тэмдгийн доорх тайлбар",
    description: "Hero зургийн баруун дээд буланд байрлах тоон тэмдгийн доорх тайлбар (жишээ: DAILY CHOICES). 800+ тоо өөрөө энэ хэсэгт биш, кодод шууд бичигдсэн хэвээр (Trust strip-тэй хамт).",
    fallbackValue: "DAILY CHOICES",
  },
  {
    key: "home-text-hero-marker-label",
    group: "Hero",
    label: "Hero зургийн жижиг тэмдэглэгээ",
    description: "Hero зурган дээрх жижиг badge текст.",
    fallbackValue: "THE MORNING OF CARE",
  },
  {
    key: "home-text-hero-signature",
    group: "Hero",
    label: "Доод гарын үсэг мөр",
    description: "Hero copy-ийн хамгийн доод жижиг өгүүлбэр.",
    fallbackValue: "Өглөөнөөс орой хүртэл таны өдөр тутмын сонголт.",
  },
  {
    key: "home-text-hero-image-caption",
    group: "Hero",
    label: "Зургийн доод тайлбар",
    description: "Hero зурган дээрх доод талын жижиг тайлбар мөр.",
    fallbackValue: "Өдөр бүрийн арчилгаа, илүү ойрхон",
  },
  {
    key: "home-text-hero-trust-title",
    group: "Hero",
    label: "Баталгааны гарчиг",
    description: "Hero доторх \"100% албан ёсны эрхтэй\" бэлгэдлийн гарчиг.",
    fallbackValue: "100% албан ёсны эрхтэй",
  },
  {
    key: "home-text-hero-trust-subtitle",
    group: "Hero",
    label: "Баталгааны тайлбар",
    description: "Дээрх гарчигийн доорх жижиг тайлбар.",
    fallbackValue: "SUGI Drug Store Japan-ийн охин компани",
  },

  // ---- Sunrise ribbon (Hero-ийн доорх, баруун тийш урсдаг текстэн зурвас) ---
  {
    key: "home-text-ribbon-phrase1",
    group: "Урсдаг зурвас (Hero доор)",
    label: "1-р хэллэг",
    description: "Hero-ийн доорх тасралтгүй баруун тийш урсдаг зурвасын эхний хэллэг.",
    fallbackValue: "JAPANESE DAILY CARE",
  },
  {
    key: "home-text-ribbon-phrase2",
    group: "Урсдаг зурвас (Hero доор)",
    label: "2-р хэллэг",
    description: "",
    fallbackValue: "УЛААНБААТАР / MONGOLIA",
  },
  {
    key: "home-text-ribbon-phrase3",
    group: "Урсдаг зурвас (Hero доор)",
    label: "3-р хэллэг",
    description: "",
    fallbackValue: "ГЭР БҮЛИЙН ГИШҮҮН БҮРТ",
  },

  // ---- Shop ribbon (/shop хуудасны дээд талын тасралтгүй урсдаг зурвас) ---
  // Unlike the 3 fixed home-text-ribbon-phraseN slots above, this is ONE
  // slot holding a variable number of phrases (one per line) -- Tom
  // explicitly asked to be able to add/remove however many phrases he
  // wants, not a fixed count. Reuses the same "one textarea, split on \n"
  // convention already used for multi-line headings elsewhere in this
  // file, just for an open-ended list instead of exactly 2-3 lines.
  // Shop.tsx splits on "\n", filters blank lines, and renders however many
  // phrases result.
  {
    key: "home-shop-ribbon-phrases",
    group: "Shop дэлгүүрийн зурвас",
    label: "Урсдаг зурвасын хэллэгүүд",
    description: "Дэлгүүр хуудасны дээд талд тасралтгүй урсдаг зурвас. Мөр бүрд ЯГ НЭГ хэллэг бичнэ -- хэдэн ч мөр (хэллэг) нэмж эсвэл хасаж болно.",
    fallbackValue: "CURATED IN JAPAN\nFIND YOUR DAILY CARE\nУЛААНБААТАР / MONGOLIA",
  },

  // ---- Why Choose Us (2026-09-06: absorbed the old standalone "Бидний
  // ялгаа" story section and the customer-voices review strip -- see
  // BrandStorySection.tsx. home-text-story-number/-eyebrow-label/-heading/
  // -link-label were retired (fully redundant with this section's own
  // eyebrow/heading once merged, and -link-label pointed at a "#collection"
  // anchor that no longer exists) -- only -description survived, repurposed
  // below as this section's first lede paragraph. ------------------------
  {
    key: "home-text-wcu-eyebrow-label",
    group: "Яагаад биднийг сонгох вэ",
    label: "Эйброу текст",
    description: "Хэсгийн дээд жижиг тэмдэглэгээ.",
    fallbackValue: "ЯАГААД БИДНИЙГ СОНГОХ ВЭ",
  },
  {
    key: "home-text-wcu-heading",
    group: "Яагаад биднийг сонгох вэ",
    label: "Гарчиг (2 мөр)",
    description: "Хэсгийн гарчиг.",
    fallbackValue: "Япон чанарыг\nтанд ойртуулна.",
  },
  {
    // Was "home-text-story-heading" + the old standalone Story section's
    // own <h2> -- repurposed as the 1st lede paragraph (BrandStorySection
    // renders this ABOVE home-text-wcu-description below), key kept
    // unchanged so any admin-saved override survives the merge.
    key: "home-text-story-description",
    group: "Яагаад биднийг сонгох вэ",
    label: "Танилцуулга догол мөр (1)",
    description: "Гарчигийн доорх эхний параграф -- \"бид хэн бэ\" гэсэн танилцуулга.",
    fallbackValue: "SUGI ASAYAKE нь Японы SUGI Drug Store-ийн албан ёсны охин компани. Өдөр тутмын эрүүл мэнд, гоо сайхан, арчилгааг Монголын гэр бүл бүрт илүү ойртуулна.",
  },
  {
    key: "home-text-wcu-description",
    group: "Яагаад биднийг сонгох вэ",
    label: "Танилцуулга догол мөр (2)",
    description: "Гарчигийн доорх хоёр дахь параграф.",
    fallbackValue: "SUGI ASAYAKE-ийг сонгох гурван шалтгаан — өргөн сонголт, баталгаат импорт, ойрхон салбарууд.",
  },
  {
    key: "home-text-wcu-card1-title",
    group: "Яагаад биднийг сонгох вэ",
    label: "1-р картын гарчиг",
    description: "\"Сонголт\" карт.",
    fallbackValue: "Сонголт",
  },
  {
    key: "home-text-wcu-card1-desc",
    group: "Яагаад биднийг сонгох вэ",
    label: "1-р картын тайлбар",
    description: "800+ тоо энэ мөрөнд шууд бичигдсэн текст -- өөрчлөх бол энд шууд засна уу.",
    fallbackValue: "Арчилгаа, гоо сайхан, эрүүл ахуйн 800+ төрөл",
  },
  {
    key: "home-text-wcu-card2-title",
    group: "Яагаад биднийг сонгох вэ",
    label: "2-р картын гарчиг",
    description: "\"Баталгаа\" карт.",
    fallbackValue: "Баталгаа",
  },
  {
    key: "home-text-wcu-card2-desc",
    group: "Яагаад биднийг сонгох вэ",
    label: "2-р картын тайлбар",
    description: "",
    fallbackValue: "Японоос баталгаат, албан ёсны бүтээгдэхүүн",
  },
  {
    key: "home-text-wcu-card3-title",
    group: "Яагаад биднийг сонгох вэ",
    label: "3-р картын гарчиг",
    description: "\"Ойрхон\" карт.",
    fallbackValue: "Ойрхон",
  },
  {
    key: "home-text-wcu-card3-prefix",
    group: "Яагаад биднийг сонгох вэ",
    label: "3-р картын тайлбар (тооны өмнөх текст)",
    description: "Бодит салбарын тоо (кодоос автоматаар тооцоологдоно) энэ текстийн ДАРАА шууд харагдана -- тоог энд бичихгүй, зөвхөн урд талын текстийг л бичнэ.",
    fallbackValue: "Улаанбаатарын",
  },
  {
    key: "home-text-wcu-card3-suffix",
    group: "Яагаад биднийг сонгох вэ",
    label: "3-р картын тайлбар (тооны дараах текст)",
    description: "Бодит салбарын тооны дараа харагдах текст.",
    fallbackValue: "байршилд таныг хүлээнэ",
  },

  // ---- Category Masonry ---------------------------------------------------
  {
    key: "home-text-cat-number",
    group: "Бүтээгдэхүүний ангилал",
    label: "Дугаар (жишээ: 02)",
    description: "Нүүр хуудасны дараалсан дугаарлалт -- home-text-story-numberийн тайлбарыг үзнэ үү.",
    fallbackValue: "02",
  },
  {
    key: "home-text-cat-eyebrow-label",
    group: "Бүтээгдэхүүний ангилал",
    label: "Эйброу текст",
    description: "",
    fallbackValue: "EVERYDAY JAPAN",
  },
  {
    key: "home-text-cat-heading",
    group: "Бүтээгдэхүүний ангилал",
    label: "Гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Японы бүтээгдэхүүний\nүндсэн ангилал.",
  },
  {
    key: "home-text-cat-description",
    group: "Бүтээгдэхүүний ангилал",
    label: "Тайлбар өгүүлбэр",
    description: "800+ тоо энэ мөрөнд шууд бичигдсэн.",
    fallbackValue: "Арьс арчилгаа, гоо сайхан, эрүүл ахуй, гэр бүлийн өдөр тутмын хэрэгцээг 800+ сонголтоос нэг дороос.",
  },
  {
    key: "home-text-cat-link-label",
    group: "Бүтээгдэхүүний ангилал",
    label: "Холбоосын текст",
    description: "",
    fallbackValue: "Дэлгэрэнгүй үзэх",
  },
  {
    key: "home-text-cat-anchor-eyebrow",
    group: "Бүтээгдэхүүний ангилал",
    label: "Том зургийн эйброу текст",
    description: "Anchor (том зураг) tile дээрх жижиг тэмдэглэгээ.",
    fallbackValue: "OUR SELECTION",
  },
  {
    key: "home-text-cat-anchor-heading",
    group: "Бүтээгдэхүүний ангилал",
    label: "Том зургийн гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Нэг өдөрт\nхэрэгтэй бүх зүйл.",
  },
  {
    key: "home-text-cat-anchor-cta",
    group: "Бүтээгдэхүүний ангилал",
    label: "Том зургийн CTA текст",
    description: "",
    fallbackValue: "Ойр салбараа олох",
  },
  {
    key: "home-text-cat-note",
    group: "Бүтээгдэхүүний ангилал",
    label: "Доод тэмдэглэл",
    description: "Хэсгийн доод талын жижиг тэмдэглэл мөр.",
    fallbackValue: "Бидний тавиур дээрх бүтээгдэхүүн бүр өдөр тутмын хэрэгцээнээс эхэлнэ.",
  },
  {
    key: "home-text-cat-detail-arhis-archilgaa",
    group: "Бүтээгдэхүүний ангилал — 6 картын тайлбар",
    label: "\"Арьс арчилгаа\" картын тайлбар",
    description: "Ангиллын НЭР биш (нэр нь /shop-ийн шүүлтүүрт ашиглагддаг тул энд засварлагдахгүй), зөвхөн доод тайлбар мөр.",
    fallbackValue: "Өдөр тутмын цэвэр, зөөлөн арчилгаа",
  },
  {
    key: "home-text-cat-detail-goo-saikhan",
    group: "Бүтээгдэхүүний ангилал — 6 картын тайлбар",
    label: "\"Гоо сайхан\" картын тайлбар",
    description: "",
    fallbackValue: "Японы сонгомол хэрэгцээт бүтээгдэхүүн",
  },
  {
    key: "home-text-cat-detail-eruul-mend",
    group: "Бүтээгдэхүүний ангилал — 6 картын тайлбар",
    label: "\"Эрүүл мэнд\" картын тайлбар",
    description: "",
    fallbackValue: "Өдөр тутмын сайн сайхны найдвартай сонголт",
  },
  {
    key: "home-text-cat-detail-eruul-akhui",
    group: "Бүтээгдэхүүний ангилал — 6 картын тайлбар",
    label: "\"Эрүүл ахуй\" картын тайлбар",
    description: "",
    fallbackValue: "Гэр бүлд хэрэгтэй цэвэр, аюулгүй хэрэглээ",
  },
  {
    key: "home-text-cat-detail-us-ba-bie",
    group: "Бүтээгдэхүүний ангилал — 6 картын тайлбар",
    label: "\"Үс ба бие\" картын тайлбар",
    description: "",
    fallbackValue: "Өдөр бүрийн арчилгааг илүү хялбар болгоно",
  },
  {
    key: "home-text-cat-detail-eej-ba-khuukhed",
    group: "Бүтээгдэхүүний ангилал — 6 картын тайлбар",
    label: "\"Ээж ба хүүхэд\" картын тайлбар",
    description: "",
    fallbackValue: "Зөөлөн, хэрэгцээт сонголтууд",
  },

  // ---- Bestseller rail -----------------------------------------------------
  {
    key: "home-text-bestseller-kicker",
    group: "Их зарагддаг бараанууд",
    label: "Дээд жижиг тэмдэглэгээ",
    description: "",
    fallbackValue: "ОНЦЛОХ СОНГОЛТ",
  },
  {
    key: "home-text-bestseller-heading",
    group: "Их зарагддаг бараанууд",
    label: "Гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Их зарагддаг\nбараанууд.",
  },
  {
    key: "home-text-bestseller-description",
    group: "Их зарагддаг бараанууд",
    label: "Тайлбар өгүүлбэр",
    description: "",
    fallbackValue: "Манай захиалгын бодит түүхээр эрэмбэлсэн, хамгийн их итгэл олсон сонголтууд.",
  },
  {
    key: "home-text-bestseller-all-link",
    group: "Их зарагддаг бараанууд",
    label: "\"Бүгдийг үзэх\" линкийн текст",
    description: "",
    fallbackValue: "Бүх бүтээгдэхүүн үзэх",
  },

  // ---- "Танд санал болгож байна" rail (Preference Profile v2, 2026-09-01) --
  {
    key: "home-text-recommended-kicker",
    group: "Танд санал болгож байна",
    label: "Дээд жижиг тэмдэглэгээ",
    description: "",
    fallbackValue: "ТАНД ЗОРИУЛАН",
  },
  {
    key: "home-text-recommended-heading",
    group: "Танд санал болгож байна",
    label: "Гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Танд санал\nболгож байна.",
  },
  {
    key: "home-text-recommended-description",
    group: "Танд санал болгож байна",
    label: "Тайлбар өгүүлбэр",
    description: "",
    fallbackValue: "Таны профайл дээр хадгалсан тохиргоо, эсвэл манай хамгийн эрэлттэй сонголтуудад тулгуурласан жагсаалт.",
  },

  // ---- Топ брэндүүд (2026-09-04, NEWVISION.md §5; 2026-09-06: briefly
  // retired from the homepage during the design-review consolidation, then
  // restored the same day at Tom's explicit "we need Top Brands, must
  // have!!" -- back in Home.tsx between BrandStorySection and
  // CategoryMasonry, same position it always had.) --------------------
  {
    key: "home-text-brands-eyebrow",
    group: "Топ брэндүүд",
    label: "Эйброу текст",
    description: "",
    fallbackValue: "ТОП БРЭНД",
  },
  {
    key: "home-text-brands-heading",
    group: "Топ брэндүүд",
    label: "Гарчиг",
    description: "",
    fallbackValue: "Тансаг брэндүүд.",
  },

  // ---- Family / care section ------------------------------------------------
  // 2026-09-06: SeasonalCampaignCarousel no longer renders on the homepage
  // (Tom's "cut to ~6 sections" call) -- its 3 home-text-summer-* slots were
  // retired here. This section's own old hand-rolled markup (a rotated
  // "sun stamp" badge, home-text-care-stamp) was replaced by the
  // already-built EditorialBanner primitive's plain rectangular `tag` --
  // home-text-care-tag now feeds that prop, home-text-care-stamp retired
  // as redundant with it (both said "FAMILY CARE").
  {
    key: "home-text-care-tag",
    group: "Гэр бүлийн арчилгаа",
    label: "Зургийн дээд жижиг тэмдэглэгээ",
    description: "2026-09-06: Топ Брэнд буцаж нэмэгдсэний дараа хуудасны бодит эрэмбэ өөрчлөгдсөн тул энэ хэсэг (EditorialBanner) Салбарууд-аас ӨМНӨ орж ирдэг болсон -- \"04\" биш \"03\" байх ёстой байсныг Tom дахин олж заслаа. EditorialBanner-ийн зургийн буланд харагдах жижиг тэмдэглэгээ.",
    fallbackValue: "03 / FAMILY CARE",
  },
  {
    key: "home-text-care-eyebrow",
    group: "Гэр бүлийн арчилгаа",
    label: "Эйброу текст",
    description: "",
    fallbackValue: "ГЭР БҮЛИЙН ӨДӨР БҮРТ",
  },
  {
    key: "home-text-care-heading",
    group: "Гэр бүлийн арчилгаа",
    label: "Гарчиг (2 мөр)",
    description: "Анхны хувилбарт эхний мөрний зөвхөн \"итгэл.\" гэдэг үг ялгаатай өнгөтэй байсан бол одоо энэ хэсэгт бүх эхний мөр адилхан онцлогтойгоор харагдана (жижиг хялбарчлал).",
    fallbackValue: "Багахан итгэл.\nИх халамж.",
  },
  {
    key: "home-text-care-description",
    group: "Гэр бүлийн арчилгаа",
    label: "Тайлбар өгүүлбэр",
    description: "",
    fallbackValue: "Бидний сонголт зөвхөн бүтээгдэхүүн биш. Таны гэр бүлийн өдөр тутмын амар тайван байдал, итгэл, халамж юм.",
  },
  {
    key: "home-text-care-point1",
    group: "Гэр бүлийн арчилгаа",
    label: "1-р жагсаалтын мөр",
    description: "",
    fallbackValue: "Баталгаат Япон бүтээгдэхүүн",
  },
  {
    key: "home-text-care-point2",
    group: "Гэр бүлийн арчилгаа",
    label: "2-р жагсаалтын мөр",
    description: "",
    fallbackValue: "Гэр бүл бүрт зориулсан сонголт",
  },
  {
    key: "home-text-care-point3",
    group: "Гэр бүлийн арчилгаа",
    label: "3-р жагсаалтын мөр",
    description: "",
    // 2026-09-04: was "Storepay-ээр төлөх боломжтой" -- Storepay has never
    // been a real payment option at /checkout (only cash and QPay), so this
    // was a false claim shown to every visitor. Replaced with a real,
    // already-verified fact (same delivery window promised on /shop's hero).
    fallbackValue: "24–48 цагийн дотор Улаанбаатарт хүргэнэ",
  },

  // ---- Харилцагчийн үг (2026-09-04, NEWVISION.md §6; 2026-09-06: this
  // group's 2 slots now feed BrandStorySection's compact review-strip
  // kicker instead of a standalone customer-voices-section -- see that
  // file. home-text-brands-eyebrow/-heading (Топ брэндүүд) and all 5
  // home-text-jn-* (SUGI Journal) slots were retired here: the Top Brands
  // rail and JournalSection no longer render on the homepage (still real,
  // reusable components -- JournalSection still lives at /journal -- just
  // not shown here, see Home.tsx's top comment). ----------------------
  {
    key: "home-text-voices-eyebrow",
    group: "Харилцагчийн үг",
    label: "Эйброу текст",
    description: "",
    fallbackValue: "ХАРИЛЦАГЧИЙН ҮГ",
  },
  {
    key: "home-text-voices-heading",
    group: "Харилцагчийн үг",
    label: "Гарчиг",
    description: "",
    fallbackValue: "Юу ярьж байна вэ.",
  },

  // ---- Store locator ---------------------------------------------------------
  {
    key: "home-text-locator-number",
    group: "Салбарууд",
    label: "Дугаар (жишээ: 04)",
    description: "2026-09-06: Топ Брэнд буцаж нэмэгдсэний дараа хуудасны эрэмбэ Category(02) → Family Care(03) → Салбарууд(04) болов -- урьд нь энд \"03\" гэж бичигдсэн байсан ч Family Care-ийн \"04\"-ээс ӨМНӨ гарч ирж дахин зөрчил үүсгэсэн (Tom-ийн дахин олсон bug) -- заслаа. Бусад хэсгийн дугаартай (02/03) дараалал зөрчихгүй байхыг өөрөө шалгаарай.",
    fallbackValue: "04",
  },
  {
    key: "home-text-locator-eyebrow-label",
    group: "Салбарууд",
    label: "Эйброу текст",
    description: "",
    fallbackValue: "FIND YOUR ASAYAKE",
  },
  {
    key: "home-text-locator-count-suffix",
    group: "Салбарууд",
    label: "Салбарын тооны дараах текст",
    description: "Бодит салбарын тоо (кодоос автоматаар тооцоологдоно) энэ текстийн ӨМНӨ шууд харагдана.",
    fallbackValue: "БАЙРШИЛ",
  },
  {
    key: "home-text-locator-heading",
    group: "Салбарууд",
    label: "Гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Танд ойрхон\nсалбар дээр.",
  },
  {
    key: "home-text-locator-description",
    group: "Салбарууд",
    label: "Тайлбар өгүүлбэр",
    description: "",
    fallbackValue: "Улаанбаатарын өөр өөр цэгүүдэд япон чанарыг танд ойртуулж байна.",
  },
  {
    key: "home-text-locator-note",
    group: "Салбарууд",
    label: "Доод тэмдэглэл",
    description: "",
    fallbackValue: "Салбарын байршлыг Google Maps дээр нээх",
  },

  // ---- Quick Stats (membership) — only the static copy, not real numbers ----
  {
    key: "home-text-qs-eyebrow-label",
    group: "Гишүүнчлэлийн хураангуй",
    label: "Эйброу текст",
    description: "",
    fallbackValue: "ГИШҮҮНЧЛЭЛ",
  },
  {
    key: "home-text-qs-heading",
    group: "Гишүүнчлэлийн хураангуй",
    label: "Гарчиг (2 мөр)",
    description: "Reference зурагтай тааруулахын тулд \"Quick Stats\" гэсэн англи гарчиг санаатайгаар хэвээр байгаа (өмнөх session-д Tom-той батлагдсан) -- гэхдээ энд ч мөн засварлах боломжтой.",
    fallbackValue: "Quick\nStats",
  },
  {
    key: "home-text-qs-subtitle",
    group: "Гишүүнчлэлийн хураангуй",
    label: "Монгол тайлбар мөр",
    description: "",
    fallbackValue: "Илүү их худалдан авалт, илүү их хэмнэлт.",
  },
  {
    key: "home-text-qs-description",
    group: "Гишүүнчлэлийн хураангуй",
    label: "Тайлбар өгүүлбэр",
    description: "",
    fallbackValue: "Таны нийт худалдан авалтын дүн өсөх тусам гишүүнчлэлийн хямдрал нэмэгдэж, дараагийн захиалга бүрд илүү их хэмнэлт үүснэ.",
  },
  {
    key: "home-text-qs-guest-hint",
    group: "Гишүүнчлэлийн хураангуй",
    label: "Зочны бичиг (нэвтрээгүй үед)",
    description: "",
    fallbackValue: "Нэвтэрснээр өөрийн бодит хэмнэлтийг харах боломжтой",
  },
  {
    key: "home-text-qs-cta-loggedin",
    group: "Гишүүнчлэлийн хураангуй",
    label: "CTA текст (нэвтэрсэн)",
    description: "",
    fallbackValue: "Профайл руу орох",
  },
  {
    key: "home-text-qs-cta-guest",
    group: "Гишүүнчлэлийн хураангуй",
    label: "CTA текст (нэвтрээгүй)",
    description: "",
    fallbackValue: "Гишүүнээр бүртгүүлэх",
  },

  // ---- Final CTA (2026-09-06: moved from a standalone Home.tsx section into
  // an opt-in banner rendered by SiteFooter.tsx -- same real content/slots,
  // just read from a different component now; only Home.tsx passes it). ---
  {
    key: "home-text-finalcta-eyebrow",
    group: "Эцсийн CTA",
    label: "Эйброу текст",
    description: "",
    fallbackValue: "NEED A LITTLE HELP?",
  },
  {
    key: "home-text-finalcta-heading",
    group: "Эцсийн CTA",
    label: "Гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Сайн сонголт\nойрхон байна.",
  },
] as const;

export type SiteTextSlotKey = (typeof siteTextSlots)[number]["key"];

export const siteTextSlotKeys = siteTextSlots.map(slot => slot.key) as [SiteTextSlotKey, ...SiteTextSlotKey[]];

export const getSiteTextSlot = (key: SiteTextSlotKey) =>
  siteTextSlots.find(slot => slot.key === key)!;
