import { expect, test } from "./helpers/fixtures";

/**
 * /privacy, /terms, /about — сайтын баримтууд, 3 хэлээр.
 * Эдгээр хуудсанд толгой (хэл солих товч) байхгүй тул хэлийг товчны бичдэг
 * газраар нь (`localStorage["sugi-locale"]`, hooks/useLocale.ts) тавьж ачаална.
 * Гарчиг admin-аас засагдаж болох тул яг текст биш: монгол гарчиг байна,
 * бусад хэлэнд <html lang> солигдож гарчиг өөр болно.
 */
for (const path of ["/privacy", "/terms", "/about"]) {
  test(`${path}: гарчиг, агуулга, 3 хэл`, async ({ browser, baseURL }) => {
    let mongolian = "";
    for (const lang of ["mn", "en", "ja"] as const) {
      const context = await browser.newContext({ baseURL });
      await context.addInitScript(value => { try { localStorage.setItem("sugi-locale", value); } catch { /* хувийн цонх */ } }, lang);
      const page = await context.newPage();
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toBeVisible();
      const text = (await heading.textContent())?.trim() ?? "";
      expect(text.length).toBeGreaterThan(3);
      if (lang === "mn") {
        mongolian = text;
        expect(await page.locator("#main-content").innerText()).toContain(text);
      } else {
        expect(text, `${lang}: гарчиг орчуулагдаагүй`).not.toBe(mongolian);
      }
      await context.close();
    }
  });
}
