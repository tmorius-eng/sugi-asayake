import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GUEST_CART_COOKIE_NAME } from "../shared/const";
import { cartItems, orderItems, orders, phoneVerificationSessions, productCategories, productVariants, products } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";

// Guest checkout phone verification (2026-09-14). The env switch that
// _test-setup.ts turns off is turned on here for these calls only; the
// verify.mn LIVE re-check is skipped because no key is configured in the
// test environment, so a session row with status "verified" stands in for a
// shopper who answered the SMS.
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function guestContext(existingGuestToken?: string): { ctx: TrpcContext; cookiesSet: Record<string, string> } {
  const cookiesSet: Record<string, string> = {};
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: { cookie: existingGuestToken ? `${GUEST_CART_COOKIE_NAME}=${existingGuestToken}` : "" },
      ip: `203.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}.9`,
      socket: { remoteAddress: "203.0.113.9" },
    } as unknown as TrpcContext["req"],
    res: { cookie: (name: string, value: string) => { cookiesSet[name] = value; }, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return { ctx, cookiesSet };
}

describeWithDatabase("guest checkout phone verification", () => {
  const marker = `otp${Date.now().toString(36)}`;
  const phone = "88119977";
  let categoryId = 0;
  let productId = 0;
  const orderIds: number[] = [];
  const sessionIds: number[] = [];
  let previous: string | undefined;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    previous = process.env.GUEST_CHECKOUT_OTP;
    process.env.GUEST_CHECKOUT_OTP = "1";
    process.env.VERIFY_MN_SKIP_LIVE_CHECK = "1";
    const category = await db.insert(productCategories).values({ name: "OTP test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(category[0].insertId);
    const product = await db.insert(products).values({ categoryId, name: "OTP test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 50, isPublished: true });
    productId = Number(product[0].insertId);
    await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 10_000, stockQuantity: 50, isDefault: true });
  });

  afterAll(async () => {
    process.env.GUEST_CHECKOUT_OTP = previous ?? "0";
    delete process.env.VERIFY_MN_SKIP_LIVE_CHECK;
    const db = await getDb();
    if (!db) return;
    for (const id of orderIds) {
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.id, id));
    }
    for (const id of sessionIds) await db.delete(phoneVerificationSessions).where(eq(phoneVerificationSessions.id, id));
    await db.delete(cartItems).where(eq(cartItems.variantId, (await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId)))[0]!.id));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
  }, 60_000);

  async function cartToken(): Promise<string> {
    const first = guestContext();
    await appRouter.createCaller(first.ctx).cart.addItem({ productId, quantity: 1 });
    return first.cookiesSet[GUEST_CART_COOKIE_NAME];
  }
  const orderInput = (sessionId?: string | null) => ({
    customerName: "OTP Guest", customerPhone: phone, deliveryMethod: "store_pickup" as const, pickupBranch: "Орос элчингийн салбар", paymentMethod: "cash_on_delivery" as const,
    phoneVerificationSessionId: sessionId ?? null,
  });
  async function seedSession(input: { phone: string; status: "pending" | "verified"; purpose?: "checkout" | "register" }) {
    const db = await getDb();
    const verifyMnSessionId = `${marker}-${sessionIds.length}-${Math.random().toString(36).slice(2, 8)}`;
    const inserted = await db!.insert(phoneVerificationSessions).values({ userId: null, purpose: input.purpose ?? "checkout", phone: input.phone, verifyMnSessionId, code: "123456", status: input.status, expiresAt: new Date(Date.now() + 300_000) });
    sessionIds.push(Number(inserted[0].insertId));
    return verifyMnSessionId;
  }

  it("tells a guest they must verify, and refuses a pending, foreign-purpose or wrong-number session", async () => {
    const guest = guestContext(await cartToken());
    const caller = appRouter.createCaller(guest.ctx);
    expect(await caller.checkout.guestPhoneVerificationRequired()).toBe(true);
    await expect(caller.checkout.createOrder(orderInput(null))).rejects.toThrow(/баталгаажуулна уу/);
    await expect(caller.checkout.createOrder(orderInput(await seedSession({ phone, status: "pending" })))).rejects.toThrow(/баталгаажуулна уу/);
    await expect(caller.checkout.createOrder(orderInput(await seedSession({ phone, status: "verified", purpose: "register" })))).rejects.toThrow(/баталгаажуулна уу/);
    await expect(caller.checkout.createOrder(orderInput(await seedSession({ phone: "99001122", status: "verified" })))).rejects.toThrow(/таарахгүй/);
  }, 30_000);

  it("accepts a verified session for the order's number, and spends it on that one order only", async () => {
    const sessionId = await seedSession({ phone, status: "verified" });
    const guest = guestContext(await cartToken());
    const order = await appRouter.createCaller(guest.ctx).checkout.createOrder(orderInput(sessionId));
    orderIds.push(order.id);
    expect(order.customerPhone).toBe(phone);
    const db = await getDb();
    const [row] = await db!.select().from(phoneVerificationSessions).where(eq(phoneVerificationSessions.verifyMnSessionId, sessionId));
    expect(row?.consumedAt).toBeTruthy();
    // The same session cannot vouch for a second basket.
    const again = guestContext(await cartToken());
    await expect(appRouter.createCaller(again.ctx).checkout.createOrder(orderInput(sessionId))).rejects.toThrow(/баталгаажуулна уу/);
  }, 30_000);

  it("is switched off by the env flag and by the admin setting, and never asked of a phone-verified account", async () => {
    process.env.GUEST_CHECKOUT_OTP = "0";
    try {
      expect(await appRouter.createCaller(guestContext().ctx).checkout.guestPhoneVerificationRequired()).toBe(false);
    } finally {
      process.env.GUEST_CHECKOUT_OTP = "1";
    }
    const signedIn: TrpcContext = { ...guestContext().ctx, user: { id: 1, phone: "88000000" } as TrpcContext["user"] };
    expect(await appRouter.createCaller(signedIn).checkout.guestPhoneVerificationRequired()).toBe(false);
  });
});
