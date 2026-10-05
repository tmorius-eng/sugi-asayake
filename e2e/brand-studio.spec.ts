import { expect, test } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";
import { openAdminSection } from "./helpers/admin";

/**
 * /admin → Брэнд студи (2026-10-05, A1). Сервер талыг brand-studio.integration.test.ts шалгадаг;
 * энд: амьд preview бодитоор өнгө авдаг, AA анхааруулга + "Бүгдийг засах", баярын урьдчилан
 * харалт (постер + мэндчилгээ) iframe-д гардаг, утсан дээр хуудас хэвтээ гүйлгэхгүй.
 * Юу ч ХАДГАЛАХГҮЙ — staging-ийн өнгийг бусад spec (контраст) хэмждэг.
 */
test.describe("Брэнд студи", () => {
  test("өнгө → амьд preview, AA хамгаалалт, баярын урьдчилан харалт", async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    await signInAs(context, "admin", baseURL!);
    await page.goto("/admin");
    await openAdminSection(page, "Брэнд студи");
    await expect(page.getByText(/Одоо идэвхтэй:/)).toBeVisible();

    const frame = page.frameLocator('iframe[title="Сайтын урьдчилан харах"]');
    await expect(frame.locator(".hero-copy h1")).toBeVisible({ timeout: 30_000 });
    const readVar = (name: string) => frame.locator("html").evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

    // Үндсэн өнгө солиход iframe-ийн --primary хуудас дахин ачаалалгүй солигдоно.
    await page.getByLabel("Үндсэн өнгө (товч) — hex").fill("#1d4e9e");
    await expect.poll(() => readVar("--primary"), { timeout: 5_000 }).toBe("#1d4e9e");
    await expect(page.getByRole("button", { name: "Хадгалах" })).toBeEnabled();

    // Унших боломжгүй хослол → анхааруулга, хадгалах хаалттай → "Бүгдийг засах".
    await page.getByLabel("Товч дээрх текст — hex").fill("#7aa0e0");
    await expect(page.getByText(/Унших боломжгүй \d+ хослол/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Хадгалах" })).toBeDisabled();
    await page.getByRole("button", { name: "Бүгдийг засах" }).click();
    await expect(page.getByText(/Бүх текст уншигдахуйц/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("brand-studio-colors.png"), fullPage: false });

    // Цуцлах — юу ч хадгалахгүй.
    await page.getByRole("button", { name: "Цуцлах" }).click();
    await expect.poll(() => readVar("--primary"), { timeout: 5_000 }).not.toBe("#1d4e9e");

    // Логоноос палитр (A2): сайтын логоноос 3 палитр, дарахад preview-д шууд.
    await page.getByRole("button", { name: "Логоноос өнгө гаргах" }).click();
    await expect(page.getByRole("button", { name: /— туршиж үзэх$/ })).toHaveCount(3, { timeout: 20_000 });
    await page.getByRole("button", { name: "Тод — туршиж үзэх" }).click();
    await expect(page.getByText(/Бүх текст уншигдахуйц/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("brand-studio-logo-palette.png"), fullPage: false });
    await page.getByRole("button", { name: "Цуцлах" }).click();

    // Нүүрний бүтэц (A3): салбаруудыг хамгийн дээр, ангиллыг нуух — preview reload-гүй дахин эрэмбэлнэ.
    await page.getByRole("tab", { name: "Нүүрний бүтэц" }).click();
    for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "Салбарууд — дээш" }).click();
    await page.getByRole("button", { name: /Ангиллууд — нуух/ }).click();
    await expect.poll(async () => frame.locator("main > *").evaluateAll(nodes => nodes.findIndex(n => n.id === "stores" || n.querySelector("#stores"))), { timeout: 5_000 }).toBe(1);
    await expect(frame.locator("#collection")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("brand-studio-layout.png"), fullPage: false });
    await page.getByRole("button", { name: "Цуцлах" }).click();
    await expect.poll(async () => frame.locator("#stores").count()).toBe(1);

    // Баярын таб: 13 карт, Цагаан сарын урьдчилан харалт → постер + мэндчилгээ iframe-д.
    await page.getByRole("tab", { name: "Баярын загвар" }).click();
    await expect(page.getByRole("button", { name: "Урьдчилан харах" })).toHaveCount(13);
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Цагаан сар" }) });
    await card.getByRole("button", { name: "Урьдчилан харах" }).click();
    await expect(frame.locator(".hero-greeting")).toHaveText("Сар шинэдээ сайхан шинэлээрэй!", { timeout: 5_000 });
    await expect(frame.locator('[data-slot="home-hero"] img').first()).toHaveAttribute("src", /\/images\/holidays\/tsagaan-sar\.webp$/);
    await expect.poll(async () => frame.locator('[data-slot="home-hero"] img').first().evaluate(img => (img as HTMLImageElement).naturalWidth), { timeout: 10_000 }).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath("brand-studio-holidays.png"), fullPage: false });

    // Утасны өргөнд хуудас бүхэлдээ хэвтээ гүйлгэхгүй.
    if (testInfo.project.name === "mobile") {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("энгийн хэрэглэгчийн iframe-гүй хуудсанд гүүр юу ч хийхгүй", async ({ page }) => {
    await page.goto("/?brandPreview=1");
    await expect(page.locator("html")).not.toHaveAttribute("data-brand-preview", "");
  });
});
