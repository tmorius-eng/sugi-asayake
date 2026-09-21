import { expect, test } from "./helpers/fixtures";
import { addFirstInStockProductToCart } from "./helpers/storefront";

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
