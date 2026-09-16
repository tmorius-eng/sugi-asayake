import { expect, test } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";
import { openAdminSection } from "./helpers/admin";

/**
 * /admin-ийн жижиг текстийн контраст (WCAG 2.2 AA, 4.5:1) — гэрэл ба харанхуй
 * горим хоёуланд.
 *
 * Storefront-ийн палитр 2026-09-11-нд бодит computed дэвсгэр дээр хэмжигдсэн
 * боловч admin тал хэмжигдээгүй байсан: `--a-faint` цагаан дээр 2.74:1
 * (2026-09-16-нд зассан). Энэ тест нь токены утгыг биш, хөтчийн ЭЦСИЙН зурсан
 * өнгө ба ард нь бодитоор байгаа дэвсгэрийг харьцуулна — тиймээс ямар нэг
 * дүрэм дээрээс дарж бичсэн ч барина.
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
  // Элементийн ард бодитоор ямар өнгө байгааг ол (тунгалаг эцгүүдийг давж).
  const backgroundOf = (element) => {
    let node = element;
    while (node) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour && colour.a > 0.95) return colour;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const failures = [];
  for (const element of document.querySelectorAll(".admin-shell *")) {
    const text = Array.from(element.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("");
    if (!text) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || parseFloat(style.opacity) < 0.5) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const colour = parse(style.color);
    if (!colour || colour.a < 0.5) continue;
    const size = parseFloat(style.fontSize);
    const bold = parseInt(style.fontWeight, 10) >= 700;
    // WCAG: том текст (18.66px+ bold, эсвэл 24px+) 3:1, бусад нь 4.5:1.
    const required = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    const value = ratio(colour, backgroundOf(element));
    if (value + 0.01 < required) failures.push({ text: text.slice(0, 40), colour: style.color, size, required, ratio: Number(value.toFixed(2)), where: element.tagName + "." + String(element.className).slice(0, 70) });
  }
  return failures;
})()`;

for (const theme of ["light", "dark"] as const) {
  test(`admin (${theme}): жижиг текст бүр AA контрастыг хангана`, async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    await page.goto("/admin");
    await page.evaluate(mode => {
      document.documentElement.setAttribute("data-admin-theme", mode);
      try { localStorage.setItem("sugi-admin-theme", mode); } catch { /* blocked storage */ }
    }, theme);

    for (const section of ["Бүтээгдэхүүн", "Хэрэглэгч"]) {
      await openAdminSection(page, section);
      await page.waitForTimeout(1200);
      const failures = await page.evaluate(CONTRAST_PROBE);
      expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    }
  });
}
