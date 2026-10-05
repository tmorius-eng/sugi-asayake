import { expect, test } from "./helpers/fixtures";
import { BRAND_FONTS, fontFaceCss, fontStack } from "../shared/fonts";

/**
 * Брэнд студийн фонт (A2, 2026-10-05) — PROJECT-GUIDE: "шинэ гарчгийн шрифт нэмэх бол монгол Ө/Ү
 * глифийг ХӨТӨЧ ДЭЭР хэмжиж шалга". Фонт бүрийг хуудсанд серверийнхтэй ижил @font-face-ээр тавьж,
 * "ӨөҮүЁ"-г тэр фонтоор ба зөвхөн monospace-ээр canvas дээр хэмжинэ — глиф дутвал fallback руу
 * унаж өргөн ТЭНЦҮҮ гарна. Мөн гарчиг бодитоор тэр фонтоор зурагдсаныг шалгана.
 */
test.describe("брэнд фонт — монгол глиф хөтөч дээр", () => {
  for (const font of BRAND_FONTS.filter(f => f.key !== "golos")) {
    test(`${font.family}: Ө ө Ү ү Ё өөрийн глифээр`, async ({ page }) => {
      await page.goto("/");
      await page.addStyleTag({ content: `${fontFaceCss(font.key)}html:root{--font-body:${fontStack(font.key)};--font-display:${fontStack(font.key)};}` });
      const result = await page.evaluate(async family => {
        await document.fonts.load(`700 40px "${family}"`, "ӨөҮүЁ");
        await document.fonts.load(`400 40px "${family}"`, "ӨөҮүЁ");
        const ctx = document.createElement("canvas").getContext("2d")!;
        const width = (fontCss: string) => { ctx.font = fontCss; return ctx.measureText("ӨөҮүЁ").width; };
        const heading = document.querySelector(".hero-copy h1");
        return {
          loaded: document.fonts.check(`400 40px "${family}"`, "ӨөҮүЁ"),
          own: width(`400 40px "${family}", monospace`),
          fallback: width("400 40px monospace"),
          headingFamily: heading ? getComputedStyle(heading).fontFamily : "",
        };
      }, font.family);
      expect(result.loaded, "фонт ачаалагдсангүй").toBe(true);
      expect(Math.abs(result.own - result.fallback), "Ө/Ү глиф дутуу — monospace руу унав").toBeGreaterThan(1);
      expect(result.headingFamily).toContain(font.family);
    });
  }
});
