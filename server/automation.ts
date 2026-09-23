import { clearReviewRequested, clearCartReminderSent, getAbandonedCartsNeedingReminder, getLowStockProducts, getOrdersNeedingReviewRequest, getStockLedgerHealth, getStoreSettingNumber, markCartReminderSent, markReviewRequested, getStoreSettingValue, purgeNotificationOutbox, purgeStaleTelemetry, recordNotification, claimRestockAlert, getPendingRestockAlerts, rearmRestockAlerts } from "./db";
import { getStaleTransfers } from "./transfers";
import { runInventorySync } from "./integrations/inventorySync";
import { fillTemplate } from "../shared/store-settings";
import { ubDateKey } from "../shared/notification-events";
import { sendAccountEmail, notifyOwner } from "./_core/notification";
import { sendPushToUser } from "./_core/webPush";
import { registerJob } from "./_core/scheduler";
import { ENV } from "./_core/env";
import { purgeExpiredFaceHandoffs } from "./faceHandoff";
import { purgeExpiredFaceChallenges } from "./db";
import { purgeSearchQueries } from "./search/searchAnalytics";

/**
 * "Controls everything" admin overhaul (2026-09-08, Phases E/F): the two
 * real jobs registered on top of server/_core/scheduler.ts's generic
 * infrastructure. Each job's actual logic is its own exported `run*Job`
 * function (not an inline closure) so an integration test can call it
 * directly -- exercising the real query/send/mark round trip -- without
 * going through the scheduler's own due-ness bookkeeping, which is
 * server/_core/scheduler.test.ts's job to cover in isolation.
 */

// Phase E: reminds a registered, opted-in shopper about a cart they left
// idle for 24h+ -- see getAbandonedCartsNeedingReminder's own doc-comment
// (server/db.ts) for the exact staleness/eligibility rules.
export async function runAbandonedCartReminderJob(): Promise<void> {
  const abandonedCarts = await getAbandonedCartsNeedingReminder();
  if (abandonedCarts.length === 0) return;
  const subject = await getStoreSettingValue("email-subject-abandoned-cart");
  const emailBody = await getStoreSettingValue("email-body-abandoned-cart");
  const pushBody = await getStoreSettingValue("push-body-abandoned-cart");
  for (const cart of abandonedCarts) {
    // 2026-09-23: илгээхийн ӨМНӨ эзэмшинэ. Хоёр лаптоп + production нэг DB
    // хуваалцдаг тул хоёр scheduler ижил сагсыг сонгож, хоёулаа "сагсандаа
    // бараа үлдсэн" имэйл/push илгээх боломжтой байв (тэмдэглэгээ нь илгээсний
    // ДАРАА бичигддэг байсан). Хэрэв ямар ч суваг ажиллахгүй бол эзэмшилтийг
    // буцааж суллана.
    if (!(await markCartReminderSent(cart.cartId))) continue;
    const name = cart.name ?? "хүндэт харилцагч";
    let delivered = false;
    if (cart.email && cart.emailOptIn) {
      // 2026-09-20 (P1-2): the return value used to be ignored, so a Brevo
      // 4xx/5xx still marked the reminder as sent and the customer never got
      // one. A false from an UNCONFIGURED Brevo (log fallback) still counts --
      // nothing will ever send in that environment, and retrying hourly would
      // only spam the log.
      const sent = await sendAccountEmail({ to: cart.email, subject, content: fillTemplate(emailBody, { "{нэр}": name }) });
      if (sent || !ENV.brevoApiKey) delivered = true;
    }
    // 2026-09-14: the phone-only customer's channel. Counted as delivered
    // only when a subscription actually accepted it, so a cart whose only
    // subscription has died (404/410, dropped by sendPushToUser) is retried
    // by a later tick instead of being silently marked.
    if (cart.pushSubscriptions > 0) {
      const sent = await sendPushToUser(cart.userId, { title: subject, body: fillTemplate(pushBody, { "{нэр}": name }), url: "/checkout", tag: "abandoned-cart" });
      if (sent > 0) delivered = true;
    }
    // Ямар ч суваг хүрээгүй бол тэмдэглэгээг буцааж, дараагийн тик дахин
    // оролдоно (хуучин логик ижил зорилготой байсан, зөвхөн дараалал өөр).
    if (!delivered) await clearCartReminderSent(cart.cartId);
  }
}

