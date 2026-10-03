import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { larkChatDeliveries, notificationOutbox, type NotificationOutboxRow } from "../../../drizzle/schema";
import type { NotificationGroup } from "../../../shared/notification-events";
import { sqlInt } from "../../_core/sqlSafe";
import { ENV } from "../../_core/env";
import { getDb } from "../../db";
import { addOutboxListener, TEST_SUPPRESSED_MARKER } from "../../notificationOutbox";
import { buildOutboxCard } from "./cards";
import { LarkApiError, larkClientFor, type LarkClient } from "./client";
import { readLarkConfig, type LarkConfig } from "./config";
import { isLarkPushAllowed } from "./gate";

/**
 * notification_outbox → Lark-ийн бүлэг чат (2026-10-03).
 *
 * ntfy-ийн dispatcher (server/notifications.ts)-ийн ХОЁР ДАХЬ, бие даасан
 * хэрэглэгч: outbox-ын `status`-ыг огт хөндөхгүй, хүргэлт бүрийг
 * lark_chat_deliveries-д бичнэ. ntfy асаалттай эсэхээс үл хамаарна.
 *
 * Шинэ мөрийг "id-аас хойш" (watermark) биш anti-join-оор олно: урт checkout
 * гүйлгээ бага id-тай мөрийг их id-ийн ДАРАА commit хийж болох тул watermark
 * түүнийг алгасна. Сүүлийн EXPIRE_AFTER_MINUTES-ийн, delivery мөргүй, тестийн
 * биш outbox мөр бүрийг UNIQUE(outboxId) дээрх INSERT IGNORE-оор эзэмшинэ —
 * хоёр лаптоп + prod зэрэг ажилласан ч нэг л удаа илгээгдэнэ (бодит илгээлт
 * зөвхөн gate.ts зөвшөөрсөн машин дээр).
 */

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
/** Дараагийн оролдлогын өмнөх хүлээлт (секунд), ntfy-тэй ижил шат. */
const RETRY_DELAYS_S = [60, 300, 1800, 1800];
const EXPIRE_AFTER_MINUTES = 120;
const STUCK_CLAIM_MINUTES = 5;
const LOOP_INTERVAL_MS = 60_000;
/** Dispatcher асахаас ӨМНӨХ мөрүүдээс ихдээ энэ хэмжээг л авна — LARK_PUSH-ийг
 *  анх асаахад сүүлийн 2 цагийн бүх мэдэгдэл чат руу нэг дор цутгахгүй, харин
 *  deploy-ийн богино зогсолтод үүссэн мөр алдагдахгүй. */
const STARTUP_BACKFILL_MINUTES = 10;
let dispatcherStartedAt: Date | null = null;

export type LarkDispatchSummary = { sent: number; failed: number; retried: number; skipped: number; ran: boolean };

const shortError = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

/**
 * Нэг event олон бүлэгт (жишээ нь агуулах + удирдлага) мөр үүсгэдэг. Хэрэв
 * admin хоёр бүлэгт НЭГ чатыг тавьсан бол (жижиг баг бүгд нэг чатад) ижил
 * карт хоёр удаа очих ёсгүй. Нэг INSERT-ийн мөрүүд дараалсан id-тай тул
 * өмнөх цөөн мөрөөс ижил event-ийг хайна.
 */
async function isDuplicateForChat(row: NotificationOutboxRow, chatId: string, config: LarkConfig): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  // Sibling-ийн карт бодитоор явсан/явж байгаа үед л давхардал — expired/failed
  // болсон бол энэ мөр тэр чат руу очих цорын ганц боломж.
  const siblings = await db.select({ groupKey: notificationOutbox.groupKey }).from(notificationOutbox)
    .innerJoin(larkChatDeliveries, eq(larkChatDeliveries.outboxId, notificationOutbox.id))
    .where(and(
      lt(notificationOutbox.id, row.id),
      gte(notificationOutbox.id, row.id - 8),
      eq(notificationOutbox.eventType, row.eventType),
      eq(notificationOutbox.title, row.title),
      eq(notificationOutbox.message, row.message),
      inArray(larkChatDeliveries.status, ["sent", "sending", "pending"]),
    ));
  return siblings.some(sibling => config.chats[sibling.groupKey as NotificationGroup] === chatId);
}

