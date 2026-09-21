import { expect, test } from "./helpers/fixtures";
import { ensureE2ERoutine } from "./helpers/routine";

/**
 * /routine/:slug — багцын хуудас ба "Бүгдийг сагслах" (өөрийн тестийн routine).
 *
 * Амжилтыг хэрэглэгчийн харах дохиогоор (toast) ба серверийн сагсаар шалгана —
 * drawer-ийг нээх товчоор биш: утсан дээр toast яг сагсны товчны дэргэд
 * хөдөлж гардаг тул товч "тогтворжих" хүртэл хүлээж, бүтэн run-д унаж байв.
 */
test("/routine/:slug: багц харагдаж, Бүгдийг сагслах сагсыг дүүргэнэ", async ({ page }) => {
  const routine = await ensureE2ERoutine();
  await page.goto(`/routine/${routine.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: routine.name })).toBeVisible();
  await page.getByRole("button", { name: /Бүгдийг сагслах/ }).click();
  await expect(page.locator(".added-to-cart-toast.is-visible")).toContainText("сагсанд орлоо", { timeout: 20_000 });

  // Сервер дээрх зочны сагс (ижил cookie) багцын бүх барааг агуулна.
  const response = await page.request.get("/api/trpc/cart.current");
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { result: { data: { json: { items: Array<{ productId: number }> } | null } } };
  const inCart = new Set((payload.result.data.json?.items ?? []).map(item => item.productId));
  for (const productId of routine.productIds) expect(inCart.has(productId), `бараа #${productId} сагсанд алга`).toBe(true);
});
