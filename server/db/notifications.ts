// server/db/notifications.ts — Мэдэгдлийн outbox/feed, push subscription.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { loginAttempts, notificationOutbox, pushSubscriptions, users, visitorSessions } from "../../drizzle/schema";
import { enqueueNotification, TEST_SUPPRESSED_MARKER } from "../notificationOutbox";
import type { NotificationEventType, NotificationPayloads } from "../../shared/notification-events";
import { getDb } from "./connection";

/** Queues a notification outside any transaction -- for events that happen
 *  in code with no transaction of its own (a webhook, a scheduled job).
 *  Never throws: a notification must not fail the thing it reports on. */
/**
 * Буцаах утга (2026-09-23): мөр ШИНЭЭР бичигдсэн эсэх. `dedupeKey`-тэй
 * үед энэ нь атом цоож болно (`INSERT … IGNORE`) — өдөрт нэг удаа явах
 * ёстой имэйл/push-ыг хоёр процесс зэрэг илгээхээс сэргийлнэ.
 */
export async function recordNotification<K extends NotificationEventType>(type: K, payload: NotificationPayloads[K], dedupeKey?: string | null): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    return (await enqueueNotification(db, type, payload, { dedupeKey })) > 0;
  } catch (error) {
    console.error(`[notifications] could not queue ${type}`, error);
    return false;
  }
}

/** Most recent outbox rows for the admin Integrations screen. The message
 *  text carries no customer PII by construction, so showing it is safe. */
export async function getRecentNotificationOutbox(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: notificationOutbox.id, eventType: notificationOutbox.eventType, groupKey: notificationOutbox.groupKey,
    title: notificationOutbox.title, status: notificationOutbox.status, attempts: notificationOutbox.attempts,
    lastError: notificationOutbox.lastError, createdAt: notificationOutbox.createdAt, sentAt: notificationOutbox.sentAt,
  }).from(notificationOutbox)
    .where(or(isNull(notificationOutbox.lastError), ne(notificationOutbox.lastError, TEST_SUPPRESSED_MARKER)))
    .orderBy(desc(notificationOutbox.id)).limit(limit);
}

/**
 * Daily outbox housekeeping, run by the scheduler on EVERY machine (the
 * dispatcher only runs where NOTIFICATIONS_DISPATCH=1, which today is
 * nowhere). Deletes rows the test suite wrote once they are a day old --
 * a full suite run leaves ~70 of them -- and anything finished more than 90
 * days ago, so the table stays small without a separate retention policy.
 */
/**
 * Data retention (2026-09-12 audit): two tables grew without bound.
 *  - visitor_sessions: one row per anonymous browsing session, forever. The
 *    analytics that read it (conversion rate, traffic sources) look back at
 *    most a couple of years; older rows are weight with no reader. Orders
 *    keep their link via SET NULL, so an old order is never touched.
 *  - login_attempts: the security log behind rate limiting and the
 *    Security Center's history. A year is plenty for both.
 * Nothing with a legal retention promise (orders, receipts, audit logs) is
 * touched here -- the privacy page promises those for 10 years.
 */
export async function purgeStaleTelemetry() {
  const db = await getDb();
  if (!db) return { visitorSessions: 0, loginAttempts: 0 };
  const sessions = await db.delete(visitorSessions).where(sql`${visitorSessions.lastSeenAt} < NOW() - INTERVAL 24 MONTH`);
  const logins = await db.delete(loginAttempts).where(sql`${loginAttempts.createdAt} < NOW() - INTERVAL 12 MONTH`);
  return { visitorSessions: Number(sessions[0].affectedRows ?? 0), loginAttempts: Number(logins[0].affectedRows ?? 0) };
}

export async function purgeNotificationOutbox(): Promise<{ testRows: number; oldRows: number }> {
  const db = await getDb();
  if (!db) return { testRows: 0, oldRows: 0 };
  const test = await db.delete(notificationOutbox).where(and(eq(notificationOutbox.status, "suppressed"), eq(notificationOutbox.lastError, TEST_SUPPRESSED_MARKER), sql`${notificationOutbox.createdAt} < NOW() - INTERVAL 1 DAY`));
  const old = await db.delete(notificationOutbox).where(and(inArray(notificationOutbox.status, ["sent", "failed", "expired", "suppressed"]), sql`${notificationOutbox.createdAt} < NOW() - INTERVAL 90 DAY`));
  return { testRows: Number(test[0].affectedRows ?? 0), oldRows: Number(old[0].affectedRows ?? 0) };
}

/**
 * The admin top bar's bell (2026-09-11): the same notifications the user's
 * group gets on their phones, newest first, plus how many are newer than
 * what they last marked as seen. Every status counts -- a notification that
 * failed or expired on its way to a phone still describes something real
 * that happened -- except rows the test suite wrote.
 */
export async function getNotificationFeed(userId: number, group: string, limit = 30) {
  const db = await getDb();
  if (!db) return { items: [], unreadCount: 0, lastSeenId: null as number | null };
  const notTestRow = or(isNull(notificationOutbox.lastError), ne(notificationOutbox.lastError, TEST_SUPPRESSED_MARKER));
  const [items, seenRows] = await Promise.all([
    db.select({
      id: notificationOutbox.id, eventType: notificationOutbox.eventType, title: notificationOutbox.title,
      message: notificationOutbox.message, clickPath: notificationOutbox.clickPath, priority: notificationOutbox.priority,
      createdAt: notificationOutbox.createdAt,
    }).from(notificationOutbox).where(and(eq(notificationOutbox.groupKey, group), notTestRow)).orderBy(desc(notificationOutbox.id)).limit(limit),
    db.select({ lastSeen: users.lastSeenNotificationId }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const lastSeenId = seenRows[0]?.lastSeen ?? null;
  const [unread] = await db.select({ count: sql<number>`COUNT(*)` }).from(notificationOutbox)
    .where(and(eq(notificationOutbox.groupKey, group), notTestRow, lastSeenId === null ? sql`1 = 1` : sql`${notificationOutbox.id} > ${lastSeenId}`));
  return { items, unreadCount: Number(unread?.count ?? 0), lastSeenId };
}

/** Marks everything up to `upToId` as seen. Never moves the marker
 *  backwards (a stale tab must not resurrect already-read items). */
export async function markNotificationsSeen(userId: number, upToId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users)
    .set({ lastSeenNotificationId: upToId })
    .where(and(eq(users.id, userId), or(isNull(users.lastSeenNotificationId), lt(users.lastSeenNotificationId, upToId))));
}

// ---------------------------------------------------------------------------
// Customer Web Push subscriptions (2026-09-13, migration 0074).
// ---------------------------------------------------------------------------

export async function upsertPushSubscription(input: { userId: number; endpoint: string; p256dh: string; auth: string; userAgent: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(pushSubscriptions).values(input).onDuplicateKeyUpdate({ set: { userId: input.userId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent } });
}

export async function deletePushSubscription(endpoint: string, userId?: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(pushSubscriptions).where(userId ? and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)) : eq(pushSubscriptions.endpoint, endpoint));
}

export async function getPushSubscriptionsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

export async function hasPushSubscription(userId: number, endpoint: string) {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))).limit(1);
  return Boolean(row);
}

export async function touchPushSubscriptions(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db.update(pushSubscriptions).set({ lastUsedAt: new Date() }).where(inArray(pushSubscriptions.id, ids));
}
