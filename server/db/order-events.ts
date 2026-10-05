// Захиалгын үйл явдлын бүртгэл (2026-10-05, migration 0101) — /admin → Процесс самбарын
// эх сурвалж. docs/CODEBASE.md §3.1.
//
// ДҮРЭМ (PROJECT-GUIDE): захиалгын мөр бичдэг ЗАМ БҮР `recordOrderEvent`-ийг ИЖИЛ транзакц
// дотор дуудна — ledger (recordStockMovement) ба outbox (enqueueNotification)-тэй ижил
// сахилга: захиалга буцвал event ч буцна, event бичигдэхгүй бол захиалга ч бичигдэхгүй.
// Транзакцаас ГАДНА (төлбөрийн callback) дуудахад алдаа гарвал дуудагч нь шиддэг эсэхээ
// өөрөө шийднэ — энд юу ч нуухгүй.
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { adminAuditLogs, integrationSyncState, notificationOutbox, orderEvents, orders, paymentAttempts, stockCounts, stockMovements, stockTransfers, users } from "../../drizzle/schema";
import { ACTOR_KIND_LABELS, PROCESS_SIDE_STAGES, PROCESS_STAGES, mergeTimeline, summarizeOrderEvent, type ActorKind, type OrderEventKind, type TimelineEntry } from "../../shared/process-timeline";
import { stockMovementLabel } from "../../shared/stock-movements";
import { sqlInt } from "../_core/sqlSafe";
import { getDb } from "./connection";
import { getRecentJobRuns } from "./ops";
import type { DbOrTx } from "./admin-orders";

export type OrderEventActor = {
  kind: ActorKind;
  /** Нэвтэрсэн хэрэглэгч/ажилтан. Зочин, job, webhook, систем бол null. */
  userId?: number | null;
  /** Хүнд харуулах нэр: провайдер ("qpay"), "Зочин", "Систем". Утас/хаяг ХЭЗЭЭ Ч биш. */
  label?: string | null;
  /** actorKind="job" бол scheduler-ийн job нэр. */
  jobName?: string | null;
};

export type RecordOrderEventInput = {
  orderId: number;
  kind: OrderEventKind;
  fromStatus?: string | null;
  toStatus?: string | null;
  actor: OrderEventActor;
  /** Дүн/тоо/SKU зэрэг — харилцагчийн нэр, утас, хаяг ОРУУЛАХГҮЙ. */
  payload?: Record<string, unknown>;
};

/** Транзакц дотор дуудахад тохиромжтой: dbOrTx нь `tx` эсвэл `db`. */
export async function recordOrderEvent(dbOrTx: DbOrTx, input: RecordOrderEventInput): Promise<void> {
  await dbOrTx.insert(orderEvents).values({
    orderId: input.orderId,
    kind: input.kind,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    actorKind: input.actor.kind,
    actorUserId: input.actor.userId ?? null,
    actorLabel: input.actor.label ?? null,
    jobName: input.actor.jobName ?? null,
    payloadJson: input.payload ? JSON.stringify(input.payload) : null,
  });
}

/** Транзакцгүй дуудагчид (роутерийн мэдэгдлийн дараах алхам) — DB байхгүй бол чимээгүй алгасна. */
export async function recordOrderEventOutsideTx(input: RecordOrderEventInput): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await recordOrderEvent(db, input);
}

