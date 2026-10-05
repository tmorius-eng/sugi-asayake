import "dotenv/config";
// Нэг удаагийн backfill (2026-10-05, migration 0101): order_events үүсэхээс ӨМНӨХ
// захиалгуудын амьдралын мөчлөгийг orders мөрийн timestamp-ууд, payment_attempts
// ба admin_audit_logs-оос сэргээж order_events-д бичнэ — /admin → Процесс дээр хуучин
// захиалга ч түүхтэй харагдана.
//
// Idempotent: аль хэдийн `order.created` event-тэй захиалгыг АЛГАСНА, тиймээс хэд ч
// удаа (deploy-ийн өмнө staging, дараа нь prod, дараа нь дахин) ажиллуулж болно.
// createdAt-ийг ил бичдэг тул дараалал бодит цагаараа.
//
// Deploy-ийн ДАРАА ажиллуулахад ч аюулгүй: хуучин захиалгад шинэ код аль хэдийн бодит event
// бичсэн бол (ажилтан төлөв сольсон) тэр мөчөөс хойшхи аудитаас юу ч сэргээхгүй (cutoff) —
// давхар "Төлөв: …" мөр үүсэхгүй. Хамгийн цэвэр дараалал: 0101 → backfill → deploy.
//
// Хэрэглээ (--dry-run ч гэсэн production схемд `--i-know-this-is-production` шаардана):
//   pnpm exec tsx scripts/backfill-order-events.ts --staging --dry-run  # sugi_staging, зөвхөн тоолно
//   pnpm exec tsx scripts/backfill-order-events.ts --staging            # sugi_staging
//   pnpm exec tsx scripts/backfill-order-events.ts --i-know-this-is-production [--dry-run]
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { adminAuditLogs, orderEvents, orders, paymentAttempts } from "../drizzle/schema";
import { getDb } from "../server/db";
import { refuseProductionDatabase } from "./_refuse-production";

const WEBHOOK_PAID_METHODS = new Set(["qpay", "storepay"]);
const DRY_RUN = process.argv.includes("--dry-run");

if (process.argv.includes("--staging") && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/defaultdb(\?|$)/, "/sugi_staging$1");
}
refuseProductionDatabase("backfill-order-events");

