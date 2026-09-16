import { expect, test } from "./helpers/fixtures";

/**
 * CSS cascade layer-ийн регрессийн хамгаалалт (2026-09-16).
 *
 * `client/src/index.css`-ийн reset дүрмүүд ЗААВАЛ `@layer base` дотор байх
 * ёстой. Давхаргагүй (unlayered) CSS нь давхаргатай бүх CSS-ээс — Tailwind-ийн
 * utilities давхарга ч мөн адил — давамгайлдаг тул `a { color: inherit }`
 * давхаргагүй байхад `<a class="text-[#df1f3d]">` чимээгүй үйлчилдэггүй байв.
 * Тэр нь кодын хэд хэдэн газарт `!` (important) залгах болсны шалтгаан.
 *
 * Энэ тест нь хуудсанд жинхэнэ <a> нэмж, бодит computed өнгийг уншина —
 * өөрөөр хэлбэл "дүрэм аль давхаргад байна вэ" гэдгийг биш, "хөтөч эцэст нь
 * юу зурах вэ" гэдгийг шалгана.
 */
test.describe("CSS давхарга", () => {
  for (const [label, url] of [["нүүр", "/"], ["дэлгүүр", "/shop"]] as const) {
    test(`${label}: <a> дээрх өнгөний utility класс reset-ээс давамгайлна`, async ({ page }) => {
      await page.goto(url);
      const result = await page.evaluate(() => {
        const host = document.querySelector("main") ?? document.body;
        const link = document.createElement("a");
        link.href = "#";
        link.className = "text-[#df1f3d] underline";
        link.textContent = "layer probe";
        host.appendChild(link);
        const style = getComputedStyle(link);
        const out = { color: style.color, decoration: style.textDecorationLine };
        link.remove();
        return out;
      });
      expect(result.color).toBe("rgb(223, 31, 61)");
      expect(result.decoration).toBe("underline");
    });
  }

  test("класс өгөөгүй холбоос reset-ийн дагуу өнгөө өвлөнө", async ({ page }) => {
    await page.goto("/");
    const inherited = await page.evaluate(() => {
      const host = document.querySelector("main") ?? document.body;
      const wrapper = document.createElement("div");
      wrapper.style.color = "rgb(1, 2, 3)";
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = "plain probe";
      wrapper.appendChild(link);
      host.appendChild(wrapper);
      const out = { color: getComputedStyle(link).color, decoration: getComputedStyle(link).textDecorationLine };
      wrapper.remove();
      return out;
    });
    expect(inherited.color).toBe("rgb(1, 2, 3)");
    expect(inherited.decoration).toBe("none");
  });
});
