import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, getPriceCampaignReport, generateOrderNumber } from "./db";
import { orderItems, orders, priceCampaigns } from "../drizzle/schema";

/**
 * Нийтийн хямдралын тайлан (SITEWIDE-SALE-PLAN §4). Өөрийн хямдрал + 3 захиалга
 * (цонх дотор хямдралтай, цонх дотор төлөгдөөгүй, цонхны өмнөх) үүсгэж, дүнг шалгана.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("price campaign report", () => {
  const marker = `pcr${Date.now().toString(36)}`;
  let campaignId = 0;
  const orderIds: number[] = [];
  // Өнгөрсөн, тогтсон цонх: [start, end) = 2 хоног; өмнөх цонх = түүнээс өмнөх 2 хоног.
  const start = new Date("2020-03-10T04:00:00Z");
  const end = new Date("2020-03-12T04:00:00Z");

  async function insertOrder(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, values: { createdAt: Date; totalMnt: number; paymentStatus: "paid" | "unpaid"; campaignId: number | null; list: number | null; unit: number; qty: number }) {
    const [res] = await db.insert(orders).values({
      orderNumber: generateOrderNumber(), paymentMethod: "cash_on_delivery", deliveryMethod: "store_pickup",
      customerName: marker, customerPhone: "99000000", subtotalMnt: values.totalMnt, totalMnt: values.totalMnt,
      paymentStatus: values.paymentStatus, createdAt: values.createdAt, priceCampaignId: values.campaignId,
    });
    const orderId = Number((res as { insertId: number }).insertId);
    orderIds.push(orderId);
    await db.insert(orderItems).values({ orderId, productName: `${marker} item`, sku: `${marker}-sku`, unitPriceMnt: values.unit, listPriceMnt: values.list, quantity: values.qty });
  }

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL required.");
    const [res] = await db.insert(priceCampaigns).values({ name: `${marker} campaign`, percentOff: 20, startsAt: start, endsAt: end });
    campaignId = Number((res as { insertId: number }).insertId);
    await insertOrder(db, { createdAt: new Date("2020-03-11T04:00:00Z"), totalMnt: 16_000, paymentStatus: "paid", campaignId, list: 10_000, unit: 8_000, qty: 2 });
    await insertOrder(db, { createdAt: new Date("2020-03-11T05:00:00Z"), totalMnt: 5_000, paymentStatus: "unpaid", campaignId, list: 10_000, unit: 8_000, qty: 1 });
    await insertOrder(db, { createdAt: new Date("2020-03-09T04:00:00Z"), totalMnt: 10_000, paymentStatus: "paid", campaignId: null, list: null, unit: 10_000, qty: 1 });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (orderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    if (campaignId) await db.delete(priceCampaigns).where(eq(priceCampaigns.id, campaignId));
  });

  it("зөвхөн төлөгдсөн, хямдралтай захиалгыг тоолж, өмнөх цонхтой харьцуулна", async () => {
    const report = await getPriceCampaignReport(campaignId);
    expect(report).not.toBeNull();
    expect(report!.orders.orders).toBe(1);
    expect(report!.orders.revenueMnt).toBe(16_000);
    expect(report!.orders.avgOrderMnt).toBe(16_000);
    expect(report!.orders.discountMnt).toBe(4_000); // (10000-8000) * 2
    expect(report!.orders.itemsDiscounted).toBe(1);
    expect(report!.previous.orders).toBe(1);
    expect(report!.previous.revenueMnt).toBe(10_000);
    expect(report!.previous.deltaPct.revenueMnt).toBe(60);
    expect(report!.byDay).toEqual([{ day: "2020-03-11", orders: 1, revenueMnt: 16_000, discountMnt: 4_000 }]);
    expect(report!.topProducts[0]).toMatchObject({ sku: `${marker}-sku`, quantity: 2, discountMnt: 4_000 });
  });

  it("байхгүй хямдралд null буцаана", async () => {
    expect(await getPriceCampaignReport(2_000_000_000)).toBeNull();
  });
});