type NewEvent = typeof orderEvents.$inferInsert;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");

  // Event-гүй захиалгууд (order.created байхгүй).
  const withCreated = db.select({ orderId: orderEvents.orderId }).from(orderEvents).where(eq(orderEvents.kind, "order.created"));
  const candidates = await db.select().from(orders).where(sql`${orders.id} NOT IN (${withCreated})`).orderBy(asc(orders.id));
  console.log(`Event-гүй захиалга: ${candidates.length}${DRY_RUN ? " (dry-run — бичихгүй)" : ""}`);
  if (!candidates.length) return;

  const ids = candidates.map(order => order.id);
  const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

  const paidAttempts = new Map<number, { provider: string; at: Date }>();
  const auditRows = new Map<number, Array<{ at: Date; actorUserId: number; status: string | null }>>();
  // Шинэ код аль хэдийн бичсэн эхний event — түүнээс хойшхи зүйлийг сэргээхгүй.
  const firstRealEvent = new Map<number, Date>();
  for (const part of chunk(ids, 500)) {
    const existing = await db.select({ orderId: orderEvents.orderId, firstAt: sql<Date>`MIN(${orderEvents.createdAt})` })
      .from(orderEvents).where(inArray(orderEvents.orderId, part)).groupBy(orderEvents.orderId);
    for (const row of existing) firstRealEvent.set(row.orderId, new Date(row.firstAt));
    const attempts = await db.select({ orderId: paymentAttempts.orderId, provider: paymentAttempts.provider, updatedAt: paymentAttempts.updatedAt })
      .from(paymentAttempts).where(and(inArray(paymentAttempts.orderId, part), eq(paymentAttempts.status, "paid")));
    for (const attempt of attempts) if (!paidAttempts.has(attempt.orderId)) paidAttempts.set(attempt.orderId, { provider: attempt.provider, at: attempt.updatedAt });
    const audits = await db.select({ entityId: adminAuditLogs.entityId, actorUserId: adminAuditLogs.actorUserId, metadataJson: adminAuditLogs.metadataJson, createdAt: adminAuditLogs.createdAt })
      .from(adminAuditLogs).where(and(eq(adminAuditLogs.entityType, "order"), eq(adminAuditLogs.action, "order.updated"), inArray(adminAuditLogs.entityId, part)))
      .orderBy(asc(adminAuditLogs.id));
    for (const audit of audits) {
      if (!audit.entityId) continue;
      let status: string | null = null;
      try { status = (JSON.parse(audit.metadataJson ?? "{}") as { status?: string }).status ?? null; } catch { /* хуучин мөр */ }
      const list = auditRows.get(audit.entityId) ?? [];
      list.push({ at: audit.createdAt, actorUserId: audit.actorUserId, status });
      auditRows.set(audit.entityId, list);
    }
  }

  const rows: NewEvent[] = [];
  const BACKFILL = { backfilled: true } as const;
  for (const order of candidates) {
    const cutoff = firstRealEvent.get(order.id) ?? null;
    const before = (at: Date | null | undefined) => !cutoff || !at || at.getTime() < cutoff.getTime();
    const isStaffOrigin = order.trafficSource === "staff" || order.salesChannel === "in_store";
    const createdActor = isStaffOrigin ? { actorKind: "staff" as const, actorLabel: "Ажилтан (backfill)" } : { actorKind: "customer" as const, actorLabel: order.userId ? null : "Зочин" };
    rows.push({ orderId: order.id, kind: "order.created", toStatus: order.salesChannel === "in_store" ? "completed" : "pending", ...createdActor, actorUserId: null, createdAt: order.createdAt,
      payloadJson: JSON.stringify({ ...BACKFILL, orderNumber: order.orderNumber, totalMnt: order.totalMnt, paymentMethod: order.paymentMethod, deliveryMethod: order.deliveryMethod, channel: order.salesChannel === "in_store" ? "in_store" : isStaffOrigin ? "manual" : "online" }) });

    // Ажилтны төлөв солилтууд (аудитаас) — дарааллаар, өмнөх төлөвийг гинжээр.
    let previous = order.salesChannel === "in_store" ? "completed" : "pending";
    for (const audit of auditRows.get(order.id) ?? []) {
      if (!audit.status || audit.status === previous || !before(audit.at)) continue;
      rows.push({ orderId: order.id, kind: "status.changed", fromStatus: previous, toStatus: audit.status, actorKind: "staff", actorUserId: audit.actorUserId, createdAt: audit.at, payloadJson: JSON.stringify(BACKFILL) });
      previous = audit.status;
    }
    // Аудитаас дутуу үлдсэн эцсийн төлөвийг orders-ийн timestamp-аар нөхнө (бодит event байвал тэр л хэлнэ).
    if (order.status !== previous && !cutoff) {
      const at = order.status === "completed" ? order.completedAt : order.status === "returned" ? order.returnedAt : null;
      rows.push({ orderId: order.id, kind: "status.changed", fromStatus: previous, toStatus: order.status, actorKind: "system", actorLabel: "Backfill", createdAt: at ?? order.updatedAt, payloadJson: JSON.stringify({ ...BACKFILL, inferred: true }) });
    }

    if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
      const webhook = paidAttempts.get(order.id);
      if (webhook && before(webhook.at)) {
        rows.push({ orderId: order.id, kind: "payment.paid", actorKind: "webhook", actorLabel: webhook.provider, createdAt: webhook.at, payloadJson: JSON.stringify({ ...BACKFILL, provider: webhook.provider }) });
      } else if (!webhook && order.salesChannel === "in_store") {
        rows.push({ orderId: order.id, kind: "payment.paid", actorKind: "staff", actorLabel: "Касс (backfill)", createdAt: order.createdAt, payloadJson: JSON.stringify({ ...BACKFILL, paymentMethod: "in_store" }) });
      } else if (!webhook && !WEBHOOK_PAID_METHODS.has(order.paymentMethod) && before(order.completedAt ?? order.updatedAt)) {
        rows.push({ orderId: order.id, kind: "payment.paid", actorKind: "staff", actorLabel: "Ажилтан (backfill)", createdAt: order.completedAt ?? order.updatedAt, payloadJson: JSON.stringify({ ...BACKFILL, paymentMethod: order.paymentMethod, reason: "completed" }) });
      }
    }
    if (order.refundedAt && before(order.refundedAt)) rows.push({ orderId: order.id, kind: "payment.refunded", actorKind: "staff", actorLabel: "Санхүү (backfill)", createdAt: order.refundedAt, payloadJson: JSON.stringify({ ...BACKFILL, refundAmountMnt: order.refundAmountMnt }) });
    if (order.returnRequestedAt && before(order.returnRequestedAt)) rows.push({ orderId: order.id, kind: "return.requested", actorKind: "customer", actorUserId: null, createdAt: order.returnRequestedAt, payloadJson: JSON.stringify(BACKFILL) });
    if (order.reviewRequestedAt && before(order.reviewRequestedAt)) rows.push({ orderId: order.id, kind: "review.requested", actorKind: "job", jobName: "review-request", actorLabel: "Сэтгэгдэл хүсэх ажил", createdAt: order.reviewRequestedAt, payloadJson: JSON.stringify(BACKFILL) });
  }

  console.log(`Бичих event: ${rows.length} (${candidates.length} захиалгад)`);
  if (DRY_RUN) return;
  for (const part of chunk(rows, 500)) await db.insert(orderEvents).values(part);
  const [left] = await db.select({ total: sql<number>`COUNT(*)` }).from(orders).leftJoin(orderEvents, eq(orderEvents.orderId, orders.id)).where(isNull(orderEvents.id));
  console.log(`Дууслаа. Event-гүй үлдсэн захиалга: ${Number(left?.total ?? 0)}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
