import { describe, expect, it } from "vitest";
import { normaliseForModeration, screenTextLexically } from "./_core/moderation";

const rejected = (text: string) => {
  const v = screenTextLexically(text);
  return v.allowed ? null : v.category;
};

describe("normaliseForModeration", () => {
  it("folds leetspeak, look-alikes and separators", () => {
    expect(normaliseForModeration("F.U.C.K").joined).toBe("fuck");
    expect(normaliseForModeration("sh1t").joined).toBe("shit");
    expect(normaliseForModeration("х у й").joined).toBe("хуй");
  });
  it("squeezes stretched letters", () => {
    expect(normaliseForModeration("fuuuuck").joined).toBe("fuuck");
  });
});

describe("screenTextLexically — rejects abuse in every supported language", () => {
  it("Mongolian, Cyrillic", () => {
    expect(rejected("энэ бараа новш байна")).toBe("profanity");
    expect(rejected("Чи тэнэг амьтан")).toBeTruthy();
    expect(rejected("хуй мэдэхгүй юм")).toBe("profanity");
  });
  it("Mongolian, Latin transliteration", () => {
    expect(rejected("ene baraa novsh bna")).toBe("profanity");
    expect(rejected("mangar humuus")).toBeTruthy();
  });
  it("Russian", () => {
    expect(rejected("это полное говно")).toBe("profanity");
    expect(rejected("продавец дебил")).toBe("insult");
    expect(rejected("я тебя убью")).toBe("threat");
  });
  it("English, including disguised spellings", () => {
    expect(rejected("this is f*cking garbage")).toBeTruthy();
    expect(rejected("what a sh1t product")).toBe("profanity");
    expect(rejected("the seller is an idiot")).toBe("insult");
    expect(rejected("kill yourself")).toBe("threat");
  });
  it("Chinese, Japanese, Korean (no word breaks)", () => {
    expect(rejected("这是垃圾人卖的傻逼东西")).toBe("profanity");
    expect(rejected("店員は馬鹿だ")).toBe("profanity");
    expect(rejected("씨발 진짜")).toBe("profanity");
  });
  it("slurs are hate, not just profanity", () => {
    expect(rejected("run by chinks")).toBe("hate");
  });
  it("links and messenger handles are spam", () => {
    expect(rejected("cheaper at https://other-shop.mn")).toBe("spam");
    expect(rejected("write me on telegram")).toBe("spam");
  });
});

describe("screenTextLexically — lets honest reviews through", () => {
  it("negative but civil", () => {
    expect(rejected("Терrible product, waste of money, did nothing for my skin.")).toBeNull();
    expect(rejected("Хүргэлт хоёр өдөр хоцорсон, бараа өөрөө сайн.")).toBeNull();
    expect(rejected("Очень плохо пахнет, не рекомендую.")).toBeNull();
  });
  it("Scunthorpe problems: substrings inside ordinary words", () => {
    expect(rejected("classic assortment, massage cream, first class")).toBeNull();
    expect(rejected("cocktail of vitamins, a peacock print")).toBeNull();
    expect(rejected("Написала письмо в поддержку")).toBeNull();
    expect(rejected("Shiitake mushroom extract")).toBeNull();
  });
  it("brand and product names", () => {
    expect(rejected("Cocochi AG mask, Prieclat serum, Diane shampoo")).toBeNull();
    expect(rejected("Hatomugi lotion 500ml")).toBeNull();
  });
  it("empty text is allowed (rating-only review)", () => {
    expect(rejected("")).toBeNull();
    expect(rejected("   ")).toBeNull();
  });
  it("ordinary words that share a prefix with a rejected root (2026-09-27)", () => {
    expect(rejected("Шаардлагатай зүйл болсон")).toBeNull();
    expect(rejected("Хаягаар хүргэлт сайн")).toBeNull();
    expect(rejected("Утасны бүрхүүл гоё")).toBeNull();
    expect(rejected("Хогийн уут сайн байна")).toBeNull();
    expect(rejected("Оймс зөөлөн байна")).toBeNull();
    expect(rejected("гахайн мах")).toBeNull();
    expect(rejected("Ялгасан ч гэсэн")).toBeNull();
    expect(rejected("操作简单，很好用")).toBeNull();
    expect(rejected("香りばかり強い")).toBeNull();
    expect(rejected("Great trash bags")).toBeNull();
    expect(rejected("Nice dumbbell set")).toBeNull();
  });
});

describe("screenTextLexically — still rejects the real forms next to the fixed false positives", () => {
  it("Mongolian conjugated/phrase forms", () => {
    expect(rejected("чи шаах юм чинь")).toBe("profanity");
    expect(rejected("чи тарган гахай")).toBe("insult");
    expect(rejected("чи хог юм")).toBe("insult");
  });
  it("Japanese baka without the -ri continuation", () => {
    expect(rejected("ばかだ")).toBe("profanity");
  });
  it("Chinese abusive compound still blocked without bare 操", () => {
    expect(rejected("操你妈")).toBe("profanity");
  });
});
