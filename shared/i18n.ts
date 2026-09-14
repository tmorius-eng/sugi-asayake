/**
 * Storefront languages (2026-09-12, Tom: "translate hiideg button hiilgmeer
 * baina ... dotorn english bas japanese baih ystoi").
 *
 * How this works, and what it deliberately does NOT do:
 *
 *   - The site is written in Mongolian. Rather than key every label with an
 *     invented id, the Mongolian string IS the key: `t("Дэлгүүр")` returns
 *     "Shop" or "ショップ" and falls back to the Mongolian itself when a
 *     phrase has no entry yet. That means a missing translation degrades to
 *     the original wording instead of showing a bare key, and new copy needs
 *     no plumbing to keep working.
 *   - It covers the SHOP'S OWN WORDS: navigation, buttons, section
 *     headings, form labels, the footer. It does not translate catalogue
 *     data -- product names, descriptions and brands live in the database
 *     in one language, and translating those needs a per-language column
 *     and an admin screen to fill it, which is a separate piece of work.
 *   - Admin-entered copy (the site-text slots) is translated when its
 *     current value happens to match an entry here; the fallbacks shipped
 *     with the site all do.
 */
export const LOCALES = ["mn", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  mn: "Монгол",
  en: "English",
  ja: "日本語",
};

/** Mongolian source string -> its English and Japanese wording. */
export const UI_STRINGS: Record<string, { en: string; ja: string }> = {
  // -- header, navigation --------------------------------------------------
  "Дэлгүүр": { en: "Shop", ja: "ショップ" },
  "Топ брэнд": { en: "Top brands", ja: "人気ブランド" },
  "Гишүүнчлэл": { en: "Membership", ja: "メンバーシップ" },
  "Салбарууд": { en: "Stores", ja: "店舗" },
  "Зөвлөгөө": { en: "Journal", ja: "ジャーナル" },
  "Профайл": { en: "Account", ja: "アカウント" },
  "Сагс": { en: "Cart", ja: "カート" },
  "Ангилал": { en: "Categories", ja: "カテゴリー" },
  "Тухай": { en: "About", ja: "当店について" },
  "Бүх бүтээгдэхүүн": { en: "All products", ja: "すべての商品" },
  "Хүслийн жагсаалт": { en: "Wishlist", ja: "お気に入り" },
  "Бүтээгдэхүүн, брэндээр хайх": { en: "Search products and brands", ja: "商品・ブランドを検索" },
  "Хайх": { en: "Search", ja: "検索" },
  "Нүүр хуудасны цэс": { en: "Homepage menu", ja: "ホームページメニュー" },
  "Харанхуй загвар": { en: "Dark theme", ja: "ダークテーマ" },
  "Цайвар загвар": { en: "Light theme", ja: "ライトテーマ" },
  "Хэл": { en: "Language", ja: "言語" },

  // -- home ----------------------------------------------------------------
  "SUGI ASAYAKE / MONGOLIA": { en: "SUGI ASAYAKE / MONGOLIA", ja: "SUGI ASAYAKE / MONGOLIA" },
  "ГЭР БҮЛИЙН\nГИШҮҮН БҮРТ\nЯПОН ЧАНАР": { en: "JAPANESE QUALITY\nFOR EVERY MEMBER\nOF THE FAMILY", ja: "家族みんなに\n日本のクオリティを" },
  "Японоос баталгаат бүтээгдэхүүнүүдийг албан ёсны эрхтэйгээр танд хүргэж байна.": { en: "Authentic Japanese products, brought to you under official licence.", ja: "日本の正規品を、正式なライセンスのもとでお届けします。" },
  "Бүтээгдэхүүн үзэх": { en: "Browse products", ja: "商品を見る" },
  "Салбар олох": { en: "Find a store", ja: "店舗を探す" },
  "100% албан ёсны эрхтэй": { en: "100% officially licensed", ja: "100%正規取扱い" },
  "SUGI Drug Store Japan-ийн охин компани": { en: "A subsidiary of SUGI Drug Store Japan", ja: "SUGIドラッグストアジャパンの子会社" },
  "Түгээмэл хайлт": { en: "Popular searches", ja: "人気キーワード" },
  // The admin's own current wording for the category section heading.
  "Япон бараа\nүндсэн ангилал": { en: "Japanese goods\nby category", ja: "日本の商品\nカテゴリー別" },
  "Японы бүтээгдэхүүний\nүндсэн ангилал": { en: "Japanese products\nby category", ja: "日本の商品\nカテゴリー別" },
  "Их зарагддаг\nбараанууд": { en: "Best sellers", ja: "売れ筋商品" },
  "Танд санал\nболгож байна": { en: "Recommended for you", ja: "あなたへのおすすめ" },
  "Онцлох брэндүүд": { en: "Featured brands", ja: "ピックアップブランド" },
  "Бүх брэнд үзэх": { en: "See all brands", ja: "ブランド一覧" },
  "Бүх бүтээгдэхүүн үзэх": { en: "See all products", ja: "商品一覧" },
  "Бүгдийг үзэх": { en: "See all", ja: "一覧を見る" },
  "Яагаад SUGI ASAYAKE вэ?": { en: "Why SUGI ASAYAKE?", ja: "SUGI ASAYAKEが選ばれる理由" },
  "Сонголт": { en: "Selection", ja: "品ぞろえ" },
  "Баталгаа": { en: "Guaranteed", ja: "安心・正規品" },
  "Ойрхон": { en: "Close by", ja: "お近くに" },
  "Японоос баталгаат, албан ёсны бүтээгдэхүүн": { en: "Authentic, officially imported from Japan", ja: "日本からの正規輸入品" },
  "Танд ойрхон\nсалбар дээр": { en: "A store near you", ja: "お近くの店舗で" },
  "Багахан итгэл.\nИх халамж": { en: "A little trust.\nA lot of care", ja: "小さな信頼、\n大きなやさしさ" },
  "Сайн сонголт\nойрхон байна": { en: "A good choice,\nclose to home", ja: "良い選択は、\nすぐそばに" },

  // -- shop ----------------------------------------------------------------
  "АНГИЛЛААР ШҮҮХ": { en: "FILTER BY CATEGORY", ja: "カテゴリーで絞り込む" },
  "Таны өдөр тутмын хэрэгцээний хэмнэлээр": { en: "At the pace of your everyday", ja: "毎日のリズムに合わせて" },
  "Бүгд": { en: "All", ja: "すべて" },
  "Бэлэн нөөцтэй": { en: "In stock", ja: "在庫あり" },
  "Эрэмбэ": { en: "Sort", ja: "並び替え" },
  "Онцлох": { en: "Featured", ja: "おすすめ順" },
  "Доод": { en: "Min", ja: "下限" },
  "Дээд": { en: "Max", ja: "上限" },
  "Сонгосон:": { en: "Selected:", ja: "選択中:" },
  "Бүгдийг цэвэрлэх": { en: "Clear all", ja: "すべて解除" },
  "Дараах": { en: "Next", ja: "次へ" },
  "Өмнөх": { en: "Previous", ja: "前へ" },
  "Шуурхай харах": { en: "Quick view", ja: "クイックビュー" },
  "Арьсны төрөл: Бүгд": { en: "Skin type: all", ja: "肌タイプ: すべて" },
  "Хуурай": { en: "Dry", ja: "乾燥肌" },
  "Тослог": { en: "Oily", ja: "脂性肌" },
  "Мэдрэмтгий": { en: "Sensitive", ja: "敏感肌" },
  "Хэвийн": { en: "Normal", ja: "普通肌" },

  // -- categories ----------------------------------------------------------
  "Арьс арчилгаа": { en: "Skincare", ja: "スキンケア" },
  "Гоо сайхан": { en: "Beauty", ja: "コスメ" },
  "Эрүүл мэнд": { en: "Wellness", ja: "健康・インナーケア" },
  "Эрүүл ахуй": { en: "Hygiene", ja: "衛生用品" },
  "Үс ба бие": { en: "Hair & body", ja: "ヘア・ボディ" },
  "Ээж ба хүүхэд": { en: "Mother & baby", ja: "ママ＆ベビー" },
  // 2026-09-13: the POS gained a Food category (mochi, jelly, tea, chocolate,
  // cookies); scripts/import-pos-products.ts creates it as slug "khuns".
  "Хүнс": { en: "Food & sweets", ja: "食品・お菓子" },

  // -- footer, legal -------------------------------------------------------
  "Япон чанарыг гэр бүл бүрт.": { en: "Japanese quality for every family.", ja: "日本のクオリティを、すべての家族に。" },
  "Нөхцөл ба бодлого": { en: "Terms & policies", ja: "規約とポリシー" },
  "Холбоо барих": { en: "Contact", ja: "お問い合わせ" },
  "Хувийн нууцлал": { en: "Privacy", ja: "プライバシー" },
  "Үйлчилгээний нөхцөл": { en: "Terms of service", ja: "利用規約" },
  "Буцаалт, солилцоо": { en: "Returns & exchanges", ja: "返品・交換" },
  "Захиалгаа хянах": { en: "Track your order", ja: "注文状況の確認" },
  "Күкийн тохиргоо": { en: "Cookie settings", ja: "Cookie設定" },
  "© 2026 SUGI ASAYAKE Mongolia": { en: "© 2026 SUGI ASAYAKE Mongolia", ja: "© 2026 SUGI ASAYAKE Mongolia" },


  // -- membership, locator, family care, misc (2026-09-12) ------------------
  "ГИШҮҮНЧЛЭЛ": { en: "MEMBERSHIP", ja: "メンバーシップ" },
  "Quick\nStats": { en: "Quick\nStats", ja: "メンバー特典" },
  "Илүү их худалдан авалт, илүү их хэмнэлт.": { en: "The more you buy, the more you save.", ja: "買うほどに、お得に。" },
  "Таны нийт худалдан авалтын дүн өсөх тусам гишүүнчлэлийн хямдрал нэмэгдэж, дараагийн захиалга бүрд илүү их хэмнэлт үүснэ.": { en: "As your lifetime spend grows, your membership discount rises with it and every following order costs you less.", ja: "ご購入金額が増えるほど会員割引率が上がり、次のご注文がよりお得になります。" },
  "Нэвтэрснээр өөрийн бодит хэмнэлтийг харах боломжтой": { en: "Sign in to see your own savings", ja: "ログインすると実際の割引額が見られます" },
  "Гишүүнээр бүртгүүлэх": { en: "Become a member", ja: "会員登録する" },
  "Профайл руу орох": { en: "Go to your account", ja: "アカウントへ" },
  "ЖИШЭЭ ХАРУУЛАЛТ": { en: "EXAMPLE", ja: "例" },
  "Жишээ: нийт худалдан авалт": { en: "Example: lifetime spend", ja: "例: 累計購入額" },
  "Жишээ: хөнгөлөлт": { en: "Example: discount", ja: "例: 割引率" },
  "Одоогийн зэрэглэл": { en: "Current tier", ja: "現在のランク" },
  "Дараагийн зэрэглэл": { en: "Next tier", ja: "次のランク" },
  "Одоогийн хөнгөлөлт": { en: "Current discount", ja: "現在の割引" },
  "Нийт худалдан авалт": { en: "Lifetime spend", ja: "累計購入額" },
  "Стандарт": { en: "Standard", ja: "スタンダード" },
  "Хүрэл": { en: "Bronze", ja: "ブロンズ" },
  "Мөнгөн": { en: "Silver", ja: "シルバー" },
  "Алтан": { en: "Gold", ja: "ゴールド" },
  "БАЙРШИЛ": { en: "LOCATIONS", ja: "店舗" },
  "Улаанбаатарын өөр өөр цэгүүдэд япон чанарыг танд ойртуулж байна.": { en: "Bringing Japanese quality closer to you, across Ulaanbaatar.", ja: "ウランバートル各所で、日本のクオリティをより身近に。" },
  "Салбарын байршлыг Google Maps дээр нээх": { en: "Open the store location in Google Maps", ja: "店舗の場所をGoogleマップで開く" },
  "руу залгах": { en: "Call", ja: "に電話する" },
  "Өдөр бүр": { en: "Every day", ja: "毎日" },
  "FAMILY CARE": { en: "FAMILY CARE", ja: "ファミリーケア" },
  "Бидний сонголт зөвхөн бүтээгдэхүүн биш. Таны гэр бүлийн өдөр тутмын амар тайван байдал, итгэл, халамж юм.": { en: "What we stock is more than product. It is your family’s everyday calm, trust and care.", ja: "私たちが扱うのは商品だけではありません。ご家族の毎日の安心と信頼、そしてやさしさです。" },
  "Баталгаат Япон бүтээгдэхүүн": { en: "Authentic Japanese products", ja: "日本の正規品" },
  "Гэр бүл бүрт зориулсан сонголт": { en: "A selection for every family", ja: "ご家族みんなのための品ぞろえ" },
  "24–48 цагийн дотор Улаанбаатарт хүргэнэ": { en: "Delivered in Ulaanbaatar within 24–48 hours", ja: "ウランバートル市内は24〜48時間でお届け" },
  "Арчилгаа, гоо сайхан, эрүүл ахуйн {N} төрөл": { en: "{N} lines across skincare, beauty and hygiene", ja: "スキンケア・コスメ・衛生用品を{N}種類" },
  "Улаанбаатарын": { en: "Across Ulaanbaatar,", ja: "ウランバートルの" },
  "байршилд таныг хүлээнэ": { en: "locations are waiting for you", ja: "か所でお待ちしています" },
  "ХАРИЛЦАГЧИЙН ҮГ": { en: "CUSTOMER VOICES", ja: "お客様の声" },
  "Юу ярьж байна вэ.": { en: "What they are saying.", ja: "お客様の声をご紹介" },
  "Нэргүй": { en: "Anonymous", ja: "匿名" },
  "Хайлт": { en: "Search", ja: "検索" },
  "Захиалга": { en: "Orders", ja: "注文" },
  "Сагс нээх": { en: "Open cart", ja: "カートを開く" },
  "Хаах": { en: "Close", ja: "閉じる" },
  "Үнэгүй": { en: "Free", ja: "無料" },
  "Нэмэх": { en: "Add", ja: "追加" },
  "Сагсанд нэмэх": { en: "Add to cart", ja: "カートに入れる" },
  "Дэлгэрэнгүй үзэх": { en: "See details", ja: "詳しく見る" },
  "Бүх брэнд": { en: "All brands", ja: "ブランド一覧" },
  "Шинэ мэдээ": { en: "News", ja: "お知らせ" },


  // -- /shop, recently viewed, profile (2026-09-12) -------------------------
  "02 / SUGI MARKET": { en: "02 / SUGI MARKET", ja: "02 / SUGI MARKET" },
  "Өдөр тутмын\nсонголтууд.": { en: "Everyday\nchoices", ja: "毎日の\n選びもの" },
  "Японоос албан ёсоор нийлүүлсэн арьс арчилгаа, эрүүл мэнд, гэр бүлийн хэрэгцээний бүтээгдэхүүнээ өөртөө тохируулан олоорой.": { en: "Find the skincare, wellness and family essentials officially supplied from Japan that suit you.", ja: "日本から正規に仕入れたスキンケア・健康・家族の必需品から、あなたに合うものを。" },
  "Японоос албан ёсоор нийлүүлсэн арьс арчилгаа, эрүүл мэнд, гэр бүлийн хэрэгцээний 900+ бүтээгдэхүүн.": { en: "Over 900 skincare, wellness and family products, officially supplied from Japan.", ja: "日本から正規に仕入れたスキンケア・健康・家族向け商品900点以上。" },
  "ТАНЫ ӨДӨР БҮРТ / ЯПОН ЧАНАР": { en: "FOR EVERY DAY / JAPANESE QUALITY", ja: "毎日に / 日本のクオリティ" },
  "SUGI ASAYAKE / ТАНЫ ӨДӨР БҮР": { en: "SUGI ASAYAKE / EVERY DAY", ja: "SUGI ASAYAKE / 毎日に" },
  "SUGI ASAYAKE / DISCOVER": { en: "SUGI ASAYAKE / DISCOVER", ja: "SUGI ASAYAKE / DISCOVER" },
  "Өнөөдрийн хэрэгцээ\nэндээс эхэлнэ.": { en: "Today’s essentials\nstart here", ja: "今日の必需品は\nここから" },
  "Онлайн каталогийг бид салбарын бодит нөөцтэй нь уялдуулан шинэчилж байна. Харин та өөрт ойр салбараас дараах ангиллаар шууд асууж болно.": { en: "We are syncing the online catalogue with real store stock. In the meantime, ask your nearest store about these categories directly.", ja: "オンラインカタログは店舗の実在庫と同期作業中です。その間はお近くの店舗に直接お問い合わせください。" },
  "Таны хайж буй бүтээгдэхүүнийг ойр салбараас асуугаарай.": { en: "Ask your nearest store about the product you are looking for.", ja: "お探しの商品はお近くの店舗へお問い合わせください。" },
  "{N} салбар, нэг өдөр тутмын сонголт.": { en: "{N} stores, one everyday choice.", ja: "{N}店舗、毎日の選択をひとつに。" },
  "SUGI DAILY CARE": { en: "SUGI DAILY CARE", ja: "SUGI DAILY CARE" },
  "Үнэ: багаас": { en: "Price: low to high", ja: "価格: 安い順" },
  "Үнэ: ихээс": { en: "Price: high to low", ja: "価格: 高い順" },
  "Нэр: A–Я": { en: "Name: A–Z", ja: "名前順" },
  "Нөөц дууссан": { en: "Out of stock", ja: "在庫切れ" },
  "НӨӨЦ ДУУССАН": { en: "OUT OF STOCK", ja: "在庫切れ" },
  "хуудас": { en: "page", ja: "ページ" },
  "бүтээгдэхүүн": { en: "products", ja: "商品" },
  "үр дүн": { en: "results", ja: "件" },
  "ТАНЫ СҮҮЛД ҮЗСЭН": { en: "RECENTLY VIEWED", ja: "最近見た商品" },
  "Буцаад\nхараарай.": { en: "Take another\nlook", ja: "もう一度\nご覧ください" },
  "Энэ жагсаалт зөвхөн таны энэ төхөөрөмж дээр хадгалагдана. Нэвтрэх мэдээлэл, захиалга, эсвэл хувийн таних мэдээлэл цуглуулахгүй.": { en: "This list is kept only on this device. No sign-in details, orders or identifying information are collected.", ja: "この一覧はこの端末にのみ保存されます。ログイン情報・注文・個人情報は収集しません。" },
  "Профайлаа харахын тулд нэвтэрнэ үү.": { en: "Sign in to see your account.", ja: "アカウントを見るにはログインしてください。" },
  "Хувийн мэдээлэл, зураг, хүслийн жагсаалт болон хүргэлтийн хаягаа энд хадгалж болно.": { en: "Keep your details, photo, wishlist and delivery addresses here.", ja: "お客様情報・写真・お気に入り・お届け先をここに保存できます。" },
  "Өглөөний туяа шиг гэрэлтээрэй — таны бүх мэдээлэл эндээс нэг дороос харагдана.": { en: "Everything about your account, in one place.", ja: "アカウントのすべてを、ひとつの画面に。" },
  "Захиалгын түүх": { en: "Order history", ja: "注文履歴" },
  "Нийт захиалга": { en: "Total orders", ja: "注文数" },
  "Гишүүнчлэлийн карт": { en: "Membership card", ja: "会員カード" },
  "Нууц үг солих": { en: "Change password", ja: "パスワードを変更" },
  "Имэйл мэдэгдэл": { en: "Email notifications", ja: "メール通知" },
  "Мэдэгдэл": { en: "Notifications", ja: "通知" },
  "Дэлгэрэнгүй": { en: "Details", ja: "詳細" },
  "Дэлгүүр үзэх": { en: "Browse the shop", ja: "ショップを見る" },
  "Зураг хасах": { en: "Remove photo", ja: "写真を削除" },
  "Акаунт устгах": { en: "Delete account", ja: "アカウントを削除" },
  "Акаунтаа устгах": { en: "Delete your account", ja: "アカウントを削除する" },


  // -- cart, product page, checkout, account (2026-09-12) -------------------
  "YOUR CART": { en: "YOUR CART", ja: "カート" },
  "Таны сагс": { en: "Your cart", ja: "カート" },
  "Захиалгын мэдээллээ шалгаад үргэлжлүүлнэ үү.": { en: "Check your order details and continue.", ja: "ご注文内容をご確認のうえお進みください。" },
  "Сагс хоосон байна": { en: "Your cart is empty", ja: "カートは空です" },
  "Танд тохирох бүтээгдэхүүнээ сонгоорой.": { en: "Choose the products that suit you.", ja: "お好みの商品をお選びください。" },
  "Дүн": { en: "Subtotal", ja: "小計" },
  "Захиалга үргэлжлүүлэх": { en: "Continue to checkout", ja: "レジに進む" },
  "Сагсыг шинэчилж чадсангүй.": { en: "Could not update the cart.", ja: "カートを更新できませんでした。" },
  "Сагсанд нэмж чадсангүй.": { en: "Could not add to the cart.", ja: "カートに追加できませんでした。" },
  "Сагсанд нэмэгдлээ": { en: "Added to cart", ja: "カートに追加しました" },
  "НӨАТ багтсан": { en: "VAT included", ja: "税込" },
  "Нөөцөд бэлэн": { en: "In stock", ja: "在庫あり" },
  "УБ хүргэлт": { en: "Ulaanbaatar delivery", ja: "ウランバートル配送" },
  "24–48 цагийн дотор · Салбараас үнэгүй авах": { en: "Within 24–48 hours · free store pickup", ja: "24〜48時間以内 ・ 店舗受取は無料" },
  "Албан ёсны баталгаа": { en: "Official guarantee", ja: "正規保証" },
  "ХАМТ ХАРСАН НЬ ТОХИРНО": { en: "OFTEN VIEWED TOGETHER", ja: "一緒に見られている商品" },
  "Мөн танд": { en: "You may also", ja: "こちらも" },
  "таалагдаж магадгүй": { en: "like these", ja: "おすすめです" },
  "Хэрэглэгчийн сэтгэгдэл": { en: "Customer reviews", ja: "カスタマーレビュー" },
  "Одоогоор сэтгэгдэл байхгүй байна. Эхний сэтгэгдлийг та үлдээгээрэй!": { en: "No reviews yet. Be the first to leave one.", ja: "まだレビューはありません。最初のレビューをお寄せください。" },
  "Нэвтэрч сэтгэгдэл үлдээгээрэй.": { en: "Sign in to leave a review.", ja: "レビューを書くにはログインしてください。" },
  "Сэтгэгдэл бичих": { en: "Write a review", ja: "レビューを書く" },
  "Үнэлгээ": { en: "Rating", ja: "評価" },
  "Илгээх": { en: "Submit", ja: "送信" },
  "Тоо ширхэг": { en: "Quantity", ja: "数量" },
  "Бараа": { en: "Product", ja: "商品" },
  "Нэр": { en: "Name", ja: "お名前" },
  "Утас": { en: "Phone", ja: "電話番号" },
  "SUGI ASAYAKE захиалга": { en: "SUGI ASAYAKE order", ja: "SUGI ASAYAKE ご注文" },
  "Улаанбаатар хүргэлт": { en: "Ulaanbaatar delivery", ja: "ウランバートル配送" },
  "Салбараас авах": { en: "Store pickup", ja: "店舗受取" },
  "Хүргэлтийн хаяг": { en: "Delivery address", ja: "お届け先" },
  "Дүүрэг (сонголтоор)": { en: "District (optional)", ja: "地区（任意）" },
  "Сонгох": { en: "Select", ja: "選択" },
  "Төлбөр баталгаажлаа.": { en: "Payment confirmed.", ja: "お支払いが確認されました。" },
  "Хүлээн авах мэдээлэл": { en: "Contact details", ja: "お受け取り情報" },
  "Төлбөрийн хэлбэр": { en: "Payment method", ja: "お支払い方法" },
  "Миний захиалга": { en: "My orders", ja: "注文履歴" },
  "Захиалга байхгүй байна.": { en: "No orders yet.", ja: "ご注文はまだありません。" },
  "Хүлээгдэж байна": { en: "Pending", ja: "受付中" },
  "Баталгаажсан": { en: "Confirmed", ja: "確定" },
  "Бэлтгэж байна": { en: "Preparing", ja: "準備中" },
  "Хүргэлтэд гарсан": { en: "Out for delivery", ja: "配送中" },
  "Дууссан": { en: "Completed", ja: "完了" },
  "Цуцлагдсан": { en: "Cancelled", ja: "キャンセル済み" },
  "Буцаагдсан": { en: "Returned", ja: "返品済み" },
  "Цуцлах": { en: "Cancel", ja: "キャンセル" },
  "Хадгалах": { en: "Save", ja: "保存" },
  "Буцаах": { en: "Undo", ja: "元に戻す" },
  "Алгасах": { en: "Skip", ja: "スキップ" },
  "Тусламж": { en: "Help", ja: "ヘルプ" },
  "Түр хүлээнэ үү…": { en: "One moment…", ja: "少々お待ちください…" },
  "Уншиж байна…": { en: "Loading…", ja: "読み込み中…" },
  "Хайж байна…": { en: "Searching…", ja: "検索中…" },
  "Тохирох бүтээгдэхүүн олдсонгүй.": { en: "No matching products.", ja: "該当する商品が見つかりません。" },
  "Хүсэлт амжилтгүй боллоо. Дахин оролдоно уу.": { en: "That request failed. Please try again.", ja: "リクエストに失敗しました。もう一度お試しください。" },
  "SUGI ASAYAKE профайл": { en: "SUGI ASAYAKE account", ja: "SUGI ASAYAKE アカウント" },
  "SUGI ASAYAKE дэлгүүр": { en: "SUGI ASAYAKE shop", ja: "SUGI ASAYAKE ショップ" },
  "Хувийн мэдээлэл": { en: "Personal details", ja: "お客様情報" },
  "Профайл засах": { en: "Edit profile", ja: "プロフィールを編集" },
  "Таны нэр": { en: "Your name", ja: "お名前" },
  "Шинэ нууц үг": { en: "New password", ja: "新しいパスワード" },
  "Шинэ нууц үг давтах": { en: "Repeat the new password", ja: "新しいパスワード（確認）" },
  "8-с дээш тэмдэгт": { en: "At least 8 characters", ja: "8文字以上" },
  "Арьсны профайл": { en: "Skin profile", ja: "肌のプロフィール" },
  "Үсний профайл": { en: "Hair profile", ja: "髪のプロフィール" },
  "Үнэр & хэрэглээ": { en: "Fragrance & routine", ja: "香り・使い方" },
  "Эрүүл мэнд & амьдрал": { en: "Wellness & lifestyle", ja: "健康・ライフスタイル" },
  "Интерьер": { en: "Interior", ja: "インテリア" },
  "Тойм": { en: "Overview", ja: "概要" },
  "Бага насны хүүхэдтэй": { en: "Has young children", ja: "小さなお子様がいる" },
  "Ирэхээр мэдэгдэх": { en: "Notify me when it is back", ja: "入荷したら知らせる" },
  "Нүүр": { en: "Home", ja: "ホーム" },
  "Хадгалсан": { en: "Saved", ja: "保存済み" },
  "ДЭЛГҮҮР": { en: "SHOP", ja: "ショップ" },
  "Дэлгүүр рүү буцах": { en: "Back to the shop", ja: "ショップに戻る" },
  "Нүүр хуудас руу буцах": { en: "Back to the homepage", ja: "ホームに戻る" },
  "Цэс нээх": { en: "Open menu", ja: "メニューを開く" },
  "Цэс хаах": { en: "Close menu", ja: "メニューを閉じる" },
  "Хайлт хаах": { en: "Close search", ja: "検索を閉じる" },
  "Нууцлалын бодлого": { en: "Privacy policy", ja: "プライバシーポリシー" },
  "Анхаарна уу:": { en: "Please note:", ja: "ご注意:" },
  "хэсэгт бий.": { en: "is available in this section.", ja: "こちらのセクションにあります。" },
  "Энэ баркодтой бараа сайтад алга.": { en: "No product on the site carries this barcode.", ja: "このバーコードの商品はサイトにありません。" },
  "Барааны хуудас нээгдэж байна…": { en: "Opening the product page…", ja: "商品ページを開いています…" },
  "Баркод хайхад алдаа гарлаа. Дахин уншуулна уу.": { en: "Barcode lookup failed. Please scan again.", ja: "バーコード検索に失敗しました。もう一度スキャンしてください。" },


  // -- order confirmation, verification, preferences (2026-09-12) -----------
  "Яагаад биднийг сонгох вэ": { en: "Why choose us", ja: "選ばれる理由" },
  "Тайлан татагдлаа": { en: "Report downloaded", ja: "レポートをダウンロードしました" },
  "үнэгүй": { en: "free", ja: "無料" },
  "Хадгалж байна…": { en: "Saving…", ja: "保存中…" },
  "ДАРАХАД ТОМРОНО · ← → ГАРААР СОЛИГДОНО": { en: "CLICK TO ZOOM · ← → TO BROWSE", ja: "クリックで拡大 ・ ←→ で切り替え" },
  "Өмнөх зураг": { en: "Previous image", ja: "前の画像" },
  "Дараах зураг": { en: "Next image", ja: "次の画像" },
  "ЗАХИАЛГА БАТАЛГААЖЛАА": { en: "ORDER CONFIRMED", ja: "ご注文が確定しました" },
  "Баярлалаа,": { en: "Thank you,", ja: "ありがとうございます、" },
  "Routine хямдрал": { en: "Routine discount", ja: "ルーティン割引" },
  "Нийт төлсөн": { en: "Total paid", ja: "お支払い合計" },
  "QPay-ээр төлөгдсөн": { en: "Paid with QPay", ja: "QPayでお支払い済み" },
  "Захиалгуудаа харах": { en: "View your orders", ja: "注文履歴を見る" },
  "Таны захиалгыг хүлээн авлаа. Явцыг доорх дугаараар “Миний захиалга” хэсгээс хэдийч хянаж болно.": { en: "We have your order. Track it any time from “My orders” using the number below.", ja: "ご注文を承りました。下記の番号で「注文履歴」からいつでも確認できます。" },
  "Кодны хугацаа дууссан байна. Хуучин кодоор баталгаажуулах боломжгүй.": { en: "That code has expired. An old code cannot be used to verify.", ja: "コードの有効期限が切れています。古いコードでは認証できません。" },
  "Дахин оролдох": { en: "Try again", ja: "もう一度試す" },
  "Утасны дугаар амжилттай баталгаажлаа.": { en: "Your phone number is verified.", ja: "電話番号が確認されました。" },
  "SMS илгээх апп нээх": { en: "Open your SMS app", ja: "SMSアプリを開く" },
  "SMS хүлээж байна…": { en: "Waiting for the SMS…", ja: "SMSを待っています…" },
  "Өөр дугаар ашиглах": { en: "Use another number", ja: "別の番号を使う" },
  "Баталгаажуулж чадсангүй. Дахин оролдоно уу.": { en: "Verification failed. Please try again.", ja: "認証できませんでした。もう一度お試しください。" },
  "Утсаар сэргээх": { en: "Recover by phone", ja: "電話番号で再設定" },
  "Мессеж шалгах": { en: "Check your messages", ja: "メッセージを確認" },
  "Хүйс": { en: "Gender", ja: "性別" },
  "Дүүрэг": { en: "District", ja: "地区" },
  "Сонгоогүй": { en: "Not selected", ja: "未選択" },
  "Төрсөн он": { en: "Year of birth", ja: "生まれ年" },
  "Мэргэжил": { en: "Occupation", ja: "ご職業" },
  "Арьсны төрөл": { en: "Skin type", ja: "肌タイプ" },
  "Санаа зовдог асуудал (хамгийн чухал асуудлаа эхэлж сонгоно уу)": { en: "Concerns (start with the one that matters most)", ja: "お悩み（最も気になるものから）" },
  "Арчилгааны зэрэг": { en: "Routine depth", ja: "お手入れの段階" },
  "Үсний төрөл": { en: "Hair type", ja: "髪質" },
  "Санаа зовдог асуудал (олноор сонгож болно)": { en: "Concerns (choose as many as you like)", ja: "お悩み（複数選択可）" },
  "Үнэрийн сонголт": { en: "Fragrance preference", ja: "香りの好み" },
  "Сонирхдог зүйлс (олноор сонгож болно)": { en: "Interests (choose as many as you like)", ja: "興味のあること（複数選択可）" },
  "Бага насны хүүхэдтэй юу?": { en: "Do you have young children?", ja: "小さなお子様はいますか？" },
  "Тийм": { en: "Yes", ja: "はい" },
  "Үгүй": { en: "No", ja: "いいえ" },
  "Интерьерийн хэв маяг": { en: "Interior style", ja: "インテリアの好み" },
  "Буцах": { en: "Back", ja: "戻る" },
  "Дуусгах": { en: "Finish", ja: "完了する" },
  "Тохиргоо хадгалагдлаа.": { en: "Your preferences are saved.", ja: "設定を保存しました。" },
  "Хадгалж чадсангүй.": { en: "Could not save.", ja: "保存できませんでした。" },
  "жишээ: Багш": { en: "e.g. Teacher", ja: "例: 教師" },


  // -- sentences built at runtime; {placeholders} are filled after translating
  "Жишээ нь: {spend} худалдан авалттай гишүүн \"{tier}\" зэрэглэлд {discount}% хөнгөлөлт эдэлж, \"{next}\" зэрэглэл хүртэл {left} дутуу байна.": { en: "For example: a member who has spent {spend} sits in the \"{tier}\" tier with {discount}% off, and is {left} away from \"{next}\".", ja: "例: 累計{spend}のお客様は「{tier}」ランクで{discount}%割引となり、「{next}」まであと{left}です。" },
  "Жишээ нь: {spend} худалдан авалттай гишүүн \"{tier}\" зэрэглэлд {discount}% хөнгөлөлт эдэлнэ.": { en: "For example: a member who has spent {spend} sits in the \"{tier}\" tier with {discount}% off.", ja: "例: 累計{spend}のお客様は「{tier}」ランクで{discount}%割引となります。" },
  "дараагийн \"{tier}\" зэрэглэлд хүрэхэд {left} дутуу байна": { en: "{left} away from the next tier, \"{tier}\"", ja: "次のランク「{tier}」まであと{left}" },
  "хамгийн дээд зэрэглэлд хүрсэн байна": { en: "you have reached the highest tier", ja: "最上位ランクに到達しています" },
  "Таны гишүүнчлэл: {tier} зэрэглэл, одоогийн хөнгөлөлт {discount}%.": { en: "Your membership: {tier} tier, {discount}% off today.", ja: "ご利用状況: {tier}ランク、現在の割引{discount}%。" },


  // -- remaining storefront copy (2026-09-12, third pass) --------------------
  "Тоо хасах": { en: "Decrease quantity", ja: "数量を減らす" },
  "Тоо нэмэх": { en: "Increase quantity", ja: "数量を増やす" },
  "Тоо сонгох": { en: "Choose quantity", ja: "数量を選ぶ" },
  "Ачаалж байна": { en: "Loading", ja: "読み込み中" },
  "Ойр салбараа олох": { en: "Find your nearest store", ja: "お近くの店舗を探す" },
  "Нэвтэрсэн үед идэвхжинэ": { en: "Available once you are signed in", ja: "ログイン後にご利用いただけます" },
  "Бүртгэлтэй юу? Нэвтрэх": { en: "Already registered? Sign in", ja: "登録済みの方はログイン" },
  "Шинэ хэрэглэгч үү? Бүртгүүлэх": { en: "New here? Create an account", ja: "はじめての方は新規登録" },
  "Хамт авбал тохирно": { en: "Goes well together", ja: "一緒に使うと相性抜群" },
  "Хуудасны эхэнд буцах": { en: "Back to top", ja: "ページ上部へ戻る" },
  "Үндсэн цэс": { en: "Main menu", ja: "メインメニュー" },
  "Бүтэн мэдээлэл харах": { en: "See the full details", ja: "詳細をすべて見る" },
  "Японоос албан ёсоор нийлүүлсэн өдөр тутмын арчилгааны сонголт.": { en: "Everyday care, officially supplied from Japan.", ja: "日本から正規に仕入れた、毎日のケア。" },
  "Дэлгэрэнгүй мэдээллийг ачаалж байна…": { en: "Loading the details…", ja: "詳細を読み込んでいます…" },
  "Танд зориулан": { en: "Picked for you", ja: "あなたにおすすめ" },
  "ТАНД ЗОРИУЛАН": { en: "PICKED FOR YOU", ja: "あなたにおすすめ" },
  "Таны сүүлд үзсэн": { en: "Recently viewed", ja: "最近見た商品" },
  "Таны профайл дээр хадгалсан арьсны төрөл, арчилгааны сонирхол, интерьер загварт тохирсон бүтээгдэхүүнүүд.": { en: "Products matched to the skin type, care interests and interior style saved on your profile.", ja: "プロフィールに保存された肌タイプ・ケアの好み・インテリアの好みに合わせた商品です。" },
  "Шуурхай холбоос": { en: "Quick links", ja: "クイックリンク" },
  "Сайн сонголт ойрхон байна.": { en: "A good choice, close to home.", ja: "良い選択は、すぐそばに。" },
  "SUGI ASAYAKE сошиал хуудаснууд": { en: "SUGI ASAYAKE social pages", ja: "SUGI ASAYAKE のSNS" },
  "Тохиргоо": { en: "Settings", ja: "設定" },
  "Ойлголоо": { en: "Got it", ja: "了解しました" },
  "Зарыг хаах": { en: "Close the promotion", ja: "お知らせを閉じる" },
  "Бидний ялгаа, яагаад биднийг сонгох вэ": { en: "What sets us apart", ja: "私たちが選ばれる理由" },
  "Өмнөх бараанууд": { en: "Previous products", ja: "前の商品" },
  "Дараагийн бараанууд": { en: "Next products", ja: "次の商品" },
  "Арьс арчилгаа, гоо сайхан, эрүүл ахуй, гэр бүлийн өдөр тутмын хэрэгцээг 900+ сонголтоос нэг дороос.": { en: "Skincare, beauty, hygiene and family essentials — over 900 choices in one place.", ja: "スキンケア・コスメ・衛生用品・家族の必需品を900点以上、ひとつの場所で。" },
  "Ангиллууд": { en: "Categories", ja: "カテゴリー" },
  "Бидний тавиур дээрх бүтээгдэхүүн бүр өдөр тутмын хэрэгцээнээс эхэлнэ.": { en: "Everything on our shelves starts with an everyday need.", ja: "私たちの棚にある商品は、すべて毎日の必要から始まります。" },
  "Ангиллын навигаци": { en: "Category navigation", ja: "カテゴリーのナビゲーション" },
  "Өмнөх ангилал": { en: "Previous category", ja: "前のカテゴリー" },
  "Дараагийн ангилал": { en: "Next category", ja: "次のカテゴリー" },
  "Каруселийн навигаци": { en: "Carousel navigation", ja: "カルーセルのナビゲーション" },
  "Өмнөх брэнд": { en: "Previous brand", ja: "前のブランド" },
  "Дараагийн брэнд": { en: "Next brand", ja: "次のブランド" },
  "слайд шоу": { en: "slideshow", ja: "スライドショー" },
  "Гишүүнчлэлийн мэдээлэл одоогоор ачаалагдсангүй.": { en: "Membership details could not be loaded.", ja: "メンバー情報を読み込めませんでした。" },
  "Гишүүнчлэлийн график ачаалж чадсангүй.": { en: "The membership chart could not be loaded.", ja: "メンバーチャートを読み込めませんでした。" },
  "Нийт хэмнэсэн дүн": { en: "Total saved", ja: "節約額の合計" },
  "тодорхойгүй байна": { en: "not known yet", ja: "未確定" },
  "Гишүүнчлэлийн хураангуй": { en: "Membership summary", ja: "メンバーシップ概要" },
  "Хамгийн дээд шат": { en: "Highest tier", ja: "最上位ランク" },
  "Японы чанарыг": { en: "Japanese quality,", ja: "日本のクオリティを" },
  "ойртуулна.": { en: "brought closer.", ja: "もっと身近に。" },
  "Шүүлтүүр цэвэрлэх": { en: "Clear filters", ja: "絞り込みを解除" },
  "Хайлтад тохирох брэнд олдсонгүй.": { en: "No brand matches that search.", ja: "該当するブランドが見つかりません。" },
  "Бүх брэнд — SUGI ASAYAKE": { en: "All brands — SUGI ASAYAKE", ja: "全ブランド — SUGI ASAYAKE" },
  "SUGI ASAYAKE-д худалдаалагдаж буй Японы бүх брэндийн жагсаалт.": { en: "Every Japanese brand carried by SUGI ASAYAKE.", ja: "SUGI ASAYAKEで取り扱う日本ブランドの一覧です。" },
  "БРЭНДИЙН НЭР": { en: "BRAND NAME", ja: "ブランド名" },
  "Брэндийн нэрээр хайх": { en: "Search by brand name", ja: "ブランド名で検索" },
  "Үсгээр шүүх": { en: "Filter by letter", ja: "頭文字で絞り込む" },
  "Профайлаас засах": { en: "Edit in your profile", ja: "プロフィールで編集" },
  "Имэйл (сонголтоор)": { en: "Email (optional)", ja: "メール（任意）" },
  "Тохирох салбарыг дараагийн алхамд сонгоно": { en: "You will choose the store in the next step", ja: "店舗は次のステップで選びます" },
  "Авах салбар": { en: "Pickup store", ja: "受取店舗" },
  "Салбар сонгох": { en: "Choose a store", ja: "店舗を選ぶ" },
  "Төлбөр": { en: "Payment", ja: "お支払い" },
  "Хүргэлт эсвэл салбарт хүлээн авах үед": { en: "On delivery or at the store", ja: "配送時または店舗で" },
  "StorePay-ээс боломжит дүнг асууж байна…": { en: "Checking your StorePay limit…", ja: "StorePayの利用可能額を確認しています…" },
  "QPay одоогоор идэвхгүй.": { en: "QPay is not active yet.", ja: "QPayは現在ご利用いただけません。" },
  "Зочноор захиалж болно —": { en: "You can order as a guest —", ja: "ゲストのままご注文いただけます —" },
  "бүртгэлтэй бол нэвтрэх": { en: "sign in if you are registered", ja: "登録済みの方はログイン" },
  "Сагс хоосон байна.": { en: "Your cart is empty.", ja: "カートは空です。" },
  "Хасах": { en: "Remove", ja: "削除" },
  "Дэлгүүрийн зээл ашиглах": { en: "Use store credit", ja: "ストアクレジットを使う" },
  "Барааны дүн": { en: "Items subtotal", ja: "商品小計" },
  "Дэлгүүрийн зээл": { en: "Store credit", ja: "ストアクレジット" },
  "Банкны апп сонгон төлнө үү. Callback баталгаажмагц төлөв автоматаар шинэчлэгдэнэ.": { en: "Pay in your banking app. The status updates automatically once the callback arrives.", ja: "銀行アプリでお支払いください。コールバックの確認後、状態は自動で更新されます。" },
  "Зөвшөөрөхийг хүлээж байна…": { en: "Waiting for approval…", ja: "承認をお待ちしています…" },
  "Буцаалт, солилцооны нөхцөл:": { en: "Returns and exchanges:", ja: "返品・交換について:" },
  "хуудаснаас үзнэ үү.": { en: "see the page.", ja: "ページをご覧ください。" },
  "Захиалгыг үргэлжлүүлж чадсангүй. Дахин оролдоно уу.": { en: "The order could not be placed. Please try again.", ja: "ご注文を確定できませんでした。もう一度お試しください。" },
  "Зөвлөгөө ба\nмэдээ.": { en: "Journal and\nnews", ja: "ジャーナルと\nお知らせ" },
  "Зөвлөгөө ба мэдээ.": { en: "Journal and news", ja: "ジャーナルとお知らせ" },
  "Захиалгаа\nхянах.": { en: "Track your\norder", ja: "ご注文の\n確認" },
  "Захиалгаа хянах.": { en: "Track your order", ja: "ご注文の確認" },
  "Дахин\nтавтай морил.": { en: "Welcome\nback", ja: "おかえりなさい" },
  "Дахин тавтай морил.": { en: "Welcome back", ja: "おかえりなさい" },
  "Бүртгэл\nүүсгэх.": { en: "Create an\naccount", ja: "アカウントを\n作成" },
  "Утасны дугаараа\nбаталгаажуулах.": { en: "Verify your\nphone number", ja: "電話番号を\n確認する" },
  "Нууц үгээ\nсэргээх.": { en: "Reset your\npassword", ja: "パスワードを\n再設定" },
  "Энэ хуудас олдсонгүй.": { en: "This page was not found.", ja: "このページは見つかりませんでした。" },
  "50% хямдрал!": { en: "50% off!", ja: "50%オフ！" },
  "24 цагийн турш": { en: "For 24 hours", ja: "24時間限定" },
  "— дууссан": { en: "— sold out", ja: "— 完売" },
  "X сонголт.": { en: "X options.", ja: "X 種類" },


  // -- catalogue category descriptions, as stored in the database -----------
  "Өдөр тутмын цэвэр, зөөлөн арчилгаа — нүүр, бие арчилгааны бүтээгдэхүүн": { en: "Clean, gentle everyday care — face and body products", ja: "毎日の清潔でやさしいケア — フェイス・ボディ用品" },
  "Японы сонгомол гоо сайхны бүтээгдэхүүн": { en: "A curated selection of Japanese beauty", ja: "厳選された日本のコスメ" },
  "Өдөр тутмын сайн сайхны найдвартай сонголт": { en: "Dependable choices for everyday wellbeing", ja: "毎日の健康を支える確かな選択" },
  "Гэр бүлд хэрэгтэй цэвэр, аюулгүй хэрэглээ": { en: "Clean, safe essentials for the family", ja: "家族のための清潔で安心な日用品" },
  "Өдөр бүрийн арчилгааг илүү хялбар болгоно": { en: "Makes everyday care simpler", ja: "毎日のケアをもっと手軽に" },
  "Зөөлөн, хэрэгцээт сонголтууд": { en: "Gentle, genuinely useful choices", ja: "やさしく、本当に必要なものを" },

  // -- account, checkout ---------------------------------------------------
  "Нэвтрэх": { en: "Sign in", ja: "ログイン" },
  "Бүртгүүлэх": { en: "Create account", ja: "新規登録" },
  "Гарах": { en: "Sign out", ja: "ログアウト" },
  "Утасны дугаар": { en: "Phone number", ja: "電話番号" },
  "Нууц үг": { en: "Password", ja: "パスワード" },
  "Нууц үгээ мартсан уу?": { en: "Forgotten your password?", ja: "パスワードをお忘れですか？" },
  "Захиалга батлах": { en: "Place order", ja: "注文を確定する" },
  "Хүргэлт": { en: "Delivery", ja: "配送" },
  "Нийт": { en: "Total", ja: "合計" },
  "Бэлэн мөнгө": { en: "Cash", ja: "現金" },

  // -- assembled labels and the strings the live audit still showed --------
  "{page} — SUGI ASAYAKE": { en: "{page} — SUGI ASAYAKE", ja: "{page} — SUGI ASAYAKE" },
  "SUGI ASAYAKE Mongolia — Япон чанарыг гэр бүл бүрт": { en: "SUGI ASAYAKE Mongolia — Japanese quality for every family", ja: "SUGI ASAYAKE Mongolia — 日本の品質を、すべての家族に" },
  "Захиалга баталгаажуулах": { en: "Checkout", ja: "ご注文の確定" },
  "Захиалга хянах": { en: "Track an order", ja: "注文状況の確認" },
  "Зөвлөгөө ба мэдээ": { en: "Journal and news", ja: "ジャーナル・ニュース" },
  "Хуудас олдсонгүй": { en: "Page not found", ja: "ページが見つかりません" },
  "Нууц үг сэргээх": { en: "Reset your password", ja: "パスワードの再設定" },
  "Сагсанд нэмэх — {price}": { en: "Add to cart — {price}", ja: "カートに追加 — {price}" },
  "УБ хүргэлт — {fee}": { en: "Delivery in UB — {fee}", ja: "UB市内配送 — {fee}" },
  "24–48 цагийн дотор": { en: "Within 24–48 hours", ja: "24〜48時間以内" },
  "Салбараас үнэгүй авах": { en: "Free pickup at a store", ja: "店舗受取は無料" },
  "Нэвтэрч": { en: "Sign in", ja: "ログイン" },
  "сэтгэгдэл үлдээгээрэй.": { en: "to leave a review.", ja: "してレビューを投稿してください。" },
  "Дүүрэг, хороо, байр, орц, тоот, нэмэлт тайлбар": { en: "District, khoroo, building, entrance, flat, any extra note", ja: "区・ホロー・建物・入口・部屋番号・補足" },
  "Хямдралын код": { en: "Discount code", ja: "割引コード" },
  "Сагс нээх, {n} бараатай": { en: "Open cart, {n} item(s)", ja: "カートを開く（{n}点）" },
  "{brand} брэндийн бараанууд": { en: "Products by {brand}", ja: "{brand}の商品" },
  "{name}-г хүслийн жагсаалтад нэмэх": { en: "Add {name} to your wishlist", ja: "{name}をお気に入りに追加" },
  "{name}-г хүслийн жагсаалтаас хасах": { en: "Remove {name} from your wishlist", ja: "{name}をお気に入りから削除" },
  "{name}-г сагсанд нэмэх": { en: "Add {name} to your cart", ja: "{name}をカートに追加" },
  "{name} — сагснаас хасах": { en: "{name} — remove from cart", ja: "{name} — カートから削除" },
  "{name} — тоо нэмэх": { en: "{name} — increase quantity", ja: "{name} — 数量を増やす" },
  "{name} — тоо хасах": { en: "{name} — decrease quantity", ja: "{name} — 数量を減らす" },
  "{name} шуурхай харах": { en: "Quick view of {name}", ja: "{name}をクイックビュー" },
  "{branch} — Google Maps дээр нээх": { en: "{branch} — open in Google Maps", ja: "{branch} — Googleマップで開く" },
  "{branch} Google Maps дээр нээх": { en: "{branch} — open in Google Maps", ja: "{branch} — Googleマップで開く" },
  "{n} дэх зургийг харах": { en: "View image {n}", ja: "{n}枚目の画像を見る" },
  "Өдөр бүр {hours}": { en: "Every day {hours}", ja: "毎日 {hours}" },
  "{n} ширхэг үлдсэн": { en: "{n} left in stock", ja: "残り{n}点" },
  "Миний профайл": { en: "My account", ja: "マイアカウント" },
  "Зургийг томруулж харах": { en: "View the image larger", ja: "画像を拡大して見る" },
  "Доод үнэ (₮)": { en: "Lowest price (₮)", ja: "最低価格（₮）" },
  "Дээд үнэ (₮)": { en: "Highest price (₮)", ja: "最高価格（₮）" },
  "Том grid харагдац": { en: "Large grid view", ja: "大きいグリッド表示" },
  "Жижиг grid харагдац": { en: "Small grid view", ja: "小さいグリッド表示" },
  "Хуудаслалт": { en: "Pagination", ja: "ページ送り" },
  "Facebook хуудас нээх": { en: "Open our Facebook page", ja: "Facebookページを開く" },
  "Instagram хуудас нээх": { en: "Open our Instagram page", ja: "Instagramページを開く" },
  "SUGI ASAYAKE брэндийн мессеж": { en: "A message from SUGI ASAYAKE", ja: "SUGI ASAYAKEからのメッセージ" },
  "SUGI ASAYAKE-ийн гэр бүлийн арчилгааны бүтээгдэхүүнүүд": { en: "SUGI ASAYAKE family care products", ja: "SUGI ASAYAKEのファミリーケア商品" },
  "SUGI ASAYAKE-ийн 4 салбарын байршлыг харуулсан зурган дүрслэл": { en: "An illustration of SUGI ASAYAKE's four store locations", ja: "SUGI ASAYAKEの4店舗の場所を示すイラスト" },
  "Шуурхай": { en: "Quick view", ja: "クイック" },
  "УБ ХҮРГЭЛТ": { en: "UB DELIVERY", ja: "UB配送" },
  "САЛБАРААС ҮНЭГҮЙ АВАХ": { en: "FREE STORE PICKUP", ja: "店舗受取は無料" },
  "брэнд": { en: "brands", ja: "ブランド" },
  "бараа": { en: "products", ja: "商品" },
  "Дэлгэрэнгүй унших": { en: "Read more", ja: "続きを読む" },
  "SUGI ASAYAKE-ийн арчилгаа, гоо сайхан, өдөр тутмын зөвлөгөөнүүд.": { en: "Care, beauty and everyday advice from SUGI ASAYAKE.", ja: "SUGI ASAYAKEのケア・美容・暮らしのアドバイス。" },
  "Захиалгын дугаар": { en: "Order number", ja: "注文番号" },
  "Захиалгын дугаар болон захиалахад ашигласан утасны дугаараа оруулна уу.": { en: "Enter your order number and the phone number you ordered with.", ja: "注文番号と、ご注文時の電話番号を入力してください。" },
  "Бүртгэлтэй утасны дугаараа оруулбал SMS-ээр баталгаажуулна.": { en: "Enter your registered phone number and we will confirm it by SMS.", ja: "登録済みの電話番号を入力すると、SMSで確認します。" },
  "Баталгаажуулах SMS илгээхэд таны дугаараас": { en: "Sending the confirmation SMS costs you", ja: "確認SMSの送信にはお客様の番号から" },
  "хасагдана (оператор компаниас хураана, бид биш).": { en: "charged by your mobile operator, not by us.", ja: "が差し引かれます（通信事業者による請求で、当社ではありません）。" },
  "Код илгээх": { en: "Send the code", ja: "コードを送る" },
  "Нэвтрэх хуудас руу буцах": { en: "Back to sign in", ja: "ログイン画面に戻る" },
  "Захиалгаа": { en: "Confirm your", ja: "ご注文を" },
  "баталгаажуулах": { en: "order", ja: "確定する" },
  "Захиалгын мэдээллээ баталгаажуулаад, хүргэлт эсвэл салбарынхаа сонголтыг хий. QPay зөвхөн merchant тохиргоо дууссаны дараа идэвхжинэ.": { en: "Check your order details and choose delivery or a store to collect from. QPay switches on once the merchant setup is finished.", ja: "ご注文内容をご確認のうえ、配送か店舗受取をお選びください。QPayは加盟店設定の完了後に有効になります。" },
  "24–48 цаг": { en: "24–48 hours", ja: "24〜48時間" },
  "-с эхэлнэ": { en: "and up", ja: "から" },
  "Merchant credentials орох хүртэл зөвхөн бэлэн мөнгөний захиалга ажиллана. Bank transfer болон картын төлбөр нь тохиргоогүй тул зориуд харагдахгүй байна.": { en: "Until the merchant credentials are in place, only cash orders go through. Bank transfer and card payment are deliberately hidden while they are unconfigured.", ja: "加盟店情報が登録されるまでは、現金でのご注文のみ承ります。銀行振込とカード決済は未設定のため、あえて表示していません。" },
  "Хэрэглэх": { en: "Apply", ja: "適用する" },
  "Дэлгэрэнгүйг": { en: "Full details on the", ja: "詳しくは" },
  "Нээгдсэн, ашигласан бүтээгдэхүүнийг зөвхөн бодит гэмтэлтэй эсвэл зарласан чанар/шинж чанараа хангаагүй үед л буцаана — таалагдаагүй, санаа өөрчлөгдсөн шалтгаанаар буцаах боломжгүй. Ариун цэврийн лац, савлагаа нээгдсэн эрүүл ахуйн бүтээгдэхүүнийг халдваргүйжлийн шалтгаанаар буцаах, солих боломж хязгаарлагдана.": { en: "An opened or used product can be returned only if it is genuinely faulty or fails the quality it was sold on — not because you changed your mind. Hygiene products whose seal or packaging has been opened are limited in what can be returned or exchanged, for reasons of infection control.", ja: "開封・使用済みの商品は、実際に不良がある場合、または表示された品質を満たさない場合にのみご返品いただけます（気に入らない、気が変わったという理由でのご返品はできません）。衛生シールや包装が開封された衛生用品は、衛生上の理由から返品・交換が制限されます。" },
  "Орос элчингийн салбар": { en: "Russian Embassy branch", ja: "ロシア大使館前店" },
  "Их наяд плаза": { en: "Ikh Nayad Plaza", ja: "イフ・ナヤド・プラザ店" },
  "Яармаг FOOD CITY": { en: "Yarmag FOOD CITY", ja: "ヤルマグ FOOD CITY店" },
  "Japan Town C6, Four Seasons Garden Center 3 давхар": { en: "Japan Town C6, Four Seasons Garden Center, 3rd floor", ja: "Japan Town C6、フォーシーズンズ・ガーデンセンター3階" },

  // -- 2026-09-13: the account pages, reviews and Q&A (Tom switched to 日本語
  // on /profile and most of it stayed Mongolian). Everything below came out
  // of a static sweep of the storefront sources against this dictionary. --

  // -- profile: navigation and overview -----------------------------------
  "Хувийн профайл": { en: "Personal details", ja: "お客様情報" },
  "Аюулгүй байдал": { en: "Security", ja: "セキュリティ" },
  "Профайлын цэс": { en: "Account menu", ja: "アカウントメニュー" },
  "Нэргүй хэрэглэгч": { en: "Unnamed customer", ja: "名前未設定" },
  "Сайн байна уу,": { en: "Hello,", ja: "こんにちは、" },
  "Сүүлийн захиалга": { en: "Latest order", ja: "最近のご注文" },
  "· Нийт": { en: "· Total", ja: "· 合計" },
  "Захиалгын явц болон дахин захиалах": { en: "Order progress and reordering", ja: "注文状況と再注文" },
  "Захиалгын явц (баталгаажсан, хүргэлтэд гарсан, хүргэгдсэн)": { en: "Order progress (confirmed, out for delivery, delivered)", ja: "注文状況（確定・配送中・配達済み）" },
  "Дахин захиалах": { en: "Reorder", ja: "再注文" },
  "Захиалга цуцлах": { en: "Cancel order", ja: "注文をキャンセル" },
  "Баримт (PDF)": { en: "Receipt (PDF)", ja: "領収書（PDF）" },
  "Баримт үүсгэх боломжгүй боллоо.": { en: "The receipt could not be generated.", ja: "領収書を作成できませんでした。" },
  "Захиалгыг цуцаллаа.": { en: "The order has been cancelled.", ja: "注文をキャンセルしました。" },
  "Захиалгыг цуцлах боломжгүй боллоо.": { en: "The order could not be cancelled.", ja: "注文をキャンセルできませんでした。" },
  "Энэ захиалгыг цуцлах уу? Энэ үйлдлийг буцаах боломжгүй.": { en: "Cancel this order? This cannot be undone.", ja: "この注文をキャンセルしますか？この操作は取り消せません。" },
  "Энэ захиалгын бүтээгдэхүүн(үүд) одоо каталогт байхгүй байна.": { en: "The product(s) in this order are no longer in the catalogue.", ja: "この注文の商品は現在カタログにありません。" },
  "Нэмэгдсэн бараа алга — нөөц дууссан байж магадгүй.": { en: "Nothing was added — the items may be out of stock.", ja: "追加できる商品がありません。在庫切れの可能性があります。" },
  "{n} бараа сагсанд нэмэгдлээ.": { en: "{n} item(s) added to your cart.", ja: "{n}点をカートに追加しました。" },
  "Өмнөх захиалгуудыг үзэх": { en: "Show earlier orders", ja: "以前の注文を見る" },
  "Хүргэлтийн дугаар:": { en: "Tracking number:", ja: "追跡番号:" },
  "Авах салбар: {branch}": { en: "Pickup store: {branch}", ja: "受取店舗: {branch}" },
  "Сонгогдоогүй": { en: "Not chosen", ja: "未選択" },
  "Хүргэгдсэн": { en: "Delivered", ja: "配達済み" },
  "Бэлтгэсэн": { en: "Prepared", ja: "準備完了" },
  "Төлөгдсөн": { en: "Paid", ja: "支払い済み" },
  "Төлбөр хүлээж буй": { en: "Awaiting payment", ja: "支払い待ち" },
  "Буцаан олгосон": { en: "Refunded", ja: "返金済み" },
  "Буцаан олголт хүлээгдэж буй": { en: "Refund pending", ja: "返金手続き中" },
  "{n} настай": { en: "{n} years old", ja: "{n}歳" },
  "{n} онд төрсөн": { en: "born in {n}", ja: "{n}年生まれ" },

  // -- profile: personal details ------------------------------------------
  "Нэр болон хүргэлтэд хэрэглэх утасны дугаар": { en: "Your name and the phone number used for deliveries", ja: "お名前と配送時に使用する電話番号" },
  "Имэйл": { en: "Email", ja: "メール" },
  "Хувийн мэдээлэл шинэчлэгдлээ.": { en: "Your details have been updated.", ja: "お客様情報を更新しました。" },
  "Зураг солих": { en: "Change photo", ja: "写真を変更" },
  "Зураг шинэчлэгдлээ.": { en: "Your photo has been updated.", ja: "写真を更新しました。" },
  "JPG, PNG, WEBP форматтай, 4 MB-аас бага зураг сонгоно уу.": { en: "Choose a JPG, PNG or WEBP image under 4 MB.", ja: "4MB未満のJPG・PNG・WEBP画像を選んでください。" },
  "Бүх талбарыг бөглөнө үү.": { en: "Please fill in every field.", ja: "すべての項目を入力してください。" },
  "Гүйцэтгэж чадсангүй. Дахин оролдоно уу.": { en: "That didn't go through. Please try again.", ja: "処理できませんでした。もう一度お試しください。" },

  // -- profile: preferences -----------------------------------------------
  "Таны тохиргоо": { en: "Your preferences", ja: "あなたの設定" },
  "Хувийн болон гоо сайхны/гэрийн профайл — танд тохирсон бүтээгдэхүүн санал болгоход ашиглагдана": { en: "Your personal, beauty and home profile — used to recommend products that suit you", ja: "パーソナル・美容・暮らしのプロフィール。あなたに合う商品のご提案に使われます" },
  "Профайл бөглөх": { en: "Fill in your profile", ja: "プロフィールを入力" },
  "6 асуулт, ~2 минут — танд тохирсон бүтээгдэхүүн санал болгоход тусална. Бүх асуулт заавал биш.": { en: "6 questions, about 2 minutes — helps us recommend products that suit you. Every question is optional.", ja: "6問・約2分。あなたに合う商品のご提案に役立ちます。すべて任意です。" },
  "Алхам {step} / {steps} — бүх асуулт заавал биш, хүссэн үедээ хаагаад дараа үргэлжлүүлж болно.": { en: "Step {step} of {steps} — every question is optional; close any time and continue later.", ja: "ステップ {step} / {steps}。すべて任意で、いつでも閉じて後で続けられます。" },
  "Хадгалахаас өмнө хариултаа шалгаарай. Дараа нь энэ профайлыг хүссэн үедээ дахин засаж болно.": { en: "Check your answers before saving. You can edit this profile again any time.", ja: "保存する前に回答をご確認ください。プロフィールは後からいつでも編集できます。" },
  "Хүргэлтийн хаяг тусад нь \"Хүргэлтийн хаяг\" таб дээр хадгалагдана — энэ зөвхөн зөвлөмжид ашиглагдана.": { en: "Delivery addresses are kept separately under the \"Addresses\" tab — this is only used for recommendations.", ja: "お届け先は「お届け先」タブに別途保存されます。こちらはおすすめのためだけに使われます。" },
  "Эрэгтэй": { en: "Male", ja: "男性" },
  "Эмэгтэй": { en: "Female", ja: "女性" },
  "Бусад": { en: "Other", ja: "その他" },
  "Хосолмол": { en: "Combination", ja: "混合肌" },
  "Холимог": { en: "Mixed", ja: "混合" },
  "Энгийн": { en: "Normal", ja: "普通肌" },
  "Эмзэг": { en: "Sensitive", ja: "敏感肌" },
  "Мэдрэг байдал": { en: "Sensitivity", ja: "敏感さ" },
  "Хуурайшилт": { en: "Dryness", ja: "乾燥" },
  "Үрчлээ, хөгшрөлт": { en: "Wrinkles and ageing", ja: "しわ・エイジング" },
  "Батга, бацлуур": { en: "Acne and breakouts", ja: "ニキビ・吹き出物" },
  "Толбо, пигмент": { en: "Dark spots and pigmentation", ja: "シミ・色素沈着" },
  "Уйтгар өнгө": { en: "Dullness", ja: "くすみ" },
  "Ширхэгжилт": { en: "Texture", ja: "肌のざらつき" },
  "Наранаас хамгаалах / UV": { en: "Sun protection / UV", ja: "日焼け対策・UV" },
  "Энгийн (цэвэрлэгч+тос)": { en: "Simple (cleanser + moisturiser)", ja: "シンプル（洗顔＋保湿）" },
  "Дунд зэрэг (+тонер/серум)": { en: "Moderate (+ toner / serum)", ja: "標準（＋化粧水・美容液）" },
  "Иж бүрэн (5+ алхам)": { en: "Full routine (5+ steps)", ja: "フルケア（5ステップ以上）" },
  "Будаг/хими хийсэн": { en: "Coloured / chemically treated", ja: "カラー・パーマあり" },
  "Гэмтсэн": { en: "Damaged", ja: "ダメージヘア" },
  "Хусам": { en: "Dandruff", ja: "フケ" },
  "Үс унах": { en: "Hair loss", ja: "抜け毛" },
  "Толгойн арьс мэдрэмтгий": { en: "Sensitive scalp", ja: "敏感な頭皮" },
  "Үнэргүй": { en: "Fragrance-free", ja: "無香料" },
  "Хөнгөн үнэртэй": { en: "Lightly scented", ja: "ほのかな香り" },
  "Цэцгийн үнэртэй": { en: "Floral", ja: "フローラル" },
  "Цитрус/шинэлэг үнэртэй": { en: "Citrus / fresh", ja: "シトラス・フレッシュ" },
  "Эрч хүч": { en: "Energy", ja: "エネルギー" },
  "Нойр": { en: "Sleep", ja: "睡眠" },
  "Дархлаа": { en: "Immunity", ja: "免疫" },
  "Хоол боловсруулалт": { en: "Digestion", ja: "消化" },
  "Жин хянах": { en: "Weight management", ja: "体重管理" },
  "Минимал": { en: "Minimal", ja: "ミニマル" },
  "Скандинав": { en: "Scandinavian", ja: "北欧" },
  "Жапанди": { en: "Japandi", ja: "ジャパンディ" },
  "Ваби-саби": { en: "Wabi-sabi", ja: "わびさび" },
  "Модерн": { en: "Modern", ja: "モダン" },

  // -- profile: wishlist, addresses ---------------------------------------
  "Таны хадгалсан бүтээгдэхүүнүүд": { en: "Products you have saved", ja: "保存した商品" },
  "Хүслийн жагсаалт хоосон байна. Бүтээгдэхүүний зураг дээрх зүрхэн дүрс дээр дарж нэмээрэй.": { en: "Your wishlist is empty. Tap the heart on a product image to add it.", ja: "お気に入りはまだありません。商品画像のハートを押して追加してください。" },
  "Хүслийн жагсаалтаас хасах": { en: "Remove from wishlist", ja: "お気に入りから削除" },
  "Сагслах": { en: "Add to cart", ja: "カートに入れる" },
  "Хадгалсан хаяг": { en: "Saved addresses", ja: "保存したお届け先" },
  "Захиалга хийхэд үндсэн хаяг автоматаар бөглөгдөнө": { en: "Your default address is filled in automatically at checkout", ja: "ご注文時に既定のお届け先が自動入力されます" },
  "Хадгалсан хаяг алга байна. Захиалга хийхдээ дахин бичихгүйн тулд эндээс нэмээрэй.": { en: "No saved addresses yet. Add one here so you don't have to type it at checkout.", ja: "保存したお届け先はありません。ご注文のたびに入力しなくて済むよう、ここで追加してください。" },
  "Хаяг нэмэх": { en: "Add address", ja: "お届け先を追加" },
  "Хаягийн нэр (жишээ: Гэр, Ажил)": { en: "Address label (e.g. Home, Work)", ja: "お届け先の名前（例：自宅、職場）" },
  "Гэр": { en: "Home", ja: "自宅" },
  "Хүлээн авагчийн нэр": { en: "Recipient name", ja: "受取人のお名前" },
  "Дэлгэрэнгүй хаяг": { en: "Full address", ja: "住所の詳細" },
  "Дүүрэг, хороо, байр, орц, тоот": { en: "District, khoroo, building, entrance, flat", ja: "区・ホロー・建物・入口・部屋番号" },
  "Үндсэн хаяг болгох": { en: "Make this my default address", ja: "既定のお届け先にする" },
  "Үндсэн болгох": { en: "Make default", ja: "既定にする" },
  "ҮНДСЭН": { en: "DEFAULT", ja: "既定" },
  "Засах": { en: "Edit", ja: "編集" },
  "Устгах": { en: "Delete", ja: "削除" },
  "Хаяг нэмэгдлээ.": { en: "Address added.", ja: "お届け先を追加しました。" },
  "Хаяг шинэчлэгдлээ.": { en: "Address updated.", ja: "お届け先を更新しました。" },
  "Хаяг устгагдлаа.": { en: "Address deleted.", ja: "お届け先を削除しました。" },
  "Энэ хаягийг устгах уу?": { en: "Delete this address?", ja: "このお届け先を削除しますか？" },

  // -- profile: notifications ---------------------------------------------
  "Ямар мэдээллийг имэйл/SMS-ээр авахаа удирдана": { en: "Choose what you receive by email or SMS", ja: "メール・SMSで受け取る内容を設定します" },
  "Ирэхээр мэдэгдэх болон бусад имэйл мэдэгдлүүд": { en: "Back-in-stock alerts and other email notifications", ja: "再入荷のお知らせなどのメール通知" },
  "SMS мэдэгдэл": { en: "SMS notifications", ja: "SMS通知" },
  "Захиалга, хүргэлттэй холбоотой богино мессеж": { en: "Short messages about your orders and deliveries", ja: "ご注文・配送に関するショートメッセージ" },
  "Push мэдэгдэл (энэ хөтөч)": { en: "Push notifications (this browser)", ja: "プッシュ通知（このブラウザ）" },
  "Push мэдэгдэл асаалаа.": { en: "Push notifications are on.", ja: "プッシュ通知をオンにしました。" },
  "Push мэдэгдэл унтраалаа.": { en: "Push notifications are off.", ja: "プッシュ通知をオフにしました。" },
  "Туршилтын мэдэгдэл илгээх": { en: "Send a test notification", ja: "テスト通知を送る" },
  "Туршилтын мэдэгдэл илгээлээ.": { en: "Test notification sent.", ja: "テスト通知を送りました。" },
  "Илгээгдсэнгүй — энэ хөтөч бүртгэлгүй байна.": { en: "Not sent — this browser isn't subscribed.", ja: "送信されませんでした。このブラウザは登録されていません。" },
  "Хөтөч мэдэгдэл илгээхийг зөвшөөрсөнгүй.": { en: "The browser didn't allow notifications.", ja: "ブラウザが通知を許可しませんでした。" },
  "Хөтчийн тохиргоонд мэдэгдэл хаагдсан байна.": { en: "Notifications are blocked in your browser settings.", ja: "ブラウザの設定で通知がブロックされています。" },
  "Энэ хөтөч/холболт push дэмждэггүй (HTTPS ба iPhone дээр \"Нүүр дэлгэцэд нэмэх\" шаардлагатай).": { en: "This browser or connection doesn't support push (HTTPS is required, and on iPhone the site must be added to the Home Screen).", ja: "このブラウザまたは接続ではプッシュ通知を利用できません（HTTPSが必要で、iPhoneでは「ホーム画面に追加」が必要です）。" },
  "Одоогоор эдгээр тохиргоо зөвхөн \"Ирэхээр мэдэгдэх\" (хүслийн жагсаалтын back-in-stock) мэдэгдэлд хамаарна. Захиалгын баталгаажуулах имэйл систем ирээдүйд нэмэгдэхэд мөн адил дагана.": { en: "For now these settings only apply to back-in-stock alerts from your wishlist. Order confirmation emails will follow the same settings once they are added.", ja: "現在この設定はお気に入りの再入荷通知にのみ適用されます。注文確認メールが追加された際も同じ設定に従います。" },

  // -- profile: security ---------------------------------------------------
  "Одоогийн нууц үг": { en: "Current password", ja: "現在のパスワード" },
  "Нууц үг шинэчлэх": { en: "Update password", ja: "パスワードを更新" },
  "Нууц үг амжилттай солигдлоо.": { en: "Your password has been changed.", ja: "パスワードを変更しました。" },
  "Шинэ нууц үг дор хаяж 8 тэмдэгт байх ёстой.": { en: "The new password must be at least 8 characters.", ja: "新しいパスワードは8文字以上にしてください。" },
  "Шинэ нууц үг таарахгүй байна.": { en: "The new passwords don't match.", ja: "新しいパスワードが一致しません。" },
  "Session удирдлага": { en: "Sessions", ja: "セッション管理" },
  "Бусад төхөөрөмж/хөтчөөс гарах": { en: "Sign out of other devices and browsers", ja: "他の端末・ブラウザからログアウト" },
  "Бүх төхөөрөмжөөс гарах": { en: "Sign out everywhere", ja: "すべての端末からログアウト" },
  "Бусад бүх төхөөрөмжийн session хүчингүй боллоо.": { en: "All other devices have been signed out.", ja: "他のすべての端末からログアウトしました。" },
  "Энэ таны БҮХ төхөөрөмж дээрх session-г хүчингүй болгоно (энэ хөтчийг оруулаад). Үргэлжлүүлэх үү?": { en: "This signs you out on ALL devices, including this browser. Continue?", ja: "このブラウザを含むすべての端末からログアウトします。続行しますか？" },
  "Баталгаажуулахын тулд нууц үгээ оруулна уу": { en: "Enter your password to confirm", ja: "確認のためパスワードを入力してください" },
  "Бүрмөсөн устгах": { en: "Delete permanently", ja: "完全に削除" },
  "Акаунт устгагдлаа.": { en: "Your account has been deleted.", ja: "アカウントを削除しました。" },
  "Энэ үйлдлийг буцаах боломжгүй. Таны хувийн мэдээлэл, хаяг, хүслийн жагсаалт бүрмөсөн устана (захиалгын түүх нягтлан бодох бүртгэлийн зорилгоор хадгалагдана).": { en: "This cannot be undone. Your personal details, addresses and wishlist are deleted for good (order history is kept for accounting).", ja: "この操作は取り消せません。お客様情報・お届け先・お気に入りは完全に削除されます（注文履歴は会計上の理由で保持されます）。" },

  // -- profile: help -------------------------------------------------------
  "Түгээмэл асуултууд болон холбоо барих": { en: "Frequently asked questions and contact", ja: "よくあるご質問とお問い合わせ" },
  "Хүргэлт хэдэн хоног болох вэ?": { en: "How long does delivery take?", ja: "配送にはどのくらいかかりますか？" },
  "Улаанбаатар доторх хүргэлт ихэвчлэн 24–48 цагийн дотор хийгдэнэ. Салбараас өөрөө авах бол захиалга баталгаажмагц бэлэн болно.": { en: "Delivery within Ulaanbaatar usually takes 24–48 hours. Store pickup is ready as soon as the order is confirmed.", ja: "ウランバートル市内の配送は通常24〜48時間です。店舗受取は注文確定後すぐにご用意できます。" },
  "Захиалгаа хэрхэн буцаах вэ?": { en: "How do I return an order?", ja: "注文を返品するには？" },
  "Хүлээн авсан бараанд гэмтэл, зөрүү илэрвэл савлагаа, баримтын хамт 9450-9911 дугаарт мэдэгдэнэ үү. Дэлгэрэнгүй нөхцөл Нүүр хуудасны \"Буцаалт\" хэсэгт бий.": { en: "If an item arrives damaged or differs from your order, keep the packaging and receipt and call 9450-9911. Full terms are under \"Returns\" on the homepage.", ja: "届いた商品に破損や相違があった場合は、包装と領収書を保管のうえ 9450-9911 までご連絡ください。詳しい条件はホームページの「返品」をご覧ください。" },
  "Төлбөрийн ямар сонголт байдаг вэ?": { en: "Which payment options are there?", ja: "支払い方法は何がありますか？" },
  "Бэлэн мөнгө (хүргэлт/салбарт хүлээн авахдаа), мөн QPay (merchant тохиргоо дуусмагц идэвхжинэ).": { en: "Cash on delivery or at the store, and QPay once the merchant setup is complete.", ja: "配達時または店舗での現金払い、および加盟店設定完了後のQPayです。" },
  "Миний мэдээллийг хэрхэн хамгаалдаг вэ?": { en: "How is my data protected?", ja: "個人情報はどのように保護されますか？" },
  "Төлбөрийн картын мэдээллийг сайт хадгалдаггүй. Дэлгэрэнгүй Нүүр хуудасны \"Хувийн нууцлал\" хэсэгт бий.": { en: "The site never stores card details. Full details are under \"Privacy\" on the homepage.", ja: "当サイトはカード情報を保存しません。詳しくはホームページの「プライバシー」をご覧ください。" },

  // -- profile: membership card and gift cards ----------------------------
  "Нийт худалдан авалтын дүнгээр автоматаар шатлан нэмэгддэг хөнгөлөлт": { en: "A discount that rises automatically with your total spend", ja: "累計購入額に応じて自動的に上がる割引" },
  "Утасны дугаараа \"Хувийн профайл\" хэсэгт бүртгүүлж картаа идэвхжүүлээрэй": { en: "Register your phone number under \"Personal details\" to activate your card", ja: "「お客様情報」で電話番号を登録するとカードが有効になります" },
  "Захиалга бүрт -": { en: "Every order -", ja: "毎回のご注文 -" },
  "\"{tier}\" шатанд (-{pct}%) хүрэхэд {left} дутуу байна.": { en: "{left} more to reach the \"{tier}\" tier (-{pct}%).", ja: "「{tier}」ランク（-{pct}%）まであと {left} です。" },
  "Үүнд манай салбарт биечлэн хийсэн {amount} худалдан авалтын түүх багтсан.": { en: "This includes {amount} of purchases made in our stores.", ja: "これには店舗でのご購入 {amount} が含まれています。" },
  "Та хамгийн дээд шатанд хүрсэн байна — баярлалаа!": { en: "You have reached the top tier — thank you!", ja: "最高ランクに到達しています。ありがとうございます！" },
  "{amount}-с эхлэн": { en: "from {amount}", ja: "{amount}から" },
  "0₮-с эхлэн": { en: "from 0₮", ja: "0₮から" },
  "Хямдралгүй": { en: "No discount", ja: "割引なし" },
  "Бэлгийн карт ашиглах": { en: "Redeem a gift card", ja: "ギフトカードを使う" },
  "Кодоо оруулахад дүн нь дэлгүүрийн зээл болж, дараагийн захиалгад ашиглагдана.": { en: "Enter the code and its value becomes store credit for your next order.", ja: "コードを入力すると、金額がストアクレジットになり次回のご注文で使えます。" },
  "Бэлгийн картын код": { en: "Gift card code", ja: "ギフトカードのコード" },
  "Ашиглах": { en: "Redeem", ja: "使う" },
  "{amount} дэлгүүрийн зээл нэмэгдлээ. Үлдэгдэл: {balance}": { en: "{amount} of store credit added. Balance: {balance}", ja: "ストアクレジット {amount} を追加しました。残高: {balance}" },

  // -- membership section on the homepage ---------------------------------
  "{tier} — {left} дутуу": { en: "{tier} — {left} to go", ja: "{tier} — あと{left}" },
  "Таны гишүүнчлэл: {tier} зэрэглэл, одоогийн хөнгөлөлт {discount}%, нийт худалдан авалт {spend}, нийт хэмнэсэн дүн {saved}, {next}.": { en: "Your membership: {tier} tier, current discount {discount}%, total spend {spend}, total saved {saved}, {next}.", ja: "あなたの会員ランク: {tier}、現在の割引 {discount}%、累計購入額 {spend}、累計節約額 {saved}、{next}。" },

  // -- reviews and Q&A ------------------------------------------------------
  "Сэтгэгдлүүд": { en: "Reviews", ja: "レビュー" },
  "Сэтгэгдэл үлдээх": { en: "Write a review", ja: "レビューを書く" },
  "Бүтээгдэхүүний талаарх сэтгэгдлээ бичнэ үү (заавал биш)": { en: "Tell us what you think of the product (optional)", ja: "商品の感想をお書きください（任意）" },
  "Нийтлэх": { en: "Post", ja: "投稿する" },
  "{n} од өгөх": { en: "Give {n} star(s)", ja: "星{n}つを付ける" },
  "Сэтгэгдэл нийтлэгдлээ. Баярлалаа!": { en: "Your review has been posted. Thank you!", ja: "レビューを投稿しました。ありがとうございます！" },
  "Сэтгэгдэл илгээж чадсангүй.": { en: "The review could not be sent.", ja: "レビューを送信できませんでした。" },
  "Та энэ бүтээгдэхүүнд сэтгэгдэл бичсэн байна. Баярлалаа!": { en: "You have already reviewed this product. Thank you!", ja: "この商品にはすでにレビューを投稿済みです。ありがとうございます！" },
  "Зөвхөн энэ бүтээгдэхүүнийг захиалсан хэрэглэгч сэтгэгдэл бичих боломжтой.": { en: "Only customers who have ordered this product can review it.", ja: "この商品をご注文いただいたお客様のみレビューを投稿できます。" },
  "Үнэлгээ өгсөн, сэтгэгдэл бичээгүй.": { en: "Rated, without a written review.", ja: "評価のみ（コメントなし）" },
  "Таалагдлаа": { en: "Like", ja: "いいね" },
  "Таалагдсанаа болих": { en: "Unlike", ja: "いいねを取り消す" },
  "Хариулах": { en: "Reply", ja: "返信" },
  "Хариулт": { en: "Reply", ja: "返信" },
  "Хариулт бичих…": { en: "Write a reply…", ja: "返信を書く…" },
  "Хариулт нийтлэгдлээ.": { en: "Your reply has been posted.", ja: "返信を投稿しました。" },
  "Болих": { en: "Cancel", ja: "キャンセル" },
  "Та": { en: "You", ja: "あなた" },
  "Хэрэглэгч": { en: "Customer", ja: "お客様" },
  "Худалдан авагч": { en: "Verified buyer", ja: "購入者" },
  "Нэвтэрсний дараа боломжтой.": { en: "Available once you are signed in.", ja: "ログイン後にご利用いただけます。" },
  "Алдаа гарлаа.": { en: "Something went wrong.", ja: "エラーが発生しました。" },
  "саяхан": { en: "just now", ja: "たった今" },
  "{n}мин": { en: "{n}m", ja: "{n}分前" },
  "{n}ц": { en: "{n}h", ja: "{n}時間前" },
  "{n}ө": { en: "{n}d", ja: "{n}日前" },
  "{n}сар": { en: "{n}mo", ja: "{n}か月前" },
  "{n}ж": { en: "{n}y", ja: "{n}年前" },
  "Асуулт, хариулт": { en: "Questions and answers", ja: "質問と回答" },
  "Энэ барааны талаар асуултаа бичээрэй — ажилтан эсвэл өмнө авсан хэрэглэгч хариулна.": { en: "Ask a question about this product — a staff member or a previous buyer will answer.", ja: "この商品について質問してください。スタッフまたは購入者がお答えします。" },
  "Асуулт асуух": { en: "Ask a question", ja: "質問する" },
  "Асуулт": { en: "Question", ja: "質問" },
  "Асуултууд": { en: "Questions", ja: "質問一覧" },
  "Асуулт хараахан алга. Хамгийн түрүүнд асуугаарай.": { en: "No questions yet. Be the first to ask.", ja: "まだ質問はありません。最初の質問をどうぞ。" },
  "Жишээ: Хуурай, мэдрэмтгий арьсанд тохирох уу?": { en: "For example: Is it suitable for dry, sensitive skin?", ja: "例：乾燥肌・敏感肌にも合いますか？" },
  "Дор хаяж 5 тэмдэгт": { en: "At least 5 characters", ja: "5文字以上" },
  "Асуулт асуухын тулд нэвтэрнэ үү.": { en: "Sign in to ask a question.", ja: "質問するにはログインしてください。" },
  "Асуулт нийтлэгдлээ. Ажилтан эсвэл худалдан авагч удахгүй хариулна.": { en: "Your question has been posted. A staff member or buyer will answer soon.", ja: "質問を投稿しました。スタッフまたは購入者がまもなくお答えします。" },
  "Хариулт хүлээгдэж байна": { en: "Awaiting an answer", ja: "回答待ち" },
  "Ачаалж байна…": { en: "Loading…", ja: "読み込み中…" },

  // -- product page ----------------------------------------------------------
  "Бүтээгдэхүүнийг ачаалж байна": { en: "Loading the product", ja: "商品を読み込み中" },
  "Ачааллаж байна...": { en: "Loading...", ja: "読み込み中..." },
  "Бүтээгдэхүүн олдсонгүй.": { en: "Product not found.", ja: "商品が見つかりません。" },
  "Таны хайсан бүтээгдэхүүн одоогоор нийтлэгдээгүй, эсвэл холбоос өөрчлөгдсөн байж болно. Манай каталогоос бусад сонголтыг хараарай.": { en: "The product you're looking for isn't published yet, or the link has changed. Have a look at the rest of our catalogue.", ja: "お探しの商品はまだ公開されていないか、リンクが変更された可能性があります。カタログの他の商品をご覧ください。" },
  "Бүтээгдэхүүнүүдийг харах": { en: "Browse products", ja: "商品を見る" },
  "Энэ бүтээгдэхүүн": { en: "This product is part of the", ja: "この商品は" },
  "арчилгааны дараалалд багтдаг.": { en: "care routine.", ja: "ケアルーティンに含まれています。" },
  "Бүтэн routine-г үзэх": { en: "See the full routine", ja: "ルーティン全体を見る" },
  "Routine-оо дуусга": { en: "Complete your routine", ja: "ルーティンを完成させる" },
  "ROUTINE-ОО ДУУСГА": { en: "COMPLETE YOUR ROUTINE", ja: "ルーティンを完成させる" },
  "АРЬС АРЧИЛГАА": { en: "SKINCARE", ja: "スキンケア" },
  "Бүгдийг хамт авбал -{pct}%": { en: "Buy them all together for -{pct}%", ja: "まとめて購入で -{pct}%" },
  "{pct}% хямдралтай.": { en: "{pct}% off.", ja: "{pct}%オフ。" },
  "сагслах": { en: "add to cart", ja: "カートに入れる" },
  "Хувилбар сонгох": { en: "Choose an option", ja: "オプションを選択" },
  "{name} — нөөц дууссан": { en: "{name} — out of stock", ja: "{name} — 在庫切れ" },
  "{name} сагсанд нэмэгдлээ.": { en: "{name} has been added to your cart.", ja: "{name}をカートに追加しました。" },
  "Зөвхөн {n} ширхэг үлдсэн — удахгүй дуусна!": { en: "Only {n} left — selling fast!", ja: "残り{n}点。まもなく完売！" },

  // -- shop ------------------------------------------------------------------
  "Каталогийг бэлдэж байна": { en: "Preparing the catalogue", ja: "カタログを準備中" },
  "Каталогийг ачаалж чадсангүй.": { en: "The catalogue could not be loaded.", ja: "カタログを読み込めませんでした。" },
  "Интернэт холболтоо шалгаад дахин оролдоно уу.": { en: "Check your internet connection and try again.", ja: "インターネット接続を確認して、もう一度お試しください。" },
  "Хайж байна": { en: "Searching", ja: "検索中" },
  "Энэ удаа тохирох бүтээгдэхүүн олдсонгүй.": { en: "No matching products this time.", ja: "該当する商品が見つかりませんでした。" },
  "Өөр хайлтын үг хэрэглэж үзэх эсвэл бүх ангиллыг дахин хараарай.": { en: "Try a different search term, or browse all categories again.", ja: "別のキーワードで検索するか、すべてのカテゴリーをご覧ください。" },
  "Шүүлтүүр арилгах": { en: "Clear filters", ja: "絞り込みを解除" },
  "{label} шүүлтүүрийг хасах": { en: "Remove the {label} filter", ja: "{label} の絞り込みを解除" },
  "Хайлт: {term}": { en: "Search: {term}", ja: "検索: {term}" },
  "Арьсны төрөл: {type}": { en: "Skin type: {type}", ja: "肌タイプ: {type}" },
  "Үнэ: {range}": { en: "Price: {range}", ja: "価格: {range}" },
  "үр дүн /": { en: "results /", ja: "件 /" },
  "Таны өмнө үзсэн {n} бүтээгдэхүүн одоогоор онлайн каталогоос хасагдсан байна.": { en: "{n} of the products you viewed earlier are no longer in the online catalogue.", ja: "以前ご覧になった商品のうち{n}点は、現在オンラインカタログにありません。" },
  "Таны өмнө үзсэн {n} бүтээгдэхүүн одоогоор онлайн каталогоос хасагдсан байна. Шинэ сонголт нэмэгдэхэд энд дахин гарна.": { en: "{n} of the products you viewed earlier are no longer in the online catalogue. They'll show up here again when new stock is added.", ja: "以前ご覧になった商品のうち{n}点は、現在オンラインカタログにありません。新しい商品が追加されると再びここに表示されます。" },
  // The greeting's fallback when a customer has no name on file: "Сайн байна уу, Танд."
  "Танд": { en: "there", ja: "お客様" },
  "Таны үзсэн бүтээгдэхүүн энд гарна. Бодит каталог нийтлэгдсэний дараа бүтээгдэхүүний картнаас “Шуурхай харах” эсвэл дэлгэрэнгүй хуудас нээгээрэй.": { en: "Products you view will appear here. Open “Quick view” or the product page from any product card.", ja: "ご覧になった商品がここに表示されます。商品カードから「クイックビュー」または詳細ページを開いてください。" },
  "Дор хаяж {n} тэмдэгт оруулна уу.": { en: "Type at least {n} characters.", ja: "{n}文字以上入力してください。" },
  "“{term}” -г бүх дэлгүүрээс харах →": { en: "See “{term}” across the whole shop →", ja: "「{term}」をショップ全体で見る →" },
  "Хайлт цэвэрлэх": { en: "Clear search", ja: "検索をクリア" },
  "брэнд ·": { en: "brands ·", ja: "ブランド ·" },

  // -- cart, checkout, order confirmation ------------------------------------
  "Улаанбаатар хүргэлт:": { en: "Delivery in Ulaanbaatar:", ja: "ウランバートル市内配送:" },
  "(эсвэл салбараас": { en: "(or collect from a store for", ja: "（または店舗受取なら" },
  "авах). Дээрх дүн хүргэлтийн төлбөр орохгүй.": { en: "). The total above doesn't include delivery.", ja: "）。上記の金額に配送料は含まれていません。" },
  "24–48 цаг ·": { en: "24–48 hours ·", ja: "24〜48時間 ·" },
  "Нэр, утас, хүргэлт эсвэл авах салбарын мэдээллээ бүрэн оруулна уу.": { en: "Please fill in your name, phone, and delivery or pickup details.", ja: "お名前・電話番号・配送先または受取店舗をすべて入力してください。" },
  "Сагс хоосон байна. Бүтээгдэхүүн сонгоод дахин оролдоно уу.": { en: "Your cart is empty. Choose some products and try again.", ja: "カートは空です。商品を選んでからもう一度お試しください。" },
  "Хямдралын код оруулна уу.": { en: "Enter a discount code.", ja: "割引コードを入力してください。" },
  "Хямдралын код (": { en: "Discount code (", ja: "割引コード（" },
  "Гишүүнчлэлийн хямдрал (": { en: "Membership discount (", ja: "会員割引（" },
  "Гишүүнчлэлийн хямдрал": { en: "Membership discount", ja: "会員割引" },
  "” код хэрэгжлээ!": { en: "” applied!", ja: "」を適用しました！" },
  "QR болон банкны апп": { en: "QR code and banking apps", ja: "QRコード・銀行アプリ" },
  "Банкны апп": { en: "Banking app", ja: "銀行アプリ" },
  "Merchant тохиргоо хүлээгдэж байна": { en: "Waiting for merchant setup", ja: "加盟店設定の完了待ち" },
  "Мерчант тохиргоо хүлээгдэж байна": { en: "Waiting for merchant setup", ja: "加盟店設定の完了待ち" },
  "QPay merchant credentials ороогүй тул бодит төлбөр одоогоор идэвхгүй.": { en: "Live payment is off until the QPay merchant credentials are in place.", ja: "QPayの加盟店情報が登録されるまで、実際の決済は無効です。" },
  "Мерчантын мэдээлэл ороогүй тул StorePay одоогоор идэвхгүй.": { en: "StorePay is off until the merchant details are in place.", ja: "加盟店情報が登録されるまで、StorePayは無効です。" },
  "QPay нэхэмжлэл бэлэн боллоо.": { en: "Your QPay invoice is ready.", ja: "QPayの請求書を発行しました。" },
  "QPay нэхэмжлэл #": { en: "QPay invoice #", ja: "QPay請求書 #" },
  "StorePay хүсэлт #": { en: "StorePay request #", ja: "StorePay申請 #" },
  "StorePay тохиргоо хүлээгдэж байна": { en: "Waiting for StorePay setup", ja: "StorePay設定の完了待ち" },
  "Хэсэгчилсэн төлбөр — StorePay апп дээрээ зөвшөөрнө": { en: "Pay in instalments — approve in your StorePay app", ja: "分割払い — StorePayアプリで承認" },
  "StorePay хүсэлт илгээгдлээ — утсаа шалгана уу.": { en: "StorePay request sent — check your phone.", ja: "StorePayの申請を送信しました。スマートフォンをご確認ください。" },
  "StorePay-ийн боломжит дүн хүрэхгүй байна.": { en: "Your StorePay limit isn't enough.", ja: "StorePayの利用可能額が不足しています。" },
  "{possible} боломжтой, захиалга {total}. Өөр төлбөрийн хэлбэр сонгоно уу.": { en: "{possible} available, order total {total}. Please choose another payment method.", ja: "利用可能額 {possible}、注文合計 {total}。別のお支払い方法をお選びください。" },
  "{phone} дугаарт {limit} хүртэл боломжтой байна.": { en: "Up to {limit} is available on {phone}.", ja: "{phone} では {limit} までご利用いただけます。" },
  "{phone} дугаарт одоогоор {possible} л боломжтой байна — энэ захиалгын {total}-д хүрэхгүй.": { en: "Only {possible} is currently available on {phone} — not enough for this order's {total}.", ja: "{phone} では現在 {possible} のみ利用可能で、この注文の {total} には足りません。" },
  "{phone} дугаарт StorePay-ийн зээл одоогоор боломжгүй байна.": { en: "StorePay credit isn't currently available on {phone}.", ja: "{phone} では現在StorePayの与信をご利用いただけません。" },
  "{phone} дугаарын StorePay апп дээр хүсэлт очлоо. Апп дээрээ зөвшөөрсний дараа захиалга автоматаар баталгаажна.": { en: "A request has been sent to the StorePay app on {phone}. Once you approve it there, the order is confirmed automatically.", ja: "{phone} のStorePayアプリに申請を送信しました。アプリで承認すると注文が自動的に確定します。" },
  "Таны захиалгыг хүлээн авлаа. Явцыг доорх дугаар болон утасны дугаараараа “Захиалгаа хянах” хуудаснаас хэдийч шалгаж болно.": { en: "We've received your order. You can follow its progress any time on the “Track an order” page with the number below and your phone number.", ja: "ご注文を承りました。下記の注文番号と電話番号で「注文状況の確認」ページからいつでも状況をご確認いただけます。" },
  "Хүргэх хаяг: {address}": { en: "Delivery address: {address}", ja: "お届け先: {address}" },
  "Салбараас авах: {branch}": { en: "Store pickup: {branch}", ja: "店舗受取: {branch}" },
  "Нийт дүн": { en: "Total", ja: "合計金額" },
  "Захиалгын дугаар болон утасны дугаараа оруулна уу.": { en: "Enter your order number and phone number.", ja: "注文番号と電話番号を入力してください。" },
  "Хайлт амжилтгүй боллоо. Дахин оролдоно уу.": { en: "The search failed. Please try again.", ja: "検索に失敗しました。もう一度お試しください。" },

  // -- sign in, password reset ------------------------------------------------
  "Утасны дугаар болон нууц үгээ оруулна уу.": { en: "Enter your phone number and password.", ja: "電話番号とパスワードを入力してください。" },
  "Нууц үгээ оруулна уу.": { en: "Enter your password.", ja: "パスワードを入力してください。" },
  "Нэр (сонголтоор)": { en: "Name (optional)", ja: "お名前（任意）" },
  "Бүртгэл дуусгах": { en: "Finish signing up", ja: "登録を完了する" },
  "Утасны дугаар баталгаажлаа. Одоо нэр (сонголтоор) болон нууц үгээ тохируулаад бүртгэлээ дуусгана уу.": { en: "Your phone number is confirmed. Now set a name (optional) and a password to finish signing up.", ja: "電話番号を確認しました。お名前（任意）とパスワードを設定して登録を完了してください。" },
  "Бүртгэл үүсгэхийн тулд эхлээд утасны дугаараа SMS-ээр баталгаажуулна уу.": { en: "To create an account, first confirm your phone number by SMS.", ja: "アカウントを作成するには、まずSMSで電話番号を確認してください。" },
  "Таны эрх түр хаагдсан байна.": { en: "Your account is temporarily suspended.", ja: "アカウントは一時的に停止されています。" },
  "Facebook-ээр үргэлжлүүлэх": { en: "Continue with Facebook", ja: "Facebookで続ける" },
  "Facebook нэвтрэлтийг цуцаллаа.": { en: "Facebook sign-in was cancelled.", ja: "Facebookログインをキャンセルしました。" },
  "Facebook-ээр нэвтрэх боломжгүй боллоо. Утасны дугаараар нэвтэрнэ үү.": { en: "Facebook sign-in isn't available right now. Please sign in with your phone number.", ja: "現在Facebookでログインできません。電話番号でログインしてください。" },
  "Энэ Facebook данс өөр бүртгэлтэй холбогдсон байна.": { en: "This Facebook account is already linked to another account.", ja: "このFacebookアカウントは別のアカウントに連携済みです。" },
  "Утасны дугаар баталгаажлаа. Шинэ нууц үгээ оруулна уу.": { en: "Your phone number is confirmed. Enter a new password.", ja: "電話番号を確認しました。新しいパスワードを入力してください。" },
  "Нууц үг дор хаяж 8 тэмдэгт байх ёстой.": { en: "The password must be at least 8 characters.", ja: "パスワードは8文字以上にしてください。" },
  "Нууц үг таарахгүй байна.": { en: "The passwords don't match.", ja: "パスワードが一致しません。" },
  "Дахин оруулна уу": { en: "Enter it again", ja: "もう一度入力" },
  "Таны нууц үг амжилттай шинэчлэгдлээ. Одоо шинэ нууц үгээрээ нэвтэрч болно.": { en: "Your password has been updated. You can sign in with the new one now.", ja: "パスワードを更新しました。新しいパスワードでログインできます。" },
  "Нэвтрэх хуудас руу": { en: "To the sign-in page", ja: "ログイン画面へ" },

  // -- journal, routines, misc pages --------------------------------------------
  "Бүх нийтлэл": { en: "All articles", ja: "記事一覧" },
  "Нийтлэлүүдийг ачаалж байна": { en: "Loading articles", ja: "記事を読み込み中" },
  "Одоогоор нийтлэл алга.": { en: "No articles yet.", ja: "まだ記事はありません。" },
  "МЭДЭЭ": { en: "NEWS", ja: "ニュース" },
  "Мэдээг ачаалж байна": { en: "Loading the article", ja: "記事を読み込み中" },
  "Мэдээ олдсонгүй.": { en: "Article not found.", ja: "記事が見つかりません。" },
  "Энэ мэдээ нийтлэгдээгүй, устгагдсан, эсвэл холбоос буруу байж болно.": { en: "This article isn't published, has been removed, or the link is wrong.", ja: "この記事は未公開か削除されたか、リンクが間違っている可能性があります。" },
  "← Нүүр хуудас руу буцах": { en: "← Back to the homepage", ja: "← ホームに戻る" },
  "Сүүлд шинэчилсэн:": { en: "Last updated:", ja: "最終更新:" },
  "Routine ачаалж байна": { en: "Loading the routine", ja: "ルーティンを読み込み中" },
  "Routine олдсонгүй.": { en: "Routine not found.", ja: "ルーティンが見つかりません。" },
  "Таны хайсан routine одоогоор нийтлэгдээгүй, эсвэл холбоос өөрчлөгдсөн байж болно.": { en: "The routine you're looking for isn't published yet, or the link has changed.", ja: "お探しのルーティンはまだ公開されていないか、リンクが変更された可能性があります。" },
  "Дэлгүүр рүү очих": { en: "Go to the shop", ja: "ショップへ" },
  "Routine-ийн тухай": { en: "About this routine", ja: "このルーティンについて" },
  "Энэхүү арчилгааны дараалал нь SUGI ASAYAKE-ийн сонгосон бүтээгдэхүүнүүдээс бүрдэнэ. Алхам бүрийг дараалан хэрэглэхийг зөвлөж байна.": { en: "This care routine is made up of products chosen by SUGI ASAYAKE. We recommend using each step in order.", ja: "このケアルーティンはSUGI ASAYAKEが選んだ商品で構成されています。各ステップを順番にお使いください。" },
  "Арчилгааны алхамууд": { en: "Routine steps", ja: "ケアのステップ" },
  "АЛХАМ": { en: "STEP", ja: "ステップ" },
  "Багцаар авбал -{pct}% ({saved} хэмнэнэ)": { en: "-{pct}% as a set (save {saved})", ja: "セット購入で -{pct}%（{saved} お得）" },
  "Хямдрал нь захиалга баталгаажуулах үед, сагсанд routine-ийн бүх бараа байгаа тохиолдолд автоматаар тооцогдоно.": { en: "The discount is applied automatically at checkout when every product in the routine is in your cart.", ja: "ルーティンの全商品がカートにあると、ご注文確定時に割引が自動的に適用されます。" },
  "Бүгдийг сагслах": { en: "Add all to cart", ja: "すべてカートに入れる" },
  "Одоогоор бүх бараа нөөцгүй байна.": { en: "All of these products are currently out of stock.", ja: "現在すべての商品が在庫切れです。" },
  "Бүх {n} бараа сагсанд орлоо.": { en: "All {n} products are in your cart.", ja: "{n}点すべてをカートに追加しました。" },
  "{n} бараа сагсанд орлоо ({skipped} нөөцгүй тул алгассан).": { en: "{n} products added to your cart ({skipped} skipped — out of stock).", ja: "{n}点をカートに追加しました（在庫切れの{skipped}点はスキップ）。" },
  // -- cookie banner (Silktide, vendor-rendered from the cookie-text-* site text) ---
  "Күки (cookie) гэдэг нь таны сагс, нэвтэрсэн төлөвийг санах жижиг файл. Та зөвшөөрвөл бид нэмээд сайтад хэдэн хүн орж байгааг нэргүйгээр тоолж, сайтаа сайжруулна. Хувийн мэдээллийг тань хэнд ч өгөхгүй.": { en: "A cookie is a small file that remembers your cart and whether you are signed in. If you agree, we also count anonymously how many people visit, to improve the site. Your personal data is never given to anyone.", ja: "Cookieは、カートの中身やログイン状態を記憶する小さなファイルです。同意いただくと、サイト改善のために訪問者数を匿名で集計します。個人情報を第三者に渡すことはありません。" },
  "За, зөвшөөрч байна": { en: "OK, I agree", ja: "はい、同意します" },
  "Зөвхөн сагс, нэвтрэлтэд хэрэгтэйг нь": { en: "Only what the cart and sign-in need", ja: "カートとログインに必要なもののみ" },
  "Күки гэж юу вэ?": { en: "What are cookies?", ja: "Cookieとは？" },
  "SUGI ASAYAKE сайт хоёр төрлийн күки хэрэглэдэг. Доороос аль нэгийг нь асааж, унтрааж болно.": { en: "SUGI ASAYAKE uses two kinds of cookies. You can switch either on or off below.", ja: "SUGI ASAYAKEは2種類のCookieを使用しています。以下でそれぞれオン・オフを切り替えられます。" },
  "Хадгалах": { en: "Save", ja: "保存" },
  "Заавал хэрэгтэй (сагс, нэвтрэлт)": { en: "Essential (cart, sign-in)", ja: "必須（カート・ログイン）" },
  "Таны сагсанд хийсэн бараа, нэвтэрсэн төлөвийг санахад хэрэгтэй. Үүнгүйгээр сайт ажиллахгүй тул унтраах боломжгүй.": { en: "Needed to remember what is in your cart and that you are signed in. The site cannot work without it, so it cannot be switched off.", ja: "カートの中身とログイン状態を記憶するために必要です。これがないとサイトが動作しないため、オフにはできません。" },
  "Тоолуур (нэргүй статистик)": { en: "Counter (anonymous statistics)", ja: "カウンター（匿名の統計）" },
  "Сайтад өдөрт хэдэн хүн орж, аль хуудсыг үзэж байгааг нэргүйгээр тоолно — та хэн болохыг мэдэхгүй. Google, Facebook зэрэг гадны компанид юу ч илгээхгүй.": { en: "Counts anonymously how many people visit each day and which pages they see — it does not know who you are. Nothing is sent to Google, Facebook or any other third party.", ja: "1日の訪問者数と閲覧されたページを匿名で集計します。あなたが誰かは分かりません。GoogleやFacebookなどの第三者には何も送信しません。" },
  "Күүкийн тохиргоог хаах": { en: "Close cookie settings", ja: "Cookie設定を閉じる" },
  // The shop hero kicker renders its three lines as separate nodes; the last one is Cyrillic.
  "УЛААНБААТАР / MONGOLIA": { en: "ULAANBAATAR / MONGOLIA", ja: "ウランバートル / MONGOLIA" },
  "Агуулга руу очих": { en: "Skip to content", ja: "本文へ移動" },
  "Шууд орсон": { en: "Direct", ja: "直接アクセス" },
  "{label} хуудас нээх": { en: "Open our {label} page", ja: "{label}ページを開く" },
  "Хүслийн жагсаалт, {n} бараатай": { en: "Wishlist, {n} item(s)", ja: "お気に入り（{n}点）" },
  "Гэнэтийн алдаа гарлаа": { en: "Something went wrong", ja: "予期しないエラーが発生しました" },
  "Уучлаарай. Хуудсыг дахин ачаалбал ихэнхдээ засагдана. Давтагдвал админд мэдэгдээрэй.": { en: "Sorry about that. Reloading the page usually fixes it; if it keeps happening, let the admin know.", ja: "申し訳ありません。ページを再読み込みすると通常は解決します。繰り返す場合は管理者にお知らせください。" },
  "Дахин ачаалах": { en: "Reload", ja: "再読み込み" },
  "Техникийн мэдээлэл": { en: "Technical details", ja: "技術情報" },
  "Сайт шинэчлэгдсэн байна": { en: "The site has been updated", ja: "サイトが更新されました" },
  "Энэ хуудас нээлттэй байх хооронд сайтын шинэ хувилбар гарсан тул дахин ачаалах шаардлагатай.": { en: "A new version of the site was released while this page was open, so it needs to be reloaded.", ja: "このページを開いている間にサイトの新しいバージョンが公開されたため、再読み込みが必要です。" },
  "Сайт шинэчлэгдсэн тул дахин ачаалж байна…": { en: "The site was updated — reloading…", ja: "サイトが更新されたため再読み込みしています…" },
  "SUGI ASAYAKE Mongolia — Японоос баталгаат бүтээгдэхүүнүүдийг албан ёсны эрхтэйгээр хүргэж байна. Улаанбаатар хотод {N} салбартай.": { en: "SUGI ASAYAKE Mongolia — authentic Japanese products under official licence, with {N} stores in Ulaanbaatar.", ja: "SUGI ASAYAKE Mongolia — 日本の正規品を正式なライセンスのもとでお届け。ウランバートルに{N}店舗。" },
  "Нэг өдөрт\nхэрэгтэй бүх зүйл": { en: "Everything you need\nin a day", ja: "一日に必要な\nすべて" },
  "Танд\nсанал болгож байна.": { en: "Recommended\nfor you.", ja: "あなたへの\nおすすめ。" },
  "Холбоос буруу байж болзошгүй, эсвэл хуудас зөөгдсөн байна. Нүүр хуудас руу буцаж дахин хайж үзээрэй.": { en: "The link may be wrong, or the page has moved. Go back to the homepage and try again.", ja: "リンクが間違っているか、ページが移動した可能性があります。ホームに戻ってもう一度お探しください。" },
};