// Hourly: frequent enough that a shopper isn't reminded a day late,
// infrequent enough that this never meaningfully competes with real
// traffic.
export function registerAbandonedCartReminderJob() {
  registerJob({ name: "abandoned-cart-reminder", intervalMs: 60 * 60 * 1000, run: runAbandonedCartReminderJob });
}

// Post-delivery review request (2026-09-14, Tom: reviews are 0 because
// nobody is ever asked). Once per completed order, N days after completion
// (review-request-days; 0 switches the job off), by push and/or the order's
// email. Marked as asked even when neither channel exists -- there is
// nothing to retry with.
export async function runReviewRequestJob(): Promise<void> {
  const days = await getStoreSettingNumber("review-request-days");
  if (!(days > 0)) return;
  const candidates = await getOrdersNeedingReviewRequest(days);
  if (candidates.length === 0) return;
  const [subject, emailBody, pushBody, rewardMnt] = await Promise.all([
    getStoreSettingValue("email-subject-review-request"), getStoreSettingValue("email-body-review-request"), getStoreSettingValue("push-body-review-request"), getStoreSettingNumber("review-reward-mnt"),
  ]);
  const rewardLine = rewardMnt > 0 ? ` Сэтгэгдэл бүрд ${new Intl.NumberFormat("mn-MN").format(rewardMnt)}₮ дэлгүүрийн зээл бэлэглэнэ.` : "";
  for (const order of candidates) {
    // 2026-09-23: илгээхийн ӨМНӨ эзэмшинэ (markReviewRequested нь одоо guarded
    // UPDATE). Өмнө нь тэмдэглэгээ илгээсний дараа байсан тул хоёр сервер нэг
    // захиалгад хоёр "сэтгэгдэл бичээрэй" мэдэгдэл явуулах боломжтой байв.
    if (!(await markReviewRequested(order.orderId))) continue;
    const name = order.customerName?.trim() || "хүндэт харилцагч";
    const values = { "{нэр}": name, "{захиалга}": order.orderNumber, "{урамшуулал}": rewardLine };
    // 2026-09-23: сувгийн аль нэг хүрсэн эсэхийг ХЯНАНА (орхигдсон сагсны
    // ажилтай ижил). Эзэмшилт илгээхийн өмнө болсон тул Brevo/push-ийн түр
    // зуурын алдаа тэмдэглэгээг мөнхөд зарцуулж, тэр худалдан авагч хүсэлтийг
    // ХЭЗЭЭ Ч авахгүй болох байсан. Ямар ч суваг байхгүй бол (имэйлгүй,
    // бүртгэлгүй) дахин оролдох зүйл байхгүй тул тэмдэглэгээ хэвээр.
    let delivered = false;
    let hadChannel = false;
    if (order.customerEmail) {
      hadChannel = true;
      const sent = await sendAccountEmail({ to: order.customerEmail, subject: fillTemplate(subject, values), content: fillTemplate(emailBody, values) }).catch(() => false);
      if (sent || !ENV.brevoApiKey) delivered = true;
    }
    if (order.userId && order.pushSubscriptions > 0) {
      hadChannel = true;
      const sent = await sendPushToUser(order.userId, { title: fillTemplate(subject, values), body: fillTemplate(pushBody, values), url: "/profile?tab=orders", tag: `review-${order.orderId}` }).catch(() => 0);
      if (sent > 0) delivered = true;
    }
    if (hadChannel && !delivered) await clearReviewRequested(order.orderId);
  }
}

