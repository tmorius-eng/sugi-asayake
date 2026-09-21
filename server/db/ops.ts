// server/db/ops.ts — Ангилал (public), дэлгүүрийн тохиргоо, хуваарьт ажил, орхигдсон сагс, дэлгүүрийн зээл, маркетингийн зардал, зочны session, аудит, нэвтрэлтийн оролдлого.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { randomBytes } from "node:crypto";
import { sqlInt } from "../_core/sqlSafe";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { adminAuditLogs, cartItems, carts, loginAttempts, marketingSpend, productCategories, pushSubscriptions, products, scheduledJobRuns, storeCreditLedger, storeSettings, users, visitorSessions } from "../../drizzle/schema";
import { getStoreSettingSlot, type StoreSettingKey } from "../../shared/store-settings";
import { getOrSetCached } from "../_core/ttlCache";
import { STOREFRONT_CACHE_KEYS, STOREFRONT_CACHE_TTL_MS, invalidateStorefront } from "./site";
import { getDb } from "./connection";

/**
 * Active catalogue categories for the STOREFRONT (2026-09-12).
 *
 * The homepage, /shop's discovery cards, the header's mobile drawer and the
 * footer all used to read a hardcoded `categories` array in
 * client/src/components/home/categories-data.ts, while /shop's own filter
 * pills read the real DB categories -- so renaming a category in /admin
 * changed the filter and left every other surface showing the old name.
 * One source now, and the admin's `description`/`imageUrl` fields (which
 * the storefront never read before) finally reach the page.
 */
export async function getPublishedCategories() {
  return getOrSetCached(STOREFRONT_CACHE_KEYS.categories, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    // Active AND actually stocked. The live database has an empty leftover
    // category ("Shampoo", 0 products, still flagged active) which the old
    // hardcoded array simply never listed; reading the table naively would
    // have put it on the homepage, in the header drawer and in the footer as
    // a link to an empty shelf. Requiring at least one published product is
    // the same rule the rest of this storefront already follows -- rails and
    // sections hide themselves rather than render an empty state.
    const rows = await db
      .select({
        id: productCategories.id,
        name: productCategories.name,
        slug: productCategories.slug,
        description: productCategories.description,
        imageUrl: productCategories.imageUrl,
        sortOrder: productCategories.sortOrder,
        productCount: sql<number>`count(${products.id})`,
      })
      .from(productCategories)
      .innerJoin(products, and(eq(products.categoryId, productCategories.id), eq(products.isPublished, true)))
      .where(eq(productCategories.isActive, true))
      .groupBy(productCategories.id)
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
    return rows.map(row => ({ ...row, productCount: Number(row.productCount) }));
  });
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase A): store_settings
 * -- same upsert-by-unique-key shape as site_media/site_text above, see
 * shared/store-settings.ts for the slot registry and drizzle/schema.ts for
 * the table. `getStoreSettingValue`/`getStoreSettingNumber` are the actual
 * "DB override, code fallback" read path every consumer (checkout, order
 * emails) calls -- a row absent for a key is never an error, just the
 * signal to use that slot's own fallbackValue, identical contract to
 * site_media/site_text's imageFor()/textFor().
 */
export async function getStoreSettings() {
  return getOrSetCached(STOREFRONT_CACHE_KEYS.storeSettings, STOREFRONT_CACHE_TTL_MS, async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ settingKey: storeSettings.settingKey, settingValue: storeSettings.settingValue, updatedAt: storeSettings.updatedAt })
      .from(storeSettings)
      .orderBy(asc(storeSettings.settingKey));
  });
}

export async function getStoreSettingValue(key: StoreSettingKey): Promise<string> {
  const db = await getDb();
  const fallback = getStoreSettingSlot(key).fallbackValue;
  if (!db) return fallback;
  const row = await db.select({ settingValue: storeSettings.settingValue }).from(storeSettings).where(eq(storeSettings.settingKey, key)).limit(1);
  return row[0]?.settingValue ?? fallback;
}

export async function getStoreSettingNumber(key: StoreSettingKey): Promise<number> {
  return Number(await getStoreSettingValue(key));
}

export async function upsertStoreSetting(input: { settingKey: string; settingValue: string; updatedByUserId: number }) {
  invalidateStorefront("storeSettings");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(storeSettings).values({
    settingKey: input.settingKey,
    settingValue: input.settingValue,
    updatedByUserId: input.updatedByUserId,
  }).onDuplicateKeyUpdate({
    set: { settingValue: input.settingValue, updatedByUserId: input.updatedByUserId, updatedAt: new Date() },
  });
  const updated = await db.select().from(storeSettings).where(eq(storeSettings.settingKey, input.settingKey)).limit(1);
  return updated[0];
}