export type OrderEventRow = {
  id: number;
  orderId: number;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorKind: ActorKind;
  actorUserId: number | null;
  actorLabel: string | null;
  actorName: string | null;
  jobName: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

function parsePayload(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const eventColumns = {
  id: orderEvents.id, orderId: orderEvents.orderId, kind: orderEvents.kind,
  fromStatus: orderEvents.fromStatus, toStatus: orderEvents.toStatus,
  actorKind: orderEvents.actorKind, actorUserId: orderEvents.actorUserId, actorLabel: orderEvents.actorLabel,
  actorName: users.name, jobName: orderEvents.jobName, payloadJson: orderEvents.payloadJson, createdAt: orderEvents.createdAt,
};

/** Нэг захиалгын event-үүд id өсөхөөр; ажилтны нэрийг users-ээс (зөвхөн нэр). */
export async function getOrderEvents(orderId: number): Promise<OrderEventRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select(eventColumns).from(orderEvents).leftJoin(users, eq(users.id, orderEvents.actorUserId))
    .where(eq(orderEvents.orderId, orderId)).orderBy(orderEvents.id);
  return rows.map(({ payloadJson, ...rest }) => ({ ...rest, payload: parsePayload(payloadJson) }));
}

/** Захиалга бүрийн СҮҮЛИЙН event (жагсаалтын мөрд) — нэг query, олон захиалга. */
export async function getLastOrderEvents(orderIds: number[]): Promise<Map<number, OrderEventRow>> {
  const out = new Map<number, OrderEventRow>();
  if (!orderIds.length) return out;
  const db = await getDb();
  if (!db) return out;
  const latest = db.select({ orderId: orderEvents.orderId, maxId: sql<number>`MAX(${orderEvents.id})`.as("maxId") })
    .from(orderEvents).where(inArray(orderEvents.orderId, orderIds)).groupBy(orderEvents.orderId).as("latest");
  const rows = await db.select(eventColumns).from(orderEvents)
    .innerJoin(latest, and(eq(latest.orderId, orderEvents.orderId), eq(latest.maxId, orderEvents.id)))
    .leftJoin(users, eq(users.id, orderEvents.actorUserId));
  for (const { payloadJson, ...rest } of rows) out.set(rest.orderId, { ...rest, payload: parsePayload(payloadJson) });
  return out;
}

/**
 * Event-гүй захиалгын тоо — "түүхгүй захиалга N". Шинэ бичих зам recordOrderEvent-ийг
 * дуудахаа мартвал энд ил гарна (backfill хийгдээгүй хуучин захиалга ч мөн).
 */
export async function countOrdersWithoutEvents(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ total: sql<number>`COUNT(*)` }).from(orders)
    .leftJoin(orderEvents, eq(orderEvents.orderId, orders.id))
    .where(isNull(orderEvents.id));
  return Number(row?.total ?? 0);
}

/** Сүүлийн N event бүх захиалгаас (аудитын feed-д), ажилтан биш акторуудаар шүүж болно. */
export async function getRecentOrderEvents(opts: { limit: number; actorKind?: ActorKind | null }): Promise<Array<OrderEventRow & { orderNumber: string }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ ...eventColumns, orderNumber: orders.orderNumber }).from(orderEvents)
    .innerJoin(orders, eq(orders.id, orderEvents.orderId))
    .leftJoin(users, eq(users.id, orderEvents.actorUserId))
    .where(opts.actorKind ? eq(orderEvents.actorKind, opts.actorKind) : undefined)
    .orderBy(desc(orderEvents.id)).limit(Math.max(1, Math.min(500, opts.limit)));
  return rows.map(({ payloadJson, ...rest }) => ({ ...rest, payload: parsePayload(payloadJson) }));
}

// ---------------------------------------------------------------------------
// Timeline: нэг захиалгын 5 эх сурвалжийг нэг дараалалд (shared/process-timeline.ts mergeTimeline).
// ---------------------------------------------------------------------------

const iso = (date: Date | null | undefined) => (date ?? new Date(0)).toISOString();

function eventEntry(row: OrderEventRow): TimelineEntry {
  const actorLabel = row.actorName ?? row.actorLabel ?? (row.actorKind === "job" ? row.jobName : null) ?? ACTOR_KIND_LABELS[row.actorKind];
  const details: TimelineEntry["details"] = {};
  for (const [key, value] of Object.entries(row.payload ?? {})) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) details[key] = value;
    else if (Array.isArray(value)) details[key] = value.join(", ");
  }
  return {
    key: `event:${row.id}`, source: "event", id: row.id, at: iso(row.createdAt), kind: row.kind, actorKind: row.actorKind, actorLabel,
    fromStatus: row.fromStatus, toStatus: row.toStatus, summary: summarizeOrderEvent(row.kind, row.payload, row.fromStatus, row.toStatus), details,
  };
}

/**
 * Захиалгын бүтэн timeline. `includeAudit` зөвхөн admin-д (ажилтны нэр харагддаг —
 * AdminHistoryPanel-тэй ижил тиер). Нөөц/төлбөр/мэдэгдлийн мөрүүд шинэ мөр бичихгүй,
 * байгаа хүснэгтүүдээс join-оор ирнэ (CODEBASE §3.1).
 */