/**
 * Trailing decoration an admin may have typed after a phrase -- an emoji,
 * an exclamation mark, a full stop. Tom's own hero copy ends in an emoji,
 * which made an exact lookup miss a phrase the dictionary already had. The
 * decoration is peeled off for the lookup and put back on the translation.
 */
const TRAILING_DECORATION = /(?:[\s!.…/·,\u2013\u2014]|\p{Extended_Pictographic}|️|‍)+$/u;

/** The same, at the front: JSX splits headings around an emphasis. */
const LEADING_DECORATION = /^(?:[\s/·,\u2013\u2014]|\p{Extended_Pictographic}|️|‍)+/u;

/**
 * Every phrase, indexed by all three of its wordings.
 *
 * The page translator (client/src/components/TranslateSurface.tsx) reads
 * the words it translates out of the DOM the app has already rendered, so
 * the moment a visitor switches once, the page is no longer in Mongolian.
 * Looking English up under a Mongolian key found nothing, and the page was
 * left half-switched until a reload (2026-09-12, Tom: "language solihoor
 * hagas dutuu soligdood baiuna zaawal refresh hiij baij buren soligdoj
 * baina"). Indexing an entry under its English and Japanese wordings too
 * makes every direction work -- including back to Mongolian -- with no
 * memory of what a node used to say.
 */
