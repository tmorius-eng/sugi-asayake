import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { larkChatDeliveries, notificationOutbox } from "../drizzle/schema";
import { getDb } from "./db";
import { dispatchPendingLarkCards } from "./integrations/lark/chatDispatcher";
import { LarkApiError } from "./integrations/lark/client";
import type { LarkConfig } from "./integrations/lark/config";
import { FakeLarkClient } from "./integrations/lark/fake";

/**
 * Lark-ийн чат dispatcher (2026-10-03) — outbox-ын ХОЁР ДАХЬ хэрэглэгч.
 * Зөвхөн энэ файлын бичсэн outbox мөрүүдийг (testScope) хөндөнө, хуурамч
 * клиент хаашаа ч илгээдэггүй. afterAll бүгдийг устгана (deliveries cascade).
 * Migration 0101 sugi_staging-д ажилласан байх ёстой.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("Lark chat dispatcher", () => {
  const marker = `lark${Date.now().toString(36)}`;
  const outboxIds: number[] = [];
  const config: LarkConfig = {
    appId: "cli_test1234",
    appSecret: "x",
    domain: "https://open.larksuite.com",
    chats: { warehouse: "oc_warehouse01", admin: "oc_admin000001", finance: "oc_warehouse01" },
    disabledEvents: new Set(["stock.low"]),
  };

  async function queue(eventType: string, groups: string[], extra: Partial<typeof notificationOutbox.$inferInsert> = {}) {
    const db = (await getDb())!;
    const ids: number[] = [];
    for (const groupKey of groups) {
      // ntfy-ийн dispatcher энэ мөрийг хэзээ ч авахгүй: тест NOTIFICATIONS_DISPATCH-гүй,
      // мөн `failed` төлөвтэй бичнэ — Lark outbox-ын төлөвийг огт хардаггүйг шалгана.
      const result = await db.insert(notificationOutbox).values({ eventType, groupKey, title: `${marker} гарчиг`, message: `${marker} мессеж`, priority: 4, clickPath: "/admin?adminSection=orders", status: "failed", ...extra });
      ids.push(Number(result[0].insertId));
    }
    outboxIds.push(...ids);
    return ids;
  }

  const deliveriesFor = async (ids: number[]) => (await getDb())!.select().from(larkChatDeliveries).where(inArray(larkChatDeliveries.outboxId, ids));

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    // Дундуур зогсоосон өмнөх run-ий мөрүүд (afterAll ажиллаагүй) admin-ий
    // хонхонд үлдэхгүй — дараагийн run өөрөө цэвэрлэнэ.
    await db.delete(notificationOutbox).where(like(notificationOutbox.title, "lark% гарчиг"));
  });

  afterAll(async () => {
    const db = await getDb();
    if (db && outboxIds.length) await db.delete(notificationOutbox).where(inArray(notificationOutbox.id, outboxIds));
  });

  it("мөр бүрийг бүлгийн чат руу НЭГ л удаа, uuid-тай илгээнэ (зэрэг хоёр ажилласан ч)", async () => {
    const ids = await queue("order.placed", ["warehouse", "admin"]);
    const client = new FakeLarkClient();
    const [first, second] = await Promise.all([
      dispatchPendingLarkCards({ outboxIds: ids, client, config }),
      dispatchPendingLarkCards({ outboxIds: ids, client, config }),
    ]);
    expect(first.sent + second.sent).toBe(2);
    expect(client.sent.map(item => item.chatId).sort()).toEqual(["oc_admin000001", "oc_warehouse01"]);
    expect(client.sent.every(item => item.uuid?.startsWith("sugi-outbox-"))).toBe(true);
    expect((await deliveriesFor(ids)).every(row => row.status === "sent" && row.larkMessageId)).toBe(true);

    // Дахин ажиллуулахад юу ч явахгүй.
    const again = await dispatchPendingLarkCards({ outboxIds: ids, client, config });
    expect(again.sent).toBe(0);
    expect(client.sent).toHaveLength(2);
  });

  it("чатгүй бүлэг, унтраасан event, нэг чатад давхардсан бүлэг = алгасна", async () => {
    const client = new FakeLarkClient();
    const noChat = await queue("order.paid", ["store"]);
    const disabled = await queue("stock.low", ["warehouse"]);
    // finance ба warehouse ижил чат — ижил event хоёр удаа очих ёсгүй.
    const sameChat = await queue("receipt.posted", ["warehouse", "finance"]);
    await dispatchPendingLarkCards({ outboxIds: [...noChat, ...disabled, ...sameChat], client, config });
    expect(client.sent).toHaveLength(1);
    const rows = await deliveriesFor([...noChat, ...disabled, ...sameChat]);
    const byOutbox = new Map(rows.map(row => [row.outboxId, row]));
    expect(byOutbox.get(noChat[0])?.status).toBe("skipped");
    expect(byOutbox.get(disabled[0])?.status).toBe("skipped");
    expect(byOutbox.get(sameChat[0])?.status).toBe("sent");
    expect(byOutbox.get(sameChat[1])).toMatchObject({ status: "skipped", lastError: expect.stringContaining("ижил чат") });
  });

  it("түр алдаа → дахин оролдоно; байнгын алдаа (бот чатад байхгүй) → шууд failed", async () => {
    const client = new FakeLarkClient();
    const [retryId] = await queue("order.placed", ["warehouse"]);
    client.failNext(new LarkApiError("timeout", null, null, false));
    await dispatchPendingLarkCards({ outboxIds: [retryId], client, config });
    let [row] = await deliveriesFor([retryId]);
    expect(row).toMatchObject({ status: "pending", attempts: 1 });

    // Хүлээлтийг дуусгаад дахин.
    await (await getDb())!.update(larkChatDeliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(larkChatDeliveries.id, row.id));
    await dispatchPendingLarkCards({ outboxIds: [retryId], client, config });
    [row] = await deliveriesFor([retryId]);
    expect(row).toMatchObject({ status: "sent", attempts: 2 });

    const [permanentId] = await queue("order.placed", ["admin"]);
    client.failNext(new LarkApiError("Bot is not in the chat (код 230002)", 230002, 400, true));
    await dispatchPendingLarkCards({ outboxIds: [permanentId], client, config });
    expect((await deliveriesFor([permanentId]))[0]).toMatchObject({ status: "failed", lastError: expect.stringContaining("230002") });
  });

  it("тестийн (suppressed marker) мөрийг хэзээ ч илгээхгүй", async () => {
    const client = new FakeLarkClient();
    const ids = await queue("order.placed", ["warehouse"], { status: "suppressed", lastError: "suppressed: test run" });
    await dispatchPendingLarkCards({ outboxIds: ids, client, config });
    expect(client.sent).toHaveLength(0);
    expect(await deliveriesFor(ids)).toHaveLength(0);
  });
});