export async function getOrderTrail(orderId: number, opts: { includeAudit: boolean }): Promise<TimelineEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const [events, movements, attempts, pushes, audits] = await Promise.all([
    getOrderEvents(orderId),
    db.select({ id: stockMovements.id, type: stockMovements.type, delta: stockMovements.delta, sku: stockMovements.sku, branchId: stockMovements.branchId, balanceAfter: stockMovements.balanceAfter, actorUserId: stockMovements.actorUserId, actorName: users.name, createdAt: stockMovements.createdAt })
      .from(stockMovements).leftJoin(users, eq(users.id, stockMovements.actorUserId))
      .where(and(eq(stockMovements.refType, "order"), eq(stockMovements.refId, orderId))).orderBy(stockMovements.id),
    db.select({ id: paymentAttempts.id, provider: paymentAttempts.provider, status: paymentAttempts.status, providerInvoiceId: paymentAttempts.providerInvoiceId, createdAt: paymentAttempts.createdAt, updatedAt: paymentAttempts.updatedAt })
      .from(paymentAttempts).where(eq(paymentAttempts.orderId, orderId)).orderBy(paymentAttempts.id),
    // dedupeKey = `${eventType}|order:<id>` (notificationOutbox.outboxDedupeKey) — id бүхэл тоо тул LIKE-д аюулгүй.
    db.select({ id: notificationOutbox.id, eventType: notificationOutbox.eventType, groupKey: notificationOutbox.groupKey, title: notificationOutbox.title, status: notificationOutbox.status, sentAt: notificationOutbox.sentAt, createdAt: notificationOutbox.createdAt })
      .from(notificationOutbox).where(sql`${notificationOutbox.dedupeKey} LIKE ${`%|order:${sqlIntValue(orderId)}`}`).orderBy(notificationOutbox.id),
    opts.includeAudit
      ? db.select({ id: adminAuditLogs.id, action: adminAuditLogs.action, actorUserId: adminAuditLogs.actorUserId, actorName: users.name, metadataJson: adminAuditLogs.metadataJson, createdAt: adminAuditLogs.createdAt })
        .from(adminAuditLogs).leftJoin(users, eq(users.id, adminAuditLogs.actorUserId))
        .where(and(eq(adminAuditLogs.entityType, "order"), eq(adminAuditLogs.entityId, orderId))).orderBy(adminAuditLogs.id)
      : Promise.resolve([]),
  ]);

  const stockEntries: TimelineEntry[] = movements.map(m => ({
    key: `stock:${m.id}`, source: "stock", id: m.id, at: iso(m.createdAt), kind: m.type,
    actorKind: m.actorUserId ? "staff" : "system", actorLabel: m.actorName ?? (m.actorUserId ? ACTOR_KIND_LABELS.staff : "Нөөцийн дэвтэр"),
    summary: `${stockMovementLabel(m.type)}: ${m.delta > 0 ? "+" : ""}${m.delta} ш · SKU ${m.sku}`,
    details: { sku: m.sku, delta: m.delta, balanceAfter: m.balanceAfter, branchId: m.branchId },
  }));
  const paymentEntries: TimelineEntry[] = attempts.map(a => ({
    key: `payment:${a.id}`, source: "payment", id: a.id, at: iso(a.status === "paid" ? a.updatedAt : a.createdAt), kind: `payment.${a.status}`,
    actorKind: "webhook", actorLabel: a.provider,
    summary: a.status === "paid" ? `${a.provider} — төлбөр баталгаажсан` : a.status === "created" ? `${a.provider} — нэхэмжлэл үүссэн, хүлээж байна` : `${a.provider} — ${a.status}`,
    details: { provider: a.provider, status: a.status, invoice: a.providerInvoiceId },
  }));
  const notificationEntries: TimelineEntry[] = pushes.map(n => ({
    key: `notification:${n.id}`, source: "notification", id: n.id, at: iso(n.createdAt), kind: n.eventType,
    actorKind: "system", actorLabel: "Мэдэгдлийн систем",
    summary: `${n.title} → ${n.groupKey}${n.status === "sent" ? " (илгээгдсэн)" : n.status === "pending" ? " (хүлээгдэж байна)" : ` (${n.status})`}`,
    details: { group: n.groupKey, status: n.status, sentAt: n.sentAt ? n.sentAt.toISOString() : null },
  }));
  const auditEntries: TimelineEntry[] = audits.map(a => ({
    key: `audit:${a.id}`, source: "audit", id: a.id, at: iso(a.createdAt), kind: a.action,
    actorKind: "staff", actorLabel: a.actorName ?? ACTOR_KIND_LABELS.staff,
    summary: a.action,
    details: compactMetadata(a.metadataJson),
  }));
  return mergeTimeline([events.map(eventEntry), stockEntries, paymentEntries, notificationEntries, auditEntries]);
}

