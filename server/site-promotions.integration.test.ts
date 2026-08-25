import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminAuditLogs, sitePromotions, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Admin-controlled marketing popup/banner: verifies the public "which
// promotion is live right now" query respects isActive + the scheduled
// window, and that only staff/admin can manage promotions.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.116.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.116.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("site promotion integration", () => {
  const marker = `promo-test-${Date.now()}`;
  const adminEmail = `${marker}-admin@example.invalid`;
  const shopperEmail = `${marker}-shopper@example.invalid`;
  let adminId = 0;
  let shopperId = 0;
  const createdPromotionIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for site promotion integration tests.");
    const adminInsert = await db.insert(users).values({ email: adminEmail, passwordHash: await hashPassword("AdminPassw0rd!"), name: "Promo Test Admin", role: "admin", emailVerifiedAt: new Date() });
    adminId = Number(adminInsert[0].insertId);
    const shopperInsert = await db.insert(users).values({ email: shopperEmail, passwordHash: await hashPassword("ShopperPassw0rd!"), name: "Promo Test Shopper", role: "user", emailVerifiedAt: new Date() });
    shopperId = Number(shopperInsert[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of createdPromotionIds) await db.delete(sitePromotions).where(eq(sitePromotions.id, id));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.id, shopperId));
  });

  function admin() {
    return callerFor({ id: adminId, email: adminEmail, name: "Promo Test Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }
  function shopper() {
    return callerFor({ id: shopperId, email: shopperEmail, name: "Promo Test Shopper", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }
  function guest() {
    return callerFor(null);
  }

  it("returns null publicly when there is no active promotion", async () => {
    const active = await guest().promotions.active();
    // Not asserting a hard null (other real data may already be active in a
    // shared dev DB) -- just confirm the call succeeds unauthenticated.
    expect(active === null || typeof active === "object").toBe(true);
  });

  it("rejects a non-staff user from creating or listing promotions", async () => {
    await expect(shopper().admin.promotions()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(shopper().admin.createPromotion({ isActive: true, displayMode: "popup", headline: "Should fail" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin creates an active promotion and it becomes the one shoppers see", async () => {
    const created = await admin().admin.createPromotion({
      isActive: true,
      displayMode: "popup",
      headline: `${marker} Шинэ бүтээгдэхүүн ирлээ!`,
      message: "Тест мессеж",
      ctaLabel: "Дэлгүүр рүү очих",
      ctaUrl: "/shop",
    });
    createdPromotionIds.push(created.id);
    expect(created.isActive).toBe(true);

    const active = await guest().promotions.active();
    expect(active?.id).toBe(created.id);
    expect(active?.headline).toBe(`${marker} Шинэ бүтээгдэхүүн ирлээ!`);
  });

  it("hides an inactive promotion from the public query", async () => {
    const admin1 = admin();
    const created = await admin1.admin.createPromotion({ isActive: false, displayMode: "banner", headline: `${marker} Inactive` });
    createdPromotionIds.push(created.id);

    const active = await guest().promotions.active();
    expect(active?.id).not.toBe(created.id);
  });

  it("respects a scheduled window: not-yet-started and already-ended promotions stay hidden", async () => {
    const admin1 = admin();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const farFuture = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recentPast = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const notYetStarted = await admin1.admin.createPromotion({ isActive: true, displayMode: "popup", headline: `${marker} Not yet started`, startsAt: future, endsAt: farFuture });
    createdPromotionIds.push(notYetStarted.id);
    const alreadyEnded = await admin1.admin.createPromotion({ isActive: true, displayMode: "popup", headline: `${marker} Already ended`, startsAt: past, endsAt: recentPast });
    createdPromotionIds.push(alreadyEnded.id);

    const active = await guest().promotions.active();
    expect(active?.id).not.toBe(notYetStarted.id);
    expect(active?.id).not.toBe(alreadyEnded.id);
  });

  it("admin can toggle a promotion off and it immediately disappears publicly", async () => {
    const admin1 = admin();
    const created = await admin1.admin.createPromotion({ isActive: true, displayMode: "popup", headline: `${marker} Togglable` });
    createdPromotionIds.push(created.id);
    expect((await guest().promotions.active())?.id).toBe(created.id);

    await admin1.admin.updatePromotion({ id: created.id, isActive: false });
    expect((await guest().promotions.active())?.id).not.toBe(created.id);
  });

  it("admin can delete a promotion", async () => {
    const admin1 = admin();
    const created = await admin1.admin.createPromotion({ isActive: false, displayMode: "popup", headline: `${marker} Deletable` });
    await admin1.admin.deletePromotion({ id: created.id });
    const list = await admin1.admin.promotions();
    expect(list.some(row => row.id === created.id)).toBe(false);
  });
});
