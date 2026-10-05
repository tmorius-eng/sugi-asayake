import { expect, test } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";
import { HOLIDAY_PALETTES } from "../shared/holiday-palettes";

/**
 * Storefront-ийн жижиг текстийн контраст (WCAG 2.2 AA) — гэрэл ба харанхуй
 * горим, компьютер ба утас (2026-09-20).
 *
 * 2026-09-11-ний Linen палитрын ажил 7 хуудас × 4 өргөнд "контрастын алдаа 0"
 * гэж хэмжсэн боловч тэр нь НЭГ УДААГИЙН скрипт байсан — дараагийн өнгөний
 * өөрчлөлтийг хэн ч дахин хэмждэггүй. Admin тал 2026-09-16-наас байнгын тесттэй
 * (admin-contrast.spec.ts); энэ нь storefront-д ижил хамгаалалт.
 *
 * Токены утгыг биш, хөтчийн ЭЦСИЙН зурсан өнгө ба ард нь бодитоор байгаа
 * дэвсгэрийг харьцуулна — тиймээс хаа нэг дүрэм дарж бичсэн ч барина
 * (2026-09-20-нд захиалгын хураангуй дээрх "харанхуй хайрцаг" нь бодитоор
 * цайвар байсныг яг ийм зөрүүгээр л олсон).
 *
 * ЗУРАГ ДЭЭРХ ТЕКСТИЙГ АЛГАСНА: hero, ангиллын карт зэрэгт текст нь зураг
 * дээр давхарлагддаг; өнгө хайх алгоритм зургийг "харж" чадахгүй тул хуудасны
 * дэвсгэртэй харьцуулж худал алдаа гаргана. Тийм текстийн уншигдах байдлыг
 * зургийн сүүдэр/давхаргаар шийддэг бөгөөд нүдээр шалгана.
 */
const CONTRAST_PROBE = `(() => {
  const parse = (value) => {
    const match = value.match(/rgba?\\(([^)]+)\\)/);
    if (!match) return null;
    const parts = match[1].split(/[,/]/).map(part => parseFloat(part.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const luminance = ({ r, g, b }) => {
    const channel = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const ratio = (fg, bg) => {
    const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };
  // Текст зураг дээр байна уу: өөрөө эсвэл эцгүүдийн аль нэг нь background-image
  // тавьсан, эсвэл эцэг нь дотроо <img>/<picture>/<video> агуулж текстийг
  // түүн дээр байрлуулсан (position: absolute/fixed хүүхэд).
  const overMedia = (element) => {
    let node = element;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      // Зураг (url) дээрх текст — хэмжих боломжгүй. Градиент бол хэмжинэ (доор).
      if (style.backgroundImage && style.backgroundImage.includes("url(")) return true;
      if ((style.position === "absolute" || style.position === "fixed") && node.parentElement && node.parentElement.querySelector(":scope > img, :scope > picture, :scope > video, :scope img")) return true;
      const colour = parse(style.backgroundColor);
      if (colour && colour.a > 0.95) return false;
      node = node.parentElement;
    }
    return false;
  };
  // Бодит дэвсгэр: градиент бол түүний БҮХ тунгалаг бус өнгөний цэг (хамгийн
  // муу нь тоологдоно), эс бөгөөс анхны тунгалаг бус өнгө. 2026-09-21 хүртэл
  // градиентийг алгасдаг байсан тул профайлын баннер дээрх алтан шошго
  // харанхуй болсныг (харанхуй дээр харанхуй) барьж чадаагүй.
  const backgroundsOf = (element) => {
    let node = element;
    while (node) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage.includes("gradient")) {
        const stops = (style.backgroundImage.match(/rgba?\\([^)]+\\)/g) || []).map(parse).filter(c => c && c.a > 0.5);
        if (stops.length) return stops;
      }
      const colour = parse(style.backgroundColor);
      if (colour && colour.a > 0.95) return [colour];
      node = node.parentElement;
    }
    return [parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }];
  };
  const failures = [];
  for (const element of document.querySelectorAll("#root *")) {
    const text = Array.from(element.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("");
    if (!text) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || parseFloat(style.opacity) < 0.5) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    // Хэрэглэгчийн харах талбарт л (скроллоор хүрэх хэсэг ч орно) — sr-only биш.
    if (style.position === "absolute" && box.width <= 1 && box.height <= 1) continue;
    const colour = parse(style.color);
    if (!colour || colour.a < 0.5) continue;
    if (overMedia(element)) continue;
    const size = parseFloat(style.fontSize);
    const bold = parseInt(style.fontWeight, 10) >= 700;
    const required = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    const value = Math.min(...backgroundsOf(element).map(bg => ratio(colour, bg)));
    if (value + 0.01 < required) failures.push({ text: text.slice(0, 40), colour: style.color, size, required, ratio: Number(value.toFixed(2)), where: element.tagName + "." + String(element.className).slice(0, 70) });
  }
  return failures;
})()`;

