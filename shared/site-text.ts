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

  // ---- Trust strip (800+ / branch count / official rights) --------------
  {
    key: "home-text-trust-stat1-label",
    group: "Тоон баримт (Trust Strip)",
    label: "\"800+\"-ийн доорх тайлбар",
    description: "Hero доорх 3 тоон баримтын эхнийх (800+) -той хамт харагдах тайлбар.",
    fallbackValue: "төрлийн бүтээгдэхүүн",
  },
  {
    key: "home-text-trust-stat2-label",
    group: "Тоон баримт (Trust Strip)",
    label: "Салбарын тооны тайлбар",
    description: "Бодит салбарын тоо (кодоос автоматаар тооцоологдоно, энд өөрчлөгдөхгүй) -той хамт харагдах тайлбар.",
    fallbackValue: "УБ дахь салбар",
  },
  {
    key: "home-text-trust-stat3-value",
    group: "Тоон баримт (Trust Strip)",
    label: "3 дахь тоон утга",
    description: "Гурав дахь баримтын тоон утга (жишээ: 01).",
    fallbackValue: "01",
  },
  {
    key: "home-text-trust-stat3-label",
    group: "Тоон баримт (Trust Strip)",
    label: "3 дахь тайлбар",
    description: "Гурав дахь баримтын тайлбар.",
    fallbackValue: "Японы албан ёсны эрх",
  },

  // ---- Story section ("01 THE SUGI DIFFERENCE") --------------------------
  {
    key: "home-text-story-eyebrow-label",
    group: "Бидний ялгаа",
    label: "Эйброу текст",
    description: "\"01\" дугаарын хажуугийн жижиг тэмдэглэгээ.",
    fallbackValue: "THE SUGI DIFFERENCE",
  },
  {
    key: "home-text-story-heading",
    group: "Бидний ялгаа",
    label: "Гарчиг (2 мөр)",
    description: "Энэ хэсгийн гарчиг. 2 мөр.",
    fallbackValue: "Японы чанарыг\nойртуулна.",
  },
  {
    key: "home-text-story-description",
    group: "Бидний ялгаа",
    label: "Тайлбар өгүүлбэр",
    description: "Гарчигийн доорх параграф.",
    fallbackValue: "SUGI ASAYAKE нь Японы SUGI Drug Store-ийн албан ёсны охин компани. Өдөр тутмын эрүүл мэнд, гоо сайхан, арчилгааг Монголын гэр бүл бүрт илүү ойртуулна.",
  },
  {
    key: "home-text-story-link-label",
    group: "Бидний ялгаа",
    label: "Холбоосын текст",
    description: "\"Бидний ялгаа\" линкийн текст.",
    fallbackValue: "Бидний ялгаа",
  },

  // ---- Why Choose Us ------------------------------------------------------
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
    key: "home-text-wcu-description",
    group: "Яагаад биднийг сонгох вэ",
    label: "Тайлбар өгүүлбэр",
    description: "Гарчигийн хажуугийн параграф.",
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

  // ---- Family / care section ------------------------------------------------
  {
    key: "home-text-care-tag",
    group: "Гэр бүлийн арчилгаа",
    label: "Зургийн дээд жижиг тэмдэглэгээ",
    description: "",
    fallbackValue: "03 / FAMILY CARE",
  },
  {
    key: "home-text-care-stamp",
    group: "Гэр бүлийн арчилгаа",
    label: "Тамганы текст",
    description: "Хэсгийн зүүн талд байрлах дугуй тамга дахь текст.",
    fallbackValue: "FAMILY CARE",
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
    fallbackValue: "Storepay-ээр төлөх боломжтой",
  },
  {
    key: "home-text-care-storepay-note",
    group: "Гэр бүлийн арчилгаа",
    label: "Storepay тэмдэглэлийн текст",
    description: "",
    fallbackValue: "Хэрэгтэй зүйлээ өнөөдөр сонгоод, төлбөрөө өөрт тохиромжтой хуваарил.",
  },

  // ---- Journal ------------------------------------------------------------------
  {
    key: "home-text-jn-eyebrow-label",
    group: "SUGI Journal",
    label: "Эйброу текст",
    description: "",
    fallbackValue: "SUGI JOURNAL",
  },
  {
    key: "home-text-jn-heading",
    group: "SUGI Journal",
    label: "Гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Зөвлөгөө ба\nмэдээ.",
  },
  {
    key: "home-text-jn-all-link",
    group: "SUGI Journal",
    label: "\"Бүгдийг үзэх\" линкийн текст",
    description: "",
    fallbackValue: "Бүх нийтлэл",
  },
  {
    key: "home-text-jn-read-more",
    group: "SUGI Journal",
    label: "Нийтлэл картын CTA текст",
    description: "Пост картуудын доод \"дэлгэрэнгүй унших\" линк -- бүх картад ижил.",
    fallbackValue: "Дэлгэрэнгүй унших",
  },

  // ---- Store locator ---------------------------------------------------------
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

  // ---- Final CTA -------------------------------------------------------------
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
