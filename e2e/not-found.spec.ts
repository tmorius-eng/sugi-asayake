import { expect, test } from "./helpers/fixtures";

/** Байхгүй зам — брэндийн 404 хуудас, JS алдаагүй.
 *  Олон сегменттэй зам: нэг сегменттэй (`/xyz`) нь нийтлэлийн `/:slug` route руу орж
 *  "Мэдээ олдсонгүй" харуулдаг (App.tsx) — тэр нь тусдаа зан төлөв. */
test("404: байхгүй хуудас брэндийн 404-ийг харуулна", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/no/such/page-e2e");
  await expect(page.locator(".notfound-code")).toHaveText("404");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /нүүр|дэлгүүр/i }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
