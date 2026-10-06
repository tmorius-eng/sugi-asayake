import { expect, test } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";

/**
 * Баярын бүтэн-сайтын загвар (skin, 2026-10-06). Tom: "баяр бүрт theme ба layout бүтнээрээ
 * солигдоно — гүйдэг banner дээр зураг тавьсан биш". Серверийн талыг (HTML-д `data-skin`)
 * holiday-skin.test.ts шалгадаг; энд БОДИТ ХӨТӨЧ дээр: skin нь нүүр, дэлгүүр, бараа,
 * checkout бүгдийг солидог, КОМПЬЮТЕР БА УТАС хоёуланд хэвтээ scroll үүсгэдэггүй, энгийн
 * өдөр (skin-гүй) хуудас юу ч татдаггүй, /admin skin АВДАГГҮЙ.
 *
 * Staging-ийн theme-д ХҮРЭХГҮЙ: skin-ийг хөтөч дээр `data-skin` + `<link>`-ээр албадаж
 * тавина (серверийн оруулж ирдэг ижил зам), тиймээс бусад spec-ийн өнгө хэмжилтийг эвдэхгүй.
 */
const SKIN = "new-year";

async function forceSkin(page: import("@playwright/test").Page) {
  await page.evaluate(key => {
    document.documentElement.setAttribute("data-skin", key);
    document.documentElement.setAttribute("data-holiday", key);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `/holiday-skins/${key}.css`;
    link.id = "skin-forced";
    document.head.appendChild(link);
  }, SKIN);
  // CSS ачаалагдтал.
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ny-green").trim()), { timeout: 10_000 }).toBe("#2f5b43");
}

const sideScroll = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const cssVar = (page: import("@playwright/test").Page, name: string) => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test.describe("баярын skin: Шинэ жил", () => {
  test("энгийн өдөр skin-гүй: data-skin байхгүй, skin-ийн нэг ч файл татагдахгүй", async ({ page }) => {
    const skinRequests: string[] = [];
    page.on("request", request => { if (/holiday-skins|cormorant-garamond/.test(request.url())) skinRequests.push(request.url()); });
    await page.goto("/");
    await expect(page.locator(".hero-copy h1")).toBeVisible({ timeout: 30_000 });
    // Staging-д баяр тохируулаагүй/унтраалттай үед. Асаалттай бол энэ нь баярын үеийн бодит төлөв — тэгвэл алгасна.
    test.skip(await page.evaluate(() => document.documentElement.hasAttribute("data-skin")), "staging-д баяр идэвхтэй байна — энгийн өдрийн шалгалтыг алгасав.");
    expect(skinRequests).toEqual([]);
  });

  test("нүүр, дэлгүүр, бараа дээр skin бүтнээр нь солигдоно + хэвтээ scroll 0", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await expect(page.locator(".hero-copy h1")).toBeVisible({ timeout: 30_000 });
    await forceSkin(page);

    // Палитр: үндсэн өнгө ногоон, дэвсгэр цайвар цайр, зарын зурвас ногоон.
    expect(await cssVar(page, "--primary")).toBe("#2f5b43");
    expect(await cssVar(page, "--ck-page")).toBe("#f7f1e8");
    expect(await cssVar(page, "--promo-bar-bg")).toBe("#2f5b43");
    // Hero = нэг бүтэн баярын зураг (өөр дэвсгэр зураг), хүрээгүй rail нуугдсан.
    const heroBg = await page.locator(".hero-section").evaluate(el => getComputedStyle(el).backgroundImage);
    expect(heroBg).toContain("new-year/hero");
    // Гарчиг serif.
    const greetingFont = await page.locator(".hero-greeting").first().evaluate(el => getComputedStyle(el).fontFamily).catch(() => "");
    if (greetingFont) expect(greetingFont).toContain("SA Festive Serif");
    expect(await sideScroll(page), "нүүр хуудас хэвтээ гүйлгэнэ").toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("skin-home.png"), fullPage: true });

    await page.goto("/shop");
    await expect(page.locator(".shop-hero")).toBeVisible({ timeout: 30_000 });
    await forceSkin(page);
    const shopHeadingFont = await page.locator(".shop-hero h1").evaluate(el => getComputedStyle(el).fontFamily);
    expect(shopHeadingFont).toContain("SA Festive Serif");
    // Барааны карт: ногоон хүрээ + булангийн чимэг (::before дээр зураг).
    const cardCorner = await page.locator(".shelf-card-frame, .product-card, .shop-card").first().evaluate(el => getComputedStyle(el, "::before").backgroundImage).catch(() => "");
    if (cardCorner && cardCorner !== "none") expect(cardCorner).toContain("card-corner");
    expect(await sideScroll(page), "дэлгүүр хэвтээ гүйлгэнэ").toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("skin-shop.png"), fullPage: false });

    const href = await page.locator('a[href^="/product/"]').first().getAttribute("href");
    test.skip(!href, "staging-д бараа алга.");
    await page.goto(href!);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
    await forceSkin(page);
    expect(await sideScroll(page), "барааны хуудас хэвтээ гүйлгэнэ").toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("skin-product.png"), fullPage: false });
  });

  test("/admin skin АВДАГГҮЙ: сервер data-skin ч, skin link ч оруулдаггүй", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin", baseURL!);
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: /Брэнд студи/ }).or(page.getByRole("button", { name: "Цэс нээх" })).first()).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-skin"))).toBe(false);
    expect(await page.locator('link[href*="holiday-skins"]').count()).toBe(0);
  });

  test("skin-ийн зураг, фонт бодитоор татагдана (404 байхгүй)", async ({ request }) => {
    for (const path of [
      "/holiday-skins/new-year.css",
      "/holiday-skins/new-year/hero.webp",
      "/holiday-skins/new-year/hero-1200.webp",
      "/holiday-skins/new-year/card-corner.webp",
      "/holiday-skins/new-year/divider.webp",
      "/holiday-skins/new-year/pine-corner.webp",
      "/holiday-skins/new-year/pine-corner-right.webp",
      "/fonts/cormorant-garamond/normal-cyrillic.woff2",
      "/fonts/cormorant-garamond/normal-cyrillic-ext.woff2",
      "/fonts/cormorant-garamond/italic-cyrillic.woff2",
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      // SPA fallback нь байхгүй замд 200 + HTML буцаадаг — content-type-аар бодитоор шалга.
      expect(response.headers()["content-type"] ?? "", path).not.toContain("text/html");
    }
  });

  test("Монгол Ө/Ү үсэг serif фонтоор ХӨТӨЧ ДЭЭР бодитоор зурагдана", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".shop-hero")).toBeVisible({ timeout: 30_000 });
    await forceSkin(page);
    await page.evaluate(() => document.fonts.ready);
    const glyphs = await page.evaluate(async () => {
      await document.fonts.load('600 40px "SA Festive Serif"', "ӨҮөү");
      const measure = (text: string, family: string) => {
        const canvas = document.createElement("canvas").getContext("2d")!;
        canvas.font = `600 60px ${family}`;
        return canvas.measureText(text).width;
      };
      // Serif-ээр хэмжсэн өргөн нь fallback (monospace)-ээс ялгаатай бол фонт жинхэнээр ачаалагдсан.
      return { serif: measure("ӨҮөү", '"SA Festive Serif", monospace'), fallback: measure("ӨҮөү", "monospace"), loaded: document.fonts.check('600 40px "SA Festive Serif"', "ӨҮөү") };
    });
    expect(glyphs.loaded).toBe(true);
    expect(Math.abs(glyphs.serif - glyphs.fallback)).toBeGreaterThan(1);
  });
});
