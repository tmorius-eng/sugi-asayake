import { expect, test } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";

/** /orders — профайлын захиалгын таб руу шилжүүлдэг богино зам (MyOrders.tsx). */
test.describe("/orders", () => {
  test("нэвтэрсэн: профайлын захиалгын таб нээгдэнэ", async ({ page, context, baseURL }) => {
    await signInAs(context, "user", baseURL!);
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/profile\?tab=orders/);
    await expect(page.locator(".profile-main")).toBeVisible();
  });

  test("зочин: нэвтрэх хуудас руу очно, эвдрэхгүй", async ({ page }) => {
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/login|\/profile/);
    await expect(page.locator("#main-content")).toBeVisible();
  });
});
