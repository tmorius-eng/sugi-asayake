import { and, eq, like } from "drizzle-orm";
import { expect, test } from "./helpers/fixtures";
import { E2E_MARKER } from "./helpers/environment";
import { addFirstInStockProductToCart } from "./helpers/storefront";
import { deleteAdminOrder, getDb, updateAdminOrder } from "../server/db";
import { orders } from "../drizzle/schema";

/**
 * Захиалгыг ЭХНЭЭС НЬ ДУУСТАЛ — зочин хэрэглэгчээр, бэлэн төлбөрөөр (2026-09-20).
 *
 * Яагаад: энэ хүртэл E2E сагснаас checkout-ийн маягт нээгдэхийг л шалгадаг
 * байсан (cart.spec.ts) — өөрөөр хэлбэл дэлгүүрийн ГОЛ урсгал болох "захиалга
 * өгөх" хэзээ ч бодит хөтөч дээр дуусч байгаагүй. Shopify-ийн эзэнд өгдөг
 * нээлтийн жагсаалтын хамгийн чухал мөр нь яг "туршилтын захиалга өгч,
 * цуцалж үзэх" юм; энэ тест тэрийг автоматжуулна.
 *
 * Мөн шинэ маягтын алдааны зан төлөвийг (талбар бүрийн доор текст,
 * aria-invalid, aria-describedby) бодит хөтөч дээр баталгаажуулна —
 * өмнө нь дутуу талбарыг зөвхөн алга болдог toast хэлдэг байв.
 *
 * Аюулгүй байдал: сервер нь `sugi_staging` схемд (helpers/environment.ts
 * production-ийг хориглодог), `NOTIFICATIONS_SUPPRESS=1` ба
 * `GUEST_CHECKOUT_OTP=0`-оор (playwright.config.ts) ажилладаг — бодит утсанд
 * SMS, push, имэйл очихгүй. Имэйл талбарыг зориуд хоосон үлдээнэ.
 *
 * Цэвэрлэгээ: аппын ӨӨРИЙН замаар — эхлээд цуцалж (нөөц ledger-ээр буцна),
 * дараа нь `deleteAdminOrder` (нөөцийн нийлбэр 0 эсэхийг өөрөө шалгадаг).
 * Гараар `DELETE` бичихгүй: тэр нь нөөцийн хөдөлгөөнийг өнчрүүлнэ.
 */
test.describe("захиалга (зочин, бэлэн мөнгө)", () => {
  test("дутуу маягт алдааг талбар дээр нь заана, бөглөөд захиалга баталгаажна", async ({ page }) => {
    const db = await getDb();
    test.skip(!db, "DB холбогдоогүй.");

    const productName = await addFirstInStockProductToCart(page);
    // Худалдан авагчийн замаар: сагс нээгээд бараа харагдсаны ДАРАА checkout
    // руу. Шууд `goto("/checkout")` хийвэл "Сагсанд нэмэх" хүсэлт дуусаагүй
    // байж болох тул сагс хоосон, "Захиалга батлах" идэвхгүй гарна (эхний
    // бичлэгт яг ингэж унасан).
    await page.getByRole("button", { name: /Сагс нээх/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: productName })).toBeVisible();
    await drawer.getByRole("link", { name: "Захиалга үргэлжлүүлэх" }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByRole("heading", { name: "Хүлээн авах мэдээлэл" })).toBeVisible({ timeout: 20_000 });

    // --- 1. Хоосон маягт: алдаа ТАЛБАР дээр, зөвхөн toast биш -------------
    const confirm = page.getByRole("button", { name: /Захиалга батлах/ });
    await confirm.click();
    const nameInput = page.locator("#customerName");
    await expect(nameInput).toHaveAttribute("aria-invalid", "true");
    await expect(nameInput).toHaveAttribute("aria-describedby", "customerName-error");
    await expect(page.locator("#customerName-error")).toHaveText("Нэрээ оруулна уу.");
    await expect(page.locator("#customerPhone-error")).toBeVisible();
    // Эхний алдаатай талбар руу фокус шилжинэ — утсан дээр дэлгэцийн гадна
    // байсан ч хэрэглэгч юу буруу болсныг хардаг.
    await expect(nameInput).toBeFocused();

    // Бичихэд тэр талбарын алдаа л арилна.
    const customerName = `${E2E_MARKER} захиалга ${Date.now().toString(36)}`;
    await nameInput.fill(customerName);
    await expect(nameInput).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#customerName-error")).toHaveCount(0);
    await expect(page.locator("#customerPhone-error")).toBeVisible();

    // --- 2. Бөглөх: салбараас авах (хаяг шаардахгүй), бэлэн мөнгө ---------
    await page.locator("#customerPhone").fill("99009900");
    await page.getByRole("button", { name: /Салбараас авах/ }).click();
    const branch = page.locator("#pickupBranch");
    await expect(branch).toBeVisible();
    const firstBranch = await branch.locator("option").nth(1).getAttribute("value");
    test.skip(!firstBranch, "staging-д салбар байхгүй — захиалгыг дуусгах боломжгүй.");
    await branch.selectOption(firstBranch!);
    // Бэлэн мөнгө нь анхдагч сонголт; тодорхой болгохын тулд дахин дарна.
    await page.getByRole("button", { name: /Бэлэн мөнгө/ }).click();

    await confirm.click();

    // --- 3. Баталгаажуулах дэлгэц ---------------------------------------
    await expect(page.getByText("ЗАХИАЛГА БАТАЛГААЖЛАА")).toBeVisible({ timeout: 30_000 });
    const shownNumber = ((await page.locator(".order-confirm-number").textContent()) ?? "").trim();
    expect(shownNumber, "баталгаажуулах дэлгэц захиалгын дугаар харуулна").not.toBe("");

    // --- 4. Бодитоор хадгалагдсан уу — дэлгэц дээр гарсан нь хангалтгүй ----
    const [saved] = await db!.select().from(orders).where(and(eq(orders.orderNumber, shownNumber), like(orders.customerName, `${E2E_MARKER}%`))).limit(1);
    expect(saved, "захиалга staging DB-д бичигдсэн байх ёстой").toBeTruthy();
    try {
      expect(saved.customerName).toBe(customerName);
      expect(saved.customerPhone).toBe("99009900");
      expect(saved.deliveryMethod).toBe("store_pickup");
      expect(saved.pickupBranch).toBe(firstBranch);
      expect(saved.paymentMethod).toBe("cash_on_delivery");
      expect(saved.paymentStatus).toBe("unpaid");
      expect(saved.status).toBe("pending");
      // Салбараас авах нь үргэлж үнэгүй (shared/delivery.ts).
      expect(saved.deliveryFeeMnt).toBe(0);
      expect(saved.totalMnt).toBeGreaterThan(0);
    } finally {
      // --- 5. Цэвэрлэгээ аппын өөрийн замаар ------------------------------
      await updateAdminOrder({ id: saved.id, status: "cancelled" });
      await deleteAdminOrder({ id: saved.id });
      const left = await db!.select({ id: orders.id }).from(orders).where(eq(orders.id, saved.id));
      expect(left, "туршилтын захиалга үлдэх ёсгүй").toHaveLength(0);
    }
  });
});
