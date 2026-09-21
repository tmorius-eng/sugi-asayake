import type { Locator } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";
import { openAdminSection } from "./helpers/admin";

/**
 * Лого одоо `brand-logo` / `brand-symbol` media slot-оос ирдэг (2026-09-17).
 *
 * Энэ багц нь дизайныг биш, УТСЫГ шалгана: hook утга буцааж байна уу, зураг
 * бодитоор ачаалагдаж байна уу. Учир нь энэ өөрчлөлтийн хамгийн болзошгүй
 * эвдрэл нь чимээгүй байдаг — `src={undefined}` үед React `src` атрибутыг огт
 * бичихгүй тул DOM-д `<img>` хэвээр "байна", зүгээр л хоосон дөрвөлжин
 * харагдана. Тиймээс `naturalWidth`-ийг хэмжинэ (2026-09-16-ны дүрэм:
 * "элемент DOM-д байна" нь хангалтгүй).
 */

/** Зураг бодитоор ачаалагдсан эсэх — байршил/хэмжээ биш, БАЙГАА эсэх. */
const loadedWidth = (locator: Locator) =>
  locator.evaluate((img: HTMLImageElement) => ({ src: img.getAttribute("src"), naturalWidth: img.naturalWidth }));

test.describe("брэндийн лого", () => {
  test("толгой ба хөл хэсгийн лого бодитоор ачаалагдана", async ({ page }) => {
    await page.goto("/");

    const headerLogo = page.locator(".commerce-brand img").first();
    await expect(headerLogo).toBeVisible();
    const header = await loadedWidth(headerLogo);
    expect(header.src, "толгойн лого src-гүй байна (hook null буцаасан уу?)").toBeTruthy();
    expect(header.naturalWidth, `лого ачаалагдсангүй: ${header.src}`).toBeGreaterThan(0);

    const footerLogo = page.locator(".site-footer .footer-logo").first();
    const footer = await loadedWidth(footerLogo);
    expect(footer.src).toBeTruthy();
    expect(footer.naturalWidth, `footer-ийн лого ачаалагдсангүй: ${footer.src}`).toBeGreaterThan(0);

    // Хоёулаа ижил эх сурвалжаас — өмнө нь толгой хэсэг өөрийн хатуу замтай
    // байсан тул нэгийг нь сольвол нөгөө нь хуучнаараа үлддэг байв.
    expect(footer.src, "толгой ба хөл өөр лого харуулж байна").toBe(header.src);
  });

  test("сервер #storefront-bootstrap блокийг бөглөж өгдөг ба эхний зурагдалт түүнтэй таарна", async ({ page }) => {
    await page.goto("/");

    const bootstrap = await page.evaluate(() => {
      const block = document.getElementById("storefront-bootstrap");
      return block?.textContent ?? null;
    });
    expect(bootstrap, "#storefront-bootstrap блок алга — index.html эсвэл indexHtml.ts тасарсан").toBeTruthy();
    // Орлуулаагүй placeholder ("%STOREFRONT_BOOTSTRAP_JSON%") нь JSON биш тул энд унана.
    const data = JSON.parse(bootstrap!) as { siteMedia?: Array<{ slotKey: string; imageUrl: string }> };
    expect(Array.isArray(data.siteMedia), "блокт siteMedia жагсаалт алга").toBe(true);
    // 2026-09-21: блок бүх slot-ыг агуулдаг болсон (hero-г tRPC-гүй зурахын тулд).
    // Лого мөргүй бол толгой хэсэг бүртгэгдсэн default-оо зурна — тэр ч таарах ёстой.
    const parsed = { logo: data.siteMedia!.find(row => row.slotKey === "brand-logo")?.imageUrl ?? "/images/brand/sugi-logo.webp" };

    const headerSrc = await page.locator(".commerce-brand img").first().getAttribute("src");
    expect(headerSrc, "эхний зурагдалтын лого сервэрийнхээс зөрж байна (солих үед анивчна)").toBe(parsed.logo);
  });

  test("/admin → Content & Media дээр логоны карт байна", async ({ page, context, baseURL }) => {
    // Tom-ийн бодит зам: /admin нээж, Content & Media рүү орж, логоны картыг
    // олох. Бүртгэлд slot нэмэхэд карт нь автоматаар гардаг ч "автоматаар
    // гарах ЁСТОЙ" гэдэг нь харагдсантай ижил биш (2026-09-16-ны дүрэм).
    await signInAs(context, "admin", baseURL!);
    await page.goto("/admin");
    await openAdminSection(page, "Content & Media");

    await expect(page.getByRole("heading", { level: 3, name: "Сайтын лого (нэрийн бичиглэл)" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Лого — жижиг бэлгэ тэмдэг" })).toBeVisible();
    // Картын зураг оруулах товч — байршуулах зам бодитоор нээлттэй эсэх.
    await expect(page.getByText("BRAND-LOGO", { exact: true })).toBeVisible();
  });
});
