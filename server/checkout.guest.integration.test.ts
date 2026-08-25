import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { GUEST_CART_COOKIE_NAME } from "../shared/const";
import { carts, cartItems, orderItems, orders, productCategories, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { createEmailVerificationCode, getDb, getUserByEmail } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

// UX-RESEARCH.md priority #1: guest checkout. This suite exercises the real
// database (same opt-in convention as commerce.database.integration.test.ts)
// because the whole point is proving the guest identity round-trips through
// an actual cookie -> DB row -> cookie cycle across separate requests, not
// just that the pure functions compile.
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

/** A context whose `res.cookie` calls are captured, so a "next request" can replay them. */
function makeGuestContext(existingGuestToken?: string): { ctx: TrpcContext; cookiesSet: Record<string, string> } {
  const cookiesSet: Record<string, string> = {};
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: { cookie: existingGuestToken ? `${GUEST_CART_COOKIE_NAME}=${existingGuestToken}` : "" },
      ip: "203.0.113.5",
      socket: { remoteAddress: "203.0.113.5" },
    } as unknown as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string) => { cookiesSet[name] = value; },
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
  return { ctx, cookiesSet };
}

function makeUserContext(userId: number): TrpcContext {
  return {
    user: { id: userId } as TrpcContext["user"],
    req: { protocol: "https", headers: {}, ip: "203.0.113.6", socket: { remoteAddress: "203.0.113.6" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

describeWithDatabase("guest checkout integration", () => {
  const marker = `guest-checkout-test-${Date.now()}`;
  let categoryId = 0;
  let productId = 0;
  const createdOrderIds: number[] = [];
  const createdUserIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for guest checkout integration tests.");

    const categoryResult = await db.insert(productCategories).values({
      name: "Guest checkout test category",
      slug: `${marker}-category`,
      sortOrder: 99999,
      isActive: true,
    });
    categoryId = Number(categoryResult[0].insertId);

    const productResult = await db.insert(products).values({
      categoryId,
      name: "Guest checkout test product",
      slug: `${marker}-product`,
      sku: `${marker}-SKU`,
      priceMnt: 5000,
      stockQuantity: 10,
      isPublished: true,
    });
    productId = Number(productResult[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (createdOrderIds.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (productId) {
      const guestCarts = await db.select({ id: carts.id }).from(carts).innerJoin(cartItems, eq(cartItems.cartId, carts.id)).where(eq(cartItems.productId, productId));
      if (guestCarts.length) {
        await db.delete(cartItems).where(inArray(cartItems.cartId, guestCarts.map(c => c.id)));
        await db.delete(carts).where(inArray(carts.id, guestCarts.map(c => c.id)));
      }
      await db.delete(products).where(eq(products.id, productId));
    }
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  it("lets an anonymous shopper add to cart and place an order with no account", async () => {
    // Request 1: add to cart as a brand-new guest (no cookie yet) -> a guest-cart cookie is minted.
    const first = makeGuestContext();
    const addResult = await appRouter.createCaller(first.ctx).cart.addItem({ productId, quantity: 2 });
    expect(addResult?.items[0]).toMatchObject({ productId, quantity: 2 });
    const guestToken = first.cookiesSet[GUEST_CART_COOKIE_NAME];
    expect(guestToken).toBeTruthy();

    // Request 2: a later request replays that same cookie, exactly like a real browser would.
    const second = makeGuestContext(guestToken);
    const cartNow = await appRouter.createCaller(second.ctx).cart.current();
    expect(cartNow?.items[0]).toMatchObject({ productId, quantity: 2 });

    // Request 3: checkout, still anonymous, still just the guest cookie.
    const third = makeGuestContext(guestToken);
    const order = await appRouter.createCaller(third.ctx).checkout.createOrder({
      customerName: "Guest Shopper",
      customerPhone: "88112233",
      customerEmail: "guest-checkout@example.invalid",
      deliveryMethod: "store_pickup",
      pickupBranch: "Орос элчингийн салбар",
      paymentMethod: "cash_on_delivery",
    });
    createdOrderIds.push(order.id);

    expect(order.userId).toBeNull();
    expect(order.customerName).toBe("Guest Shopper");
    expect(order.totalMnt).toBe(10_000);

    // The guest's cart is now empty/converted -- a follow-up request with the same
    // cookie starts a fresh (empty) active cart rather than erroring.
    const fourth = makeGuestContext(guestToken);
    const cartAfterCheckout = await appRouter.createCaller(fourth.ctx).cart.current();
    expect(cartAfterCheckout).toBeNull();
  });

  it("merges a guest's cart into their account the moment they confirm registration", async () => {
    const guestCtx = makeGuestContext();
    await appRouter.createCaller(guestCtx.ctx).cart.addItem({ productId, quantity: 1 });
    const guestToken = guestCtx.cookiesSet[GUEST_CART_COOKIE_NAME];
    expect(guestToken).toBeTruthy();

    // Register while presenting that guest-cart cookie, exactly like a
    // shopper who decides to create an account right before checking out.
    // Registration alone doesn't issue a session (or merge the cart)
    // anymore — see server/routers.ts auth.register — so the merge only
    // happens once confirmRegistration succeeds, below.
    const registerCtx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: { cookie: `${GUEST_CART_COOKIE_NAME}=${guestToken}` },
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
      } as unknown as TrpcContext["req"],
      res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
    };
    const email = `${marker}-merge@example.invalid`;
    await appRouter.createCaller(registerCtx).auth.register({
      email,
      password: "GuestMergeTestPassw0rd!",
    });
    const pending = await getUserByEmail(email);
    if (!pending) throw new Error("Pending registration not found.");
    createdUserIds.push(pending.id);

    // Seed a known code (invalidates whatever register() auto-generated and
    // emailed) so this test doesn't depend on reading a real inbox — same
    // technique as server/auth.account-recovery.integration.test.ts.
    const code = "918273";
    await createEmailVerificationCode({ userId: pending.id, codeHash: tokenHash(code), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    const confirmCtx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: { cookie: `${GUEST_CART_COOKIE_NAME}=${guestToken}` }, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } } as unknown as TrpcContext["req"],
      res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
    };
    const confirmed = await appRouter.createCaller(confirmCtx).auth.confirmRegistration({ email, code });

    const userCart = await appRouter.createCaller(makeUserContext(confirmed.id)).cart.current();
    expect(userCart?.items[0]).toMatchObject({ productId, quantity: 1 });
  });
});
