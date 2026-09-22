import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";

/**
 * Серверийн зурсан нүүрний shell (server/_core/heroShell.ts, 2026-09-21).
 *
 * Shell нь React-ийн зурах DOM-ыг ижил class-уудаар урьдчилан зурдаг тул
 * хамгийн чухал нь: JS ажиллахаас ӨМНӨ харагдах hero зураг ба JS ажилласны
 * ДАРААХ hero зураг яг нэг байрлал, нэг хэмжээтэй байх. Зөрвөл хэрэглэгч React
 * ирэх мөчид зураг "үсрэхийг" харна (Tom-ийн 2026-09-12-ны "lag" гомдол яг
 * ийм үсрэлт байсан). Толгой (промо зурвас, хайлт, дүрсүүд) нь hero-гийн
 * дээр байдаг тул түүний өндөр ч давхар шалгагдаж байна.
 *
 * "JS-гүй" төлөвийг аппын JS chunk-ийг хааж (route abort) авна — shell бол
 * тэр үед дэлгэц дээр байгаа цорын ганц зүйл.
 */
const rectOf = (page: Page, selector: string) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  return { top: Math.round(box.top + window.scrollY), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) };
}, selector);

for (const [name, viewport] of [["утас", { width: 390, height: 844 }], ["компьютер", { width: 1366, height: 900 }]] as const) {
  test(`${name}: JS-гүй shell-ийн hero зураг React-ийн зурсантай нэг байрлалд`, async ({ browser, baseURL }) => {
    // JS-гүй: аппын chunk-уудыг хаана (vendor скриптүүд ажилласаар — theme-init
    // бодит хэрэглэгчийнхтэй ижил горимд хуудсыг тавина).
    const noJs = await browser.newContext({ viewport, baseURL });
    await noJs.route(/\/assets\/.*\.js$/, route => route.abort());
    const shellPage = await noJs.newPage();
    await shellPage.goto("/");
    await shellPage.waitForSelector("#hero-shell .hero-rail-slide img");
    await shellPage.waitForFunction(() => document.fonts.status === "loaded");
    // Rail-ийн зүүн захаас эхний БҮТЭН харагдах хавтан (marquee/scroll-аас
    // хамааралгүй): React 3 хуулбар зурж дундахыг нь харуулдаг тул "DOM-ийн эхний
    // img" биш, харагдаж буйг нь харьцуулна.
    const firstVisibleTile = (root: string) => `${root} .hero-rail-slide img`;
    const shellTile = await shellPage.evaluate(sel => {
      const tiles = Array.from(document.querySelectorAll<HTMLImageElement>(sel)).map(img => ({ img, box: img.getBoundingClientRect() })).filter(t => t.box.left >= -1).sort((a, b) => a.box.left - b.box.left)[0];
      return tiles ? { src: tiles.img.getAttribute("src"), rect: { top: Math.round(tiles.box.top + window.scrollY), left: Math.round(tiles.box.left), width: Math.round(tiles.box.width), height: Math.round(tiles.box.height) } } : null;
    }, firstVisibleTile("#hero-shell"));
    const shellImg = shellTile?.rect ?? null;
    const shellHeader = await rectOf(shellPage, "#hero-shell .commerce-header");
    const shellSrc = shellTile?.src ?? null;
    await noJs.close();

    // React: ердийн ачаалалт. Хэмжих мөч нь ЯГ shell устаж React-ийн DOM орсон
    // commit (MutationObserver — paint болон useEffect-ээс өмнө): хэрэглэгчийн
    // харах "солигдох" frame нь энэ. Дараа нь rail нэг хуулбар урагшилж
    // (ижил зураг, ижил pixel) marquee секундэд ~20px гүйдэг тул хожуу
    // хэмжвэл drift-ийг алдаа гэж андуурна.
    const context = await browser.newContext({ viewport, baseURL });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const rect = (el: Element | null) => {
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return { top: Math.round(box.top + window.scrollY), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) };
      };
      const observer = new MutationObserver(() => {
        // Shell нуугдсан (Home.tsx-ийн layout effect) ба React-ийн rail орсон мөч.
        const shell = document.getElementById("hero-shell");
        if (!shell || !shell.hidden || !document.querySelector("#root .hero-rail-slide img")) return;
        const tile = Array.from(document.querySelectorAll("#root .hero-rail-slide img")).map(img => ({ img, box: img.getBoundingClientRect() })).filter(t => t.box.left >= -1).sort((a, b) => a.box.left - b.box.left)[0];
        (window as unknown as { __swap: unknown }).__swap = {
          img: rect(tile?.img ?? null),
          header: rect(document.querySelector("#root .commerce-header")),
          src: tile?.img.getAttribute("src") ?? null,
        };
        observer.disconnect();
      });
      // `document`, `documentElement` БИШ: init script нь <html> үүсэхээс өмнө ажилладаг.
      observer.observe(document, { childList: true, subtree: true });
    });
    await page.goto("/");
    await page.waitForFunction(() => Boolean((window as unknown as { __swap?: unknown }).__swap));
    const swap = await page.evaluate(() => (window as unknown as { __swap: { img: unknown; header: unknown; src: string | null } }).__swap);
    const reactImg = swap.img;
    const reactHeader = swap.header;
    const reactSrc = swap.src;
    await context.close();

    expect(shellSrc, "shell-ийн эхний зураг React-ийнхаас өөр файл").toBe(reactSrc);
    expect(shellHeader, "толгойн байрлал/өндөр зөрж байна (промо зурвас, хайлтын мөр?)").toEqual(reactHeader);
    expect(shellImg, "hero зураг React ирэхэд үсэрнэ").toEqual(reactImg);
  });
}

