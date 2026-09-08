import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";

// Admin overhaul (2026-09-08, Phase F): the first way a guest checkout
// customer can check their order status after leaving the confirmation
// page. Public + anti-enumeration (a wrong order number and a right order
// number with a wrong phone must be indistinguishable), so this covers both
// failure shapes and the rate limit that makes brute-forcing impractical.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function anonCaller(ip: string): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {}, ip, socket: { remoteAddress: ip } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("guest order tracking integration", () => {
  const marker = `trk${Date.now().toString(36)}`;
  let orderId = 0;
  const orderNumber = `${marker}ORD`;
  const realPhone = "88997766";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for order tracking integration tests.");
    const insert = await db.insert(orders).values({
      orderNumber, status: "confirmed", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
      deliveryMethod: "store_pickup", pickupBranch: "Орос элчингийн салбар", customerName: "Tracking Test Customer", customerPhone: realPhone,
      subtotalMnt: 15_000, totalMnt: 15_000,
    });
    orderId = Number(insert[0].insertId);
    await db.insert(orderItems).values({ orderId, productName: "Tracking test product", sku: `${marker}-sku`, unitPriceMnt: 15_000, quantity: 1 });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
  });

  it("looks up a real order by order number + phone, returning only a purpose-built subset", async () => {
    const caller = anonCaller("203.0.130.1");
    const result = await caller.orders.lookup({ orderNumber, phone: realPhone });
    expect(result).toMatchObject({ orderNumber, status: "confirmed", paymentStatus: "unpaid", totalMnt: 15_000 });
    expect(result.items).toHaveLength(1);
    // Never leaks internal fields -- purpose-built subset, not the raw row.
    expect(result).not.toHaveProperty("customerName");
    expect(result).not.toHaveProperty("adminNote");
  });

  it("matches a phone typed with spaces/dashes/+976, same as the real digits", async () => {
    const caller = anonCaller("203.0.130.2");
    const result = await caller.orders.lookup({ orderNumber, phone: "+976 8899-7766" });
    expect(result.orderNumber).toBe(orderNumber);
  });

  it("rejects a wrong order number and a right order number with a wrong phone identically (anti-enumeration)", async () => {
    const wrongOrderNumber = anonCaller("203.0.130.3");
    const wrongPhone = anonCaller("203.0.130.4");
    const [errorA, errorB] = await Promise.all([
      wrongOrderNumber.orders.lookup({ orderNumber: "NOSUCHORDER", phone: realPhone }).catch(e => e),
      wrongPhone.orders.lookup({ orderNumber, phone: "88110000" }).catch(e => e),
    ]);
    expect(errorA).toMatchObject({ code: "NOT_FOUND" });
    expect(errorB).toMatchObject({ code: "NOT_FOUND" });
    expect(errorA.message).toBe(errorB.message);
  });

  it("trips the rate limit after 8 attempts from the same IP", async () => {
    const caller = anonCaller("203.0.130.9");
    for (let i = 0; i < 8; i++) {
      await caller.orders.lookup({ orderNumber: "NOSUCHORDER", phone: "88110000" }).catch(() => undefined);
    }
    await expect(caller.orders.lookup({ orderNumber: "NOSUCHORDER", phone: "88110000" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