type Phrase = { mn: string; en: string; ja: string };

const phraseFor = (mn: string, entry: { en: string; ja: string }): Phrase => ({ mn, en: entry.en, ja: entry.ja });

/**
 * Entries whose key carries a {placeholder} are patterns, not fixed
 * phrases. A great many labels are assembled at runtime from data -- a
 * product name, a branch name, a count -- so the finished string is never
 * literally in the dictionary: "MASSEMOLLY-г сагсанд нэмэх" is built from
 * a product row. Matching those as patterns translates them without
 * threading a t() call through every component that builds one.
 *
 * A placeholder name means nothing but "the same piece, moved": {name} may
 * land before or after the verb, as each language needs.
 */
const PLACEHOLDER = /\{(\w+)\}/g;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Placeholders that only ever hold a number. "{n}ц" (a review's age, "2ц")
 * must not swallow every text node that happens to end in ц -- with the
 * loose (.+?) it would have rewritten "Багц" into "Баh". Anything else
 * ({name}, {tier}, {amount} with its ₮) keeps the loose match.
 */
const NUMERIC_PLACEHOLDERS = new Set(["n", "N", "count", "pct", "discount", "step", "steps"]);

/** The wording as a regular expression, with the placeholder names it uses. */
const compile = (form: string) => {
  const names: string[] = [];
  let pattern = "";
  let last = 0;
  for (const match of form.matchAll(PLACEHOLDER)) {
    pattern += escapeRegExp(form.slice(last, match.index));
    pattern += NUMERIC_PLACEHOLDERS.has(match[1]) ? "([\\d][\\d.,\\s]*?)" : "(.+?)";
    names.push(match[1]);
    last = match.index + match[0].length;
  }
  pattern += escapeRegExp(form.slice(last));
  return { test: new RegExp(`^${pattern}$`, "s"), names };
};

const EXACT = new Map<string, Phrase>();
const PATTERNS: { test: RegExp; names: string[]; phrase: Phrase }[] = [];

for (const [mn, entry] of Object.entries(UI_STRINGS)) {
  const phrase = phraseFor(mn, entry);
  const forms = [phrase.en, phrase.ja, phrase.mn];
  if (mn.includes("{")) {
    // Mongolian last, so a phrase that is its own translation still reads back.
    for (const form of forms) PATTERNS.push({ ...compile(form), phrase });
  } else {
    for (const form of forms) EXACT.set(form, phrase);
  }
}

// Longest first, so a specific pattern wins over a looser one.
PATTERNS.sort((a, b) => b.test.source.length - a.test.source.length);

const fillPattern = (text: string, locale: Locale) => {
  for (const { test, names, phrase } of PATTERNS) {
    const found = text.match(test);
    if (!found) continue;
    return phrase[locale].replace(PLACEHOLDER, (whole, name: string) => {
      const index = names.indexOf(name);
      // A piece can be translatable itself: a branch name dropped into
      // "{branch} — Google Maps дээр нээх" has an entry of its own.
      return index === -1 ? whole : translate(found[index + 1], locale);
    });
  }
  return null;
};

/**
 * Every lookup is remembered. The page translator walks the whole DOM on
 * every animation frame that changes it, so the same few hundred strings
 * are looked up over and over; without this the patterns would be re-tested
 * thousands of times a second.
 */
const memo = new Map<string, string>();

/** Translate a phrase into `locale`, from whichever language it is in now. */
export const translate = (text: string, locale: Locale): string => {
  if (!text) return text;
  const cacheKey = `${locale}|${text}`;
  const remembered = memo.get(cacheKey);
  if (remembered !== undefined) return remembered;

  const result = lookUp(text, locale);
  // A visitor can browse a long catalogue; forget everything rather than
  // grow without bound, since re-filling is cheap.
  if (memo.size > 4000) memo.clear();
  memo.set(cacheKey, result);
  return result;
};

const lookUp = (text: string, locale: Locale): string => {
  const trimmed = text.trim();
  const direct = EXACT.get(trimmed);
  if (direct) return direct[locale];
  const decorated = trimmed.match(TRAILING_DECORATION);
  if (decorated) {
    const entry = EXACT.get(trimmed.slice(0, trimmed.length - decorated[0].length));
    if (entry) return entry[locale] + decorated[0];
  }
  const led = trimmed.match(LEADING_DECORATION);
  if (led) {
    const entry = EXACT.get(trimmed.slice(led[0].length));
    if (entry) return led[0] + entry[locale];
  }
  // A phrase that differs only by a final full stop is the same phrase.
  const withDot = EXACT.get(trimmed + ".");
  if (withDot) return withDot[locale];
  const filled = fillPattern(trimmed, locale);
  if (filled !== null) return filled;
  return text;
};
