import { expect, test } from "./helpers/fixtures";

/**
 * /login — маягтын алдаа талбар дээр нь (hooks/useFieldErrors, 2026-09-21) ба
 * буруу нууц үгийн хариу. Амжилттай нэвтрэлтийг signInAs-аар богиносгодог
 * (OTP-г тойрох арын хаалга нэмэхгүй дүрэм) тул энд буруу нууц үгийн зам л
 * бодит серверийн хариугаар шалгагдана.
 */
test.describe("/login", () => {
  test("хоосон илгээхэд хоёр талбар өөрийн алдаагаа заана, фокус эхнийх дээр", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Нэвтрэх" }).click();
    await expect(page.getByText("Утасны дугаараа оруулна уу.")).toBeVisible();
    await expect(page.getByText("Нууц үгээ оруулна уу.")).toBeVisible();
    await expect(page.locator("#login-phone")).toBeFocused();
    await expect(page.locator("#login-phone")).toHaveAttribute("aria-invalid", "true");
    // Бичиж эхэлмэгц тэр талбарын алдаа арилна.
    await page.locator("#login-phone").fill("9911");
    await expect(page.getByText("Утасны дугаараа оруулна уу.")).toHaveCount(0);
  });

  test("буруу нууц үг: серверийн монгол мессеж, нэвтрүүлэхгүй", async ({ page }) => {
    // 2026-09-29-өөс клиент утасны ФОРМАТЫГ урьдчилан шалгадаг тул E2E хэрэглэгчийн
    // `e2e-sugi-user` "утас" серверт хүрэхгүй. Форматын хувьд зөв, санамсаргүй дугаар
    // ашиглана — сервер бүртгэлгүй дугаар ба буруу нууц үгт ИЖИЛ мессеж өгдөг
    // (хэрэглэгч тоолох боломжгүй), тэр мессежийг л шалгана.
    const phone = `8${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    await page.goto("/login");
    await page.locator("#login-phone").fill(phone);
    await page.locator("#login-password").fill("this-is-not-the-password");
    await page.getByRole("button", { name: "Нэвтрэх" }).click();
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("бүртгүүлэх горим руу шилжихэд утасны баталгаажуулалт эхэлнэ", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Бүртгүүлэх/ }).click();
    await expect(page.getByRole("button", { name: /Нэвтрэх/ })).toBeVisible();
    await expect(page.getByPlaceholder("9911 2233")).toBeVisible();
  });
});