async function deliver(client: LarkClient, config: LarkConfig, row: NotificationOutboxRow, deliveryId: number, attempts: number, summary: LarkDispatchSummary) {
  const db = await getDb();
  if (!db) return;
  type Insert = typeof larkChatDeliveries.$inferInsert;
  const finish = (patch: { [K in keyof Insert]?: Insert[K] | SQL }) => db.update(larkChatDeliveries).set(patch).where(eq(larkChatDeliveries.id, deliveryId));

  if (config.disabledEvents.has(row.eventType)) {
    await finish({ status: "skipped", lastError: "унтраасан (Lark тохиргоо)" });
    summary.skipped++;
    return;
  }
  const chatId = config.chats[row.groupKey as NotificationGroup];
  if (!chatId) {
    await finish({ status: "skipped", lastError: `"${row.groupKey}" бүлэгт Lark чат тохируулаагүй` });
    summary.skipped++;
    return;
  }
  if (await isDuplicateForChat(row, chatId, config)) {
    await finish({ status: "skipped", lastError: "ижил чат руу өөр бүлгээр аль хэдийн явсан" });
    summary.skipped++;
    return;
  }

  try {
    // uuid: Lark нэг цагийн дотор ижил uuid-ийг давхар илгээдэггүй — retry
    // хариугаа алдсан ч чатад хоёр карт гарахгүй.
    const result = await client.sendCard(chatId, buildOutboxCard(row, ENV.publicBaseUrl), `sugi-outbox-${row.id}`);
    await finish({ status: "sent", sentAt: sql`NOW()`, lastError: null, larkMessageId: result.messageId });
    summary.sent++;
  } catch (error) {
    const permanent = error instanceof LarkApiError && error.permanent;
    if (permanent || attempts >= MAX_ATTEMPTS) {
      await finish({ status: "failed", lastError: shortError(error) });
      summary.failed++;
      return;
    }
    const retryAfterS = error instanceof LarkApiError && error.retryAfterMs ? Math.ceil(error.retryAfterMs / 1000) : 0;
    const delaySeconds = Math.max(RETRY_DELAYS_S[attempts - 1] ?? 1800, retryAfterS);
    await finish({ status: "pending", lastError: shortError(error), nextAttemptAt: sql`NOW() + INTERVAL ${sqlInt(delaySeconds)} SECOND` });
    summary.retried++;
  }
}

/**
 * `testScope` — ЗӨВХӨН integration тест (PROJECT-GUIDE: job ажиллуулдаг тест
 * өөрийн өгөгдлөөр хязгаарлагдана). Хуурамч клиент + тохиргоо дамжуулж, зөвхөн
 * өгсөн outbox мөрүүдийг хөндөнө; хуурамч клиент хаашаа ч илгээдэггүй тул
 * gate-ийг алгасна.
 */
