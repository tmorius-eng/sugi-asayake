/**
 * Admin-ээр засварлагдах нүүрний текст, site-media.ts-ийн зургийн slot-ын текстийн
 * аналог. Tom (2026-08-31, CategoryMasonry v7 anchor-scrim засвартай хамт) нүүрний
 * "холбоотой текст"-ийг /admin-д Content & Media-ийн хажууд засварлагдах болгохыг
 * хүссэн бөгөөд хамрах хүрээ зөвхөн CategoryMasonry биш нүүр бүхэлдээ (Home.tsx ба
 * түүний зурдаг client/src/components/home/*.tsx хэсэг бүр) гэдгийг баталсан.
 *
 * site-media.ts-тэй ижил хэлбэр, ижил дүрэм:
 *  - `key` нь site_text хүснэгтэд хадгалагдах тогтвортой slotKey (varchar(80), enum
 *    биш — дараа slot нэмэхэд migration хэрэггүй).
 *  - `fallbackValue` нь сайтад аль хэдийн амьд ОДООГИЙН бодит текст (ирсэн
 *    компонентоосоо үгчлэн хуулсан), шинэ/зохиомол маркетингийн хэл биш — slot засвал
 *    дарж бичнэ, цэвэрлэвэл яг энэ анхны текст сэргэнэ.
 *  - 2-3 мөрийн гарчгийн fallbackValue мөрүүдээ "\n"-ээр холбоно (нэг slot, admin
 *    UI-д нэг textarea), мөр бүрд тусдаа slot биш — компонент бүр "\n"-ээр хувааж
 *    хоёр энгийн мөрийн эргэн тойронд өөрийн <br/>/<em>/<strong>-оо дахин хэрэглэнэ.
 *    Энэ нь admin UI-г гарчиг бүрт хоёр салангид нэг мөрийн талбар биш нэг ойлгомжтой
 *    олон мөрийн хайрцаг байлгадаг, жижиг тогтмол хялбарчлалын үнээр: анх нэг мөрийн
 *    зөвхөн ХЭСГИЙГ налуу болгодог байсан хос гарчиг (ж. care section-ийн "Багахан
 *    <em>итгэл.</em>") одоо бүтэн мөрөө налуу болгоно — дуудлагын цэг бүрт
 *    баримтжуулсан, функциональ өөрчлөлт биш.
 *
 * Энэ системд санаатайгаар ХАМРАГДААГҮЙ (slot биш код хэвээр):
 *  - Функциональ түлхүүр/линк болж давхар ажилладаг, чөлөөт текст засвар зан төлөвийг
 *    чимээгүй эвдэж болох юу ч: ангиллын картын `title` (/shop?category= шүүлтүүрийн
 *    яг таарах утга — shared/catalog-filter.ts), tel: href-ийн хажууд дугаараа
 *    агуулсан утасны CTA, салбарын нэр/цаг/хаяг (locations-data.ts-ийн бодит
 *    бүтэцтэй өгөгдөл).
 *  - Серверийн тооцоолсон бодит тоо, түүний эргэн тойрны өгүүлбэр (loyalty шатлалын
 *    нэр/хувь, хэмнэлтийн дүн, сэтгэгдлийн тоо, үнэ) — DB-ээс tRPC-ээр ирнэ, аппын
 *    бусад газрын "хуурамч тоо хэзээ ч харуулахгүй" дүрэм.
 *  - Бодит CMS-ээр аль хэдийн хамрагдсан юу ч: нийтлэлийн гарчиг/товч (content.
 *    latestPosts / Posts admin панель), барааны нэр/тайлбар (Products admin панель).
 */
/** Icon names an admin may type into the "Яагаад биднийг сонгох вэ" icon
 *  slots (2026-09-12). The storefront maps each to a lucide icon
 *  (BrandStorySection.tsx); anything else falls back to the item's default. */
export const WCU_ICON_NAMES = ["shopping-bag", "shield-check", "map-pin", "star", "heart", "truck", "sparkles", "badge-check", "leaf", "gift", "package", "smile"] as const;
export type WcuIconName = (typeof WCU_ICON_NAMES)[number];
const WCU_ICON_DESCRIPTION = `Icon-ий нэр. Боломжит утга: ${WCU_ICON_NAMES.join(", ")}. Буруу нэр бичвэл анхдагч icon харагдана.`;
const WCU_COLOR_DESCRIPTION = "Tile-ийн дэвсгэр өнгө, hex хэлбэрээр (жишээ: #e94e3c). Icon нь цагаан тул тод, бараавтар өнгө сонго. Буруу утга бол анхдагч өнгө харагдана.";