test("бусад хуудсанд shell байхгүй, нүүрэнд React ирмэгц алга болно", async ({ page }) => {
  const shopHtml = await (await page.request.get("/shop")).text();
  expect(shopHtml).not.toContain('id="hero-shell"');
  const homeHtml = await (await page.request.get("/")).text();
  expect(homeHtml).toContain('id="hero-shell"');
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // React ирмэгц shell нуугдаж, толгой/текст нь устана (зөвхөн нуусан rail үлдэнэ).
  await expect(page.locator("#hero-shell")).toBeHidden();
  expect(await page.locator("#hero-shell header, #hero-shell .hero-copy, #hero-shell .site-promo-banner").count(), "shell-ийн толгой/текст устаагүй").toBe(0);
  expect(await page.locator("h1").count(), "h1 давхардсан").toBe(1);
  expect(await page.locator(".commerce-header").count(), "толгой давхардсан").toBe(1);
});

/**
 * React is held back until the hero has painted (client/src/main.tsx, up to
 * 1.2 s). That wait must never swallow what the visitor does (2026-09-22):
 * the full E2E run showed a Tab and a tap on the header search both lost in
 * that window. Here the hero photograph is slowed down on purpose so the page
 * sits in exactly that state, and the tap / key happen inside it.
 */
test.describe("React хүлээгдэж байх үеийн анхны үйлдэл алдагдахгүй", () => {
  const holdHero = async (page: Page) => {
    await page.route(/\.(avif|webp|jpe?g|png)(\?|$)/, async route => {
      await new Promise(resolve => setTimeout(resolve, 2500));
      await route.continue().catch(() => undefined);
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("#hero-shell").waitFor();
  };

  test("анхны Tab нь skip link дээр буна", async ({ page }) => {
    await holdHero(page);
    expect(await page.evaluate(() => document.getElementById("root")!.childElementCount), "React аль хэдийн mount болсон — тест хүлээлтийн цонхыг шалгаж чадахгүй").toBe(0);
    await page.keyboard.press("Tab");
    await expect(page.locator("a.skip-link")).toBeFocused();
  });

  test("толгойн товчийг эрт дарахад React-ийн ижил товч ажиллана", async ({ page, isMobile }) => {
    await holdHero(page);
    // Утсанд хайлтын дүрс товч, компьютерт харанхуй загварын товч — хоёулаа
    // shell-д зураг, React-д жинхэнэ товч.
    const selector = isMobile ? "#hero-shell .header-search-trigger" : "#hero-shell .header-theme-toggle";
    const box = (await page.locator(selector).boundingBox())!;
    expect(await page.evaluate(() => document.getElementById("root")!.childElementCount), "React аль хэдийн mount болсон").toBe(0);
    const themeBefore = await page.evaluate(() => document.documentElement.getAttribute("data-storefront-theme"));
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if (isMobile) {
      await expect(page.locator(".header-search-input:visible").first()).toBeVisible({ timeout: 5_000 });
    } else {
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-storefront-theme")), { timeout: 5_000 }).not.toBe(themeBefore);
    }
  });
});
