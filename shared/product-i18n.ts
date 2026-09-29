import type { Locale } from "./i18n";

/**
 * Product descriptions in English and Japanese (2026-09-12, Tom: "937
 * baraanii mongol tailbaruud angli bas yponoor orchuulagdhgui baina").
 *
 * These live in the database, so the UI dictionary cannot reach them. What
 * makes them translatable without a translation service is that they were
 * generated, not written: all 937 published descriptions are built from
 * only 241 distinct sentences, and 170 of those are one template with a
 * product-type word swapped in. Measured on the live catalogue:
 *
 *     937 products · 2,809 sentences · 241 distinct
 *     the template + the seven commonest sentences cover 2,745 of them
 *
 * So a sentence-level dictionary plus one template rule translates 97.7% of
 * all description text. The remaining 64 sentences are one-offs written for
 * a single product each; they stay in Mongolian until someone writes them,
 * and they are left untouched rather than mangled.
 *
 * A product's own brand and name are masked out before lookup and restored
 * afterwards, so "BA-YU нь …" and "Mitea нь …" share one dictionary entry.
 */
/**
 * Both generated shapes. The opening subject is optional: some descriptions
 * name the product first ("BA-YU is a ..."), others start straight at
 * "Japanese retail ...", so the subject is captured when present and the
 * sentence is rebuilt without one when it is absent.
 */
const SUBJECT = "(?:(\\{BRAND}|\\{NAME}) нь )?";
const KNOWN_IN_JAPAN = "Японы жижиглэнгийн худалдаанд өргөн танигдсан (.+?) бөгөөд ";
const TEMPLATE_EVERYDAY = new RegExp(`^${SUBJECT}${KNOWN_IN_JAPAN}өдөр тутмын хэрэглээнд зориулагдсан\\.$`);
const TEMPLATE_INGREDIENT = new RegExp(`^${SUBJECT}${KNOWN_IN_JAPAN}найрлагадаа (.+?) зэргийг агуулсан байдаг\\.$`);

/** What kind of thing the product is, as the template names it. */
const PRODUCT_TYPES: Record<string, { en: string; ja: string }> = {
  "бүтээгдэхүүн": { en: "product", ja: "商品" },
  "тос (крем)": { en: "cream", ja: "クリーム" },
  "шампунь": { en: "shampoo", ja: "シャンプー" },
  "боолт/наалт": { en: "dressing or plaster", ja: "絆創膏・テープ" },
  "арчилгааны treatment": { en: "hair treatment", ja: "トリートメント" },
  "нөхөн сэргээгч (conditioner)": { en: "conditioner", ja: "コンディショナー" },
  "нүүр угаагч": { en: "facial cleanser", ja: "洗顔料" },
  "нүүрний маск": { en: "face mask", ja: "フェイスマスク" },
  "даавуун маск": { en: "sheet mask", ja: "シートマスク" },
  "маск": { en: "mask", ja: "マスク" },
  "сэрум": { en: "serum", ja: "美容液" },
  "эссенц": { en: "essence", ja: "エッセンス" },
  "эмульси": { en: "emulsion", ja: "乳液" },
  "лосьон": { en: "lotion", ja: "化粧水" },
  "тоник": { en: "toner", ja: "トナー" },
  "концентрат": { en: "concentrate", ja: "コンセントレート" },
  "цэвэрлэгч": { en: "cleanser", ja: "クレンジング" },
  "цэвэрлэгээний хөвөн": { en: "cleansing cotton", ja: "クレンジングコットン" },
  "хөвөн": { en: "cotton pad", ja: "コットン" },
  "будаг арчигч": { en: "makeup remover", ja: "メイク落とし" },
  "тослог арчигч цаас": { en: "oil blotting paper", ja: "あぶらとり紙" },
  "норгосон салфетка": { en: "wet wipes", ja: "ウェットシート" },
  "нарнаас хамгаалагч": { en: "sunscreen", ja: "日焼け止め" },
  "биеийн лосьон": { en: "body lotion", ja: "ボディローション" },
  "бие угаагч": { en: "body wash", ja: "ボディソープ" },
  "саван": { en: "soap", ja: "石けん" },
  "гарын саван": { en: "hand soap", ja: "ハンドソープ" },
  "угаалгын бодис": { en: "detergent", ja: "洗剤" },
  "агаар анхилуулагч": { en: "air freshener", ja: "芳香剤" },
  "шүдний оо": { en: "toothpaste", ja: "歯みがき粉" },
  "шүдний сойз": { en: "toothbrush", ja: "歯ブラシ" },
  "аман хөндийн шингэн": { en: "mouthwash", ja: "マウスウォッシュ" },
  "үсний тос": { en: "hair oil", ja: "ヘアオイル" },
  "үсний сүү": { en: "hair milk", ja: "ヘアミルク" },
  "самнуур/сойз": { en: "comb or brush", ja: "くし・ブラシ" },
  "уруулын будаг": { en: "lipstick", ja: "口紅" },
  "уруулын тинт": { en: "lip tint", ja: "リップティント" },
  "хацрын будаг": { en: "blusher", ja: "チーク" },
  "нүдний сүүдэр": { en: "eyeshadow", ja: "アイシャドウ" },
  "нүдний харандаа (eyeliner)": { en: "eyeliner", ja: "アイライナー" },
  "хөмсөгний будаг": { en: "eyebrow colour", ja: "アイブロウ" },
  "сормуустай маскара": { en: "mascara", ja: "マスカラ" },
  "нунтаг будаг": { en: "powder", ja: "パウダー" },
  "concealer (согог далдлагч)": { en: "concealer", ja: "コンシーラー" },
  "хумсны хайч": { en: "nail clippers", ja: "爪切り" },
  "хумхуур": { en: "tweezers", ja: "ピンセット" },
  "хусуур": { en: "razor", ja: "カミソリ" },
  "хоол тэжээлийн нэмэлт": { en: "dietary supplement", ja: "サプリメント" },
  "ундаа": { en: "drink", ja: "ドリンク" },
  "цай": { en: "tea", ja: "お茶" },
  "чихэр": { en: "sweet", ja: "お菓子" },
};

