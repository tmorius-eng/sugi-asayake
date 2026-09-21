import { expect, test } from "./helpers/fixtures";

/** /forgot-password — утасны баталгаажуулалтын алхам ачаалагдаж, буруу дугаарт хариу өгнө. */
test("/forgot-password: гарчиг, утасны талбар, буруу дугаарт алдаа", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const phone = page.getByPlaceholder("9911 2233");
  await expect(phone).toBeVisible();
  await phone.fill("1");
  await page.getByRole("button", { name: /код|илгээ|баталгаажуул/i }).first().click();
  // Сервер (эсвэл клиент) буруу дугаарыг татгалзана — toast эсвэл талбарын мөр.
  await expect(page.locator("[data-sonner-toast], .field-error, [role=\"alert\"]").first()).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/forgot-password/);
});
