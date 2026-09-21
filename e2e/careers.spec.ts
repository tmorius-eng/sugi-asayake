import { expect, test } from "./helpers/fixtures";
import { E2E_MARKER } from "./helpers/environment";

/**
 * /careers + ерөнхий анкет (staging-д зар байхгүй ч ерөнхий анкет үргэлж бий).
 * Талбарын алдаа (useFieldErrors) → бодит илгээлт → баярлалаа дэлгэц. Анкет нь
 * staging-ийн job_applications-д E2E_MARKER-тэй нэрээр бичигдэнэ.
 */
test("/careers: ерөнхий анкет — алдаа талбар дээрээ, дараа нь амжилттай илгээнэ", async ({ page }) => {
  await page.goto("/careers");
  await expect(page.getByRole("heading", { level: 1, name: /ажлын байр/i })).toBeVisible();
  await page.locator(".careers-side-apply").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Илгээх/ }).click();
  await expect(dialog.getByText("Нэрээ бичнэ үү.")).toBeVisible();
  await dialog.locator("#job-name").fill(`${E2E_MARKER} анкет`);
  await dialog.locator("#job-phone").fill("99112233");
  await dialog.getByRole("button", { name: /Илгээх/ }).click();
  await expect(dialog.getByText(/Баярлалаа/)).toBeVisible({ timeout: 20_000 });
});