/** Whole sentences, as they appear after masking the brand and name. */
const PRODUCT_SENTENCES: Record<string, { en: string; ja: string }> = {
  "Японоос албан ёсоор нийлүүлсэн бодит бүтээгдэхүүн.": {
    en: "A genuine product, officially supplied from Japan.",
    ja: "日本から正規に仕入れた本物の商品です。",
  },
  "Арьсыг чийгшүүлж, зөөлөн, тод харагдуулахад тусална.": {
    en: "Helps keep skin hydrated, soft and clear.",
    ja: "肌にうるおいを与え、やわらかく明るく見せるのを助けます。",
  },
  "Өдөр тутмын эрүүл ахуй, гэр орны цэвэрлэгээнд зориулагдсан.": {
    en: "Made for everyday hygiene and cleaning around the home.",
    ja: "毎日の衛生管理や家庭のお掃除向けです。",
  },
  "Үсний ширхэг/арьсыг зөөлөн цэвэрлэж, чийгшүүлэхэд тусална.": {
    en: "Cleanses hair and scalp gently and helps keep them hydrated.",
    ja: "髪と頭皮をやさしく洗い、うるおいを保つのを助けます。",
  },
  "Гоо сайхны өдөр тутмын арчилгаа, гоёл чимэглэлд ашиглагдана.": {
    en: "For everyday beauty routines and make-up.",
    ja: "毎日のビューティーケアやメイクにお使いいただけます。",
  },
  "Амьдралын хэв маягаа хянах, эрүүл мэндээ дэмжих хэрэглэгчдэд тохиромжтой.": {
    en: "Suited to anyone looking after their lifestyle and wellbeing.",
    ja: "生活習慣を整え、健康を支えたい方に向いています。",
  },
  "Хүүхэд, нярайн мэдрэг арьс/эрүүл мэндэд тохирсон зөөлөн найрлагатай.": {
    en: "A gentle formulation suited to the delicate skin of babies and children.",
    ja: "赤ちゃんやお子様のデリケートな肌に合うやさしい処方です。",
  },
  "Этанолгүй, өдөр бүр хэрэглэхэд зориулагдсан.": {
    en: "Alcohol-free and made for daily use.",
    ja: "エタノールフリーで、毎日お使いいただけます。",
  },
  "Нүүр болон биед хоёуланд нь хэрэглэж болно.": {
    en: "Can be used on both the face and the body.",
    ja: "顔にも体にもお使いいただけます。",
  },
  "Өдөр бүр 2 удаа хэрэглэхийг зөвлөж байна.": {
    en: "Twice a day is recommended.",
    ja: "1日2回のご使用をおすすめします。",
  },
  "Газрын тос гаралтай гадаргуугийн идэвхт бодис агуулаагүй.": {
    en: "Contains no petroleum-derived surfactants.",
    ja: "石油由来の界面活性剤は使用していません。",
  },
  "Нөхөх (refill) сав тул одоо байгаа дозаторт дахин цэнэглэж хэрэглэнэ.": {
    en: "A refill pack, for topping up a dispenser you already have.",
    ja: "詰め替え用です。お手持ちのディスペンサーに補充してお使いください。",
  },
  "Үнэргүй, будаггүй, хүүхдийн мэдрэг арьсанд тохирсон pH-тэй.": {
    en: "Fragrance-free, dye-free and pH-balanced for children's sensitive skin.",
    ja: "無香料・無着色で、お子様の敏感な肌に合わせたpHです。",
  },

  // -- one-offs, each written for a single product -------------------------
  "{BRAND} морины тостой шампунь нь Японы Kumano Yushi компанийн бүтээгдэхүүн бөгөөд силикон агуулаагүй (non-silicone) томъёолол хэрэглэсэн.": {
    en: "{BRAND} horse oil shampoo is made by the Japanese company Kumano Yushi and uses a silicone-free (non-silicone) formulation.",
    ja: "{BRAND}の馬油シャンプーは日本の熊野油脂の製品で、ノンシリコン処方を採用しています。",
  },
  "Морины тос нь хүний арьсны тос (sebum)-той хамгийн ойролцоо найрлагатай тул үсний ширхэгт гүн нэвтэрч, гэмтсэн үсийг зөөлрүүлнэ.": {
    en: "Horse oil is the closest of any oil to human sebum, so it works deep into the hair shaft and softens damaged hair.",
    ja: "馬油は人の皮脂に最も近い組成のため、髪の内部まで浸透し、傷んだ髪をやわらかく整えます。",
  },
  "Камелийн тос нэмэлтээр чийгшүүлж, тэжээллэг байдлаар хангадаг.": {
    en: "Camellia oil adds further moisture and nourishment.",
    ja: "さらに椿油がうるおいと栄養を与えます。",
  },
  "Сул хүчиллэг найрлага нь арьс, үсний рН-тэй тохирдог тул мэдрэг толгойн арьсанд ч зөөлөн үйлчилнэ.": {
    en: "Its mildly acidic formulation matches the pH of skin and hair, so it stays gentle even on a sensitive scalp.",
    ja: "弱酸性の処方は肌と髪のpHに合うため、敏感な頭皮にもやさしく働きます。",
  },
  "600мл сав, өдөр тутмын хэрэглээнд тохиромжтой.": {
    en: "A 600 ml bottle, suited to everyday use.",
    ja: "600mlボトルで、毎日の使用に向いています。",
  },
  "Moist {BRAND} Damage Repair Shampoo нь Nano Matrix болон Nano EL технологи ашигласан бөгөөд амин хүчлийн кератин нь гэмтсэн, цайруулсан үсний гадаргууг дотроос нөхөн сэргээдэг.": {
    en: "Moist {BRAND} Damage Repair Shampoo uses Nano Matrix and Nano EL technology, and its amino-acid keratin repairs damaged, bleached hair from within.",
    ja: "Moist {BRAND} Damage Repair ShampooはNano MatrixとNano ELの技術を採用し、アミノ酸ケラチンがダメージやブリーチで傷んだ髪を内側から補修します。",
  },
  "Органик аргана тос, сапоте тос нь гүнзгий тэжээлт, гялбаа өгч, чөлөөт радикалаас хамгаална.": {
    en: "Organic argan and sapote oils nourish deeply, add shine and protect against free radicals.",
    ja: "オーガニックのアルガンオイルとサポテオイルが深く栄養を与え、ツヤを出し、活性酸素から守ります。",
  },
  "Кактус болон манго тос үсний гадаргууг тэгшилнэ.": {
    en: "Cactus and mango oils smooth the surface of the hair.",
    ja: "カクタスオイルとマンゴーオイルが髪の表面を整えます。",
  },
  "Сульфат болон силиконгүй томъёолол нь халаалтын хэрэгслийн гэмтэл, будгийн бүдгэрэлтээс хамгаалж, үсийг зөөлөн, бат бөх, харагдахад эрүүл болгоно.": {
    en: "The sulphate- and silicone-free formulation protects against heat damage and colour fade, leaving hair soft, strong and healthy-looking.",
    ja: "サルフェート・シリコンフリー処方が熱によるダメージや色落ちから守り、髪をやわらかく、強く、健康的に見せます。",
  },
  "Сахарын нишингээс гаргаж авсан 100% скваланы тос нь хүний арьсны байгалийн тостой (sebum) маш ойролцоо бүтэцтэй тул амархан шингэж, наалддаггүй, өөх тосны гялбаа үлдээдэггүй.": {
    en: "Drawn from sugar cane, this 100% squalane oil is very close in structure to the skin's own sebum, so it absorbs easily without feeling sticky or leaving a greasy shine.",
    ja: "サトウキビ由来の100%スクワランオイルは、人の皮脂に非常に近い構造のため、べたつかず、油っぽいテカリも残さずになじみます。",
  },
  "Нүүр, бие, үс, хумсанд ч ашиглаж болох олон талт тос бөгөөд хуурай, мэдрэг арьсыг зөөлрүүлж, чийгийг удаан хугацаагаар барина.": {
    en: "A versatile oil for the face, body, hair and even nails, it softens dry, sensitive skin and holds moisture for a long time.",
    ja: "顔・体・髪・爪にも使える多用途オイルで、乾燥した敏感な肌をやわらげ、うるおいを長く保ちます。",
  },
  "Энэхүү өдөр тутмын нүүрний маск нь Никотинамид Мононуклеотид (NMN), усанд уусдаг коллаген болон Vitamin E (токоферол) гэсэн 3 гол чийгшүүлэгч найрлагатай.": {
    en: "This daily face mask carries three key moisturising ingredients: nicotinamide mononucleotide (NMN), water-soluble collagen and vitamin E (tocopherol).",
    ja: "この毎日使えるフェイスマスクは、ニコチンアミドモノヌクレオチド（NMN）、水溶性コラーゲン、ビタミンE（トコフェロール）という3つの主要な保湿成分を配合しています。",
  },
  "Нүүрээ угааж, чийгийг сайтар арчсаны дараа маскаа нүдний хэсгээс эхлэн тэгш байрлуулж, 10 минутын дараа авна.": {
    en: "After washing and drying the face, place the mask evenly, starting at the eye area, and remove it after 10 minutes.",
    ja: "洗顔後、水分をよく拭き取ってから、目もとを起点にマスクを均一にのせ、10分後にはがします。",
  },
  "Үлдсэн эссенцийг арьсандаа зөөлөн шингээнэ.": {
    en: "Pat any remaining essence gently into the skin.",
    ja: "残った美容液は肌にやさしくなじませてください。",
  },
  "30ш савласан, сарын турш өдөр бүр хэрэглэх боломжтой.": {
    en: "A pack of 30, enough to use daily for a month.",
    ja: "30枚入りで、1か月間毎日お使いいただけます。",
  },
  "{BRAND} Collagen Drink нь Daido Pharmaceutical компанийн үйлдвэрлэсэн, личи амттай гоо сайхны ундаа бөгөөд лонх тутамд 2000мг загасны коллаген пептид, глицин, пролин, аланин, гиалуроны хүчил, ханиа сүү, мака ханд зэргийг агуулна.": {
    en: "{BRAND} Collagen Drink is a lychee-flavoured beauty drink made by Daido Pharmaceutical, with 2,000 mg of fish collagen peptide per bottle plus glycine, proline, alanine, hyaluronic acid, royal jelly and maca extract.",
    ja: "{BRAND} Collagen Drinkは大同薬品工業が製造するライチ風味の美容ドリンクで、1本あたり魚由来コラーゲンペプチド2000mgに加え、グリシン、プロリン、アラニン、ヒアルロン酸、ローヤルゼリー、マカエキスなどを配合しています。",
  },
  "Унтахын өмнө 50мл-ийг уухыг зөвлөдөг бөгөөд арьсны чийг, уян хатан чанар, тэвчих чанарыг дэмжинэ.": {
    en: "50 ml before bed is recommended; it supports the skin's moisture, elasticity and resilience.",
    ja: "就寝前に50mlを飲むことをおすすめします。肌のうるおい、弾力、健やかさを支えます。",
  },
  "Smile Honey Toothpaste ({BRAND}) нь байгалийн ургамлын хандлага, идэвхт найрлагаар клиникийн туршилтаар батлагдсан, буйлны өвчин болон насжилттай холбоотой шүдний цоорлыг сэргийлэхэд туслах шүдний оо юм.": {
    en: "Smile Honey Toothpaste ({BRAND}) is a clinically tested toothpaste whose botanical extracts and active ingredients help guard against gum disease and age-related decay.",
    ja: "Smile Honey Toothpaste（{BRAND}）は、植物エキスと有効成分を配合し臨床試験で確かめられた歯みがき粉で、歯周病や加齢にともなう虫歯の予防を助けます。",
  },
  "Чацаргана-мент амттай, 120гр гуулин цүнхэнд савласан.": {
    en: "Sea-buckthorn and mint flavoured, in a 120 g tube.",
    ja: "シーバックソーン＆ミント風味、120gチューブ入りです。",
  },
  "{BRAND}-ийн энэхүү шүдний сойз нь 'ууланцар' хэлбэрээр тайрсан үстэй тул шүдний завсар, буйлны шугамд илүү сайн хүрч, хоол хүнсний үлдэгдлийг үр дүнтэй зайлуулдаг.": {
    en: "This {BRAND} toothbrush has peaked, mountain-cut bristles that reach between the teeth and along the gum line, clearing food debris effectively.",
    ja: "この{BRAND}の歯ブラシは山型にカットされた毛先で、歯間や歯ぐきのきわまで届き、食べかすを効率よく落とします。",
  },
  "Дунд зэргийн зөөлөн (Normal) үстэй, өдөр тутмын хэрэглээнд тохиромжтой Японы стандарт шүдний сойз.": {
    en: "A standard Japanese toothbrush with medium (normal) bristles, suited to everyday use.",
    ja: "ふつう（ノーマル）の毛のかたさで、毎日の使用に向いた日本の標準的な歯ブラシです。",
  },
  "{BRAND}-ийн эмчилгээний (medicated) шингэн гарын саван нь бактерийн эсрэг идэвхт найрлагатай бөгөөд гарын арьсыг өдөр бүрийн хэрэглээнд зориулж зөөлөн, хатаахгүйгээр цэвэрлэнэ.": {
    en: "{BRAND}'s medicated liquid hand soap contains an antibacterial active and cleans the hands gently, without drying them, for daily use.",
    ja: "{BRAND}の薬用ハンドソープは殺菌成分を配合し、毎日の手洗いで手肌を乾燥させずにやさしく洗い上げます。",
  },
  "{BRAND} брэндийн энэхүү хүүхдийн тос нь керамид, коллаген, гиалуроны хүчил, Lipidure зэрэг чийгшүүлэгч найрлагаар баялаг бөгөөд хуурайшилтаас үүдэлтэй арьсны бүдүүрлээс сэргийлж, зөөлөн, чийгтэй байлгана.": {
    en: "This {BRAND} children's cream is rich in moisturising ingredients such as ceramides, collagen, hyaluronic acid and Lipidure, keeping skin soft and hydrated and preventing the roughness that dryness brings.",
    ja: "この{BRAND}のこども用クリームは、セラミド、コラーゲン、ヒアルロン酸、リピジュアなどの保湿成分を豊富に配合し、乾燥による肌あれを防いで、やわらかでうるおいのある状態を保ちます。",
  },
  "{BRAND} Body Wash нь Франц маягийн уламжлалт 'хүйтэн шахах' аргаар удаан хугацаанд бага температурт хийгддэг тул арьсанд ашигтай витаминууд хадгалагддаг онцлогтой.": {
    en: "{BRAND} Body Wash is made the traditional French way, cold-pressed slowly at a low temperature, so the vitamins that benefit the skin are preserved.",
    ja: "{BRAND} Body Washは、フランス伝統の「コールドプレス」製法で低温にじっくり作られるため、肌にうれしいビタミンが保たれます。",
  },
  "Saponaria (угаалгын ургамал) болон 12 төрлийн байгалийн ургамлын хандтай, рН тэнцвэржүүлсэн найрлага нь бохирдлыг зөөлөн зайлуулж, арьсны байгалийн хамгаалалтын мембраныг гэмтээхгүй.": {
    en: "With saponaria (soapwort) and extracts of twelve botanicals, the pH-balanced formulation lifts dirt away gently without harming the skin's natural protective barrier.",
    ja: "サポナリア（サボンソウ）と12種の植物エキスを配合したpHバランス処方が、肌本来のバリア膜を傷めずに汚れをやさしく落とします。",
  },
  "Floral Herb анхилуун үнэртэй, 460мл сав.": {
    en: "A floral-herb fragrance, in a 460 ml bottle.",
    ja: "フローラルハーブの香り、460mlボトルです。",
  },
  "{BRAND} Moist Hot Cleansing нь гарт наалдахад биеийн дулаанаас шалтгаалан аажмаар халж, будаг болон нүүрний хамтаргыг зөөлнөөр уусгадаг 'thermo' төрлийн цэвэрлэгч юм.": {
    en: "{BRAND} Moist Hot Cleansing is a thermo cleanser: it warms gradually with the heat of your hands and dissolves make-up and the sebum in pores gently.",
    ja: "{BRAND} Moist Hot Cleansingは、手にとると体温でじんわり温まり、メイクや毛穴の皮脂をやさしく浮かせて落とすホットクレンジングです。",
  },
  "Халуун мэдрэмж нь арьсны нүхийг өргөсгөж, гүнзгий бохирдлыг илүү үр дүнтэй зайлуулахад тусалдаг бол цэвэрлэгээний дараа арьсыг чийгтэй, зөөлөн үлдээнэ.": {
    en: "The warmth opens the pores so that deeper grime comes away more easily, and the skin is left hydrated and soft afterwards.",
    ja: "温感が毛穴を開き、奥の汚れを落としやすくしながら、洗い上がりの肌はうるおってやわらかに保たれます。",
  },
  "{BRAND} Rice Face Mask нь Японы будааны ханд агуулсан эссенцээр норгосон зузаан даавуун маск бөгөөд хуурай, барзгар арьсыг чийгшүүлж зөөлрүүлдэг.": {
    en: "{BRAND} Rice Face Mask is a thick sheet mask soaked in an essence of Japanese rice extract, which hydrates and softens dry, rough skin.",
    ja: "{BRAND} Rice Face Maskは、日本のコメエキスを含む美容液をたっぷり含ませた厚手のシートマスクで、乾燥してごわついた肌をうるおしてやわらげます。",
  },
  "Нүүрэндээ 10-15 минут байлгаад авахад тохиромжтой, 10ширхэгийн багц.": {
    en: "Leave it on the face for 10 to 15 minutes, then remove it; a pack of 10.",
    ja: "顔に10〜15分のせてからはがします。10枚入りです。",
  },
  "{BRAND} Organic Facial Soap нь сарнай, гүгэл (frankincense), юзу, мирр зэрэг найрлагыг тэнцвэртэй хольсон, Японы Кочи мужийн органик юзугаар анхилсан 100гр нүүрний саван юм.": {
    en: "{BRAND} Organic Facial Soap is a 100 g facial soap balancing rose, frankincense, yuzu and myrrh, scented with organic yuzu from Kochi in Japan.",
    ja: "{BRAND} Organic Facial Soapは、ローズ、フランキンセンス、ゆず、ミルラをバランスよく配合し、高知県産のオーガニックゆずが香る100gの洗顔石けんです。",
  },
  "Парабен, хиймэл үнэрт бодис, хэт ягаан туяа шингээгч, хүнд металлын будаг, эрдэс тос агуулаагүй.": {
    en: "Free from parabens, artificial fragrance, UV absorbers, heavy-metal dyes and mineral oil.",
    ja: "パラベン、合成香料、紫外線吸収剤、重金属を含む着色料、鉱物油は使用していません。",
  },
  "Будаг арчих болон нүүр угаах хоёуланд нь хэрэглэж болох бөгөөд арьсны чийгийг хадгалж, зөөлөн, тод харагдуулна.": {
    en: "It works both as a make-up remover and as a face wash, holding in moisture and leaving skin soft and clear.",
    ja: "メイク落としとしても洗顔料としても使え、肌のうるおいを守りながら、やわらかく明るく見せます。",
  },
  "{BRAND} Suppin Powder нь маш нарийн ширхэгт бүтэцтэй тул арьстай шууд нэгдэж, нунтаг бодисын мэдрэмжийг үлдээхгүйгээр нүх, согогийг далдлана.": {
    en: "{BRAND} Suppin Powder is milled so finely that it melts into the skin, covering pores and blemishes without leaving a powdery feel.",
    ja: "{BRAND} Suppin Powderは非常に細かい粒子で肌にすっとなじみ、粉っぽさを残さずに毛穴や色ムラをカバーします。",
  },
  "Найрлага дахь арчилгааны идэвхт бодисууд арьсны чийгийг 24 цагийн турш хамгаалж, тамхины утаа, тоос шороо зэрэг гадны нөлөөллөөс хамгаална.": {
    en: "The skincare actives in it hold the skin's moisture for 24 hours and shield it from cigarette smoke, dust and other outside irritants.",
    ja: "配合されたスキンケア成分が肌のうるおいを24時間守り、たばこの煙やほこりなどの外的刺激からも肌を守ります。",
  },
  "Хунтайж/сарнайн үнэртэй хувилбартай, шөнийн цагаар зүүсэн ч зохистой гэж тооцогддог 'skincare-makeup' төрлийн будаг.": {
    en: "A skincare-makeup hybrid, offered in a rose scent and considered gentle enough to keep on overnight.",
    ja: "ローズの香りのバリエーションがあり、夜つけたままでもよいとされるスキンケアメイクタイプです。",
  },
  "Энэхүү гэрийн хэрэглээний гоо заслын багаж нь IPL (Intense Pulsed Light) флаш технологи ашигладаг бөгөөд олон удаагийн flash-тай, эрчим хүчний түвшин тохируулах боломжтой.": {
    en: "This at-home beauty device uses IPL (intense pulsed light) flash technology, with many flashes and adjustable energy levels.",
    ja: "この家庭用美容機器はIPL（インテンス・パルス・ライト）のフラッシュ技術を使用し、多数の照射回数と調整可能な出力レベルを備えています。",
  },
  "Нүүр, гар, хөл зэрэг биеийн олон хэсэгт хэрэглэх боломжтой.": {
    en: "It can be used on many parts of the body, including the face, the arms and the legs.",
    ja: "顔、腕、脚など体の広い範囲にお使いいただけます。",
  },
  "{BRAND} Room Air Freshener нь дээд зэргийн үнэртэй сүрчиг шингэсэн, сарнай, muguet, жасмин зэрэг цэцгийн дунд ноот, мод, мошус, кедр суурь ноот бүхий олон давхаргат үнэртэй.": {
    en: "{BRAND} Room Air Freshener carries a fine perfume oil: a layered scent with rose, muguet and jasmine at the heart over base notes of wood, musk and cedar.",
    ja: "{BRAND} Room Air Freshenerは上質な香料を用い、ローズ、ミュゲ、ジャスミンのミドルノートに、ウッド、ムスク、シダーのベースノートを重ねた多層的な香りです。",
  },
  "Таг нээж, хөвөн шингээгчийг эргүүлж, өрөөнд байрлуулахад л хангалттай.": {
    en: "Simply open the lid, turn the wick over and set it down in the room.",
    ja: "ふたを開け、吸い上げ用のスティックを裏返して部屋に置くだけです。",
  },
  "Меламин хөвөн нь ямар ч угаалгын нунтаггүйгээр, зөвхөн ус ашиглан цайны толбо, эрдэс усны толбо зэргийг үр дүнтэй арилгадаг.": {
    en: "Melamine foam lifts tea stains and limescale marks effectively with water alone, without any detergent.",
    ja: "メラミンスポンジは洗剤を使わず、水だけで茶しぶや水垢などをしっかり落とします。",
  },
  "Гялгар гадаргуу, машины гадна тал, хиймэл гантиг дээр хэрэглэхийг зөвлөдөггүй.": {
    en: "Not recommended on glossy surfaces, car exteriors or artificial marble.",
    ja: "光沢のある面、車の外装、人工大理石へのご使用はおすすめできません。",
  },
  "30ширхэгийн багц.": {
    en: "A pack of 30.",
    ja: "30個入りです。",
  },
  "{BRAND} (OR) Spa Shampoo Deep Cleanse нь Изумо, Юбара, Альпсын бүсийн рашаан усны хандыг хослуулсан, силикон болон сульфатгүй томъёолол ашигласан.": {
    en: "{BRAND} (OR) Spa Shampoo Deep Cleanse combines hot-spring water extracts from Izumo, Yubara and the Japanese Alps in a silicone- and sulphate-free formulation.",
    ja: "{BRAND}（OR）Spa Shampoo Deep Cleanseは、出雲・湯原・アルプス地方の温泉水エキスを組み合わせ、シリコン・サルフェートフリーの処方を採用しています。",
  },
  "Давхар цайр коллоид найрлага нь илүүдэл тосны ялгаралтыг бууруулж, толгойн арьсны үнэр, загатнааг сэргийлнэ.": {
    en: "A double zinc colloid formulation reduces excess oil and helps prevent scalp odour and itching.",
    ja: "ダブルの亜鉛コロイド成分が余分な皮脂を抑え、頭皮のにおいやかゆみを防ぎます。",
  },
  "Планктон хандлага, пироктон оламин, сакэ шаварын хандлага, цайны навчны хандлага, эвкалипт тосны хамт толгойн арьсны орчинг сайжруулна.": {
    en: "Plankton extract, piroctone olamine, sake lees extract, tea leaf extract and eucalyptus oil together improve the condition of the scalp.",
    ja: "プランクトンエキス、ピロクトンオラミン、酒粕エキス、茶葉エキス、ユーカリオイルが頭皮環境を整えます。",
  },
  "{BRAND} Emulsion нь Sugi Pharmacy групп болон Кюсу их сургуулийн хамтарсан судалгаагаар бүтээгдсэн, Naris Cosmetics компанийн үйлдвэрлэсэн эмульси юм.": {
    en: "{BRAND} Emulsion came out of joint research between the Sugi Pharmacy group and Kyushu University, and is manufactured by Naris Cosmetics.",
    ja: "{BRAND} Emulsionは、スギ薬局グループと九州大学の共同研究から生まれ、ナリス化粧品が製造する乳液です。",
  },
  "SNDP технологи бүхий 4 гоо сайхны чийгшүүлэгч найрлага (гидролизсэн гиалуроны хүчил, Vitamin C деривератив, Vitamin E деривератив, усанд уусдаг протеогликан) арьсны эвэрлэг давхаргад гүнзгий нэвтэрч, чийгийг барьж, зөөлөн, уян хатан, гэрэлтэй арьс бий болгоно.": {
    en: "Four moisturising actives carried by SNDP technology, hydrolysed hyaluronic acid, a vitamin C derivative, a vitamin E derivative and water-soluble proteoglycan, reach deep into the stratum corneum, hold moisture there and leave skin soft, supple and luminous.",
    ja: "SNDP技術による4つの保湿美容成分（加水分解ヒアルロン酸、ビタミンC誘導体、ビタミンE誘導体、水溶性プロテオグリカン）が角質層の奥まで浸透してうるおいを抱え込み、やわらかく弾力のある、透明感のある肌へ導きます。",
  },
  "Ялангуяа хуурайшилтаас үүдэлтэй уйтгар өнгөтэй арьсанд зориулагдсан.": {
    en: "It is made above all for skin that looks dull from dryness.",
    ja: "とくに乾燥による肌のくすみが気になる方に向けた商品です。",
  },
  "Өнгөлөг будаг, эрдэс тос агуулаагүй найрлагатай тул мэдрэмтгий арьсанд ч зохистой — хэрэглэгчдийн бодит сэтгэгдэлд арьс цочроогүй гэж тэмдэглэгдсэн.": {
    en: "Free of colourants and mineral oil, it suits sensitive skin too, and customers' own reviews note that it did not irritate.",
    ja: "着色料・鉱物油を使用していないため敏感肌にも向いており、実際の口コミでも肌への刺激がなかったと書かれています。",
  },
  "Kuro {BRAND} нь пуэр цай болон 18 төрлийн сонгомол ургамал, навчны (голден кэндл, арвай, гарциниа, гуава навч, банаба навч, улаан вандуй гэх мэт) хослолоор хийгдсэн, амьдралын хэв маягаа хянах хэрэглэгчдэд зориулсан цайны бренд юм.": {
    en: "Kuro {BRAND} is a tea blending pu-erh with eighteen selected plants and leaves, among them golden candle, barley, garcinia, guava leaf, banaba leaf and red bean, made for people keeping an eye on their lifestyle.",
    ja: "Kuro {BRAND}は、プーアル茶に厳選した18種の植物・茶葉（ゴールデンキャンドル、大麦、ガルシニア、グアバ葉、バナバ葉、小豆など）を合わせた、生活習慣を意識する方に向けたお茶です。",
  },
  "Нэг уутанцрыг том аяга буюу цайдандаа хийж, 250мл буцалсан усаар 3 минут норгож уухыг зөвлөнө.": {
    en: "Put one bag in a large cup or a teapot, steep it in 250 ml of boiling water for three minutes and drink.",
    ja: "ティーバッグ1包を大きめのカップかポットに入れ、熱湯250mlで3分蒸らしてお飲みください。",
  },
  "{BRAND} 100% Морины тос нь цэвэр морины өөхнөөс гарган авсан, үнэр, будаг, эрдэс тос болон бусад нэмэлт бодис ороогүй байгалийн цэвэр тос юм.": {
    en: "{BRAND} 100% Horse Oil is drawn from pure horse fat, a natural oil with no fragrance, colourant, mineral oil or other additives.",
    ja: "{BRAND} 100%馬油は、純粋な馬の脂から採った、香料・着色料・鉱物油などの添加物を一切含まない天然のオイルです。",
  },
  "Биеийн дулаанд гэсэж, арьсанд амархан шимэгддэг тул нүүр, үс, биед өргөн хэрэглэгддэг.": {
    en: "It melts at body temperature and absorbs easily, so it is widely used on the face, the hair and the body.",
    ja: "体温でとけて肌になじみやすいため、顔、髪、体と幅広く使われています。",
  },
  "Хэрэглэгчдийн бодит сэтгэгдэлд ялангуяа хуурай арьсанд тустай гэж дурдагдсан.": {
    en: "Customers' own reviews mention it as especially helpful for dry skin.",
    ja: "実際の口コミでは、とくに乾燥肌に良いと書かれています。",
  },
  "{BRAND} Плацентын ханд 100% нь гахайн гаралтай, нано хэмжээст болгосон плацентын ханд өндөр агуулгатай гоо сайхны серум юм.": {
    en: "{BRAND} 100% Placenta Extract is a beauty serum with a high concentration of nano-sized, pig-derived placenta extract.",
    ja: "{BRAND}プラセンタエキス100%は、豚由来のプラセンタエキスをナノ化して高濃度に配合した美容液です。",
  },
  "Хуурайшсан, уйтгар арьсыг эрчимтэй арчилж, гэрэлтүүлэг, уян хатан чанарыг сэргээдэг.": {
    en: "It cares intensively for dry, dull skin and brings back brightness and elasticity.",
    ja: "乾燥してくすんだ肌を集中的にケアし、明るさと弾力を取り戻します。",
  },
  "Нэмэлт бодис ороогүй найрлагатай тул тогтворгүй, мэдрэмтгий арьсанд ч хэрэглэхэд тохиромжтой.": {
    en: "Being additive-free, it suits unsettled, sensitive skin too.",
    ja: "無添加処方のため、ゆらぎやすい敏感な肌にもお使いいただけます。",
  },
};

