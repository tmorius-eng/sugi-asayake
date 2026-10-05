/**
 * Захиалгын timeline-ийн ЦЭВЭР нэгтгэгч (2026-10-05, /admin → Процесс).
 *
 * Нэг захиалгын түүх 5 эх сурвалжаас бүрддэг: order_events (алхам бүр,
 * актортой), stock_movements (нөөц хасалт/буцаалт), payment_attempts
 * (төлбөрийн оролдлого), notification_outbox (ажилтанд очсон push),
 * admin_audit_logs (ажилтны үйлдэл). Сервер тус бүрийг тусдаа query-гээр
 * уншаад энд нэг дараалал болгоно; клиент ижил функцээр эрэмбэ/дугаарыг
 * баталгаажуулж чадна. DB-гүй тул unit тестэд шууд.
 *
 * Эрэмбэ: createdAt өсөхөөр. `timestamp` нь секундын нарийвчлалтай тул нэг
 * секундэд болсон мөрүүд ТЭНЦЭНЭ (PROJECT-GUIDE) — тэнцвэрийг эх сурвалжийн
 * давуу эрх (event → ledger → payment → notify → audit), дараа нь id-аар
 * тасална. Ингэснээр "захиалга үүссэн" нь "нөөц хасагдсан"-аас, "төлбөр
 * орсон" нь "агуулахад мэдэгдсэн"-ээс урд зогсоно.
 */
export const ORDER_EVENT_KINDS = [
  "order.created",
  "status.changed",
  "payment.paid",
  "payment.refunded",
  "payment.duplicate",
  "return.requested",
  "order.edited",
  "tracking.set",
  "note.set",
  "review.requested",
  "notify.customer",
] as const;
export type OrderEventKind = (typeof ORDER_EVENT_KINDS)[number];

export type ActorKind = "customer" | "staff" | "job" | "webhook" | "system";

export type TimelineSource = "event" | "stock" | "payment" | "notification" | "audit";

/** Нэгтгэгдсэн нэг мөр — сервер бүтээж, клиент зурна. */
export type TimelineEntry = {
  /** `${source}:${id}` — React key ба dedupe-д. */
  key: string;
  source: TimelineSource;
  /** Эх хүснэгтийн мөрийн id (тэнцвэр таслахад). */
  id: number;
  at: string; // ISO
  /** Машинд уншигдах төрөл: event бол OrderEventKind, stock бол movement type, payment бол `payment.<status>`, notification бол eventType, audit бол action. */
  kind: string;
  actorKind: ActorKind;
  /** Хүнд харуулах акторын нэр (ажилтны нэр, job-ийн нэр, провайдер, "Зочин"). Утас/хаяг ХЭЗЭЭ Ч биш. */
  actorLabel: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  /** Богино, аль хэдийн монголоор бичигдсэн тайлбар (сервер бүтээнэ). */
  summary: string;
  /** Нэмэлт утгууд (дүн, тоо, SKU …) — UI товч мөрөөр харуулна. */
  details?: Record<string, string | number | boolean | null>;
};

const SOURCE_RANK: Record<TimelineSource, number> = { event: 0, stock: 1, payment: 2, notification: 3, audit: 4 };

/** Ижил захиалгын төлбөр нь order_events-д (webhook event) БА payment_attempts-д хоёуланд байдаг — attempts мөрийг
 *  event-тэй нэг секундэд, ижил статустай бол давхардуулахгүй (event-ийг үлдээнэ, attempts-ийг хасна). */
function isDuplicatePayment(entry: TimelineEntry, others: TimelineEntry[]): boolean {
  if (entry.source !== "payment" || entry.kind !== "payment.paid") return false;
  const second = entry.at.slice(0, 19);
  return others.some(other => other.source === "event" && other.kind === "payment.paid" && other.at.slice(0, 19) === second);
}

export function mergeTimeline(sources: TimelineEntry[][]): TimelineEntry[] {
  const all = sources.flat();
  const deduped = all.filter(entry => !isDuplicatePayment(entry, all));
  return deduped.sort((a, b) => {
    const byTime = a.at.localeCompare(b.at);
    if (byTime !== 0) return byTime;
    const byRank = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    if (byRank !== 0) return byRank;
    return a.id - b.id;
  });
}

