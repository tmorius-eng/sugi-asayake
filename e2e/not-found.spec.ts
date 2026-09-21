import { expect, test } from "./helpers/fixtures";

/**
 * Байхгүй зам — брэндийн 404 хуудас ба HTTP 404 (2026-09-21).
 *
 * Өмнө нь сервер БҮХ замд 200 буцаадаг ("soft 404" — хайлтын систем буруу
 * хаягийг жинхэнэ хуудас мэт индексжүүлдэг), нэг үгтэй буруу хаяг (`/shopp`) нь
 * нийтлэлийн `/:slug` route руу орж "Мэдээ олдсонгүй" гэж харуулдаг байв.
 * Одоо хоёулаа брэндийн 404 хуудас + HTTP 404 (server/_core/routeStatus.ts).
 */
for (const path of ["/shopp", "/no/such/page-e2e"]) {
  test(`${path}: брэндийн 404 хуудас, HTTP 404, JS алдаагүй`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(path);
    expect(response?.status(), "сервер 404 буцаах ёстой (soft 404 биш)").toBe(404);
    await expect(page.locator(".notfound-code")).toHaveText("404");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Мэдээ олдсонгүй")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /нүүр|дэлгүүр/i }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("жинхэнэ хуудсууд 200 хэвээр", async ({ page }) => {
  for (const path of ["/", "/shop", "/privacy", "/help", "/journal", "/brands"]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
  }
});