export async function dispatchPendingLarkCards(testScope?: { outboxIds: number[]; client: LarkClient; config: LarkConfig }): Promise<LarkDispatchSummary> {
  const summary: LarkDispatchSummary = { sent: 0, failed: 0, retried: 0, skipped: 0, ran: false };
  if (!testScope && !isLarkPushAllowed().allowed) return summary;
  const config = testScope?.config ?? await readLarkConfig({ requireActive: true });
  if (!config) return summary;
  const db = await getDb();
  if (!db) return summary;
  if (testScope && !testScope.outboxIds.length) return summary;
  summary.ran = true;
  const client = testScope?.client ?? larkClientFor(config);
  const scoped = testScope ? inArray(larkChatDeliveries.outboxId, testScope.outboxIds) : undefined;

  // Цэвэрлэгээ: үхсэн процессын эзэмшил → дахин; хэт хуучин → хугацаа дууссан.
  await db.update(larkChatDeliveries).set({ status: "pending" })
    .where(and(scoped, eq(larkChatDeliveries.status, "sending"), sql`${larkChatDeliveries.claimedAt} < NOW() - INTERVAL ${sqlInt(STUCK_CLAIM_MINUTES)} MINUTE`));
  await db.update(larkChatDeliveries).set({ status: "expired", lastError: `${EXPIRE_AFTER_MINUTES} минутад хүргэгдсэнгүй` })
    .where(and(scoped, eq(larkChatDeliveries.status, "pending"), sql`${larkChatDeliveries.createdAt} < NOW() - INTERVAL ${sqlInt(EXPIRE_AFTER_MINUTES)} MINUTE`));

  // 1) Шинэ outbox мөрүүд.
  const fresh = await db.select({ outbox: notificationOutbox }).from(notificationOutbox)
    .leftJoin(larkChatDeliveries, eq(larkChatDeliveries.outboxId, notificationOutbox.id))
    .where(and(
      isNull(larkChatDeliveries.id),
      testScope ? inArray(notificationOutbox.id, testScope.outboxIds) : undefined,
      sql`${notificationOutbox.createdAt} > NOW() - INTERVAL ${sqlInt(EXPIRE_AFTER_MINUTES)} MINUTE`,
      !testScope && dispatcherStartedAt ? gte(notificationOutbox.createdAt, new Date(dispatcherStartedAt.getTime() - STARTUP_BACKFILL_MINUTES * 60_000)) : undefined,
      or(isNull(notificationOutbox.lastError), ne(notificationOutbox.lastError, TEST_SUPPRESSED_MARKER)),
    ))
    .orderBy(notificationOutbox.id)
    .limit(BATCH_SIZE);
  for (const { outbox } of fresh) {
    const claimed = await db.insert(larkChatDeliveries).ignore().values({ outboxId: outbox.id, chatKey: outbox.groupKey, status: "sending", attempts: 1, claimedAt: sql`NOW()` });
    const insertId = Number(claimed[0].insertId ?? 0);
    if (Number(claimed[0].affectedRows ?? 0) !== 1 || !insertId) { summary.skipped++; continue; }
    await deliver(client, config, outbox, insertId, 1, summary);
  }

  // 2) Дахин оролдох ээлжтэй хүргэлтүүд.
  const due = await db.select({ delivery: larkChatDeliveries, outbox: notificationOutbox }).from(larkChatDeliveries)
    .innerJoin(notificationOutbox, eq(notificationOutbox.id, larkChatDeliveries.outboxId))
    .where(and(scoped, eq(larkChatDeliveries.status, "pending"), lte(larkChatDeliveries.nextAttemptAt, sql`NOW()`)))
    .orderBy(larkChatDeliveries.id)
    .limit(BATCH_SIZE);
  for (const { delivery, outbox } of due) {
    const claimed = await db.update(larkChatDeliveries)
      .set({ status: "sending", claimedAt: sql`NOW()`, attempts: sql`${larkChatDeliveries.attempts} + 1` })
      .where(and(eq(larkChatDeliveries.id, delivery.id), eq(larkChatDeliveries.status, "pending")));
    if (Number(claimed[0].affectedRows ?? 0) !== 1) { summary.skipped++; continue; }
    await deliver(client, config, outbox, delivery.id, delivery.attempts + 1, summary);
  }
  return summary;
}

/** Admin-ий "Lark хүргэлт" жагсаалт. */
export async function getRecentLarkDeliveries(limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: larkChatDeliveries.id,
    status: larkChatDeliveries.status,
    attempts: larkChatDeliveries.attempts,
    lastError: larkChatDeliveries.lastError,
    createdAt: larkChatDeliveries.createdAt,
    sentAt: larkChatDeliveries.sentAt,
    groupKey: notificationOutbox.groupKey,
    eventType: notificationOutbox.eventType,
    title: notificationOutbox.title,
  }).from(larkChatDeliveries)
    .innerJoin(notificationOutbox, eq(notificationOutbox.id, larkChatDeliveries.outboxId))
    .orderBy(desc(larkChatDeliveries.id))
    .limit(Math.min(Math.max(limit, 1), 100));
}

// --- хуваарь ---------------------------------------------------------------

let running = false;
let rerunRequested = false;
let kickTimer: ReturnType<typeof setTimeout> | null = null;

async function runOnce() {
  if (running) { rerunRequested = true; return; }
  running = true;
  try {
    do {
      rerunRequested = false;
      await dispatchPendingLarkCards();
    } while (rerunRequested);
  } catch (error) {
    console.error("[lark] chat dispatch failed", error);
  } finally {
    running = false;
  }
}

/** Мөр нэмэгдсэний дараа удахгүй (гүйлгээ commit хийх хугацаа өгнө). */
export function kickLarkChatDispatch() {
  if (kickTimer) return;
  kickTimer = setTimeout(() => { kickTimer = null; void runOnce(); }, 1500);
  kickTimer.unref?.();
}

let loop: ReturnType<typeof setInterval> | null = null;

export function startLarkChatDispatcher() {
  const gate = isLarkPushAllowed();
  if (!gate.allowed || loop) return;
  dispatcherStartedAt = new Date();
  addOutboxListener(kickLarkChatDispatch);
  loop = setInterval(() => void runOnce(), LOOP_INTERVAL_MS);
  loop.unref?.();
  // ntfy-ийн 8 с-ийн дараа — boot үеийн TLS холболтуудыг нэг агшинд овоолохгүй.
  const first = setTimeout(() => void runOnce(), process.env.NODE_ENV === "production" ? 12_000 : 0);
  first.unref?.();
}