export async function deleteStoreSetting(settingKey: string) {
  invalidateStorefront("storeSettings");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(storeSettings).where(eq(storeSettings.settingKey, settingKey));
  return { settingKey };
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase D): the read/write
 * pair server/_core/scheduler.ts calls -- kept here rather than having the
 * scheduler import getDb directly, matching this codebase's own convention
 * of routing all DB access through named functions in this file (see e.g.
 * server/_core/index.ts's `dbPing` import).
 */
export async function getScheduledJobLastRun(jobName: string): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.select({ lastRunAt: scheduledJobRuns.lastRunAt }).from(scheduledJobRuns).where(eq(scheduledJobRuns.jobName, jobName)).limit(1);
  return row[0]?.lastRunAt ?? null;
}

export async function markScheduledJobRun(jobName: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(scheduledJobRuns).values({ jobName, lastRunAt: new Date() }).onDuplicateKeyUpdate({ set: { lastRunAt: new Date() } });
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase E): the
 * abandoned-cart reminder job's own query -- reuses the EXACT same
 * staleness definition server/analytics.ts's getCartAbandonment already
 * established (item present, 24h+ inactive, not converted), so the
 * dashboard's abandonment number and what this job actually acts on can
 * never drift apart. Scoped, honestly, to carts belonging to a REGISTERED,
 * opted-in user with a real email on file -- a guest cart's `userId` is
 * null (guest identity is a cookie token, see CartOwner), so the inner join
 * on `users` already excludes every guest cart without a separate
 * condition; `reminderSentAt IS NULL` is what keeps a still-abandoned cart
 * from being reminded twice.
 *
 * 2026-09-14: registration is phone-only, so most customers have no email
 * at all -- the reminder reached almost nobody. A shopper who turned on
 * web push (Profile -> Notifications) is now eligible too; the job sends
 * whichever channels the row says exist (`emailOptIn`+`email`, and/or
 * `pushSubscriptions` > 0).
 */
export async function getAbandonedCartsNeedingReminder() {
  const db = await getDb();
  if (!db) return [];
  const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pushSubscriptionCount = sql<number>`(SELECT COUNT(*) FROM ${pushSubscriptions} WHERE ${pushSubscriptions.userId} = ${users.id})`;
  const rows = await db
    .selectDistinct({
      cartId: carts.id,
      userId: users.id,
      email: users.email,
      emailOptIn: users.emailOptIn,
      name: users.name,
      pushSubscriptions: pushSubscriptionCount,
    })
    .from(carts)
    .innerJoin(cartItems, eq(cartItems.cartId, carts.id))
    .innerJoin(users, eq(users.id, carts.userId))
    .where(and(
      eq(carts.status, "active"),
      lt(carts.updatedAt, staleCutoff),
      isNull(carts.reminderSentAt),
      or(
        and(eq(users.emailOptIn, true), isNotNull(users.email)),
        sql`${pushSubscriptionCount} > 0`,
      ),
    ));
  return rows.map(row => ({ ...row, pushSubscriptions: Number(row.pushSubscriptions) }));
}

export async function markCartReminderSent(cartId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(carts).set({ reminderSentAt: new Date() }).where(eq(carts.id, cartId));
}

/**
 * "Controls everything" admin overhaul (2026-09-08, Phase H/I): the one
 * write path for store credit -- an admin issuing/adjusting it (Phase H,
 * `actorUserId` set) and a checkout consuming it (Phase I, `actorUserId`
 * null, `orderId` set) both call this, so the ledger row and the cached
 * `users.storeCreditMnt` balance can never drift apart. `deltaMnt` is
 * signed: positive to add, negative to spend. The atomic `gte` guard below
 * is the same WHERE-guard + affectedRows race-proof idiom this file already
 * uses for stock decrements -- `storeCreditMnt >= -deltaMnt` is exactly
 * `storeCreditMnt + deltaMnt >= 0` rearranged, so a negative delta can never
 * push the balance below zero even under concurrent spends, and a positive
 * delta's guard is trivially always true (a balance is never negative to
 * begin with).
 */
