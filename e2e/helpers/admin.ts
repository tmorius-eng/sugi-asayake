import { expect, type Page } from "@playwright/test";

/**
 * /admin-ийн хэсэг сонгох.
 *
 * 1024px-ээс доош ижил цэс нь зүүн талын drawer-т байдаг (AdminSidebar-ийн
 * `lg:block` + Sheet) тул эхлээд "Цэс нээх". Утаснаас ажилладаг ажилтны хувьд
 * энэ нь бодит зам — POS болон бараа хүлээн авах хоёр голдуу утсан дээр хийгддэг.
 *
 * Панель ачаалагдтал ХОЁУЛАА DOM-д байхгүй тул эхлээд аль нэг нь гарч ирэхийг
 * хүлээнэ — эс бөгөөс `isVisible()` шууд false буцааж, утсан дээр байхгүй
 * хажуугийн цэсийг дарах гэж оролдоно.
 */
export async function openAdminSection(page: Page, label: string) {
  const menuButton = page.getByRole("button", { name: "Цэс нээх" });
  const sectionButton = page.getByRole("button", { name: label, exact: true });
  await expect(menuButton.or(sectionButton).first()).toBeVisible();
  if (await menuButton.isVisible()) await menuButton.click();
  await sectionButton.click();
}