// 2026-09-11-ний хэмжилттэй ижил хуудсууд + худалдан авалтын гол хоёр хуудас.
const PAGES = ["/", "/shop", "/brands", "/journal", "/returns", "/track-order", "/help", "/checkout"];

for (const theme of ["light", "dark"] as const) {
  test.describe(`storefront контраст (${theme})`, () => {
    for (const path of PAGES) {
      test(`${path}: жижиг текст бүр AA контрастыг хангана`, async ({ page }) => {
        await page.addInitScript(value => {
          try { localStorage.setItem("sugi-storefront-theme", value); } catch { /* хувийн цонх */ }
        }, theme);
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        // Горимыг хөтөч дээр бодитоор идэвхжүүлсэн эсэх — эс бөгөөс "харанхуй"
        // тест чимээгүйгээр гэрэл горимыг хоёр удаа шалгана.
        if (theme === "dark") {
          await page.evaluate(() => document.documentElement.setAttribute("data-storefront-theme", "dark"));
        }
        await expect(page.locator("#root")).not.toBeEmpty();
        const failures = await page.evaluate(CONTRAST_PROBE) as Array<Record<string, unknown>>;
        expect(failures, `${theme} ${path}: ${JSON.stringify(failures.slice(0, 8), null, 1)}`).toEqual([]);
      });
    }
  });
}

/**
 * Брэнд студийн баярын санал болгох палитр (2026-10-05): сервер 22 токены хосыг шалгадаг ч хуудсан
 * дээрх бусад элемент (хатуу цагаан текст гэх мэт) өнгөт дэвсгэр дээр уншигдах эсэхийг зөвхөн энэ барина.
 * Палитрыг `<style>`-ээр серверийн brand-tokens-ийн ДАРАА тавина (ижил `html:root` specificity → сүүлийнх ялна).
 */
const THEME_PAGES = ["/", "/shop", "/checkout"];
for (const [key, { palette }] of Object.entries(HOLIDAY_PALETTES)) {
  test.describe(`баярын палитр: ${key}`, () => {
    for (const path of THEME_PAGES) {
      test(`${path}: AA контраст`, async ({ page }) => {
        await page.addInitScript(() => { try { localStorage.setItem("sugi-storefront-theme", "light"); } catch { /* хувийн цонх */ } });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const css = `html:root{${Object.entries(palette).map(([token, value]) => `--${token}:${value};`).join("")}}`;
        await page.addStyleTag({ content: css });
        await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim())).toBe(palette.primary);
        const failures = await page.evaluate(CONTRAST_PROBE) as Array<Record<string, unknown>>;
        expect(failures, `${key} ${path}: ${JSON.stringify(failures.slice(0, 8), null, 1)}`).toEqual([]);
      });
    }
  });
}

/**
 * Нэвтэрсэн хэрэглэгчийн профайл (2026-09-21, Tom-ийн screenshot): "Тусламж"
 * таб харанхуй горимд асуултууд огт харагдахгүй байв. Дээрх тест нь нэвтрэлтгүй
 * хуудсуудыг л хэмждэг байсан тул профайлын 9 таб хэзээ ч шалгагдаж байгаагүй.
 */
const PROFILE_TABS = ["overview", "orders", "preferences", "wishlist", "addresses", "notifications", "security", "support", "loyalty"];

for (const theme of ["light", "dark"] as const) {
  test.describe(`профайлын контраст (${theme})`, () => {
    for (const tab of PROFILE_TABS) {
      test(`/profile?tab=${tab}: жижиг текст бүр AA контрастыг хангана`, async ({ page, context, baseURL }) => {
        await signInAs(context, "user", baseURL!);
        await page.addInitScript(value => {
          try { localStorage.setItem("sugi-storefront-theme", value); } catch { /* хувийн цонх */ }
        }, theme);
        await page.goto(`/profile?tab=${tab}`);
        await page.waitForLoadState("networkidle");
        if (theme === "dark") await page.evaluate(() => document.documentElement.setAttribute("data-storefront-theme", "dark"));
        await expect(page.locator(".profile-main")).toBeVisible();
        const failures = await page.evaluate(CONTRAST_PROBE) as Array<Record<string, unknown>>;
        expect(failures, `${theme} profile/${tab}: ${JSON.stringify(failures.slice(0, 8), null, 1)}`).toEqual([]);
      });
    }
  });
}
