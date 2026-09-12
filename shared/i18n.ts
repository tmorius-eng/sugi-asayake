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
};

/** Translate a Mongolian source string, falling back to it unchanged. */
export const translate = (text: string, locale: Locale): string => {
  if (locale === "mn" || !text) return text;
  const entry = UI_STRINGS[text.trim()];
  return entry ? entry[locale] : text;
};
