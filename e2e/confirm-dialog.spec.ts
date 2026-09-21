import { expect, test } from "./helpers/fixtures";
import { signInAs } from "./helpers/session";

/**
 * Сайтын өөрийн confirm dialog (components/ConfirmDialog.tsx, 2026-09-21) —
 * window.confirm-ийн оронд. Хамгийн аюултай storefront товч дээр шалгана:
 * "Бүх төхөөрөмжөөс гарах". "Болих" дарахад юу ч болохгүй (session хэвээр),
 * dialog нь role=dialog, гарчигтай, Esc-ээр хаагдана.
 */
test("профайл → аюулгүй байдал: гарах товч сайтын dialog асааж, Болих нь юу ч хийхгүй", async ({ page, context, baseURL }) => {
  await signInAs(context, "user", baseURL!);
  await page.goto("/profile?tab=security");
  await page.getByRole("button", { name: /Бүх төхөөрөмж/ }).first().click();

  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Бүх төхөөрөмжөөс гарах уу?" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("confirm-dialog.png") });
  await dialog.getByRole("button", { name: "Болих" }).click();
  await expect(dialog).toBeHidden();

  // Session хэвээр: профайл нээлттэй, нэвтрэх хуудас руу шидээгүй.
  await page.reload();
  await expect(page.locator(".profile-main")).toBeVisible();

  // Esc ч хаана.
  await page.getByRole("button", { name: /Бүх төхөөрөмж/ }).first().click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
