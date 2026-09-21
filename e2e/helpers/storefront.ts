import type { Page } from "@playwright/test";
import { expect } from "./fixtures";
import { E2E_MARKER } from "./environment";

/**
 * Нөөцтэй эхний барааг сагсанд нэмнэ — зочин хэрэглэгчээр, яг худалдан авагчийн
 * замаар (/shop → бараа → "Сагсанд нэмэх"). Нэмсэн барааны нэрийг буцаана.
 *
 * cart.spec.ts ба checkout.spec.ts хоёулаа хэрэглэдэг тул энд (2026-09-20).
 */
export async function addFirstInStockProductToCart(page: Page) {
  await page.goto("/shop");
  // Нөөцгүй бараа "Сагсанд нэмэх"-ийг идэвхгүй болгодог тул бэлэн нөөцтэйг л шүүнэ.
  await page.locator(".stock-toggle input[type=checkbox]").check();
  await expect(page.locator(".shop-product-card").first()).toBeVisible();
  // ⚠️ Өөр spec-ийн түр бараа (product-variants.spec.ts нь `e2e-sugi` тэмдэгтэй
  // бараа үүсгээд устгадаг) энэ жагсаалтад орж ирвэл яг тэр агшинд устсан
  // бараа руу ороод унадаг байв — каталогийн 10 секундын кэш түүнийг хэсэг
  // хугацаанд харуулсаар байдаг. Тестийн барааг зориуд алгасна.
  const card = page.locator(".shop-product-card").filter({ hasNotText: E2E_MARKER }).first();
  await expect(card).toBeVisible();
  // Нэрийг картаас УРЬДЧИЛАН авна: SPA дээр URL нь шинэ хуудсын DOM-оос эрт
  // солигддог тул шилжсэний дараа "эхний h1"-ийг уншвал заримдаа өмнөх
  // хуудсынх (дэлгүүрийн гарчиг) гарт орно.
  const name = ((await card.locator("h2").first().textContent()) ?? "").trim();
  await card.locator(".shop-product-link").first().click();
  await expect(page).toHaveURL(/\/product\//);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  // Хоёр товч байдаг (desktop, утасны наалттай мөр) — харагдаж байгааг нь.
  const addButton = page.getByRole("button", { name: /Сагсанд нэмэх/ }).filter({ visible: true }).first();
  await addButton.click();
  return name;
}
