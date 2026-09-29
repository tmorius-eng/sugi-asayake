import { and, eq, lte, sql } from "drizzle-orm";
import { sqlInt } from "./_core/sqlSafe";
import { notificationOutbox } from "../drizzle/schema";
import { NTFY_TOPIC_FIELD, parseDisabledEvents, type NotificationGroup } from "../shared/notification-events";
import { getDb, getIntegrationSettings } from "./db";
import { ENV } from "./_core/env";
import { publishNtfy, type NtfyMessage, type NtfyResult } from "./_core/ntfy";
import { setOutboxListener } from "./notificationOutbox";

/**
 * Delivers queued phone push notifications (2026-09-11). Business code only
 * ever WRITES to notification_outbox (server/notificationOutbox.ts); this
 * file is the one place that talks to ntfy.
 *
 * Delivery, in order of preference:
 *   1. Right after an event is queued (kickNotificationDispatch, debounced),
 *      so a new order reaches the warehouse within seconds.
 *   2. A 60-second loop -- retries, and anything queued on a machine that is
 *      not dispatching (see ENV.notificationsDispatchEnabled).
 *
 * Safe with several machines on one database: a row is only sent by whoever
 * wins the guarded `UPDATE ... WHERE status = 'pending'` claim.
 */

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
/** Delay before retry N (1-based), in seconds. */
const RETRY_DELAYS_S = [60, 300, 1800, 1800];
/** Older than this and still undelivered: expire rather than send late. */
const EXPIRE_AFTER_MINUTES = 120;
/** A claim this old belongs to a process that died mid-send. */
const STUCK_CLAIM_MINUTES = 5;
const LOOP_INTERVAL_MS = 60_000;

export type DispatchSummary = { sent: number; failed: number; retried: number; skipped: number; configured: boolean };

function clickUrl(clickPath: string | null): string | undefined {
  if (!clickPath || !ENV.publicBaseUrl) return undefined;
  return `${ENV.publicBaseUrl}${clickPath}`;
}

/**
 * 2026-09-27 (I22): 401/403 used to be treated the same as a permanently
 * broken topic (400/404) and marked `failed` on the FIRST attempt -- but an
 * ntfy access token can be rotated (admin pastes a new one in Integrations)
 * or momentarily reject a request that a moment later succeeds; giving up
 * immediately meant a token typo or a mid-rotation window silently dropped
 * every push queued in that window with no retry at all. Left to the normal
 * retry ladder instead (still bounded by MAX_ATTEMPTS / EXPIRE_AFTER_MINUTES
 * below, so a genuinely dead token does not retry forever).
 */
function isPermanentNtfyFailure(status: number | null): boolean {
  return status !== null && status >= 400 && status < 500 && status !== 429 && status !== 401 && status !== 403;
}

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed: unknown = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

/** Sends one message directly, bypassing the queue -- the admin "send a
 *  test" buttons. Works whether or not ntfy is switched on or this machine
 *  dispatches, so the setup can be checked before going live. */
export async function sendNtfyTest(group: NotificationGroup, message: Omit<NtfyMessage, "topic">): Promise<NtfyResult & { topicConfigured: boolean }> {
  const current = await getIntegrationSettings("ntfy");
  const topic = current?.settings[NTFY_TOPIC_FIELD[group]];
  if (!current || !topic) return { ok: false, status: null, error: "Энэ бүлгийн сэдэв тохируулаагүй байна.", retryAfterMs: null, topicConfigured: false };
  const result = await publishNtfy({ serverUrl: current.settings.serverUrl, accessToken: current.settings.accessToken }, { ...message, topic });
  return { ...result, topicConfigured: true };
}

