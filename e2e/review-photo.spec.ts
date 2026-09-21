import sharp from "sharp";
import { and, eq, gt } from "drizzle-orm";
import { orderItems, orders, productReviews, products } from "../drizzle/schema";
import { getDb } from "../server/db";
import { expect, test } from "./helpers/fixtures";
import { ensureE2EUser, signInAs } from "./helpers/session";

/**
 * Сэтгэгдэлд зураг (2026-09-21, migration 0093) — бодит хөтөч дээр: баталгаат
 * худалдан авалттай E2E хэрэглэгч барааны хуудсанд зураг сонгож (утсан дээр
 * багасгана), сэтгэгдлээ илгээж, урсгалд thumbnail гарч, дарахад томорно.
 *
 * Өгөгдөл: staging-д тухайн хэрэглэгчид нэг "completed" захиалга үүсгэнэ (тест бүрт
 * шинэ), өмнөх ажиллалтын сэтгэгдлийг устгана (нэг хэрэглэгч нэг бараанд нэг л
 * сэтгэгдэл), төгсгөлд хоёуланг цэвэрлэнэ. Зураг R2-д `reviews/<id>/` доор үлдэнэ.
 */
test("сэтгэгдэлд зураг хавсаргаж, урсгалд харагдаж, томорно", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const user = await ensureE2EUser("user");
  const db = (await getDb())!;
  const [product] = await db.select({ id: products.id, slug: products.slug, name: products.name }).from(products)
    .where(and(eq(products.isPublished, true), gt(products.stockQuantity, 0), eq(products.kind, "physical"))).limit(1);
  await db.delete(productReviews).where(and(eq(productReviews.userId, user.id), eq(productReviews.productId, product.id)));
  const orderNumber = `E2R${Date.now()}`;
  const orderId = Number((await db.insert(orders).values({
    userId: user.id, orderNumber, status: "completed", paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    deliveryMethod: "store_pickup", pickupBranch: "E2E", customerName: "E2E", customerPhone: "99000000", subtotalMnt: 1_000, totalMnt: 1_000,
  }))[0].insertId);
  await db.insert(orderItems).values({ orderId, productId: product.id, productName: product.name, sku: `e2e-${orderNumber}`, unitPriceMnt: 1_000, quantity: 1 });

  try {
    await signInAs(context, "user", baseURL!);
    await page.goto(`/product/${product.slug}`);
    const form = page.locator("form").filter({ hasText: "Сэтгэгдэл үлдээх" });
    await form.scrollIntoViewIfNeeded();
    await expect(form).toBeVisible();

    // Өнгөлөг, ялгарахуйц зураг (улаан→цэнхэр градиент): цайвар цэвэр өнгө нь
    // бөмбөлгийн дэвсгэртэй нийлж, screenshot дээр "зураг алга" мэт харагддаг байв.
    const size = 900;
    const pixels = Buffer.alloc(size * size * 3);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      pixels[i] = Math.round(223 * (1 - x / size)); pixels[i + 1] = Math.round(120 * (y / size)); pixels[i + 2] = Math.round(200 * (x / size));
    }
    const photo = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
    await form.locator('input[type="file"]').setInputFiles({ name: "IMG_2001.jpg", mimeType: "image/jpeg", buffer: photo });
    await expect(form.locator(".review-photo-preview img")).toBeVisible({ timeout: 45_000 });
    await form.locator("textarea").fill("E2E: зурагтай сэтгэгдэл");
    await form.getByRole("button", { name: /Илгээх|Нийтлэх|Сэтгэгдэл/ }).last().click();

    const thumb = page.locator(".review-thread .review-photo img").first();
    await expect(thumb).toBeVisible({ timeout: 20_000 });
    await thumb.scrollIntoViewIfNeeded();
    // "Элемент байна" биш — зураг бодитоор татагдаж зурагдсан эсэх (naturalWidth).
    await expect.poll(() => thumb.evaluate(img => (img as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath("review-photo-thread.png") });
    await page.locator(".review-thread .review-photo").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const big = dialog.locator("img").first();
    await expect.poll(() => big.evaluate(img => (img as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(600); // нээгдэх анимаци дуусах
    await page.screenshot({ path: test.info().outputPath("review-photo-lightbox.png") });
  } finally {
    await db.delete(productReviews).where(and(eq(productReviews.userId, user.id), eq(productReviews.productId, product.id)));
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
  }
});
