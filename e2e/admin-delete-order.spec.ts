import { eq, like } from "drizzle-orm";
import { expect, test } from "./helpers/fixtures";
import { E2E_MARKER } from "./helpers/environment";
import { signInAs } from "./helpers/session";
import { openAdminSection } from "./helpers/admin";
import { getDb } from "../server/db";
import { orderItems, orders } from "../drizzle/schema";

/**
 * Захиалга устгах — бүтэн гинж хөтөч дээр (2026-09-16, Tom-ийн хүсэлт).
 *
 * Серверийн хаалтуудыг `admin-deletes.integration.test.ts` шалгадаг. Энд
 * шалгах зүйл нь өөр бөгөөд өнөөдрийн сургамжаас гарсан: **товч нь
 * бодитоор гарч ирж, дарахад нь үнэхээр ажиллаж байна уу**. Тэр өдөр
 * QR хаалга, суулгах товч хоёулаа "код зөв, дэлгэц дээр ажиллахгүй"
 * гэсэн ангиллын алдаатай production-д гарсан.
 *
 * Тест нь өөрийн захиалгаа үүсгээд UI-гаар устгана — өгөгдөл `sugi_staging`
 * схемд (e2e/helpers/environment.ts production схемийг хориглодог).
 */
test.describe("админ захиалга устгах", () => {
  test("цуцлагдсан, төлөгдөөгүй захиалгыг UI-гаас устгана", async ({ page, context, baseURL }) => {
    const db = await getDb();
    test.skip(!db, "DB холбогдоогүй.");

    const orderNumber = `${E2E_MARKER.toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
    const inserted = await db!.insert(orders).values({
      orderNumber,
      customerName: `${E2E_MARKER} устгах тест`,
      customerPhone: "99009900",
      deliveryMethod: "ub_delivery",
      paymentMethod: "cash_on_delivery",
      deliveryDistrict: "sukhbaatar",
      deliveryAddress: "Тестийн хаяг",
      subtotalMnt: 1000, deliveryFeeMnt: 0, totalMnt: 1000,
      // Устгах товч ЗӨВХӨН энэ хосон дээр гарна.
      status: "cancelled", paymentStatus: "unpaid",
    });
    const orderId = Number(inserted[0].insertId);
    await db!.insert(orderItems).values({ orderId, productId: null, productName: "Тест бараа", sku: `${E2E_MARKER}-del`, quantity: 1, unitPriceMnt: 1000 });

    try {
      await signInAs(context, "admin", baseURL!);
      await page.goto("/admin");
      await openAdminSection(page, "Захиалга");

      // Жагсаалтын горимд картууд бүрэн харагдана (board горимд багана бүр
      // товчлолтой).
      const listToggle = page.getByRole("button", { name: "Жагсаалт харагдац" });
      if (await listToggle.isVisible().catch(() => false)) await listToggle.click();

      const search = page.getByPlaceholder(/хайх/i).first();
      if (await search.isVisible().catch(() => false)) await search.fill(orderNumber);

      const card = page.locator("article").filter({ hasText: orderNumber });
      await expect(card).toBeVisible({ timeout: 20_000 });

      const deleteButton = card.getByRole("button", { name: "Захиалга устгах" });
      await expect(deleteButton, "цуцлагдсан+төлөгдөөгүй захиалгад устгах товч байх ёстой").toBeVisible();

      page.once("dialog", dialog => dialog.accept());
      await deleteButton.click();

      await expect(card).toHaveCount(0, { timeout: 20_000 });

      // Дэлгэцээс алга болсон нь хангалтгүй — мөр үнэхээр устсан эсэх.
      const rows = await db!.select().from(orders).where(eq(orders.id, orderId));
      expect(rows, "захиалга өгөгдлийн сангаас устсан байх ёстой").toHaveLength(0);
      const items = await db!.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      expect(items, "барааны мөр ч хамт устана").toHaveLength(0);
    } finally {
      await db!.delete(orderItems).where(eq(orderItems.orderId, orderId)).catch(() => undefined);
      await db!.delete(orders).where(like(orders.orderNumber, `${E2E_MARKER.toUpperCase()}%`)).catch(() => undefined);
    }
  });
});