/** The ingredient words the second shape names, singly or comma-separated. */
const INGREDIENTS: Record<string, { en: string; ja: string }> = {
  "CICA (Centella Asiatica)": { en: "CICA (Centella Asiatica)", ja: "CICA（ツボクサ）" },
  "Vitamin C": { en: "vitamin C", ja: "ビタミンC" },
  "будааны ханд": { en: "rice extract", ja: "コメエキス" },
  "гиалуроны хүчил": { en: "hyaluronic acid", ja: "ヒアルロン酸" },
  "гэрэлтүүлэх": { en: "brightening agents", ja: "ブライトニング成分" },
  "зөгийн бал": { en: "honey", ja: "はちみつ" },
  "керамид": { en: "ceramides", ja: "セラミド" },
  "коллаген": { en: "collagen", ja: "コラーゲン" },
  "мойлхуйн ханд": { en: "bird cherry extract", ja: "エゾノウワミズザクラエキス" },
  "морины тос": { en: "horse oil", ja: "馬油" },
  "ниацинамид": { en: "niacinamide", ja: "ナイアシンアミド" },
  "органик": { en: "organic ingredients", ja: "オーガニック成分" },
  "плацентын ханд": { en: "placenta extract", ja: "プラセンタエキス" },
  "ретинол": { en: "retinol", ja: "レチノール" },
  "силикон агуулаагүй": { en: "a silicone-free formulation", ja: "シリコンフリー処方" },
  "скваланы тос": { en: "squalane oil", ja: "スクワランオイル" },
  "хатомуги (Job's tears) ханд": { en: "hatomugi (Job's tears) extract", ja: "ハトムギエキス" },
  "хэт ягаан туяанаас хамгаалах SPF": { en: "SPF protection from UV light", ja: "紫外線を防ぐSPF" },
  "чийгшүүлэгч": { en: "moisturising agents", ja: "保湿成分" },
};