/** LIKE-д орох утга бүхэл тоо гэдгийг баталгаажуулна (sqlInt-тэй ижил шалгалт, харин утга буцаана). */
function sqlIntValue(value: number): number {
  sqlInt(value); // шиддэг шалгалт
  return value;
}

function compactMetadata(json: string | null): TimelineEntry["details"] {
  const parsed = parsePayload(json);
  if (!parsed) return undefined;
  const out: NonNullable<TimelineEntry["details"]> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Самбарын тойм: эгнээ бүрийн тоо, гацсан захиалга, хүний шийдвэр хүлээж буй алхмууд.
// ---------------------------------------------------------------------------

export type ProcessStageSummary = { status: string; count: number; stuck: number; oldestAt: Date | null };
export type ProcessOverview = {
  stuckHours: number;
  stages: ProcessStageSummary[];
  /** Сүүлийн 30 хоногт хаагдсан (цуцлагдсан/буцаагдсан) захиалга. */
  closed: ProcessStageSummary[];
  pendingHuman: { returnRequests: number; unpaidWebhookOrders24h: number; submittedStockCounts: number; openTransferDiscrepancies: number };
  vendorSync: { configured: boolean; pushCursor: number | null; lastRunAt: Date | null; lastOkAt: Date | null; lastError: string | null; behindCount: number };
  missingTrail: number;
  /** Сүүлийн 24 цагийн event-үүд актораар — самбарын "хэн хэдийг хийв" мөр. */
  actors24h: Record<ActorKind, number>;
};

export async function getProcessOverview(stuckHours: number): Promise<ProcessOverview> {
  const db = await getDb();
  const empty: ProcessOverview = {
    stuckHours, stages: PROCESS_STAGES.map(status => ({ status, count: 0, stuck: 0, oldestAt: null })), closed: PROCESS_SIDE_STAGES.map(status => ({ status, count: 0, stuck: 0, oldestAt: null })),
    pendingHuman: { returnRequests: 0, unpaidWebhookOrders24h: 0, submittedStockCounts: 0, openTransferDiscrepancies: 0 },
    vendorSync: { configured: false, pushCursor: null, lastRunAt: null, lastOkAt: null, lastError: null, behindCount: 0 }, missingTrail: 0,
    actors24h: { customer: 0, staff: 0, job: 0, webhook: 0, system: 0 },
  };
  if (!db) return empty;
  const hours = sqlInt(stuckHours);
  const openStatuses = PROCESS_STAGES.filter(status => status !== "completed");
  const [openRows, completedRows, closedRows, [human], syncRows, missingTrail, actorRows] = await Promise.all([
    db.select({ status: orders.status, count: sql<number>`COUNT(*)`, stuck: sql<number>`SUM(CASE WHEN ${orders.updatedAt} < NOW() - INTERVAL ${hours} HOUR THEN 1 ELSE 0 END)`, oldestAt: sql<Date | null>`MIN(${orders.updatedAt})` })
      .from(orders).where(inArray(orders.status, [...openStatuses])).groupBy(orders.status),
    db.select({ count: sql<number>`COUNT(*)` }).from(orders).where(and(eq(orders.status, "completed"), gte(orders.completedAt, sql`NOW() - INTERVAL 30 DAY`))),
    db.select({ status: orders.status, count: sql<number>`COUNT(*)` }).from(orders).where(and(inArray(orders.status, [...PROCESS_SIDE_STAGES]), gte(orders.updatedAt, sql`NOW() - INTERVAL 30 DAY`))).groupBy(orders.status),
    db.select({
      returnRequests: sql<number>`SUM(CASE WHEN ${orders.returnRequestedAt} IS NOT NULL AND ${orders.status} = 'completed' THEN 1 ELSE 0 END)`,
      unpaidWebhookOrders24h: sql<number>`SUM(CASE WHEN ${orders.paymentStatus} = 'unpaid' AND ${orders.paymentMethod} IN ('qpay','storepay') AND ${orders.status} = 'pending' AND ${orders.createdAt} < NOW() - INTERVAL 24 HOUR THEN 1 ELSE 0 END)`,
    }).from(orders),
    db.select().from(integrationSyncState).where(and(eq(integrationSyncState.provider, "smartsoftware"), eq(integrationSyncState.stream, "push"))).limit(1),
    countOrdersWithoutEvents(),
    db.select({ actorKind: orderEvents.actorKind, count: sql<number>`COUNT(*)` }).from(orderEvents).where(gte(orderEvents.createdAt, sql`NOW() - INTERVAL 1 DAY`)).groupBy(orderEvents.actorKind),
  ]);
  const [[counts], [discrepancies]] = await Promise.all([
    db.select({ total: sql<number>`COUNT(*)` }).from(stockCounts).where(eq(stockCounts.status, "submitted")),
    db.select({ total: sql<number>`COUNT(*)` }).from(stockTransfers).where(eq(stockTransfers.discrepancyStatus, "open")),
  ]);
  const byStatus = new Map(openRows.map(row => [row.status, row]));
  const stages: ProcessStageSummary[] = PROCESS_STAGES.map(status => {
    if (status === "completed") return { status, count: Number(completedRows[0]?.count ?? 0), stuck: 0, oldestAt: null };
    const row = byStatus.get(status);
    return { status, count: Number(row?.count ?? 0), stuck: Number(row?.stuck ?? 0), oldestAt: row?.oldestAt ? new Date(row.oldestAt) : null };
  });
  const closed: ProcessStageSummary[] = PROCESS_SIDE_STAGES.map(status => ({ status, count: Number(closedRows.find(row => row.status === status)?.count ?? 0), stuck: 0, oldestAt: null }));
  const sync = syncRows[0];
  const pushCursor = sync?.cursor && /^\d+$/.test(sync.cursor) ? Number(sync.cursor) : null;
  let behindCount = 0;
  if (sync && pushCursor !== null) {
    const [behind] = await db.select({ total: sql<number>`COUNT(*)` }).from(stockMovements).where(sql`${stockMovements.id} > ${pushCursor}`);
    behindCount = Number(behind?.total ?? 0);
  }
  const actors24h = { ...empty.actors24h };
  for (const row of actorRows) actors24h[row.actorKind] = Number(row.count);
  return {
    stuckHours, stages, closed,
    pendingHuman: { returnRequests: Number(human?.returnRequests ?? 0), unpaidWebhookOrders24h: Number(human?.unpaidWebhookOrders24h ?? 0), submittedStockCounts: Number(counts?.total ?? 0), openTransferDiscrepancies: Number(discrepancies?.total ?? 0) },
    vendorSync: { configured: Boolean(sync), pushCursor, lastRunAt: sync?.lastRunAt ?? null, lastOkAt: sync?.lastOkAt ?? null, lastError: sync?.lastError ?? null, behindCount },
    missingTrail, actors24h,
  };
}

export type StageOrderRow = {
  id: number; orderNumber: string; status: string; paymentStatus: string; paymentMethod: string; deliveryMethod: string; totalMnt: number;
  createdAt: Date; updatedAt: Date; returnRequestedAt: Date | null;
  lastEvent: { kind: string; actorKind: ActorKind; actorLabel: string | null; summary: string; at: Date } | null;
};

/** Нэг эгнээний захиалгууд (шинэ нь эхэнд, `updatedAt` тэнцвэл `id`). Нэр/утас буцаахгүй — зөвхөн дугаар. */
export async function getStageOrders(input: { status: string; stuckOnly: boolean; stuckHours: number; limit: number }): Promise<StageOrderRow[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(orders.status, input.status as typeof orders.$inferSelect.status)];
  if (input.stuckOnly) conditions.push(lt(orders.updatedAt, sql`NOW() - INTERVAL ${sqlInt(input.stuckHours)} HOUR`));
  const rows = await db.select({
    id: orders.id, orderNumber: orders.orderNumber, status: orders.status, paymentStatus: orders.paymentStatus, paymentMethod: orders.paymentMethod, deliveryMethod: orders.deliveryMethod,
    totalMnt: orders.totalMnt, createdAt: orders.createdAt, updatedAt: orders.updatedAt, returnRequestedAt: orders.returnRequestedAt,
  }).from(orders).where(and(...conditions)).orderBy(desc(orders.updatedAt), desc(orders.id)).limit(Math.max(1, Math.min(100, input.limit)));
  const last = await getLastOrderEvents(rows.map(row => row.id));
  return rows.map(row => {
    const event = last.get(row.id);
    return {
      ...row,
      lastEvent: event ? { kind: event.kind, actorKind: event.actorKind, actorLabel: event.actorName ?? event.actorLabel ?? ACTOR_KIND_LABELS[event.actorKind], summary: summarizeOrderEvent(event.kind, event.payload, event.fromStatus, event.toStatus), at: event.createdAt } : null,
    };
  });
}

