import { expect, test } from "./helpers/fixtures";

/** Нийтлэлийн хуудас (/:slug) — /journal-ийн эхний нийтлэлийн гарчиг харагдана. */
test("нийтлэл: /journal → эхний нийтлэл нээгдэж гарчиг таарна", async ({ page }) => {
  // Хуудаслалттай content.allPosts (2026-09-21): эхний хуудасны эхний мөр.
  const input = encodeURIComponent(JSON.stringify({ json: { page: 1, pageSize: 1 } }));
  const response = await page.request.get(`/api/trpc/content.allPosts?input=${input}`);
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { result: { data: { json: { items: Array<{ slug: string; title: string }>; total: number } } } };
  const first = payload.result.data.json.items[0];
  test.skip(!first, "staging-д нийтлэл алга");
  await page.goto(`/${first.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: first.title })).toBeVisible();
  await expect(page.locator("#main-content")).toBeVisible();
});
