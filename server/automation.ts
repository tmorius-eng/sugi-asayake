import { getAbandonedCartsNeedingReminder, getLowStockProducts, markCartReminderSent, getStoreSettingValue, purgeNotificationOutbox, recordNotification } from "./db";
import { fillTemplate } from "../shared/store-settings";
import { ubDateKey } from "../shared/notification-events";
import { sendAccountEmail, notifyOwner } from "./_core/notification";
import { registerJob } from "./_core/scheduler";

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
  for (const cart of abandonedCarts) {
    if (!cart.email) continue; // belt-and-suspenders; the query itself already filters this
    await sendAccountEmail({
      to: cart.email,
      subject: await getStoreSettingValue("email-subject-abandoned-cart"),
      content: fillTemplate(await getStoreSettingValue("email-body-abandoned-cart"), { "{нэр}": cart.name ?? "хүндэт харилцагч" }),
    });
    await markCartReminderSent(cart.cartId);
  }
}

// Hourly: frequent enough that a shopper isn't reminded a day late,
// infrequent enough that this never meaningfully competes with real
// traffic.
export function registerAbandonedCartReminderJob() {
  registerJob({ name: "abandoned-cart-reminder", intervalMs: 60 * 60 * 1000, run: runAbandonedCartReminderJob });
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
  await notifyOwner({
    title: fillTemplate(await getStoreSettingValue("email-subject-low-stock-digest"), { "{тоо}": String(lowStockProducts.length) }),
    content: `Дараах бараануудын нөөц бага байна:\n\n${lines}\n\nАдмин самбарын Бүтээгдэхүүн хэсгээс шинэчилнэ үү.`,
  });
  // 2026-09-11: the same digest as a phone push to the warehouse. Keyed by
  // the Ulaanbaatar date, so a restart that re-runs the job the same day
  // does not buzz everyone twice.
  await recordNotification("stock.low_digest", {
    count: lowStockProducts.length,
    items: lowStockProducts.map(product => ({ sku: product.sku, name: product.name, quantity: product.stockQuantity })),
  }, `day:${ubDateKey()}`);
}

// ~20h interval (not a literal 24h) so a slightly-early tick never lets a
// full day pass with no digest at all.
export function registerLowStockDigestJob() {
  registerJob({ name: "low-stock-owner-digest", intervalMs: 20 * 60 * 60 * 1000, run: runLowStockDigestJob });
}

// 2026-09-11: keeps notification_outbox small -- see purgeNotificationOutbox.
export async function runNotificationOutboxPurgeJob(): Promise<void> {
  const { testRows, oldRows } = await purgeNotificationOutbox();
  if (testRows || oldRows) console.log(`[notifications] outbox purge: ${testRows} test row(s), ${oldRows} row(s) older than 90 days`);
}

export function registerNotificationOutboxPurgeJob() {
  registerJob({ name: "notification-outbox-purge", intervalMs: 20 * 60 * 60 * 1000, run: runNotificationOutboxPurgeJob });
}