/** Самбарын "гинж" — захиалгын төлөвийн урагшлах дараалал (server/db/admin-orders.ts orderStatusRank-тай ижил). */
export const PROCESS_STAGES = ["pending", "confirmed", "packed", "out_for_delivery", "completed"] as const;
export const PROCESS_SIDE_STAGES = ["cancelled", "returned"] as const;
export type ProcessStage = (typeof PROCESS_STAGES)[number] | (typeof PROCESS_SIDE_STAGES)[number];

export const PROCESS_STAGE_LABELS: Record<ProcessStage, string> = {
  pending: "Хүлээгдэж буй",
  confirmed: "Баталгаажсан",
  packed: "Савлагдсан",
  out_for_delivery: "Хүргэлтэнд",
  completed: "Дууссан",
  cancelled: "Цуцлагдсан",
  returned: "Буцаагдсан",
};
export const stageLabel = (status: string) => PROCESS_STAGE_LABELS[status as ProcessStage] ?? status;

export const ACTOR_KIND_LABELS: Record<ActorKind, string> = {
  customer: "Харилцагч",
  staff: "Ажилтан",
  job: "Автомат ажил",
  webhook: "Төлбөрийн callback",
  system: "Систем",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  qpay: "QPay", storepay: "StorePay", bank_transfer: "банкны шилжүүлэг", card: "карт", cash_on_delivery: "бэлнээр хүргэлтэнд", in_store: "касс", store_credit: "дэлгүүрийн зээл",
};
const mnt = (value: unknown) => typeof value === "number" ? `${value.toLocaleString("en-US")}₮` : "";

/** order_events мөрийг хүнд уншигдах нэг өгүүлбэр болгоно — сервер timeline бүтээхэд, клиент дахин бодохгүй. */
export function summarizeOrderEvent(kind: string, payload: Record<string, unknown> | null, fromStatus: string | null, toStatus: string | null): string {
  const p = payload ?? {};
  switch (kind) {
    case "order.created": {
      const channel = p.channel === "in_store" ? "кассаар" : p.channel === "manual" ? "ажилтан бүртгэв" : "онлайн";
      return `Захиалга үүссэн — ${channel}${p.itemCount ? `, ${p.itemCount} ш` : ""}${p.totalMnt !== undefined ? `, ${mnt(p.totalMnt)}` : ""}`;
    }
    case "status.changed": return `Төлөв: ${stageLabel(fromStatus ?? "")} → ${stageLabel(toStatus ?? "")}${p.bulk ? " (бөөнөөр)" : ""}${p.restocked ? " · нөөц буцсан" : ""}`;
    case "payment.paid": return `Төлбөр орсон${p.provider ? ` — ${PAYMENT_METHOD_LABELS[String(p.provider)] ?? p.provider}` : p.paymentMethod ? ` — ${PAYMENT_METHOD_LABELS[String(p.paymentMethod)] ?? p.paymentMethod}` : ""}${p.amountMnt !== undefined ? `, ${mnt(p.amountMnt)}` : ""}`;
    case "payment.refunded": return `Буцаан олголт ${mnt(p.refundAmountMnt)}${p.restockItems ? " · нөөцөд буцаав" : ""}`;
    case "payment.duplicate": return `⚠️ Давхар төлбөр — ${p.provider ?? ""}`;
    case "return.requested": return "Харилцагч буцаалтын хүсэлт илгээв";
    case "order.edited": return `Захиалгыг ажилтан засав${p.totalsRecomputed === false ? " (төлөгдсөн — дүн хөндөгдөөгүй)" : ""}`;
    case "tracking.set": return `Хүргэлтийн дугаар: ${p.deliveryTrackingRef ?? "—"}`;
    case "note.set": return "Админ тэмдэглэл бичигдэв";
    case "review.requested": return "Сэтгэгдэл бичихийг хүсэв (автомат)";
    case "notify.customer": return `Харилцагчид мэдэгдэв — ${stageLabel(String(p.status ?? ""))}${Array.isArray(p.channels) && p.channels.length ? ` (${p.channels.join(", ")})` : ""}`;
    default: return kind;
  }
}
