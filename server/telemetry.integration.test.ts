import { afterAll, describe, expect, it } from "vitest";
import { testSessionUser } from "./_test-helpers";
import { eq, inArray } from "drizzle-orm";
import { orderItems, orders, productCategories, productVariants, products, users, visitorSessions } from "../drizzle/schema";
import { VISITOR_SESSION_COOKIE_NAME } from "../shared/const";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Tier E of the admin analytics dashboard (2026-08-27): the first-party
// visitor/session tracking that makes a real Conversion Rate possible.
// Exercises the real database, same opt-in convention as every other
// *.integration.test.ts file here.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

/** Builds a caller with a mutable req.headers object and a res.cookie stub
 *  that actually records what it was called with -- callerFor in
 *  analytics.integration.test.ts stubs res.cookie as a no-op, which is
 *  fine there (nothing under test reads it back), but this suite's whole
 *  point is proving telemetry.pageview sets the right cookie. */
function callerWithCookieRecorder(headers: Record<string, string> = {}, ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`): { caller: ReturnType<typeof appRouter.createCaller>; setCookieCalls: { name: string; value: string }[] } {
  const setCookieCalls: { name: string; value: string }[] = [];
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers, ip, socket: { remoteAddress: ip } } as unknown as TrpcContext["req"],
    res: { cookie: (name: string, value: string) => { setCookieCalls.push({ name, value }); }, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return { caller: appRouter.createCaller(ctx), setCookieCalls };
}

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

describeWithDatabase("telemetry pageview integration (Tier E)", () => {
  const marker = `telemetry-test-${Date.now()}`;
  const sessionTokens: string[] = [];
  const orderIds: number[] = [];
  let userId = 0;
  let productId = 0;
  // Зөвхөн ЭНЭ тест үүсгэсэн бол устгана — бодит ангиллыг хэзээ ч хөндөхгүй.
  let createdCategoryId = 0;

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (orderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    if (productId) await db.delete(products).where(eq(products.id, productId)); // cascades the variant
    if (userId) await db.delete(users).where(eq(users.id, userId));
    if (createdCategoryId) await db.delete(productCategories).where(eq(productCategories.id, createdCategoryId));
    for (const token of sessionTokens) await db.delete(visitorSessions).where(eq(visitorSessions.sessionToken, token));
  });

  it("silently no-ops for a bot User-Agent -- no cookie, no session row", async () => {
    const { caller, setCookieCalls } = callerWithCookieRecorder({ "user-agent": BOT_UA });
    const result = await caller.telemetry.pageview({ path: "/shop" });
    expect(result.ok).toBe(true);
    expect(setCookieCalls.length).toBe(0);
  });

  it("mints a token, sets a cookie, and creates a session row on a fresh call", async () => {
    const { caller, setCookieCalls } = callerWithCookieRecorder({ "user-agent": MOBILE_UA });
    await caller.telemetry.pageview({ path: "/", trafficSource: "google / organic" });

    expect(setCookieCalls.length).toBe(1);
    expect(setCookieCalls[0].name).toBe(VISITOR_SESSION_COOKIE_NAME);
    const token = setCookieCalls[0].value;
    sessionTokens.push(token);

    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [row] = await db.select().from(visitorSessions).where(eq(visitorSessions.sessionToken, token));
    expect(row).toBeTruthy();
    expect(row.landingPath).toBe("/");
    expect(row.trafficSource).toBe("google / organic");
    expect(row.deviceType).toBe("mobile");
    expect(row.pageViewCount).toBe(1);
  });

  it("bumps lastSeenAt/pageViewCount on a repeat call with the same token, without minting a new one", async () => {
    const { caller: firstCaller, setCookieCalls: firstCalls } = callerWithCookieRecorder({ "user-agent": DESKTOP_UA });
    await firstCaller.telemetry.pageview({ path: "/shop" });
    const token = firstCalls[0].value;
    sessionTokens.push(token);

    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [before] = await db.select({ pageViewCount: visitorSessions.pageViewCount }).from(visitorSessions).where(eq(visitorSessions.sessionToken, token));

    // Same token, sent back the way a real browser would via the cookie
    // header -- no cookie should be re-set for an already-live session.
    const { caller: secondCaller, setCookieCalls: secondCalls } = callerWithCookieRecorder({ "user-agent": DESKTOP_UA, cookie: `${VISITOR_SESSION_COOKIE_NAME}=${token}` });
    await secondCaller.telemetry.pageview({ path: "/product/test-slug" });
    expect(secondCalls.length).toBe(0);

    const [after] = await db.select({ pageViewCount: visitorSessions.pageViewCount }).from(visitorSessions).where(eq(visitorSessions.sessionToken, token));
    expect(after.pageViewCount).toBe(before.pageViewCount + 1);
  });

  it("resolves visitorSessionId through checkout.createOrder's actual cookie-read path, and getConversionOverview counts the session as converted", async () => {
    const { caller: pageviewCaller, setCookieCalls } = callerWithCookieRecorder({ "user-agent": DESKTOP_UA });
    await pageviewCaller.telemetry.pageview({ path: "/" });
    const token = setCookieCalls[0].value;
    sessionTokens.push(token);

    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    // ⚠️ 2026-09-16: өмнө нь "ямар нэг ангилал байгаа" гэж НАЙДАЖ, байхгүй
    // бол шидэж байв. Хөгжүүлэгчийн DB-д ангилал үргэлж байдаг тул энэ нь
    // хэзээ ч мэдэгддэггүй байсан ба CI-ийн ЦЭВЭР схемд (seed-гүй) яг энд
    // унадаг байв. Тест өөрийн шаардлагатай өгөгдлөө өөрөө үүсгэнэ.
    const [existing] = await db.select({ id: productCategories.id }).from(productCategories).limit(1);
    let categoryId = existing?.id;
    if (!categoryId) {
      const created = await db.insert(productCategories).values({ name: `${marker} ангилал`, slug: `${marker}-cat`, sortOrder: 9999 });
      categoryId = Number(created[0].insertId);
      createdCategoryId = categoryId;
    }
    const productInsert = await db.insert(products).values({ categoryId, name: "Telemetry Test Product", slug: `${marker}-product`, priceMnt: 22_000, sku: `${marker}-sku`, stockQuantity: 10, isPublished: true });
    productId = Number(productInsert[0].insertId);
    await db.insert(productVariants).values({ productId, sku: `${marker}-sku`, priceMnt: 22_000, stockQuantity: 10, isDefault: true });

    const userInsert = await db.insert(users).values({ email: `${marker}-user@example.invalid`, passwordHash: await hashPassword("TelemetryTest1!"), name: "Telemetry Test User", role: "user", emailVerifiedAt: new Date() });
    userId = Number(userInsert[0].insertId);
    const shopperUser: TrpcContext["user"] = testSessionUser({ id: userId, email: `${marker}-user@example.invalid`, name: "Telemetry Test User", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    // Same session cookie the pageview beacon set above -- this is the
    // whole point: checkout.createOrder must read it from the request
    // itself (httpOnly, no client-side involvement needed), not have it
    // passed in as an input field.
    const shopperCtx: TrpcContext = {
      user: shopperUser,
      req: { protocol: "https", headers: { cookie: `${VISITOR_SESSION_COOKIE_NAME}=${token}` }, ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "198.51.100.1" } } as unknown as TrpcContext["req"],
      res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
    };
    const shopperCaller = appRouter.createCaller(shopperCtx);

    const { addCartItem } = await import("./db");
    await addCartItem({ owner: { userId }, productId, quantity: 1 });
    const order = await shopperCaller.checkout.createOrder({
      customerName: "Telemetry Test Shopper",
      customerPhone: "88117766",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    });
    orderIds.push(order.id);

    const [orderRow] = await db.select({ visitorSessionId: orders.visitorSessionId }).from(orders).where(eq(orders.id, order.id));
    const [sessionRow] = await db.select({ id: visitorSessions.id }).from(visitorSessions).where(eq(visitorSessions.sessionToken, token));
    expect(orderRow.visitorSessionId).toBe(sessionRow.id);

    // Same "actually charged" discipline as every other analytics section --
    // mark it paid the way a real delivery confirmation would.
    await db.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, order.id));

    const adminInsert = await db.insert(users).values({ email: `${marker}-admin@example.invalid`, passwordHash: await hashPassword("TelemetryAdmin1!"), name: "Telemetry Test Admin", role: "admin", emailVerifiedAt: new Date() });
    const adminId = Number(adminInsert[0].insertId);
    try {
      const adminCtx: TrpcContext = {
        user: testSessionUser({ id: adminId, email: `${marker}-admin@example.invalid`, name: "Telemetry Test Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }),
        req: { protocol: "https", headers: {}, ip: "203.0.113.60", socket: { remoteAddress: "203.0.113.60" } } as unknown as TrpcContext["req"],
        res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
      };
      const report = await appRouter.createCaller(adminCtx).admin.analyticsReport({});
      expect(report.conversion.sessionsCount).toBeGreaterThanOrEqual(1);
      expect(report.conversion.convertedSessionsCount).toBeGreaterThanOrEqual(1);
      expect(report.conversion.conversionRatePercent).not.toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, adminId));
    }
  });
});
