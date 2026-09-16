import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Захиалгын явцын push мэдэгдэл — /admin-аас удирдагдах эсэх (2026-09-16).
 *
 * Tom: *"ene admin tohirgoo sain suuj editable auto tohirgoo bas on off edit
 * hiij yu yvuulahaa zaswarlaj boldof zde?"* — өмнө нь эдгээр текст
 * `server/_core/webPush.ts`-д ХАТУУ бичигдсэн байсан: өөрчлөхийн тулд deploy
 * хэрэгтэй, унтраах ямар ч арга байгаагүй.
 *
 * `web-push`-ийг stub хийнэ: энд шалгах зүйл нь сүлжээ биш, **тохиргоо
 * дуулгавартай эсэх** — юу илгээгдэж байна, ямар нөхцөлд огт илгээгдэхгүй вэ.
 */
const sendNotification = vi.fn(async () => ({ statusCode: 201 }));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendNotification(...(args as [])) },
}));

import { getDb, upsertStoreSetting } from "./db";
import { sendOrderStatusPush, webPushEnabled } from "./_core/webPush";
import { pushSubscriptions, storeSettings, users } from "../drizzle/schema";
import { hashPassword } from "./_core/password";

const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("order status push is admin-configurable", () => {
  const marker = `osp${Date.now().toString(36)}`;
  let userId = 0;
  let adminId = 0;
  const touchedKeys = ["push-order-notifications", "push-title-order-shipped", "push-body-order-shipped"] as const;

  const payloadOf = (call: unknown[]) => JSON.parse(String(call[1])) as { title: string; body: string; url: string };

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL required.");
    const admin = await db.insert(users).values({ email: `${marker}-admin@example.invalid`, passwordHash: await hashPassword("AdminPassw0rd!"), name: "OSP Admin", role: "admin", emailVerifiedAt: new Date() });
    adminId = Number(admin[0].insertId);
    const customer = await db.insert(users).values({ email: `${marker}-c@example.invalid`, passwordHash: await hashPassword("CustPassw0rd!"), name: "OSP Customer", role: "user", emailVerifiedAt: new Date() });
    userId = Number(customer[0].insertId);
    await db.insert(pushSubscriptions).values({
      userId, endpoint: `https://push.example.invalid/${marker}`,
      p256dh: "BJ3QFm5cQxV9hfQOTBiG6dsRp6cDjT0SwIbGcIcD1nQ", auth: "cGFzc3dvcmRwYXNzd29yZA",
    });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    // Тохиргоо нь ДЭЛГҮҮРИЙН бодит утга тул тестийн дараа заавал арилгана —
    // мөр байхгүй бол код өөрийн fallback-даа буцаж, өнөөдрийн зан төлөв сэргэнэ.
    for (const key of touchedKeys) await db.delete(storeSettings).where(eq(storeSettings.settingKey, key));
    if (userId) await db.delete(users).where(eq(users.id, userId));
    if (adminId) await db.delete(users).where(eq(users.id, adminId));
  });

  const order = { id: 987_654, userId: 0, orderNumber: "SAMUTEST123", status: "shipped" };

  it("анхдагчаар кодын текстээр илгээнэ", async () => {
    if (!webPushEnabled()) return; // VAPID тохируулаагүй орчинд утгагүй
    sendNotification.mockClear();
    await sendOrderStatusPush({ ...order, userId });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = payloadOf(sendNotification.mock.calls[0] as unknown[]);
    expect(payload.title).toBe("Хүргэлтэд гарлаа");
    expect(payload.body).toContain("SAMUTEST123");
  });

  it("админ бичсэн текстийг ашиглана ({захиалга} орлуулагдана)", async () => {
    if (!webPushEnabled()) return;
    await upsertStoreSetting({ settingKey: "push-title-order-shipped", settingValue: "Явлаа!", updatedByUserId: adminId });
    await upsertStoreSetting({ settingKey: "push-body-order-shipped", settingValue: "{захиалга} замдаа гарлаа.", updatedByUserId: adminId });
    sendNotification.mockClear();
    await sendOrderStatusPush({ ...order, userId });
    const payload = payloadOf(sendNotification.mock.calls[0] as unknown[]);
    expect(payload.title).toBe("Явлаа!");
    expect(payload.body).toBe("SAMUTEST123 замдаа гарлаа.");
  });

  it("биеийг хоосон болговол ЗӨВХӨН тэр төлөв унтарна", async () => {
    if (!webPushEnabled()) return;
    await upsertStoreSetting({ settingKey: "push-body-order-shipped", settingValue: "   ", updatedByUserId: adminId });
    sendNotification.mockClear();
    await sendOrderStatusPush({ ...order, userId });
    expect(sendNotification).not.toHaveBeenCalled();

    // Өөр төлөв хэвээрээ ажиллана — хоосон бие нь дэлхий дахиныг унтраахгүй.
    await sendOrderStatusPush({ ...order, userId, status: "delivered" });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("үндсэн унтраалга бүх төлөвийг зогсооно", async () => {
    if (!webPushEnabled()) return;
    await upsertStoreSetting({ settingKey: "push-body-order-shipped", settingValue: "{захиалга} замдаа гарлаа.", updatedByUserId: adminId });
    await upsertStoreSetting({ settingKey: "push-order-notifications", settingValue: "0", updatedByUserId: adminId });
    sendNotification.mockClear();
    await sendOrderStatusPush({ ...order, userId });
    await sendOrderStatusPush({ ...order, userId, status: "delivered" });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