export async function adjustStoreCredit(input: { userId: number; deltaMnt: number; reason: string; actorUserId: number | null; orderId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (input.deltaMnt === 0) throw new Error("Adjustment amount must not be zero.");
  return db.transaction(async tx => {
    const update = await tx.update(users)
      .set({ storeCreditMnt: sql`${users.storeCreditMnt} + ${input.deltaMnt}`, updatedAt: new Date() })
      .where(and(eq(users.id, input.userId), gte(users.storeCreditMnt, -input.deltaMnt)));
    if (Number(update[0].affectedRows ?? 0) !== 1) {
      throw new Error("Insufficient store credit balance for this adjustment.");
    }
    await tx.insert(storeCreditLedger).values({
      userId: input.userId, deltaMnt: input.deltaMnt, reason: input.reason,
      actorUserId: input.actorUserId, orderId: input.orderId ?? null,
    });
    const [updatedUser] = await tx.select({ storeCreditMnt: users.storeCreditMnt }).from(users).where(eq(users.id, input.userId)).limit(1);
    return { userId: input.userId, storeCreditMnt: updatedUser?.storeCreditMnt ?? 0 };
  });
}

/** Checkout's own "apply my store credit" toggle -- the customer-facing
 *  read, distinct from getAdminUserDetail's admin-facing one above. */
export async function getUserStoreCreditBalance(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ storeCreditMnt: users.storeCreditMnt }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.storeCreditMnt ?? 0;
}

/**
 * Audit 2026-09-09 (architecture debt #3): users.storeCreditMnt is a cached
 * balance and store_credit_ledger is the append-only truth; every writer
 * must update both inside one transaction, and nothing else checks they
 * agree. This is that check -- the number of accounts whose cached balance
 * differs from the sum of their ledger rows. Surfaced on the admin System
 * Health card so a drift is seen the day it happens, not the day a
 * customer complains (which is exactly how BUG-U1 stayed hidden).
 */
export async function getStoreCreditDrift() {
  const db = await getDb();
  if (!db) return { driftedAccounts: 0, checkedAccounts: 0 };
  const ledgerTotals = db.select({ userId: storeCreditLedger.userId, ledgerTotal: sql<number>`coalesce(sum(${storeCreditLedger.deltaMnt}), 0)`.as("ledgerTotal") })
    .from(storeCreditLedger).groupBy(storeCreditLedger.userId).as("ledgerTotals");
  const [row] = await db.select({
    checked: sql<number>`count(*)`,
    drifted: sql<number>`coalesce(sum(case when ${users.storeCreditMnt} <> coalesce(${ledgerTotals.ledgerTotal}, 0) then 1 else 0 end), 0)`,
  }).from(users).leftJoin(ledgerTotals, eq(ledgerTotals.userId, users.id))
    .where(or(ne(users.storeCreditMnt, 0), isNotNull(ledgerTotals.userId)));
  return { driftedAccounts: Number(row?.drifted ?? 0), checkedAccounts: Number(row?.checked ?? 0) };
}

export async function getStoreCreditLedger(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: storeCreditLedger.id, deltaMnt: storeCreditLedger.deltaMnt, reason: storeCreditLedger.reason,
    actorUserId: storeCreditLedger.actorUserId, actorEmail: users.email, orderId: storeCreditLedger.orderId,
    createdAt: storeCreditLedger.createdAt,
  }).from(storeCreditLedger)
    .leftJoin(users, eq(users.id, storeCreditLedger.actorUserId))
    .where(eq(storeCreditLedger.userId, userId))
    // ⚠️ `id` тэнцвэр ЗААВАЛ (2026-09-16). `createdAt` нь секундын
    // нарийвчлалтай тул нэг секундэд хийгдсэн хоёр гүйлгээ тэнцэж, MySQL
    // дурын дарааллаар буцаана — админ "сүүлийн хөдөлгөөн" гэж буруу мөр
    // харна. CI (локал MySQL, латенц бараг тэг) дээр хоёр мөр үргэлж нэг
    // секундэд багтдаг тул яг энд баригдсан; HeatWave-ийн тунелийн
    // саатлаас болж хөгжүүлэгчийн машин дээр санамсаргүй ногоон гардаг байв.
    // Гарын авлагын "хуудаслалтад тогтвортой тэнцвэр" дүрэмтэй ижил анги.
    .orderBy(desc(storeCreditLedger.createdAt), desc(storeCreditLedger.id))
    // Admin-ий drawer сүүлийн 5-ыг харуулдаг; хязгааргүй жагсаалт (2026-09-21 аудит) 100-аар.
    .limit(100);
}

/** Tier F: CAC's one input. Same upsert-by-unique-key shape as
 *  upsertSiteMedia above. */
export async function getMarketingSpendRows(monthKeys: string[]) {
  const db = await getDb();
  if (!db || monthKeys.length === 0) return [];
  return db.select({ monthKey: marketingSpend.monthKey, spendMnt: marketingSpend.spendMnt }).from(marketingSpend).where(inArray(marketingSpend.monthKey, monthKeys));
}

