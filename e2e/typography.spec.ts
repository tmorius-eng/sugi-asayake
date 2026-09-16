import { expect, test } from "./helpers/fixtures";

/**
 * Гарчгийн шрифт монгол кирилл үсгийг БҮРЭН зурж чадаж байна уу (2026-09-16).
 *
 * Энэ нь "шрифт нэмэх" ажлын хамгийн бодит эрсдэл: Ө/Ү (U+04E8/U+04AE) нь
 * Юникодын cyrillic-ext мужид байдаг бөгөөд display шрифтүүдийн олонх нь тэр
 * дэд олонлогийг агуулдаггүй. Тэгвэл гарчиг дундаа зөвхөн Ө, Ү нь өөр шрифтээр
 * унаж, эрээн харагдана — нүдээр хараад заримдаа анзаарагдахгүй өнгөрдөг.
 *
 * Шалгах арга: глифийг `"Cormorant Garamond", monospace` ба цэвэр `monospace`-ээр зурж
 * өргөнийг харьцуулна — monospace бол өргөнөөрөө эрс ялгаатай тул Cormorant Garamond
 * тухайн глифийг өгсөн эсэх нь тодорхой гарна. (Golos-той харьцуулах нь
 * найдваргүй: зарим глифийн өргөн санамсаргүй давхцдаг.)
 *
 * ⚠️ `document.fonts.ready` хангалтгүй: canvas нь unicode-range-аар хуваагдсан
 * дэд файлыг өөрөө татуулдаггүй тул эхлээд `document.fonts.load(...)`.
 */
test("гарчгийн шрифт Ө, Ү зэрэг монгол глифийг өөрөө зурна", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    await document.fonts.load('700 64px "Cormorant Garamond"', "ӨҮөүЭЖБ");
    const context = document.createElement("canvas").getContext("2d")!;
    const widths: Record<string, { display: number; mono: number }> = {};
    for (const glyph of ["Ө", "Ү", "ө", "ү", "Э", "Ж", "Б"]) {
      context.font = '700 64px "Cormorant Garamond", monospace';
      const display = context.measureText(glyph).width;
      context.font = "700 64px monospace";
      widths[glyph] = { display, mono: context.measureText(glyph).width };
    }
    const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
    return { display, widths };
  });

  expect(result.display).toContain("Cormorant Garamond");
  for (const [glyph, { display, mono }] of Object.entries(result.widths)) {
    expect(display, `${glyph} нь Cormorant Garamond-оор зурагдах ёстой (өргөн ${display} vs monospace ${mono})`).not.toBe(mono);
  }
});

test("hero гарчиг гарчгийн шрифтээр зурагдана", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const heroFont = await page.evaluate(() => {
    const hero = document.querySelector(".hero-copy h1") ?? document.querySelector("main h1");
    return hero ? getComputedStyle(hero).fontFamily : "";
  });
  expect(heroFont).toContain("Cormorant Garamond");
});