export const siteTextSlots = [
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
    key: "home-text-hero-signature",
    group: "Hero",
    label: "Доод гарын үсэг мөр",
    description: "Hero copy-ийн хамгийн доод жижиг өгүүлбэр.",
    fallbackValue: "Өглөөнөөс орой хүртэл таны өдөр тутмын сонголт.",
  },

  // 2026-09-12: the per-slide text (badge, marker, corner label, caption --
  // 18 slots across six slides) was deleted outright at Tom's request. The
  // hero row is photographs only now, so those slots had nothing left to
  // render and only cluttered /admin. A slide still appears purely because
  // its IMAGE slot has an upload (see shared/site-media.ts).
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

  // ---- Why Choose Us (2026-09-12: rebuilt against Tom's reference -- a
  // light panel, centred eyebrow + title, three numbered columns; see
  // BrandStorySection.tsx). The eyebrow slot is rendered again; the two
  // lede paragraphs below are no longer shown but stay registered so a
  // saved override is never lost. No key was added or removed. ----------
  {
    key: "home-text-wcu-eyebrow-label",
    group: "Яагаад биднийг сонгох вэ",
    label: "Эйброу текст",
    description: "(2026-09-12-оос нүүрэнд харагдахгүй -- Tom-ийн хүсэлтээр хасагдсан; хадгалсан утга алдагдахгүй.)",
    fallbackValue: "ЯАГААД БИДНИЙГ СОНГОХ ВЭ",
  },
  {
    key: "home-text-wcu-heading",
    group: "Яагаад биднийг сонгох вэ",
    label: "Гарчиг",
    description: "Төв гарчиг. Ихэвчлэн 1 мөр; Enter дарж 2 мөр болгож болно.",
    fallbackValue: "Яагаад SUGI ASAYAKE вэ?",
  },
  {
    // Was "home-text-story-heading" + the old standalone Story section's
    // own <h2> -- repurposed as the 1st lede paragraph (BrandStorySection
    // renders this ABOVE home-text-wcu-description below), key kept
    // unchanged so any admin-saved override survives the merge.
    key: "home-text-story-description",
    group: "Яагаад биднийг сонгох вэ",
    label: "Танилцуулга догол мөр (1)",
    description: "(2026-09-12-оос нүүрэнд харагдахгүй -- хадгалсан утга алдагдахгүй.) Гарчигийн доорх эхний параграф -- \"бид хэн бэ\" гэсэн танилцуулга.",
    fallbackValue: "SUGI ASAYAKE нь Японы SUGI Drug Store-ийн албан ёсны охин компани. Өдөр тутмын эрүүл мэнд, гоо сайхан, арчилгааг Монголын гэр бүл бүрт илүү ойртуулна.",
  },
  {
    key: "home-text-wcu-description",
    group: "Яагаад биднийг сонгох вэ",
    label: "Танилцуулга догол мөр (2)",
    description: "(2026-09-12-оос нүүрэнд харагдахгүй -- хадгалсан утга алдагдахгүй.) Гарчигийн доорх хоёр дахь параграф.",
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
    label: "1-р зүйлийн тайлбар",
    description: "{N} гэж бичсэн газар бодит барааны тоо (жишээ: 900+) автоматаар орно -- тоог гараар бичихгүй.",
    fallbackValue: "Арчилгаа, гоо сайхан, эрүүл ахуйн {N} төрөл",
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
  // 2026-09-12: the icon and tile colour of each of the three items are
  // admin-editable too (Tom: "бүгд /admin дээр тохируулагддаг байг").
  // Icon names come from WCU_ICON_NAMES below; an unknown name or an
  // invalid colour falls back to the default, never to a broken tile.
  {
    key: "home-text-wcu-card1-icon",
    group: "Яагаад биднийг сонгох вэ",
    label: "1-р зүйлийн icon",
    description: WCU_ICON_DESCRIPTION,
    fallbackValue: "shopping-bag",
  },
  {
    key: "home-text-wcu-card1-color",
    group: "Яагаад биднийг сонгох вэ",
    label: "1-р зүйлийн tile өнгө",
    description: WCU_COLOR_DESCRIPTION,
    fallbackValue: "#e94e3c",
  },
  {
    key: "home-text-wcu-card2-icon",
    group: "Яагаад биднийг сонгох вэ",
    label: "2-р зүйлийн icon",
    description: WCU_ICON_DESCRIPTION,
    fallbackValue: "shield-check",
  },
  {
    key: "home-text-wcu-card2-color",
    group: "Яагаад биднийг сонгох вэ",
    label: "2-р зүйлийн tile өнгө",
    description: WCU_COLOR_DESCRIPTION,
    fallbackValue: "#2b1d9e",
  },
  {
    key: "home-text-wcu-card3-icon",
    group: "Яагаад биднийг сонгох вэ",
    label: "3-р зүйлийн icon",
    description: WCU_ICON_DESCRIPTION,
    fallbackValue: "map-pin",
  },
  {
    key: "home-text-wcu-card3-color",
    group: "Яагаад биднийг сонгох вэ",
    label: "3-р зүйлийн tile өнгө",
    description: WCU_COLOR_DESCRIPTION,
    fallbackValue: "#12b76a",
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
    fallbackValue: "Японы бүтээгдэхүүний\nүндсэн ангилал",
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
    fallbackValue: "Нэг өдөрт\nхэрэгтэй бүх зүйл",
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
    fallbackValue: "Их зарагддаг\nбараанууд",
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


  // ---- "Түгээмэл хайлт" keyword chips under the opening photographs
  //      (2026-09-12 Cosme Kitchen restyle; the chips themselves are the
  //      real categories and featured brands, not editable text) ----------
  {
    key: "home-text-keywords-heading",
    group: "Түгээмэл хайлт",
    label: "Гарчиг",
    description: "Нүүрний эхний зургуудын доорх түлхүүр үгийн хайрцгийн гарчиг.",
    fallbackValue: "Түгээмэл хайлт",
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
    fallbackValue: "Танд санал\nболгож байна",
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
  // CategoryMasonry, same position it always had.)
  //
  // 2026-09-10: the section was rebuilt against matsuyaginza.com/en's
  // "Featured Brands". Tom asked for "Тансаг брэндүүд." to be deleted
  // outright, so `home-text-brands-heading` and its eyebrow companion
  // `home-text-brands-eyebrow` ("ТОП БРЭНД") were removed rather than
  // re-worded -- the reference carries no eyebrow at all, just one plain
  // 40px heading. This single slot replaces both. Dropping the two old keys
  // from siteTextSlotKeys also stops the admin Текст tab from listing copy
  // that nothing renders any more; any stale site_text row is inert (nothing
  // reads it) and is deleted alongside this change. --------------------
  {
    key: "home-text-featured-brands-heading",
    group: "Топ брэндүүд",
    label: "Гарчиг",
    description: "Каруселийн дээрх гарчиг. SUGI-ийн улаан өнгөөр, цэггүй.",
    fallbackValue: "Онцлох брэндүүд",
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
    fallbackValue: "Багахан итгэл.\nИх халамж",
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
    fallbackValue: "Танд ойрхон\nсалбар дээр",
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
    fallbackValue: "Илүү их худалдан авалт, илүү их хэмнэлт",
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
    fallbackValue: "Сайн сонголт\nойрхон байна",
  },

  // ======================================================================
  // 2026-09-12: everything below extends this registry PAST the homepage.
  //
  // Until now all 70 slots above were `home-*`: the homepage was fully
  // admin-editable while /shop, /checkout, the product page, the account
  // pages and every <title> stayed hardcoded, so changing the shop hero's
  // headline was a click and changing the /shop headline was a deploy.
  //
  // Same rules as the homepage slots -- fallbackValue is the CURRENT real
  // copy, copied verbatim from the component it came from, and the same
  // exclusions still apply: nothing that doubles as a functional key
  // (category titles, tel: numbers -- those are store_settings now),
  // nothing built around a server-computed number, and no pure UI
  // microcopy (button labels, form validation, toasts, aria-labels).
  // ======================================================================

  // ---- Толгой цэс ба хөл (site-wide) ------------------------------------
  {
    key: "nav-text-shop",
    group: "Толгой цэс ба хөл",
    label: "Цэс: Дэлгүүр",
    description: "Нүүр хуудасны дээд цэсний холбоосын нэр (холбоос нь /shop хэвээр).",
    fallbackValue: "Дэлгүүр",
  },
  {
    key: "nav-text-brands",
    group: "Толгой цэс ба хөл",
    label: "Цэс: Топ брэнд",
    description: "",
    fallbackValue: "Топ брэнд",
  },
  {
    key: "nav-text-membership",
    group: "Толгой цэс ба хөл",
    label: "Цэс: Гишүүнчлэл",
    description: "",
    fallbackValue: "Гишүүнчлэл",
  },
  {
    key: "nav-text-stores",
    group: "Толгой цэс ба хөл",
    label: "Цэс: Салбарууд",
    description: "",
    fallbackValue: "Салбарууд",
  },
  {
    key: "nav-text-journal",
    group: "Толгой цэс ба хөл",
    label: "Цэс: Зөвлөгөө",
    description: "",
    fallbackValue: "Зөвлөгөө",
  },
  {
    key: "footer-text-tagline",
    group: "Толгой цэс ба хөл",
    label: "Хөлийн уриа",
    description: "Логоны доор харагдах нэг мөр.",
    fallbackValue: "Япон чанарыг гэр бүл бүрт.",
  },
  {
    key: "footer-text-column-shop",
    group: "Толгой цэс ба хөл",
    label: "Хөл: \"Дэлгүүр\" баганын гарчиг",
    description: "Доорх жагсаалт нь бодит ангиллууд — тэдгээрийг Бүтээгдэхүүн → Ангилал хэсгээс засварлана.",
    fallbackValue: "Дэлгүүр",
  },
  {
    key: "footer-text-column-branches",
    group: "Толгой цэс ба хөл",
    label: "Хөл: \"Салбарууд\" баганын гарчиг",
    description: "Доорх жагсаалт нь бодит салбарууд — Салбарууд хэсгээс засварлана.",
    fallbackValue: "Салбарууд",
  },
  {
    key: "footer-text-column-legal",
    group: "Толгой цэс ба хөл",
    label: "Хөл: \"Нөхцөл ба бодлого\" баганын гарчиг",
    description: "",
    fallbackValue: "Нөхцөл ба бодлого",
  },
  {
    key: "footer-text-column-contact",
    group: "Толгой цэс ба хөл",
    label: "Хөл: \"Холбоо барих\" баганын гарчиг",
    description: "Утас, имэйлийг Дэлгүүрийн тохиргоо → Холбоо барих хэсгээс засварлана.",
    fallbackValue: "Холбоо барих",
  },
  {
    key: "footer-text-copyright",
    group: "Толгой цэс ба хөл",
    label: "Хөл: зохиогчийн эрхийн мөр",
    description: "",
    fallbackValue: "© 2026 SUGI ASAYAKE Mongolia",
  },
  {
    key: "footer-text-subsidiary",
    group: "Толгой цэс ба хөл",
    label: "Хөл: баруун доод мөр",
    description: "",
    fallbackValue: "Official SUGI Drug Store Japan subsidiary",
  },

  // ---- /shop -------------------------------------------------------------
  {
    key: "shop-text-hero-kicker",
    group: "Дэлгүүр (/shop)",
    label: "Дээд жижиг тэмдэглэгээ",
    description: "",
    fallbackValue: "02 / SUGI MARKET",
  },
  {
    key: "shop-text-hero-heading",
    group: "Дэлгүүр (/shop)",
    label: "Гол гарчиг (2 мөр)",
    description: "Мөр бүрийг шинэ мөрөнд бичнэ үү. Хоёр дахь мөр онцолж харагдана.",
    fallbackValue: "Өдөр тутмын\nсонголтууд.",
  },
  {
    key: "shop-text-hero-description",
    group: "Дэлгүүр (/shop)",
    label: "Гарчгийн доорх тайлбар",
    description: "",
    fallbackValue: "Японоос албан ёсоор нийлүүлсэн арьс арчилгаа, эрүүл мэнд, гэр бүлийн хэрэгцээний бүтээгдэхүүнээ өөртөө тохируулан олоорой.",
  },
  {
    key: "shop-text-hero-signature",
    group: "Дэлгүүр (/shop)",
    label: "Тэмдэглэгээний зурвас",
    description: "Гарчгийн доорх жижиг badge. Хажууд нь харагдах хүргэлтийн үнэ нь Дэлгүүрийн тохиргооноос автоматаар гарна.",
    fallbackValue: "ТАНЫ ӨДӨР БҮРТ / ЯПОН ЧАНАР",
  },
  {
    key: "shop-text-filter-heading",
    group: "Дэлгүүр (/shop)",
    label: "Шүүлтүүрийн гарчиг",
    description: "",
    fallbackValue: "АНГИЛЛААР ШҮҮХ",
  },
  {
    key: "shop-text-filter-subtitle",
    group: "Дэлгүүр (/shop)",
    label: "Шүүлтүүрийн тайлбар",
    description: "",
    fallbackValue: "Таны өдөр тутмын хэрэгцээний хэмнэлээр",
  },
  {
    key: "shop-text-discovery-kicker",
    group: "Дэлгүүр (/shop)",
    label: "Discovery хэсгийн тэмдэглэгээ",
    description: "Каталог хоосон үед харагдах хэсэг.",
    fallbackValue: "SUGI ASAYAKE / DISCOVER",
  },
  {
    key: "shop-text-discovery-heading",
    group: "Дэлгүүр (/shop)",
    label: "Discovery гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Өнөөдрийн хэрэгцээ\nэндээс эхэлнэ.",
  },
  {
    key: "shop-text-discovery-description",
    group: "Дэлгүүр (/shop)",
    label: "Discovery тайлбар",
    description: "",
    fallbackValue: "Онлайн каталогийг бид салбарын бодит нөөцтэй нь уялдуулан шинэчилж байна. Харин та өөрт ойр салбараас дараах ангиллаар шууд асууж болно.",
  },
  {
    key: "shop-text-contact-cta-title",
    group: "Дэлгүүр (/shop)",
    label: "Салбарын CTA гарчиг",
    description: "Салбарын тоо автоматаар бодит тоогоор солигдоно — {N} гэж бичсэн газар орно.",
    fallbackValue: "{N} салбар, нэг өдөр тутмын сонголт.",
  },
  {
    key: "shop-text-contact-cta-subtitle",
    group: "Дэлгүүр (/shop)",
    label: "Салбарын CTA тайлбар",
    description: "",
    fallbackValue: "Таны хайж буй бүтээгдэхүүнийг ойр салбараас асуугаарай.",
  },
  {
    key: "shop-text-recent-kicker",
    group: "Дэлгүүр (/shop)",
    label: "\"Сүүлд үзсэн\" тэмдэглэгээ",
    description: "",
    fallbackValue: "ТАНЫ СҮҮЛД ҮЗСЭН",
  },
  {
    key: "shop-text-recent-heading",
    group: "Дэлгүүр (/shop)",
    label: "\"Сүүлд үзсэн\" гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Буцаад\nхараарай.",
  },
  {
    key: "shop-text-recent-note",
    group: "Дэлгүүр (/shop)",
    label: "\"Сүүлд үзсэн\" тайлбар",
    description: "",
    fallbackValue: "Энэ жагсаалт зөвхөн таны энэ төхөөрөмж дээр хадгалагдана. Нэвтрэх мэдээлэл, захиалга, эсвэл хувийн таних мэдээлэл цуглуулахгүй.",
  },
  {
    key: "shop-text-recommended-kicker",
    group: "Дэлгүүр (/shop)",
    label: "\"Танд зориулан\" тэмдэглэгээ",
    description: "",
    fallbackValue: "ТАНД ЗОРИУЛАН",
  },
  {
    key: "shop-text-recommended-heading",
    group: "Дэлгүүр (/shop)",
    label: "\"Танд зориулан\" гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Танд\nсанал болгож байна.",
  },
  {
    key: "shop-text-recommended-description",
    group: "Дэлгүүр (/shop)",
    label: "\"Танд зориулан\" тайлбар",
    description: "",
    fallbackValue: "Таны профайл дээр хадгалсан арьсны төрөл, арчилгааны сонирхол, интерьер загварт тохирсон бүтээгдэхүүнүүд.",
  },

  // ---- Барааны хуудас ----------------------------------------------------
  {
    key: "pdp-text-routine-kicker",
    group: "Барааны хуудас",
    label: "Routine хэсгийн тэмдэглэгээ",
    description: "Тухайн бараа arчилгааны багцад багтдаг үед л харагдана.",
    fallbackValue: "ROUTINE-ОО ДУУСГА",
  },
  {
    key: "pdp-text-routine-heading",
    group: "Барааны хуудас",
    label: "Routine хэсгийн гарчиг",
    description: "",
    fallbackValue: "Хамт авбал тохирно",
  },
  {
    key: "pdp-text-reviews-heading",
    group: "Барааны хуудас",
    label: "Сэтгэгдлийн хэсгийн гарчиг",
    description: "Сэтгэгдлийн тоо автоматаар хажууд нь нэмэгдэнэ.",
    fallbackValue: "Хэрэглэгчийн сэтгэгдэл",
  },
  {
    key: "pdp-text-reviews-empty",
    group: "Барааны хуудас",
    label: "Сэтгэгдэл байхгүй үеийн текст",
    description: "",
    fallbackValue: "Одоогоор сэтгэгдэл байхгүй байна. Эхний сэтгэгдлийг та үлдээгээрэй!",
  },
  {
    key: "pdp-text-reviews-eligibility",
    group: "Барааны хуудас",
    label: "Сэтгэгдэл бичих эрхгүй үеийн тайлбар",
    description: "Тухайн барааг захиалаагүй хэрэглэгчид харагдана.",
    fallbackValue: "Зөвхөн энэ бүтээгдэхүүнийг захиалсан хэрэглэгч сэтгэгдэл бичих боломжтой.",
  },

  // ---- Захиалга баталгаажуулах (/checkout) -------------------------------
  {
    key: "checkout-text-heading",
    group: "Захиалга баталгаажуулах",
    label: "Гол гарчиг (2 мөр)",
    description: "Хоёр дахь мөр улаанаар онцлогдоно.",
    fallbackValue: "Захиалгаа\nбаталгаажуулах.",
  },
  {
    key: "checkout-text-description",
    group: "Захиалга баталгаажуулах",
    label: "Гарчгийн доорх тайлбар",
    description: "",
    fallbackValue: "Захиалгын мэдээллээ баталгаажуулаад, хүргэлт эсвэл салбарынхаа сонголтыг хий. QPay зөвхөн merchant тохиргоо дууссаны дараа идэвхжинэ.",
  },
  {
    key: "checkout-text-returns-notice",
    group: "Захиалга баталгаажуулах",
    label: "Буцаалтын анхааруулга",
    description: "Захиалга өгөхийн өмнө харуулах бодлогын анхааруулга. Төгсгөлд нь \"Буцаалт, солилцоо\" хуудасны холбоос автоматаар нэмэгдэнэ.",
    fallbackValue: "Нээгдсэн, ашигласан бүтээгдэхүүнийг зөвхөн бодит гэмтэлтэй эсвэл зарласан чанар/шинж чанараа хангаагүй үед л буцаана — таалагдаагүй, санаа өөрчлөгдсөн шалтгаанаар буцаах боломжгүй. Ариун цэврийн лац, савлагаа нээгдсэн эрүүл ахуйн бүтээгдэхүүнийг халдваргүйжлийн шалтгаанаар буцаах, солих боломж хязгаарлагдана.",
  },
  {
    key: "checkout-text-qpay-notice",
    group: "Захиалга баталгаажуулах",
    label: "QPay идэвхгүй үеийн анхааруулга",
    description: "QPay merchant тохиргоо хийгдсэний дараа энэ мөр өөрөө алга болно.",
    fallbackValue: "Merchant credentials орох хүртэл зөвхөн бэлэн мөнгөний захиалга ажиллана. Bank transfer болон картын төлбөр нь тохиргоогүй тул зориуд харагдахгүй байна.",
  },

  // ---- Данс, туслах хуудсууд ---------------------------------------------
  {
    key: "login-text-heading",
    group: "Нэвтрэх, бүртгүүлэх",
    label: "Нэвтрэх гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Дахин\nтавтай морил.",
  },
  {
    key: "login-text-register-heading",
    group: "Нэвтрэх, бүртгүүлэх",
    label: "Бүртгүүлэх гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Бүртгэл\nүүсгэх.",
  },
  {
    key: "login-text-verify-heading",
    group: "Нэвтрэх, бүртгүүлэх",
    label: "Утас баталгаажуулах гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Утасны дугаараа\nбаталгаажуулах.",
  },
  {
    key: "login-text-verify-lede",
    group: "Нэвтрэх, бүртгүүлэх",
    label: "Утас баталгаажуулах тайлбар",
    description: "",
    fallbackValue: "Бүртгэл үүсгэхийн тулд эхлээд утасны дугаараа SMS-ээр баталгаажуулна уу.",
  },
  {
    key: "forgot-text-heading",
    group: "Нэвтрэх, бүртгүүлэх",
    label: "Нууц үг сэргээх гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Нууц үгээ\nсэргээх.",
  },
  {
    key: "forgot-text-lede",
    group: "Нэвтрэх, бүртгүүлэх",
    label: "Нууц үг сэргээх тайлбар",
    description: "",
    fallbackValue: "Бүртгэлтэй утасны дугаараа оруулбал SMS-ээр баталгаажуулна.",
  },
  {
    key: "track-text-heading",
    group: "Захиалга хянах",
    label: "Гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Захиалгаа\nхянах.",
  },
  {
    key: "track-text-lede",
    group: "Захиалга хянах",
    label: "Тайлбар",
    description: "",
    fallbackValue: "Захиалгын дугаар болон захиалахад ашигласан утасны дугаараа оруулна уу.",
  },
  {
    key: "journal-text-heading",
    group: "Зөвлөгөө ба мэдээ",
    label: "Гарчиг (2 мөр)",
    description: "",
    fallbackValue: "Зөвлөгөө ба\nмэдээ.",
  },
  {
    key: "journal-text-lede",
    group: "Зөвлөгөө ба мэдээ",
    label: "Тайлбар",
    description: "",
    fallbackValue: "SUGI ASAYAKE-ийн арчилгаа, гоо сайхан, өдөр тутмын зөвлөгөөнүүд.",
  },
  {
    key: "brands-text-heading",
    group: "Бүх брэнд",
    label: "Гарчиг",
    description: "Брэнд болон бүтээгдэхүүний тоо доор нь автоматаар харагдана.",
    fallbackValue: "Бүх брэнд",
  },
  {
    key: "notfound-text-heading",
    group: "Хуудас олдсонгүй (404)",
    label: "Гарчиг",
    description: "",
    fallbackValue: "Энэ хуудас олдсонгүй.",
  },
  {
    key: "notfound-text-description",
    group: "Хуудас олдсонгүй (404)",
    label: "Тайлбар",
    description: "",
    fallbackValue: "Холбоос буруу байж болзошгүй, эсвэл хуудас зөөгдсөн байна. Нүүр хуудас руу буцаж дахин хайж үзээрэй.",
  },
  {
    key: "profile-text-greeting-kicker",
    group: "Профайл",
    label: "Дээд тэмдэглэгээ",
    description: "",
    fallbackValue: "SUGI ASAYAKE / ТАНЫ ӨДӨР БҮР",
  },
  {
    key: "profile-text-greeting-lede",
    group: "Профайл",
    label: "Мэндчилгээний тайлбар",
    description: "",
    fallbackValue: "Өглөөний туяа шиг гэрэлтээрэй — таны бүх мэдээлэл эндээс нэг дороос харагдана.",
  },
  {
    key: "profile-text-signedout-heading",
    group: "Профайл",
    label: "Нэвтрээгүй үеийн гарчиг",
    description: "",
    fallbackValue: "Профайлаа харахын тулд нэвтэрнэ үү.",
  },
  {
    key: "profile-text-signedout-lede",
    group: "Профайл",
    label: "Нэвтрээгүй үеийн тайлбар",
    description: "",
    fallbackValue: "Хувийн мэдээлэл, зураг, хүслийн жагсаалт болон хүргэлтийн хаягаа энд хадгалж болно.",
  },

  // ---- SEO (хуудасны гарчиг, тайлбар) ------------------------------------
  // These feed <title>/<meta name="description"> per route -- what Google
  // and a Facebook link preview show. Kept as their own group because an
  // owner edits them for search reasons, not for on-page design reasons.
  {
    key: "seo-text-home-title",
    group: "SEO (хайлтын гарчиг)",
    label: "Нүүр хуудас: title",
    description: "Browser-ийн таб болон Google-ийн хайлтын үр дүнд харагдах гарчиг.",
    fallbackValue: "SUGI ASAYAKE Mongolia — Япон чанарыг гэр бүл бүрт",
  },
  {
    key: "seo-text-home-description",
    group: "SEO (хайлтын гарчиг)",
    label: "Нүүр хуудас: тайлбар",
    description: "Салбарын тоо {N} гэж бичсэн газар бодит тоогоор солигдоно.",
    fallbackValue: "SUGI ASAYAKE Mongolia — Японоос баталгаат бүтээгдэхүүнүүдийг албан ёсны эрхтэйгээр хүргэж байна. Улаанбаатар хотод {N} салбартай.",
  },
  {
    // 2026-09-23: баримтын PDF-ийн толгойд хатуу бичигдсэн байсан мөр
    // (PROJECT-GUIDE: "харилцагчид харагдах брэнд/домэйн/утасны утгыг кодод
    // хатуу бичихгүй"). Шинэ эзэн брэндээ /admin-аас сольсон ч баримт бүрт
    // хуучин тайлбар хэвлэгдэх эрсдэлтэй байв.
    key: "invoice-text-tagline",
    group: "Баримт (PDF)",
    label: "Баримтын толгойн мөр",
    description: "Захиалгын баримтын PDF дээр дэлгүүрийн нэрийн доор хэвлэгдэх нэг мөр.",
    fallbackValue: "Японы гоо сайхан, эрүүл мэнд, гэр ахуйн бараа · Улаанбаатар",
  },
  {
    key: "seo-text-shop-title",
    group: "SEO (хайлтын гарчиг)",
    label: "Дэлгүүр: title",
    description: "",
    fallbackValue: "Дэлгүүр — SUGI ASAYAKE",
  },
  {
    key: "seo-text-shop-description",
    group: "SEO (хайлтын гарчиг)",
    label: "Дэлгүүр: тайлбар",
    description: "",
    fallbackValue: "Японоос албан ёсоор нийлүүлсэн арьс арчилгаа, эрүүл мэнд, гэр бүлийн хэрэгцээний 900+ бүтээгдэхүүн.",
  },
  {
    key: "seo-text-journal-title",
    group: "SEO (хайлтын гарчиг)",
    label: "Зөвлөгөө ба мэдээ: title",
    description: "",
    fallbackValue: "Зөвлөгөө ба мэдээ — SUGI ASAYAKE",
  },
  {
    key: "seo-text-brands-title",
    group: "SEO (хайлтын гарчиг)",
    label: "Бүх брэнд: title",
    description: "",
    fallbackValue: "Бүх брэнд — SUGI ASAYAKE",
  },
  {
    key: "seo-text-brands-description",
    group: "SEO (хайлтын гарчиг)",
    label: "Бүх брэнд: тайлбар",
    description: "",
    fallbackValue: "SUGI ASAYAKE-д худалдаалагдаж буй Японы бүх брэндийн жагсаалт.",
  },
  {
    key: "seo-text-checkout-title",
    group: "SEO (хайлтын гарчиг)",
    label: "Захиалга баталгаажуулах: title",
    description: "",
    fallbackValue: "Захиалга баталгаажуулах — SUGI ASAYAKE",
  },
  {
    key: "seo-text-login-title",
    group: "SEO (хайлтын гарчиг)",
    label: "Нэвтрэх: title",
    description: "",
    fallbackValue: "Нэвтрэх — SUGI ASAYAKE",
  },
  {
    key: "seo-text-track-title",
    group: "SEO (хайлтын гарчиг)",
    label: "Захиалга хянах: title",
    description: "",
    fallbackValue: "Захиалга хянах — SUGI ASAYAKE",
  },
  {
    key: "seo-text-profile-title",
    group: "SEO (хайлтын гарчиг)",
    label: "Профайл: title",
    description: "",
    fallbackValue: "Миний профайл — SUGI ASAYAKE",
  },
  {
    key: "seo-text-notfound-title",
    group: "SEO (хайлтын гарчиг)",
    label: "404: title",
    description: "",
    fallbackValue: "Хуудас олдсонгүй — SUGI ASAYAKE",
  },

  // ---- Нийгмийн сүлжээний хуваалцалт ба бүтэцлэгдсэн өгөгдөл --------------
  // 2026-09-12: unlike every slot above, these four are NOT rendered by
  // React -- a crawler or a Facebook/Messenger link preview reads the HTML
  // before any JavaScript runs, so a client-side edit would never reach it.
  // The server substitutes these into client/index.html on the way out (see
  // server/_core/indexHtml.ts), which is why they live here rather than in
  // the static file they end up in.
  // ---- Брэнд (эзэн солих, 2026-10-05) --------------------------------------
  // Толгойн буцах холбоос, хуудасны гарчгийн төгсгөл, ажилтны тэмдэг, admin-ий гарчиг — кодонд
  // "SUGI ASAYAKE" хатуу бичигдсэн 60 орчим газар энэ нэг slot-оос уншина (client/src/lib/brand.ts).
  {
    key: "brand-text-short-name",
    group: "Брэнд",
    label: "Брэндийн богино нэр",
    description: "Толгой хэсэг, хуудасны гарчиг (\"Нэвтрэх — …\"), ажилтны хариултын тэмдэг, admin-ий гарчигт гарна. Сайтыг өөр эзэнд шилжүүлэхэд эхэлж солино.",
    fallbackValue: "SUGI ASAYAKE",
  },
  {
    key: "brand-text-supplier",
    group: "Брэнд",
    label: "Албан ёсны нийлүүлэгч",
    description: "Барааны хуудасны \"Албан ёсны баталгаа\" мөрөнд гарна (бараа хаанаас ирдэг).",
    fallbackValue: "SUGI Drug Store Japan",
  },
  {
    key: "seo-text-site-name",
    group: "SEO (хуваалцах, бүтэцлэгдсэн өгөгдөл)",
    label: "Сайтын нэр",
    description: "Facebook/Twitter дээр хуваалцахад болон Google-ийн бизнесийн карт дээр гарах нэр.",
    fallbackValue: "SUGI ASAYAKE Mongolia",
  },
  {
    key: "seo-text-og-description",
    group: "SEO (хуваалцах, бүтэцлэгдсэн өгөгдөл)",
    label: "Facebook/Messenger-т хуваалцахад гарах тайлбар",
    description: "Холбоосыг чатад эсвэл ханан дээр тавихад зурган доор гарах текст. {N} гэж бичсэн газар салбарын бодит тоогоор солигдоно.",
    fallbackValue: "Японоос баталгаат бүтээгдэхүүнийг албан ёсны эрхтэйгээр Улаанбаатарын {N} салбар болон онлайнаар хүргэж байна.",
  },
  {
    key: "seo-text-twitter-description",
    group: "SEO (хуваалцах, бүтэцлэгдсэн өгөгдөл)",
    label: "Twitter/X-д хуваалцахад гарах тайлбар",
    description: "Ихэвчлэн дээрхээс богино байдаг. {N} гэж бичсэн газар салбарын бодит тоогоор солигдоно.",
    fallbackValue: "Япон чанарыг гэр бүлийн гишүүн бүрт.",
  },
  {
    key: "seo-text-ld-description",
    group: "SEO (хуваалцах, бүтэцлэгдсэн өгөгдөл)",
    label: "Google-ийн бизнесийн картын тайлбар",
    description: "Google-д дэлгүүрийг тодорхойлох бүтэцлэгдсэн өгөгдөл (schema.org Store). {N} гэж бичсэн газар салбарын бодит тоогоор солигдоно.",
    fallbackValue: "Албан ёсны Япон гоо сайхан, эрүүл мэнд, өдөр тутмын хэрэглээний бүтээгдэхүүний дэлгүүр.",
  },

  // ---- Күкийн зөвшөөрлийн банер -----------------------------------------
  // 2026-09-12: same server-substitution path as the SEO block above, for
  // the same reason -- the consent manager (client/public/vendor/silktide-
  // consent-manager.js) is configured in client/index.html and has already
  // drawn the banner before React mounts, so React could not supply this
  // copy even if it wanted to. What it says is a legal-disclosure question
  // an owner should be able to answer without a deploy.
  {
    key: "cookie-text-prompt-description",
    group: "Күкийн банер",
    label: "Банерын гол текст",
    description: "Сайтад анх ороход баруун доод буланд гарч ирэх цонхны тайлбар.",
    fallbackValue: "Күки (cookie) гэдэг нь таны сагс, нэвтэрсэн төлөвийг санах жижиг файл. Та зөвшөөрвөл бид нэмээд сайтад хэдэн хүн орж байгааг нэргүйгээр тоолж, сайтаа сайжруулна. Хувийн мэдээллийг тань хэнд ч өгөхгүй.",
  },
  {
    key: "cookie-text-accept-all",
    group: "Күкийн банер",
    label: "\"Бүгдийг зөвшөөрөх\" товчны текст",
    description: "",
    fallbackValue: "За, зөвшөөрч байна",
  },
  {
    key: "cookie-text-reject",
    group: "Күкийн банер",
    label: "\"Зөвхөн шаардлагатайг\" товчны текст",
    description: "",
    fallbackValue: "Зөвхөн сагс, нэвтрэлтэд хэрэгтэйг нь",
  },
  {
    key: "cookie-text-preferences-button",
    group: "Күкийн банер",
    label: "\"Тохиргоо\" товчны текст",
    description: "",
    fallbackValue: "Дэлгэрэнгүй",
  },
  {
    key: "cookie-text-preferences-title",
    group: "Күкийн банер",
    label: "Тохиргооны цонхны гарчиг",
    description: "",
    fallbackValue: "Күки гэж юу вэ?",
  },
  {
    key: "cookie-text-preferences-description",
    group: "Күкийн банер",
    label: "Тохиргооны цонхны тайлбар",
    description: "",
    fallbackValue: "SUGI ASAYAKE сайт хоёр төрлийн күки хэрэглэдэг. Доороос аль нэгийг нь асааж, унтрааж болно.",
  },
  {
    key: "cookie-text-save",
    group: "Күкийн банер",
    label: "\"Хадгалах\" товчны текст",
    description: "",
    fallbackValue: "Хадгалах",
  },
  {
    key: "cookie-text-essential-label",
    group: "Күкийн банер",
    label: "Заавал шаардлагатай күкийн нэр",
    description: "",
    fallbackValue: "Заавал хэрэгтэй (сагс, нэвтрэлт)",
  },
  {
    key: "cookie-text-essential-description",
    group: "Күкийн банер",
    label: "Заавал шаардлагатай күкийн тайлбар",
    description: "⚠️ Энэ бол хуулийн мэдэгдэл. Сайт бодитоор ямар күки ашигладгийг үнэн зөв тайлбарласан байх ёстой.",
    fallbackValue: "Таны сагсанд хийсэн бараа, нэвтэрсэн төлөвийг санахад хэрэгтэй. Үүнгүйгээр сайт ажиллахгүй тул унтраах боломжгүй.",
  },
  {
    key: "cookie-text-analytics-label",
    group: "Күкийн банер",
    label: "Статистикийн күкийн нэр",
    description: "",
    fallbackValue: "Тоолуур (нэргүй статистик)",
  },
  {
    key: "cookie-text-marketing-label",
    group: "Күкийн банер",
    label: "Маркетингийн күкийн нэр",
    description: "Meta Pixel (Facebook сурталчилгааны хэмжилт) энэ ангилалд багтана — Pixel ID тохируулаагүй бол ангилал харагдсан ч юу ч ачаалагдахгүй.",
    fallbackValue: "Маркетинг (Facebook сурталчилгаа)",
  },
  {
    key: "cookie-text-marketing-description",
    group: "Күкийн банер",
    label: "Маркетингийн күкийн тайлбар",
    description: "⚠️ Энэ бол хуулийн мэдэгдэл — Meta Pixel юу хийдгийг үнэнээр тайлбарлана.",
    fallbackValue: "Facebook-ийн Pixel манай сурталчилгаа хэр үр дүнтэйг хэмжинэ (аль хуудас, сагс, захиалга). Зөвшөөрөхгүй бол Facebook руу юу ч илгээгдэхгүй.",
  },
  {
    key: "cookie-text-analytics-description",
    group: "Күкийн банер",
    label: "Статистикийн күкийн тайлбар",
    description: "⚠️ Энэ бол хуулийн мэдэгдэл. Гуравдагч талын хэрэгсэл нэмвэл энэ текстийг заавал шинэчилнэ.",
    fallbackValue: "Сайтад өдөрт хэдэн хүн орж, аль хуудсыг үзэж байгааг нэргүйгээр тоолно — та хэн болохыг мэдэхгүй. Google, Facebook зэрэг гадны компанид юу ч илгээхгүй.",
  },
] as const;

export type SiteTextSlotKey = (typeof siteTextSlots)[number]["key"];

export const siteTextSlotKeys = siteTextSlots.map(slot => slot.key) as [SiteTextSlotKey, ...SiteTextSlotKey[]];

export const getSiteTextSlot = (key: SiteTextSlotKey) =>
  siteTextSlots.find(slot => slot.key === key)!;