export async function upsertMarketingSpend(input: { monthKey: string; spendMnt: number; updatedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(marketingSpend).values({
    monthKey: input.monthKey,
    spendMnt: input.spendMnt,
    updatedByUserId: input.updatedByUserId,
  }).onDuplicateKeyUpdate({
    set: { spendMnt: input.spendMnt, updatedByUserId: input.updatedByUserId, updatedAt: new Date() },
  });
  const updated = await db.select().from(marketingSpend).where(eq(marketingSpend.monthKey, input.monthKey)).limit(1);
  return updated[0];
}

// Tier E: the industry-standard GA/Shopify-style "session" boundary -- a
// gap this long since the last pageview starts a new session, even if the
// cookie itself is still valid (the cookie's own lifetime is much longer;
// see the schema comment on visitorSessions and getVisitorSessionCookieOptions).
const VISITOR_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Resolves (or creates) the visitor_sessions row for one pageview beacon
 * call. Bumps lastSeenAt/pageViewCount on an existing, still-live session;
 * mints a fresh token and inserts a new row otherwise (no existing token,
 * an unrecognized token, or one that's gone stale past the 30-minute
 * window). Always returns a token — the router only writes the cookie back
 * when isNewToken is true, so an existing valid session's cookie is never
 * needlessly rewritten.
 */
export async function resolvePageviewSession(input: {
  existingToken?: string;
  path: string;
  trafficSource?: string | null;
  deviceType: "mobile" | "tablet" | "desktop" | "unknown";
}): Promise<{ sessionToken: string; isNewToken: boolean }> {
  const db = await getDb();
  if (!db) return { sessionToken: randomBytes(24).toString("base64url"), isNewToken: true };
  if (input.existingToken) {
    const existing = await db.select().from(visitorSessions).where(eq(visitorSessions.sessionToken, input.existingToken)).limit(1);
    if (existing[0] && existing[0].lastSeenAt.getTime() >= Date.now() - VISITOR_SESSION_TIMEOUT_MS) {
      await db.update(visitorSessions).set({ lastSeenAt: new Date(), pageViewCount: sql`${visitorSessions.pageViewCount} + 1` }).where(eq(visitorSessions.id, existing[0].id));
      return { sessionToken: input.existingToken, isNewToken: false };
    }
  }
  const sessionToken = randomBytes(24).toString("base64url");
  await db.insert(visitorSessions).values({ sessionToken, landingPath: input.path, trafficSource: input.trafficSource ?? null, deviceType: input.deviceType });
  return { sessionToken, isNewToken: true };
}

/** Looks up the visitor_sessions.id for a session cookie value read at
 *  checkout — null for a missing/unrecognized/expired token (an order can
 *  always be placed with no session link; conversion tracking just won't
 *  count it, exactly like any order placed before Tier E shipped). */
export async function getVisitorSessionIdByToken(sessionToken: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: visitorSessions.id }).from(visitorSessions).where(eq(visitorSessions.sessionToken, sessionToken)).limit(1);
  return rows[0]?.id ?? null;
}

/** The most recent campaign send with this fingerprint inside the window,
 *  or null -- see admin.sendCampaign's double-send guard. */
export async function findRecentCampaignSend(fingerprint: string, windowMinutes: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ id: adminAuditLogs.id, createdAt: adminAuditLogs.createdAt }).from(adminAuditLogs)
    .where(and(eq(adminAuditLogs.action, "campaign.sent"), like(adminAuditLogs.metadataJson, `%"fingerprint":"${fingerprint}"%`), sql`${adminAuditLogs.createdAt} > NOW() - INTERVAL ${sqlInt(windowMinutes)} MINUTE`))
    .orderBy(desc(adminAuditLogs.createdAt)).limit(1);
  return row ?? null;
}

export async function logAdminAction(input: { actorUserId: number; action: string; entityType: string; entityId?: number | null; metadata?: Record<string, unknown> }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(adminAuditLogs).values({ actorUserId: input.actorUserId, action: input.action, entityType: input.entityType, entityId: input.entityId ?? null, metadataJson: input.metadata ? JSON.stringify(input.metadata) : null });
}

