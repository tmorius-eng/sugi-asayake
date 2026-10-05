import { eq } from "drizzle-orm";
import { expect, test } from "./helpers/fixtures";
import { E2E_MARKER } from "./helpers/environment";
import { signInAs } from "./helpers/session";
import { openAdminSection } from "./helpers/admin";
import { getDb, recordOrderEvent } from "../server/db";
import { orderItems, orders } from "../drizzle/schema";

/**
 * /admin → Процесс (2026-10-05): захиалгын бодит гинж, захиалгын түүх, ажлын
 * түүх. Сервер талыг `order-events.integration.test.ts` шалгадаг; энд шалгах нь
 * **эгнээ, товч, timeline хөтөч дээр бодитоор гарч ирж, дарахад ажилладаг эсэх** —
 * компьютер ба утас хоёуланд (эгнээ утсан дээр хэвтээ scroll-тай байх ёстой,
 * хуудас бүхэлдээ хэвтээ scroll үүсгэхгүй).
 */
test.describe("админ процессын самбар", () => {
  test("гинж → захиалгын жагсаалт → түүх, ба deep link", async ({ page, context, baseURL }, testInfo) => {
    const db = await getDb();
    test.skip(!db, "DB холбогдоогүй.");

    const orderNumber = `${E2E_MARKER.toUpperCase()}PRC${Date.now().toString(36).toUpperCase()}`;
    const inserted = await db!.insert(orders).values({
      orderNumber, customerName: `${E2E_MARKER} процесс тест`, customerPhone: "99009901",
      deliveryMethod: "ub_delivery", paymentMethod: "cash_on_delivery", deliveryDistrict: "sukhbaatar", deliveryAddress: "Тестийн хаяг",
      subtotalMnt: 25_000, deliveryFeeMnt: 0, totalMnt: 25_000, status: "confirmed", paymentStatus: "unpaid",
    });
    const orderId = Number(inserted[0].insertId);
    await db!.insert(orderItems).values({ orderId, productId: null, productName: "Процесс тест бараа", sku: `${E2E_MARKER}-prc`, quantity: 1, unitPriceMnt: 25_000 });
    await recordOrderEvent(db!, { orderId, kind: "order.created", toStatus: "pending", actor: { kind: "customer", label: "Зочин" }, payload: { orderNumber, totalMnt: 25_000, itemCount: 1, channel: "online" } });
    await recordOrderEvent(db!, { orderId, kind: "status.changed", fromStatus: "pending", toStatus: "confirmed", actor: { kind: "staff" }, payload: {} });

    try {
      await signInAs(context, "admin", baseURL!);
      await page.goto("/admin");
      await openAdminSection(page, "Процесс");
      await expect(page.getByRole("heading", { name: "Процессын самбар" })).toBeVisible();

      // Эгнээнүүд — таван урагшлах төлөв бүгд байна.
      const chain = page.getByRole("region", { name: "Захиалгын гинж" });
      for (const label of ["Хүлээгдэж буй", "Баталгаажсан", "Савлагдсан", "Хүргэлтэнд", "Дууссан"]) {
        await expect(chain.getByRole("button", { name: new RegExp(`^${label} — \\d+ захиалга`) })).toBeVisible();
      }
      // Акторын легенд.
      await expect(chain.getByText("Харилцагч", { exact: false }).first()).toBeVisible();

      // Хуудас бүхэлдээ хэвтээ scroll үүсгэхгүй (эгнээ өөрийн контейнер дотроо гүйлгэнэ).
      const overflow = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const offenders = [...document.querySelectorAll("body *")]
          .filter(el => el.getBoundingClientRect().right > width + 1 && el.getBoundingClientRect().width > 40)
          .slice(0, 8)
          .map(el => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right)}`);
        return { px: document.documentElement.scrollWidth - width, offenders };
      });
      expect(overflow.px, `хуудсын хэвтээ scroll: ${overflow.offenders.join(" | ")}`).toBeLessThanOrEqual(1);

      // "Баталгаажсан" эгнээ → жагсаалтад манай захиалга → "Түүх".
      await chain.getByRole("button", { name: /^Баталгаажсан — \d+ захиалга/ }).click();
      const row = page.locator("li, article, div").filter({ hasText: orderNumber }).filter({ has: page.getByRole("button", { name: "Түүх" }) }).last();
      await expect(row).toBeVisible({ timeout: 20_000 });
      await page.screenshot({ path: testInfo.outputPath("process-chain.png"), fullPage: true });
      await row.getByRole("button", { name: "Түүх" }).click();

      // Timeline: захиалга үүссэн → төлөв солигдсон, акторын chip-тэй.
      await expect(page.getByRole("tab", { name: "Захиалгын түүх" })).toHaveAttribute("aria-selected", "true");
      const timeline = page.locator("ol").filter({ hasText: "Захиалга үүссэн" });
      await expect(timeline).toBeVisible({ timeout: 20_000 });
      await expect(timeline.getByText(/Төлөв: Хүлээгдэж буй → Баталгаажсан/)).toBeVisible();
      await expect(timeline.getByText("Зочин").first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("process-trail.png"), fullPage: true });

      // Deep link шууд түүх рүү.
      await page.goto(`/admin?adminSection=process&orderId=${orderId}`);
      await expect(page.locator("ol").filter({ hasText: "Захиалга үүссэн" })).toBeVisible({ timeout: 20_000 });

      // Admin-д л харагдах гурав дахь tab: бүртгэгдсэн job-ууд жагсаана.
      await page.getByRole("tab", { name: "Ажлууд ба аудит" }).click();
      // Staging дээр scheduler зориуд ажилладаггүй (clusterRole.ts) — тэр тохиолдолд самбар
      // үүнийг тайлбарлах ёстой; production дээр бол бүртгэгдсэн job-ууд жагсаана.
      await expect(page.getByText("inventory-sync-smartsoftware").first().or(page.getByTestId("scheduler-inactive"))).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("heading", { name: "Аудитын урсгал" })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("process-jobs.png"), fullPage: true });
    } finally {
      await db!.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db!.delete(orders).where(eq(orders.id, orderId)); // order_events cascade
    }
  });

  test("агуулахын ажилтан гинжийг харна, 'Ажлууд ба аудит' tab-гүй", async ({ page, context, baseURL }) => {
    await signInAs(context, "warehouse", baseURL!);
    await page.goto("/admin");
    await openAdminSection(page, "Процесс");
    await expect(page.getByRole("heading", { name: "Процессын самбар" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Гинж" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Ажлууд ба аудит" })).toHaveCount(0);
  });
});
