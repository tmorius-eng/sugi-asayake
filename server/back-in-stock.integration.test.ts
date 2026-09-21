import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { productCategories, products, users, wishlistItems } from "../drizzle/schema";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { PushPayload } from "./_core/webPush";

// "Ирэхээр мэдэгдэх" job (2026-09-21, migration 0092, server/automation.ts).
// Push ба имэйлийг mock хийнэ — жинхэнэ Brevo/web-push руу юу ч явахгүй.
// ⚠️ Job-ийг ЗААВАЛ өөрийн бараагаар хязгаарлана (`productIds`): integration тест
// бодит схем дээр ажилладаг тул хязгаарлахгүй бол бодит харилцагчийн хүлээгдэж буй
// мэдэгдлийг "эзэмшиж" (restockNotifiedAt тавиад) тэд хэзээ ч авахгүй болно.
const sent = vi.hoisted(() => ({
  pushes: [] as Array<{ userId: number } & PushPayload>,
  emails: [] as Array<{ to: string; subject: string; content: string }>,
}));
vi.mock("./_core/webPush", async importOriginal => ({
  ...(await importOriginal<typeof import("./_core/webPush")>()),
  sendPushToUser: vi.fn(async (userId: number, payload: PushPayload) => { sent.pushes.push({ userId, ...payload }); return 1; }),
}));
vi.mock("./_core/notification", async importOriginal => ({
  ...(await importOriginal<typeof import("./_core/notification")>()),
  sendAccountEmail: vi.fn(async (input: { to: string; subject: string; content: string }) => { sent.emails.push(input); return true; }),
}));

import { runBackInStockJob } from "./automation";

const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("back-in-stock job", () => {
  const marker = `restock-test-${Date.now()}`;
  let categoryId = 0;
  let productId = 0;
  let watcherId = 0;
  let bystanderId = 0;
  const watcherEmail = `${marker}-watcher@example.invalid`;

  const setStock = async (stockQuantity: number) => {
    const db = await getDb();
    await db!.update(products).set({ stockQuantity }).where(eq(products.id, productId));
  };
  const rowOf = async (userId: number) => {
    const db = await getDb();
    const [row] = await db!.select().from(wishlistItems).where(eq(wishlistItems.userId, userId));
    return row;
  };
  const run = () => runBackInStockJob({ productIds: [productId] });

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for back-in-stock integration tests.");
    const category = await db.insert(productCategories).values({ name: `${marker} category`, slug: `${marker}-category`, sortOrder: 99999, isActive: true });
    categoryId = Number(category[0].insertId);
    const product = await db.insert(products).values({ categoryId, name: "Restock Test Product", nameMn: "Нөөц тест бараа", slug: `${marker}-product`, sku: `${marker}-SKU`, priceMnt: 9_000, stockQuantity: 0, isPublished: true });
    productId = Number(product[0].insertId);
    const passwordHash = await hashPassword("Passw0rd!123");
    const watcher = await db.insert(users).values({ email: watcherEmail, passwordHash, name: "Restock Watcher", role: "user", emailOptIn: true });
    watcherId = Number(watcher[0].insertId);
    const bystander = await db.insert(users).values({ email: `${marker}-bystander@example.invalid`, passwordHash, name: "Restock Bystander", role: "user", emailOptIn: true });
    bystanderId = Number(bystander[0].insertId);
    await db.insert(wishlistItems).values([
      { userId: watcherId, productId, notifyOnRestock: true },
      // Хүслийн жагсаалтад байгаа ч мэдэгдэл асаагаагүй — хэзээ ч хүлээж авахгүй.
      { userId: bystanderId, productId, notifyOnRestock: false },
    ]);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(wishlistItems).where(eq(wishlistItems.productId, productId));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    await db.delete(users).where(inArray(users.id, [watcherId, bystanderId]));
  });

  it("does nothing while the product is still sold out", async () => {
    const result = await run();
    expect(result.notified).toBe(0);
    expect(sent.pushes).toHaveLength(0);
    expect(sent.emails).toHaveLength(0);
  });

  it("notifies the watcher once by push and email when stock returns, with the Mongolian name and product link", async () => {
    await setStock(5);
    const result = await run();
    expect(result.notified).toBe(1);
    expect(sent.pushes).toHaveLength(1);
    expect(sent.pushes[0]).toMatchObject({ userId: watcherId, url: `/product/${marker}-product` });
    expect(`${sent.pushes[0].title} ${sent.pushes[0].body}`).toContain("Нөөц тест бараа");
    expect(sent.emails).toHaveLength(1);
    expect(sent.emails[0].to).toBe(watcherEmail);
    expect((await rowOf(watcherId)).restockNotifiedAt).not.toBeNull();
    // Мэдэгдэл асаагаагүй хүн хэзээ ч хүлээж авахгүй.
    expect(sent.pushes.some(push => push.userId === bystanderId)).toBe(false);
  });

  it("never sends twice for the same arrival", async () => {
    const result = await run();
    expect(result.notified).toBe(0);
    expect(sent.pushes).toHaveLength(1);
    expect(sent.emails).toHaveLength(1);
  });

  it("re-arms when the product sells out, then notifies again on the next arrival", async () => {
    await setStock(0);
    const rearm = await run();
    expect(rearm.rearmed).toBe(1);
    expect((await rowOf(watcherId)).restockNotifiedAt).toBeNull();
    expect((await rowOf(watcherId)).notifyOnRestock).toBe(true);

    await setStock(3);
    const again = await run();
    expect(again.notified).toBe(1);
    expect(sent.pushes).toHaveLength(2);
    expect(sent.emails).toHaveLength(2);
  });
});