// TIER 4: admin-only Audit Log viewer — every filter is optional/additive.
// entityType/entityId (2026-09-07, Project "SUGI Desk" Phase 4) reuse this
// same query for the new per-record History panel — same shape, same
// admin-only gate, just scoped to one record instead of the global feed.
export async function getAdminAuditLogs(filters: { action?: string; actorEmail?: string; dateFrom?: Date; dateTo?: Date; entityType?: string; entityId?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    filters.action ? eq(adminAuditLogs.action, filters.action) : undefined,
    filters.actorEmail ? like(users.email, `%${filters.actorEmail}%`) : undefined,
    filters.dateFrom ? gte(adminAuditLogs.createdAt, filters.dateFrom) : undefined,
    filters.dateTo ? lte(adminAuditLogs.createdAt, filters.dateTo) : undefined,
    filters.entityType ? eq(adminAuditLogs.entityType, filters.entityType) : undefined,
    filters.entityId !== undefined ? eq(adminAuditLogs.entityId, filters.entityId) : undefined,
  ].filter(condition => condition !== undefined);

  return db.select({
    id: adminAuditLogs.id,
    actorUserId: adminAuditLogs.actorUserId,
    actorEmail: users.email,
    actorName: users.name,
    action: adminAuditLogs.action,
    entityType: adminAuditLogs.entityType,
    entityId: adminAuditLogs.entityId,
    metadataJson: adminAuditLogs.metadataJson,
    createdAt: adminAuditLogs.createdAt,
  })
    .from(adminAuditLogs)
    .leftJoin(users, eq(adminAuditLogs.actorUserId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(Math.min(filters.limit ?? 100, 200));
}

// Best-effort: a DB hiccup while recording history should never be the
// reason a legitimate login fails, so this swallows its own errors (same
// pattern as the email/SMS senders in _core/notification.ts).
// NOTE (2026-09-05): the `email` column/param name predates login moving to
// phone+password -- it now holds whatever identifier was actually typed
// into the login form (a phone number, going forward). Left as `email`
// rather than renamed: this is a security/rate-limit audit log, not a real
// email address field, and a column rename here is a schema migration with
// no functional upside (same call as leaving staff_invitations in place).
export async function recordLoginAttempt(input: { email: string; userId: number | null; success: boolean; reason?: string | null; ipAddress: string | null }) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(loginAttempts).values({ email: input.email, userId: input.userId, success: input.success, reason: input.reason ?? null, ipAddress: input.ipAddress });
  } catch (error) {
    console.error("[Login attempt] Failed to record:", error);
  }
}

/**
 * Аудит 2026-09-20 (P0-3): данс тус бүрийн lockout-ийн тоолуур. Өмнө нь login
 * зөвхөн IP-д хязгаарлагдаж, `login_attempts` бичигддэг ч хэн ч уншдаггүй байв
 * — олон IP-ээс (proxy, CGNAT-ийн өөр гарц) нэг дансыг хязгааргүй таах боломжтой.
 * `login_attempts_user_idx` индекс аль хэдийн бий; 12 сарын retention-той тул
 * хүснэгт хязгаартай.
 *
 * DB-гүй (unit тест, tooling) үед 0 — lockout нь нэмэлт хамгаалалт, гол зам биш.
 */
export async function countRecentFailedLoginAttempts(userId: number, windowMs: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const since = new Date(Date.now() - windowMs);
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(loginAttempts)
    .where(and(eq(loginAttempts.userId, userId), eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since)));
  return Number(row?.count ?? 0);
}

// TIER 4: admin-only Login History viewer.
// Admin overhaul (2026-09-08, Phase M): real server-side pagination.
// login_attempts is a permanent table with no retention/cleanup job -- the
// actual gap this closes isn't rows disappearing, it's the UI hard-capping
// at 200 and making everything older invisible even though it's still
// sitting right there in the table.
export async function getLoginHistory(filters: { email?: string; success?: boolean; page?: number; pageSize?: number }) {
  const db = await getDb();
  if (!db) return { rows: [], totalCount: 0 };
  const conditions = [
    filters.email ? like(loginAttempts.email, `%${filters.email}%`) : undefined,
    filters.success !== undefined ? eq(loginAttempts.success, filters.success) : undefined,
  ].filter(condition => condition !== undefined);
  const where = conditions.length ? and(...conditions) : undefined;

  const pageSize = Math.min(Math.max(filters.pageSize ?? 50, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);

  const [rows, [{ count: totalCount }]] = await Promise.all([
    db.select().from(loginAttempts)
      .where(where)
      // Ижил секундэд олон оролдлого бичигддэг (нэг халдлага) тул хуудаслалтад
      // тогтвортой дараалал шаардлагатай — id нь эцсийн тэнцвэр (2026-09-16).
      .orderBy(desc(loginAttempts.createdAt), desc(loginAttempts.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(loginAttempts).where(where),
  ]);
  return { rows, totalCount: Number(totalCount) };
}
