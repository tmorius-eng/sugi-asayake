import { expect, test } from "./helpers/fixtures";
import { addFirstInStockProductToCart } from "./helpers/storefront";

/**
 * Толгойн сагс ХУУДАС БҮРД ажиллана (2026-09-21).
 *
 * /journal, /brands, нийтлэл, /track-order, /login, /checkout дээр толгойн сагсны
 * дүрс "үхсэн" байв: тоо нь үргэлж 0, дарахад юу ч болдоггүй (хуудас сагсаа
 * холбоогүй тул `onCartOpen` undefined). Мөн /privacy /terms /about /help
 * хуудсанд толгой огт байгаагүй. Одоо толгой сагсаа өөрөө удирдана.
 */
test("сагстай зочин: толгойн сагс бүх хуудсанд зөв тоотой, дарахад нээгдэнэ", async ({ page }) => {
  test.setTimeout(90_000);
  const name = await addFirstInStockProductToCart(page);
  await expect(page.locator(".added-to-cart-toast.is-visible")).toBeVisible({ timeout: 15_000 });

  for (const path of ["/privacy", "/terms", "/about", "/help", "/journal", "/brands", "/track-order", "/login"]) {
    await page.goto(path);
    const cart = page.locator(".commerce-header").getByRole("button", { name: /Сагс нээх, \d+ бараатай/ });
    await expect(cart, `${path}: толгойн сагс тоогүй эсвэл алга`).toBeVisible({ timeout: 15_000 });
  }

  // Нэг хуудсанд бодитоор нээж, бараа нь drawer-т байгааг харна.
  await page.goto("/privacy");
  await page.locator(".commerce-header").getByRole("button", { name: /Сагс нээх/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Таны сагс" })).toBeVisible();
  await expect(drawer.getByRole("heading", { name })).toBeVisible();
});

test("хуулийн ба тусламжийн хуудсанд сайтын толгой байна", async ({ page }) => {
  for (const path of ["/privacy", "/terms", "/about", "/help"]) {
    await page.goto(path);
    await expect(page.locator(".commerce-header"), `${path}: толгой алга`).toBeVisible();
    await expect(page.getByRole("button", { name: "Хэл" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
