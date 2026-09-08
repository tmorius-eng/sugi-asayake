import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { cartItems, carts, productCategories, products, productVariants, users } from "../drizzle/schema";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import { runAbandonedCartReminderJob, runLowStockDigestJob } from "./automation";

// "Controls everything" admin overhaul (2026-09-08, Phases E/F). Same
// opt-in convention as the other commerce integration suites -- these jobs
// touch real products/carts/users. No BREVO_API_KEY is set for this test
// run, so every send falls back to a `console.log` line (see
// server/_core/notification.ts) -- that's the observable signal these
// tests assert on, same technique as order-notifications.integration.test.ts.
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("automation jobs integration", () => {
  const marker = `automation-test-${Date.now()}`;
  const staleUpdatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago -- past the 24h staleness cutoff
  let categoryId = 0;
  let productId = 0;
  let variantId = 0;
  let optedInUserId = 0;
  let optedOutUserId = 0;
  const createdCartIds: number[] = [];
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for automation integration tests.");

    const categoryResult = await db.insert(productCategories).values({ name: "Automation test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(categoryResult[0].insertId);
    const productResult = await db.insert(products).values({ categoryId, name: "Automation test product", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 15_000, stockQuantity: 10, isPublished: true });
    productId = Number(productResult[0].insertId);
    const variantResult = await db.insert(productVariants).values({ productId, sku: `${marker}-SKU`, priceMnt: 15_000, stockQuantity: 10, isDefault: true });
    variantId = Number(variantResult[0].insertId);

    const optedInInsert = await db.insert(users).values({ email: `${marker}-optedin@example.invalid`, passwordHash: await hashPassword("AutomationTest1!"), name: "Automation Test Opted In", role: "user", emailOptIn: true, emailVerifiedAt: new Date() });
    optedInUserId = Number(optedInInsert[0].insertId);
    const optedOutInsert = await db.insert(users).values({ email: `${marker}-optedout@example.invalid`, passwordHash: await hashPassword("AutomationTest1!"), name: "Automation Test Opted Out", role: "user", emailOptIn: false, emailVerifiedAt: new Date() });
    optedOutUserId = Number(optedOutInsert[0].insertId);
  });

  beforeEach(() => { logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined); });
  afterEach(() => { logSpy.mockRestore(); });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (createdCartIds.length) {
      await db.delete(cartItems).where(inArray(cartItems.cartId, createdCartIds));
      await db.delete(carts).where(inArray(carts.id, createdCartIds));
    }
    if (optedInUserId) await db.delete(users).where(eq(users.id, optedInUserId));
    if (optedOutUserId) await db.delete(users).where(eq(users.id, optedOutUserId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
  });

  async function insertStaleCart(overrides: { userId?: number | null; guestToken?: string; status?: "active" | "converted" }) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const insert = await db.insert(carts).values({
      userId: overrides.userId ?? null,
      guestToken: overrides.guestToken ?? null,
      status: overrides.status ?? "active",
      updatedAt: staleUpdatedAt,
    });
    const cartId = Number(insert[0].insertId);
    createdCartIds.push(cartId);
    await db.insert(cartItems).values({ cartId, variantId, quantity: 1 });
    return cartId;
  }

  it("reminds only the eligible cart (registered, opted-in, active, stale) — not converted/opted-out/guest carts — and never twice", async () => {
    const eligibleCartId = await insertStaleCart({ userId: optedInUserId });
    await insertStaleCart({ userId: optedOutUserId }); // opted out -- must be skipped
    await insertStaleCart({ userId: optedInUserId, status: "converted" }); // converted -- must be skipped
    await insertStaleCart({ guestToken: `${marker}-guest-token` }); // guest -- must be skipped (no userId to join on)

    await runAbandonedCartReminderJob();
    const logged = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
    expect(logged).toContain(`${marker}-optedin@example.invalid`);
    expect(logged).not.toContain(`${marker}-optedout@example.invalid`);

    const db = await getDb();
    if (!db) throw new Error("no db");
    const [reminded] = await db.select({ reminderSentAt: carts.reminderSentAt }).from(carts).where(eq(carts.id, eligibleCartId)).limit(1);
    expect(reminded.reminderSentAt).not.toBeNull();

    // Running it again must not re-send: reminderSentAt now excludes this cart.
    logSpy.mockClear();
    await runAbandonedCartReminderJob();
    const secondRun = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
    expect(secondRun).not.toContain(`${marker}-optedin@example.invalid`);
  });

  it("sends a low-stock digest only when the product list is non-empty, naming the actual SKU", async () => {
    const db = await getDb();
    if (!db) throw new Error("no db");
    // The throwaway product above already has stockQuantity: 10 (not low) --
    // drop it under the real LOW_STOCK_THRESHOLD (5) for this one test.
    await db.update(products).set({ stockQuantity: 2 }).where(eq(products.id, productId));
    try {
      await runLowStockDigestJob();
      const logged = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
      expect(logged).toContain(`${marker}-SKU`);
    } finally {
      await db.update(products).set({ stockQuantity: 10 }).where(eq(products.id, productId));
    }

    logSpy.mockClear();
    await runLowStockDigestJob();
    const afterRestock = logSpy.mock.calls.map(call => call.join(" ")).join("\n");
    expect(afterRestock).not.toContain(`${marker}-SKU`);
  });
});
