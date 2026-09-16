import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";
import { E2E_MARKER } from "./helpers/environment";

/**
 * Сагс — зочин (нэвтрээгүй) хэрэглэгчээр.
 *
 * Сагс нь хөтөчийн localStorage биш, СЕРВЕР дээрх мөр (`carts` / `cart_items`,
 * зочны хувьд `guest_cart_token` cookie-гоор холбогддог) тул "нэмээд refresh
 * хийхэд үлдэж байна уу" гэдэг нь бодит round trip-ийг шалгадаг цорын ганц зам.
 *
 * Захиалга ЭНД өгөхгүй: e2e нь staging схемд ажилладаг ч захиалга нь мэдэгдэл,
 * нөөцийн ledger, тоолуур зэрэг олон зүйлийг хөдөлгөдөг тул тусдаа, зориудаар
 * тэмдэглэгдсэн урсгал байх ёстой (checkout.spec.ts).
 */
async function addFirstInStockProductToCart(page: Page) {
  await page.goto("/shop");
  // Нөөцгүй бараа "Сагсанд нэмэх"-ийг идэвхгүй болгодог тул бэлэн нөөцтэйг л шүүнэ.
  await page.locator(".stock-toggle input[type=checkbox]").check();
  await expect(page.locator(".shop-product-card").first()).toBeVisible();
  // ⚠️ Өөр spec-ийн түр бараа (product-variants.spec.ts нь `e2e-sugi` тэмдэгтэй
  // бараа үүсгээд устгадаг) энэ жагсаалтад орж ирвэл яг тэр агшинд устсан
  // бараа руу ороод унадаг байв — каталогийн 10 секундын кэш түүнийг хэсэг
  // хугацаанд харуулсаар байдаг. Тестийн барааг зориуд алгасана.
  const card = page.locator(".shop-product-card").filter({ hasNotText: E2E_MARKER }).first();
  await expect(card).toBeVisible();
  // Нэрийг картаас УРЬДЧИЛАН авна: SPA дээр URL нь шинэ хуудсын DOM-оос эрт
  // солигддог тул шилжсэний дараа "эхний h1"-ийг уншвал заримдаа өмнөх
  // хуудсынх (дэлгүүрийн гарчиг) гарт орно.
  const name = ((await card.locator("h2").first().textContent()) ?? "").trim();
  await card.locator(".shop-product-link").first().click();
  await expect(page).toHaveURL(/\/product\//);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  // Хоёр товч байдаг (desktop, утасны наалттай мөр) — харагдаж байгааг нь.
  const addButton = page.getByRole("button", { name: /Сагсанд нэмэх/ }).filter({ visible: true }).first();
  await addButton.click();
  return name;
}

test.describe("сагс (зочин)", () => {
  test("бараа нэмэхэд сагсанд харагдаж, refresh-ийг давна", async ({ page }) => {
    const name = await addFirstInStockProductToCart(page);

    await page.getByRole("button", { name: /Сагс нээх/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "Таны сагс" })).toBeVisible();
    await expect(drawer.getByRole("heading", { name })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Захиалга үргэлжлүүлэх" })).toBeVisible();

    // Сервер дээр үнэхээр хадгалагдсан эсэх: шинэ ачаалалт.
    await page.reload();
    await page.getByRole("button", { name: /Сагс нээх/ }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name })).toBeVisible();
  });

  test("тоо нэмэх, хасах, устгах ажиллана", async ({ page }) => {
    const name = await addFirstInStockProductToCart(page);
    await page.getByRole("button", { name: /Сагс нээх/ }).click();
    const drawer = page.getByRole("dialog");

    await drawer.getByRole("button", { name: `${name} — тоо нэмэх` }).click();
    await expect(drawer.getByText("2", { exact: true }).first()).toBeVisible();

    await drawer.getByRole("button", { name: `${name} — сагснаас хасах` }).click();
    await expect(drawer.getByText("Сагс хоосон байна")).toBeVisible();
  });

  test("сагснаас checkout руу орж, хүргэлтийн маягт гарч ирнэ", async ({ page }) => {
    await addFirstInStockProductToCart(page);
    await page.getByRole("button", { name: /Сагс нээх/ }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Захиалга үргэлжлүүлэх" }).click();
    await expect(page).toHaveURL(/\/checkout/);
    // Захиалга ӨГӨХГҮЙ — зөвхөн хуудас бодитоор нээгдэж, эхний алхмын маягт
    // гарч ирснийг шалгана (утас, компьютер хоёуланд ижил).
    // 20 секунд: checkout нь сагс, хүргэлтийн тохиргоо, салбар, урамшуулал
    // зэрэг хэд хэдэн дуудлагыг зэрэг хийдэг тул бүтэн suite ажиллаж байхад
    // (нэг DB-г хуваалцаж) 10 секунд заримдаа хүрэхгүй байв.
    await expect(page.getByRole("heading", { name: "Хүлээн авах мэдээлэл" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder("Таны нэр")).toBeVisible();
  });
});
