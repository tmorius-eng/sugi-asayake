import { expect, test } from "./helpers/fixtures";

/**
 * Хайлт v3 (2026-09-20) — Tom-ийн гомдол бүрийг хөтөч дээр: кирилл үг, галиг,
 * буруу бичсэн брэнд, баркод, монгол нэр. Толгойн хайлт (`catalog.suggest`) ба
 * /shop (`catalog.search`) нэг индекс тул хоёуланг нь дайрна.
 *
 * Staging-ийн бодит каталогт тулгуурлана (PRIECLAT 21, Cocochi 16 бараа —
 * 2026-09-14-ний prod хуулбар). Бараа нэмэхгүй, бичихгүй.
 */
const HEADER_INPUT = ".header-search-input";
const RESULT = ".header-search-result";

/** Компьютерт inline талбар, утсанд дүрсэн товч → popover: аль нь ч байсан бичнэ. */
async function typeInHeader(page: import("@playwright/test").Page, query: string) {
  let input = page.locator(`${HEADER_INPUT}:visible`).first();
  if (!(await input.count())) {
    await page.locator(".header-search-trigger:visible").first().click();
    input = page.locator(`${HEADER_INPUT}:visible`).first();
  }
  await expect(input).toBeVisible();
  await input.fill(query);
}

test.describe("хайлт v3", () => {
  test("кирилл үгээр (батга) латин нэртэй бараа олдоно", async ({ page }) => {
    await page.goto("/shop?q=%D0%B1%D0%B0%D1%82%D0%B3%D0%B0");
    await expect(page.locator(".shop-product-card").first()).toBeVisible({ timeout: 20_000 });
  });

  test("галигаар (shampun) шампунь олдоно", async ({ page }) => {
    await page.goto("/shop?q=shampun");
    const cards = page.locator(".shop-product-card");
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    await expect(cards.first()).toContainText(/shampoo|шампунь/i);
  });

  test("буруу бичсэн брэнд (priecla) толгойн хайлтад брэндийн мөр өгнө", async ({ page }) => {
    await page.goto("/");
    await typeInHeader(page, "priecla");
    await expect(page.locator(".header-search-facet").first()).toContainText(/PRIECLAT/i, { timeout: 15_000 });
    await expect(page.locator(RESULT).first()).toBeVisible();
  });

  test("кириллээр бичсэн брэнд (кокочи) бараа олно", async ({ page }) => {
    await page.goto("/");
    await typeInHeader(page, "кокочи");
    await expect(page.locator(RESULT).filter({ hasText: /cocochi/i }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("брэндийн мөр дарахад /shop?brand= нээгдэнэ", async ({ page }) => {
    await page.goto("/");
    await typeInHeader(page, "cocochi");
    const facet = page.locator(".header-search-facet").first();
    await expect(facet).toContainText(/Cocochi/i, { timeout: 15_000 });
    await facet.click();
    await expect.poll(() => new URL(page.url()).searchParams.get("brand"), { timeout: 15_000 }).toMatch(/cocochi/i);
    await expect(page.locator(".shop-product-card").first()).toBeVisible();
  });

  test("утгагүй хайлтад хоосон төлөв, санал (did you mean) эсвэл 'олдсонгүй'", async ({ page }) => {
    await page.goto("/");
    await typeInHeader(page, "zzqxjv");
    await expect(page.locator(".header-search-empty, .header-search-didyoumean").first()).toBeVisible({ timeout: 15_000 });
  });
});