export async function dispatchPendingNotifications(): Promise<DispatchSummary> {
  const summary: DispatchSummary = { sent: 0, failed: 0, retried: 0, skipped: 0, configured: false };
  const db = await getDb();
  if (!db) return summary;

  // Housekeeping first, so the batch below only sees rows worth sending.
  await db.update(notificationOutbox)
    .set({ status: "expired", lastError: `not delivered within ${EXPIRE_AFTER_MINUTES} minutes` })
    .where(and(eq(notificationOutbox.status, "pending"), sql`${notificationOutbox.createdAt} < NOW() - INTERVAL ${sqlInt(EXPIRE_AFTER_MINUTES)} MINUTE`));
  await db.update(notificationOutbox)
    .set({ status: "pending" })
    .where(and(eq(notificationOutbox.status, "sending"), sql`${notificationOutbox.claimedAt} < NOW() - INTERVAL ${sqlInt(STUCK_CLAIM_MINUTES)} MINUTE`));
  // (Deleting old and test rows is a daily scheduler job on every machine --
  // purgeNotificationOutbox in db.ts -- not this loop, which only runs where
  // NOTIFICATIONS_DISPATCH=1.)

  // Not switched on (or not set up): leave everything pending. Nothing is
  // burned -- rows simply expire if ntfy stays off for two hours.
  const current = await getIntegrationSettings("ntfy");
  if (!current?.isActive) return summary;
  summary.configured = true;
  const settings = current.settings;
  const disabled = parseDisabledEvents(settings.disabledEvents);

  const candidates = await db.select().from(notificationOutbox)
    .where(and(eq(notificationOutbox.status, "pending"), lte(notificationOutbox.nextAttemptAt, sql`NOW()`)))
    .orderBy(notificationOutbox.id)
    .limit(BATCH_SIZE);

  for (const row of candidates) {
    const claimed = await db.update(notificationOutbox)
      .set({ status: "sending", claimedAt: sql`NOW()`, attempts: sql`${notificationOutbox.attempts} + 1` })
      .where(and(eq(notificationOutbox.id, row.id), eq(notificationOutbox.status, "pending")));
    if (Number(claimed[0].affectedRows ?? 0) !== 1) { summary.skipped++; continue; }
    const attempts = row.attempts + 1;

    if (disabled.has(row.eventType)) {
      await db.update(notificationOutbox).set({ status: "suppressed", lastError: "унтраасан (ntfy тохиргоо)" }).where(eq(notificationOutbox.id, row.id));
      summary.skipped++;
      continue;
    }
    const topic = settings[NTFY_TOPIC_FIELD[row.groupKey as NotificationGroup]];
    if (!topic) {
      await db.update(notificationOutbox).set({ status: "failed", lastError: `"${row.groupKey}" бүлгийн сэдэв тохируулаагүй` }).where(eq(notificationOutbox.id, row.id));
      summary.failed++;
      continue;
    }

    const result = await publishNtfy({ serverUrl: settings.serverUrl, accessToken: settings.accessToken }, {
      topic,
      title: row.title,
      message: row.message,
      priority: Math.min(5, Math.max(1, row.priority)) as NtfyMessage["priority"],
      tags: parseTags(row.tagsJson),
      click: clickUrl(row.clickPath),
    });

    if (result.ok) {
      await db.update(notificationOutbox).set({ status: "sent", sentAt: sql`NOW()`, lastError: null }).where(eq(notificationOutbox.id, row.id));
      summary.sent++;
    } else if (attempts >= MAX_ATTEMPTS || isPermanentNtfyFailure(result.status)) {
      // 4xx other than 429/401/403 (bad topic shape) will not fix itself by retrying.
      await db.update(notificationOutbox).set({ status: "failed", lastError: (result.error ?? "unknown error").slice(0, 300) }).where(eq(notificationOutbox.id, row.id));
      summary.failed++;
    } else {
      const delaySeconds = Math.max(RETRY_DELAYS_S[attempts - 1] ?? 1800, Math.ceil((result.retryAfterMs ?? 0) / 1000));
      await db.update(notificationOutbox)
        .set({ status: "pending", lastError: (result.error ?? "unknown error").slice(0, 300), nextAttemptAt: sql`NOW() + INTERVAL ${sqlInt(delaySeconds)} SECOND` })
        .where(eq(notificationOutbox.id, row.id));
      summary.retried++;
    }
  }
  return summary;
}

// --- scheduling -----------------------------------------------------------

let running = false;
let rerunRequested = false;
let kickTimer: ReturnType<typeof setTimeout> | null = null;

async function runOnce() {
  if (running) { rerunRequested = true; return; }
  running = true;
  try {
    do {
      rerunRequested = false;
      await dispatchPendingNotifications();
    } while (rerunRequested);
  } catch (error) {
    console.error("[notifications] dispatch failed", error);
  } finally {
    running = false;
  }
}

/** Deliver soon. Debounced, and delayed a little so the transaction that
 *  queued the row has committed by the time we look for it; anything missed
 *  is picked up by the loop within a minute. */
export function kickNotificationDispatch() {
  if (!ENV.notificationsDispatchEnabled) return;
  if (kickTimer) return;
  kickTimer = setTimeout(() => { kickTimer = null; void runOnce(); }, 1500);
  kickTimer.unref?.();
}

let loop: ReturnType<typeof setInterval> | null = null;

export function startNotificationDispatcher() {
  if (!ENV.notificationsDispatchEnabled) {
    console.log("[notifications] NOTIFICATIONS_DISPATCH is not 1 on this machine -- push notifications are queued but not sent from here.");
    return;
  }
  if (loop) return;
  setOutboxListener(kickNotificationDispatch);
  loop = setInterval(() => void runOnce(), LOOP_INTERVAL_MS);
  loop.unref?.();
  // First pass a few seconds after boot in production (2026-09-13): firing
  // it at once, together with the scheduler and the warm-ups, opened ~10 TLS
  // connections in the same instant and the 1-ECPU HeatWave instance timed
  // the last ones out. Tests keep the immediate run.
  const bootDelay = process.env.NODE_ENV === "production" ? 8_000 : 0;
  const first = setTimeout(() => void runOnce(), bootDelay);
  first.unref?.();
}