/** Буцаалтын хүсэлттэй, хараахан шийдэгдээгүй захиалгууд — "хүний шийдвэр" дараалалд. */
export async function getOpenReturnRequests(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: orders.id, orderNumber: orders.orderNumber, totalMnt: orders.totalMnt, returnRequestedAt: orders.returnRequestedAt, completedAt: orders.completedAt })
    .from(orders).where(and(isNotNull(orders.returnRequestedAt), eq(orders.status, "completed"))).orderBy(desc(orders.returnRequestedAt)).limit(limit);
}

// ---------------------------------------------------------------------------
// Аудитын feed: ажилтны аудит + автомат акторуудын event + job ажиллалт — нэг дараалал.
// ---------------------------------------------------------------------------

export type AuditFeedEntry = {
  key: string; at: Date; source: "audit" | "event" | "job"; actorKind: ActorKind; actorLabel: string;
  kind: string; summary: string; entityType: string | null; entityId: number | null; orderNumber: string | null; ok: boolean | null;
};

export async function getAuditFeed(input: { limit: number; actorKind?: ActorKind | null }): Promise<AuditFeedEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.max(1, Math.min(200, input.limit));
  const wantStaff = !input.actorKind || input.actorKind === "staff";
  const wantJob = !input.actorKind || input.actorKind === "job";
  const [audits, events, runs] = await Promise.all([
    wantStaff
      ? db.select({ id: adminAuditLogs.id, action: adminAuditLogs.action, entityType: adminAuditLogs.entityType, entityId: adminAuditLogs.entityId, actorName: users.name, createdAt: adminAuditLogs.createdAt })
        .from(adminAuditLogs).leftJoin(users, eq(users.id, adminAuditLogs.actorUserId)).orderBy(desc(adminAuditLogs.id)).limit(limit)
      : Promise.resolve([]),
    input.actorKind === "staff" ? Promise.resolve([]) : getRecentOrderEvents({ limit, actorKind: input.actorKind ?? null }).then(rows => rows.filter(row => row.actorKind !== "staff")),
    wantJob ? getRecentJobRuns(limit) : Promise.resolve([]), // 0102-гүй DB-д хоосон (dev); prod-ыг boot guard хамгаална
  ]);
  const entries: AuditFeedEntry[] = [
    ...audits.map(a => ({ key: `audit:${a.id}`, at: a.createdAt, source: "audit" as const, actorKind: "staff" as const, actorLabel: a.actorName ?? ACTOR_KIND_LABELS.staff, kind: a.action, summary: a.action, entityType: a.entityType, entityId: a.entityId, orderNumber: null, ok: null })),
    ...events.map(e => ({ key: `event:${e.id}`, at: e.createdAt, source: "event" as const, actorKind: e.actorKind, actorLabel: e.actorName ?? e.actorLabel ?? e.jobName ?? ACTOR_KIND_LABELS[e.actorKind], kind: e.kind, summary: summarizeOrderEvent(e.kind, e.payload, e.fromStatus, e.toStatus), entityType: "order", entityId: e.orderId, orderNumber: e.orderNumber, ok: null })),
    ...runs.map(r => ({ key: `job:${r.id}`, at: r.startedAt, source: "job" as const, actorKind: "job" as const, actorLabel: r.jobName, kind: `job.${r.ok === null ? "running" : r.ok ? "ok" : "failed"}`, summary: r.ok === null ? `${r.jobName} ажиллаж байна` : r.ok ? `${r.jobName} амжилттай${r.affectedCount !== null ? ` · ${r.affectedCount} мөр` : ""}` : `${r.jobName} УНАСАН: ${r.error ?? ""}`, entityType: "job", entityId: r.id, orderNumber: null, ok: r.ok })),
  ];
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime() || b.key.localeCompare(a.key)).slice(0, limit);
}