/**
 * "зөгийн бал, чийгшүүлэгч" is translated item by item. A masked brand
 * standing in for an ingredient (a brand literally called CICA, say) passes
 * through untouched and is restored later; anything else unknown fails the
 * whole sentence, which is then left in Mongolian rather than half-turned.
 */
const translateIngredients = (raw: string, locale: Exclude<Locale, "mn">): string | null => {
  const parts = raw.split(",").map(part => part.trim()).filter(Boolean);
  const mapped = parts.map(part => (part.startsWith("{") ? part : INGREDIENTS[part]?.[locale] ?? null));
  if (mapped.some(part => part === null)) return null;
  return mapped.join(locale === "ja" ? "、" : ", ");
};

/** A sentence that lost its subject still starts with a capital letter. */
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "a serum" but "an essence" -- the type words are plain enough for this. */
const withArticle = (noun: string) => `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;

const SENTENCE_SPLIT = /(?<=\.)\s+/;

/**
 * Translate a product description (or any catalogue prose) sentence by
 * sentence. Anything the dictionary does not know is returned untouched.
 */
export function translateProductText(
  text: string | null | undefined,
  locale: Locale,
  product?: { brand?: string | null; name?: string | null },
): string {
  if (!text || locale === "mn") return text ?? "";
  const brand = product?.brand?.trim();
  const name = product?.name?.trim();
  let masked = text;
  // 2026-09-27: mask the LONGER string first. A product name that starts
  // with its own brand ("Diane" / "Diane Botanical Shampoo") used to have
  // the brand masked first, turning the source text into "{BRAND} Botanical
  // Shampoo" -- the name's own mask then searched for the original, now-gone
  // "Diane Botanical Shampoo" substring and never matched, so {NAME} was
  // never masked and the raw name leaked into the translated sentence
  // untouched. Restore order does not have the same problem: {BRAND} and
  // {NAME} are disjoint placeholder tokens, not substrings of each other.
  const maskOrder = brand && name && brand.length > name.length ? (["brand", "name"] as const) : (["name", "brand"] as const);
  for (const which of maskOrder) {
    if (which === "brand" && brand) masked = masked.split(brand).join("{BRAND}");
    if (which === "name" && name) masked = masked.split(name).join("{NAME}");
  }

  const translated = masked.split(SENTENCE_SPLIT).map(sentence => {
    const trimmed = sentence.trim();
    if (!trimmed) return sentence;
    const known = PRODUCT_SENTENCES[trimmed];
    if (known) return known[locale];
    const everyday = trimmed.match(TEMPLATE_EVERYDAY);
    if (everyday) {
      const type = PRODUCT_TYPES[everyday[2].trim()];
      if (type) {
        const subject = everyday[1];
        if (locale === "ja") {
          const lead = subject ? `${subject}は` : "";
          return `${lead}日本の小売で広く知られている${type.ja}で、毎日の使用に向いています。`;
        }
        const opening = subject ? `${subject} is ${withArticle(type.en)}` : capitalise(withArticle(type.en));
        return `${opening} widely known in Japanese retail, made for everyday use.`;
      }
    }
    const ingredient = trimmed.match(TEMPLATE_INGREDIENT);
    if (ingredient) {
      const type = PRODUCT_TYPES[ingredient[2].trim()];
      const list = translateIngredients(ingredient[3], locale);
      if (type && list) {
        const subject = ingredient[1];
        if (locale === "ja") {
          const lead = subject ? `${subject}は` : "";
          return `${lead}日本の小売で広く知られている${type.ja}で、${list}などを配合しています。`;
        }
        const opening = subject ? `${subject} is ${withArticle(type.en)}` : capitalise(withArticle(type.en));
        return `${opening} widely known in Japanese retail, formulated with ${list} among its ingredients.`;
      }
    }
    return sentence;
  }).join(locale === "ja" ? "" : " ");

  let restored = translated;
  if (brand) restored = restored.split("{BRAND}").join(brand);
  if (name) restored = restored.split("{NAME}").join(name);
  return restored;
}