// Back-in-stock (2026-09-21, migration 0092): the wishlist's "Ирэхээр мэдэгдэх"
// finally does what it says for every way stock can come back -- receiving,
// counts, transfers, vendor sync, cancellations, admin edits -- not only the
// admin product form it used to hang off. Each row is claimed BEFORE sending
// (claimRestockAlert: guarded UPDATE), so a double run never double-sends; a
// sold-out product re-arms its rows so the next arrival notifies again.
// Push goes to anyone who asked (an explicit per-item request, like an order
// update -- not marketing, so users.pushOptIn does not gate it); email only
// with emailOptIn. No customer name/phone in the text (only the product).
export async function runBackInStockJob(scope: { productIds?: number[] } = {}): Promise<{ notified: number; rearmed: number }> {
  // `scope` зөвхөн тестэд (бодит хүснэгт дээр өөрийн мөрөөр хязгаарлана); job нь бүгдийг.
  const rearmed = await rearmRestockAlerts(scope.productIds);
  const alerts = await getPendingRestockAlerts(200, scope.productIds);
  if (alerts.length === 0) return { notified: 0, rearmed };
  const [subject, emailBody, pushBody] = await Promise.all([
    getStoreSettingValue("email-subject-back-in-stock"), getStoreSettingValue("email-body-back-in-stock"), getStoreSettingValue("push-body-back-in-stock"),
  ]);
  let notified = 0;
  for (const alert of alerts) {
    if (!(await claimRestockAlert(alert.id))) continue;
    notified += 1;
    const values = { "{бараа}": alert.productNameMn?.trim() || alert.productName };
    if (pushBody.trim()) {
      await sendPushToUser(alert.userId, { title: fillTemplate(subject, values), body: fillTemplate(pushBody, values), url: `/product/${alert.productSlug}`, tag: `restock-${alert.id}` })
        .catch(error => console.warn("[back-in-stock] push failed", error instanceof Error ? error.message : error));
    }
    if (alert.email && alert.emailOptIn) {
      await sendAccountEmail({ to: alert.email, subject: fillTemplate(subject, values), content: fillTemplate(emailBody, values) }).catch(() => undefined);
    }
  }
  return { notified, rearmed };
}

export function registerBackInStockJob() {
  registerJob({ name: "back-in-stock", intervalMs: 15 * 60 * 1000, run: async () => { await runBackInStockJob(); } });
}

export function registerReviewRequestJob() {
  registerJob({ name: "review-request", intervalMs: 6 * 60 * 60 * 1000, run: runReviewRequestJob });
}

// Phase F: a daily digest to the store owner instead of a dashboard widget
// they have to remember to open -- getLowStockProducts is the EXACT same
// query the dashboard's own "НӨӨЦ ДУУСЧ БАЙНА" widget already uses (server/
// db.ts), extracted so both read one canonical source. Sends nothing when
// the list is empty -- an admin shouldn't get a daily "all clear" email
// they'll learn to ignore.
export async function runLowStockDigestJob(): Promise<void> {
  const lowStockProducts = await getLowStockProducts();
  if (lowStockProducts.length === 0) return;
  const lines = lowStockProducts.map(product => `- ${product.name} (SKU: ${product.sku}) — үлдэгдэл: ${product.stockQuantity}`).join("\n");
  // 2026-09-11: the same digest as a phone push to the warehouse. Keyed by
  // the Ulaanbaatar date, so a restart that re-runs the job the same day
  // does not buzz everyone twice.
  await recordNotification("stock.low_digest", {
    count: lowStockProducts.length,
    items: lowStockProducts.map(product => ({ sku: product.sku, name: product.name, quantity: product.stockQuantity })),
  }, `day:${ubDateKey()}`);
  // 2026-09-23: имэйл нь push-ийн ӨДРИЙН түлхүүрээс ХАМААРАХГҮЙ. Хоёулаа нэг
  // мөрөөр цоожлох гэсэн оролдлого нь илүү дор: push-ийн мөр аль хэдийн
  // байвал эзэн нөөцийн бодит товчоог ХЭЗЭЭ Ч авахгүй болно (хоёр сувгийн
  // хүлээн авагч өөр). Давхардлыг интервалаар шийдэв — доорх registerJob-ийг үз.
  await notifyOwner({
    title: fillTemplate(await getStoreSettingValue("email-subject-low-stock-digest"), { "{тоо}": String(lowStockProducts.length) }),
    content: `Дараах бараануудын нөөц бага байна:\n\n${lines}\n\nАдмин самбарын Бүтээгдэхүүн хэсгээс шинэчилнэ үү.`,
  });
}

