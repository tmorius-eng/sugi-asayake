import { notificationOutbox } from "../drizzle/schema";
import { buildNotificationMessage, NOTIFICATION_EVENTS, type NotificationEventType, type NotificationGroup, type NotificationPayloads } from "../shared/notification-events";
import { ENV } from "./_core/env";
import type { DbOrTx } from "./db";

/**
 * Queues a phone push notification (2026-09-11). Called by business code
 * INSIDE its own transaction wherever it can be, so the notification exists
 * if and only if the event committed -- see notification_outbox in
 * drizzle/schema.ts for the full reasoning, and server/notifications.ts for
 * delivery.
 *
 * A leaf module on purpose: db.ts imports this, so this must not import
 * db.ts at runtime (the `DbOrTx` import is type-only and erased). The
 * "something was queued, deliver soon" signal therefore goes through a
 * listener that server/notifications.ts registers at startup, instead of a
 * direct call that would close an import cycle.
 */

let onEnqueued: (() => void) | null = null;

export function setOutboxListener(listener: (() => void) | null) {
  onEnqueued = listener;
}

/** `lastError` of rows the test suite wrote. Kept out of the admin bell's
 *  feed and purged by the dispatcher -- dozens of throwaway test orders must
 *  not look like real shop activity. */
export const TEST_SUPPRESSED_MARKER = "suppressed: test run";

/**
 * The stored dedupe key is namespaced by event type. Callers naturally key
 * several events by the same thing ("order:42" for placed, paid, cancelled,
 * refunded), and a bare shared key made the unique index silently swallow
 * every event after the first for that order -- caught by
 * notifications.integration.test.ts on the first run.
 */
export const outboxDedupeKey = (type: NotificationEventType, key: string) => `${type}|${key}`;

export type EnqueueOptions = {
  /** Same event + key + group twice = one notification (INSERT IGNORE). */
  dedupeKey?: string | null;
  /** Send to these groups instead of the event's default list. */
  groups?: readonly NotificationGroup[];
};

/**
 * Буцаах утга (2026-09-23): ШИНЭЭР бичигдсэн мөрийн тоо. `.ignore()` нь
 * dedupeKey давхцвал 0 мөр бичдэг тул энэ тоо нь "энэ үйл явдлыг би эзэмшлээ"
 * гэсэн АТОМ цоож болно — хоёр лаптоп + production нэг DB хуваалцдаг тул
 * процесс доторх тэмдэглэгээ хүрэлцэхгүй (доорх low-stock digest-ийг үз).
 */
export async function enqueueNotification<K extends NotificationEventType>(dbOrTx: DbOrTx, type: K, payload: NotificationPayloads[K], options: EnqueueOptions = {}): Promise<number> {
  const spec = NOTIFICATION_EVENTS[type];
  const groups = options.groups ?? spec.groups;
  if (!groups.length) return 0;
  const { title, message } = buildNotificationMessage(type, payload);
  const status = ENV.notificationsSuppressed ? "suppressed" as const : "pending" as const;
  const inserted = await dbOrTx.insert(notificationOutbox).ignore().values(groups.map(group => ({
    eventType: type,
    groupKey: group,
    dedupeKey: options.dedupeKey ? outboxDedupeKey(type, options.dedupeKey) : null,
    title,
    message,
    priority: spec.priority,
    tagsJson: JSON.stringify(spec.tags),
    clickPath: `/admin?adminSection=${spec.clickSection}`,
    status,
    lastError: status === "suppressed" ? TEST_SUPPRESSED_MARKER : null,
  })));
  const insertedRows = Number(inserted[0]?.affectedRows ?? 0);
  if (status === "pending" && insertedRows > 0) onEnqueued?.();
  return insertedRows;
}
