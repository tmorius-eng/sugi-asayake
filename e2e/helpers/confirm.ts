import type { Page } from "@playwright/test";

/**
 * Сайтын өөрийн confirm dialog-ийг (components/ConfirmDialog.tsx, 2026-09-21)
 * батлана. Өмнө нь `page.once("dialog", d => d.accept())` — хөтчийн төрөлх
 * confirm-д зориулсан зам байсан; одоо энгийн товч.
 */
export async function acceptConfirm(page: Page) {
  const dialog = page.getByTestId("confirm-dialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.locator(".confirm-dialog-ok").click();
  await dialog.waitFor({ state: "hidden" });
}