// 24h interval (2026-09-23: 20h байсан).
//
// Хуучин 20 цаг нь "бага зэрэг эрт тик өдрийг алгасуулахгүй" гэсэн санаатай
// байсан ч бодит үр дүн нь 5 хоногт 6 ажиллалт, зарим өдөр ХОЁР эзний имэйл
// байв. Товчоо нь тухайн өдрийн үйл явдлын тайлан БИШ, харин ОДООГИЙН нөөцийн
// байдал тул 24 цагт нэг удаа хангалттай; due-ness нь DB-д (`scheduled_job_runs`)
// хадгалагддаг тул restart ч өдрийг алгасуулахгүй.
export function registerLowStockDigestJob() {
  registerJob({ name: "low-stock-owner-digest", intervalMs: 24 * 60 * 60 * 1000, run: runLowStockDigestJob });
}

// Phase 5 (2026-09-11): the stock ledger should always add up to the
// shelves. If something changed branch_stock behind its back (the other
// laptop on older code, a manual SQL edit), tell admin -- once a day.
export async function runStockLedgerDriftJob(): Promise<void> {
  const { driftCount } = await getStockLedgerHealth();
  if (driftCount > 0) await recordNotification("stock.ledger_drift", { count: driftCount }, `day:${ubDateKey()}`);
}

export function registerStockLedgerDriftJob() {
  registerJob({ name: "stock-ledger-drift", intervalMs: 60 * 60 * 1000, run: runStockLedgerDriftJob });
}

// Phase 5: goods that left the warehouse two days ago and still are not
// confirmed anywhere are either unscanned at the store or lost in transit.
export async function runStaleTransferJob(): Promise<void> {
  for (const transfer of await getStaleTransfers(48)) {
    await recordNotification("transfer.stale", { code: transfer.code, toBranchName: transfer.toBranchName, hours: transfer.hours }, `transfer:${transfer.id}:${ubDateKey()}`);
  }
}

export function registerStaleTransferJob() {
  registerJob({ name: "stale-transfer-reminder", intervalMs: 6 * 60 * 60 * 1000, run: runStaleTransferJob });
}

// Phase 6: the Smart Software sync -- a no-op until an adapter is
// registered and the integration is switched on (server/integrations/inventorySync.ts).
export function registerInventorySyncJob() {
  registerJob({ name: "inventory-sync-smartsoftware", intervalMs: 15 * 60 * 1000, run: async () => { await runInventorySync(); } });
}

// 2026-09-11: keeps notification_outbox small -- see purgeNotificationOutbox.
export async function runNotificationOutboxPurgeJob(): Promise<void> {
  const { testRows, oldRows } = await purgeNotificationOutbox();
  if (testRows || oldRows) console.log(`[notifications] outbox purge: ${testRows} test row(s), ${oldRows} row(s) older than 90 days`);
}

// 2026-09-12: bounded growth for the two tables that had none -- see
// purgeStaleTelemetry for the retention periods and why they are safe.
export async function runDataRetentionJob(): Promise<void> {
  const { visitorSessions, loginAttempts } = await purgeStaleTelemetry();
  // QR handoff-ийн хүсэлтүүд 90 секундын настай — нэг өдрөөс хуучин мөр нь
  // зөвхөн аудитын хог (жинхэнэ түүх нь admin_audit_logs-д үлддэг).
  // Шинэ job гаргалгүй энд хавсаргав (2026-09-16).
  const handoffs = await purgeExpiredFaceHandoffs(24);
  // Царайны challenge 3 минут амьдардаг ч хэзээ ч устдаггүй байв (2026-09-22).
  const challenges = await purgeExpiredFaceChallenges(24);
  // Хайлтын лог 90 хоног (2026-09-20): статистикт 30/90 хоногийн цонх л хэрэгтэй.
  const searches = await purgeSearchQueries(90);
  if (visitorSessions || loginAttempts || handoffs || challenges || searches) console.log(`[retention] removed ${visitorSessions} visitor session(s) older than 24 months, ${loginAttempts} login attempt(s) older than 12 months, ${handoffs} face handoff request(s) older than 24 hours, ${challenges} face challenge(s) expired over 24 hours ago, ${searches} search log row(s) older than 90 days`);
}

export function registerDataRetentionJob() {
  registerJob({ name: "data-retention", intervalMs: 24 * 60 * 60 * 1000, run: runDataRetentionJob });
}

export function registerNotificationOutboxPurgeJob() {
  registerJob({ name: "notification-outbox-purge", intervalMs: 20 * 60 * 60 * 1000, run: runNotificationOutboxPurgeJob });
}
