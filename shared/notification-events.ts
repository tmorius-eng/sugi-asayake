import { formatMnt } from "./format";

/**
 * Phone push notifications: who gets told about what (2026-09-11).
 *
 * Staff subscribe to their GROUP's ntfy topic on their phone (see the
 * "Утасны мэдэгдэл" admin section); every event below names the groups it
 * goes to. A group is derived from the user's role, so giving someone the
 * `warehouse` role is all it takes for them to see the warehouse topic.
 *
 * PRIVACY RULE: ntfy.sh topics are public to anyone who knows the name, so a
 * notification must never carry a customer's name, phone number, address or
 * email. That rule is enforced by the TYPES below rather than by discipline:
 * no payload type has any of those fields, so a builder physically cannot
 * print one. server/notification-events.test.ts feeds each builder an object
 * stuffed with sentinel PII and checks none of it comes out.
 */

export const NOTIFICATION_GROUPS = ["admin", "warehouse", "finance", "store"] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export const NOTIFICATION_GROUP_LABELS: Record<NotificationGroup, string> = {
  admin: "Удирдлага",
  warehouse: "Агуулах",
  finance: "Санхүү",
  store: "Дэлгүүрийн зөвлөхүүд",
};

/** Which key in the ntfy integration settings holds each group's topic. */
export const NTFY_TOPIC_FIELD: Record<NotificationGroup, "topicAdmin" | "topicWarehouse" | "topicFinance" | "topicStore"> = {
  admin: "topicAdmin",
  warehouse: "topicWarehouse",
  finance: "topicFinance",
  store: "topicStore",
};

/**
 * Role -> groups. `staff` are the store sales consultants (Tom, 2026-09-11:
 * they are the ones who used to photograph the handwritten goods list).
 * Marketing has no operational events to hear about. Admin hears everything
 * so the owner can subscribe to any group from one account.
 */
export function groupsForRole(role: string): NotificationGroup[] {
  switch (role) {
    case "admin": return [...NOTIFICATION_GROUPS];
    case "warehouse": return ["warehouse"];
    case "finance": return ["finance"];
    case "staff": return ["store"];
    default: return [];
  }
}

/**
 * The ONE group whose rows feed this role's in-app bell. Admin is in every
 * group for phone subscriptions, but every event that reaches any group also
 * goes to `admin` (see NOTIFICATION_EVENTS), so reading only the admin rows
 * shows each event once instead of once per group.
 */
export function feedGroupForRole(role: string): NotificationGroup | null {
  if (role === "admin") return "admin";
  return groupsForRole(role)[0] ?? null;
}

type DeliveryMethod = "ub_delivery" | "store_pickup";

/** Payload per event. Deliberately NO name / phone / address / email fields. */
export type NotificationPayloads = {
  "order.placed": { orderNumber: string; totalMnt: number; itemCount: number; deliveryMethod: DeliveryMethod; paymentMethod: string; pickupBranchName: string | null };
  // 2026-09-27: `paymentMethod` нэмэв -- зурвас өмнө нь "QPay-аар" гэж
  // ХАТУУ бичсэн байсан ч StorePay-ийн төлбөр ч энэ л event-ээр ирдэг байв.
  // Хуучин дуудагч (payload-д provider дамжуулаагүй) эвдрэхгүйн тулд optional.
  "order.paid": { orderNumber: string; totalMnt: number; paymentMethod?: string };
  "payment.paid_on_closed_order": { orderNumber: string; orderStatus: string; paymentStatus: string };
  /** 2026-09-27: аль хэдийн төлөгдсөн захиалгад ӨӨР нэхэмжлэл/зээлээр дахин мөнгө орсон — давхар төлбөр, буцаан олгох ёстой. */
  "payment.duplicate": { orderNumber: string; provider: string; totalMnt: number };
  "payment.underpaid": { orderNumber: string; paidMnt: number | null; totalMnt: number };
  "order.cancelled_by_customer": { orderNumber: string; totalMnt: number; itemCount: number };
  "refund.recorded": { orderNumber: string; refundMnt: number; restocked: boolean };
  /** The customer asked to return a completed order from their profile (2026-09-14). The reason text stays out of the push (free text could carry PII). */
  "order.return_requested": { orderNumber: string; totalMnt: number };
  /** /careers-аас анкет ирлээ (2026-09-14). Нэр, утас, имэйл push-д ОРОХГҮЙ — зөвхөн албан тушаал. */
  "careers.application_received": { positionTitle: string; hasCv: boolean };
  "stock.low_digest": { count: number; items: { sku: string; name: string; quantity: number }[] };
  "receipt.posted": { code: string; branchName: string; supplierName: string | null; lineCount: number; pieces: number; unknownCount: number };
  "count.submitted": { code: string; branchName: string; lineCount: number; varianceLines: number };
  "count.posted": { code: string; branchName: string; adjustedLines: number; netDelta: number; isOpening: boolean };
  // 2026-09-27 (I16): `blind` -- the receiving store's own copy of this push
  // must not reveal what to expect (same reasoning as getTransfer's `blind`
  // flag: a consultant must count what is really in the box, not tick off a
  // list). `lineCount`/`pieces` are still required so the admin/warehouse
  // copy (sent with `blind` unset) keeps showing them.
  "transfer.sent": { code: string; fromBranchName: string; toBranchName: string; lineCount: number; pieces: number; blind?: boolean };
  "transfer.received": { code: string; toBranchName: string; receivedPieces: number; sentPieces: number };
  "transfer.discrepancy": { code: string; toBranchName: string; shortLines: number; overLines: number; unexpectedLines: number; missingPieces: number; extraPieces: number; examples: string[] };
  "stock.low": { branchName: string; productName: string; sku: string; quantity: number; threshold: number };
  "stock.out": { branchName: string; productName: string; sku: string };
  "stock.total_out": { productName: string; sku: string };
  /**
   * Камергүй компьютер дээр admin панель утсаар баталгаажуулж нээгдлээ
   * (2026-09-16, docs/FACE-HANDOFF-PLAN.md). ⚠️ Зориуд ЗӨВХӨН хөтөч/OS:
   * ntfy-ийн сэдэв нээлттэй тул IP, байршил, нэр энд ОРОХГҮЙ — тэдгээрийг
   * баталгаажуулж буй хүн УТСАН дээрээ (нэвтэрсэн хуудсан дээр) харна.
   */
  "admin.handoff_approved": { device: string };
  "stock.ledger_drift": { count: number };
  "stock.vendor_sync_blocked": { previous: number; current: number; dropPercent: number };
  "transfer.stale": { code: string; toBranchName: string; hours: number };
  "integration.test": { groupLabel: string };
};
export type NotificationEventType = keyof NotificationPayloads;

type EventSpec = {
  /** Mongolian name shown in the admin outbox table and settings help. */
  label: string;
  groups: readonly NotificationGroup[];
  /** ntfy priority: 5 = urgent (long vibration), 3 = default, 2 = silent. */
  priority: 1 | 2 | 3 | 4 | 5;
  /** ntfy tags; the ones that match an emoji name render as that emoji. */
  tags: readonly string[];
  /** Admin section a tap on the notification opens (?adminSection=...). */
  clickSection: string;
};

export const NOTIFICATION_EVENTS: Record<NotificationEventType, EventSpec> = {
  "order.placed": { label: "Шинэ онлайн захиалга", groups: ["warehouse", "admin"], priority: 4, tags: ["package"], clickSection: "orders" },
  "order.paid": { label: "Захиалгын төлбөр төлөгдсөн", groups: ["warehouse", "finance", "admin"], priority: 4, tags: ["white_check_mark"], clickSection: "orders" },
  "payment.paid_on_closed_order": { label: "Хаагдсан захиалгад төлбөр орсон", groups: ["finance", "admin"], priority: 5, tags: ["warning"], clickSection: "orders" },
  "payment.duplicate": { label: "Давхар төлбөр орсон", groups: ["finance", "admin"], priority: 5, tags: ["warning"], clickSection: "orders" },
  "payment.underpaid": { label: "Дутуу төлбөр", groups: ["finance", "admin"], priority: 5, tags: ["warning"], clickSection: "orders" },
  "order.cancelled_by_customer": { label: "Харилцагч захиалгаа цуцалсан", groups: ["warehouse", "admin"], priority: 4, tags: ["x"], clickSection: "orders" },
  "refund.recorded": { label: "Буцаан олголт бүртгэгдсэн", groups: ["finance", "admin"], priority: 3, tags: ["money_with_wings"], clickSection: "orders" },
  "order.return_requested": { label: "Буцаалтын хүсэлт ирсэн", groups: ["warehouse", "finance", "admin"], priority: 4, tags: ["leftwards_arrow_with_hook"], clickSection: "orders" },
  "careers.application_received": { label: "Ажлын анкет ирсэн", groups: ["admin"], priority: 3, tags: ["briefcase"], clickSection: "documents" },
  "stock.low_digest": { label: "Нөөц дуусч буй бараа (өдрийн тойм)", groups: ["warehouse", "admin"], priority: 3, tags: ["chart_with_downwards_trend"], clickSection: "products" },
  "receipt.posted": { label: "Бараа хүлээн авсан", groups: ["warehouse", "admin"], priority: 3, tags: ["inbox_tray"], clickSection: "receiving" },
  "count.submitted": { label: "Тооллого батлуулахаар ирсэн", groups: ["warehouse", "admin"], priority: 4, tags: ["clipboard"], clickSection: "receiving" },
  "count.posted": { label: "Тооллого батлагдсан", groups: ["admin"], priority: 3, tags: ["white_check_mark"], clickSection: "receiving" },
  "transfer.sent": { label: "Шилжүүлэг илгээгдсэн", groups: ["store", "admin"], priority: 4, tags: ["truck"], clickSection: "receiving" },
  "transfer.received": { label: "Шилжүүлэг хүлээн авсан", groups: ["warehouse", "admin"], priority: 3, tags: ["white_check_mark"], clickSection: "receiving" },
  "transfer.discrepancy": { label: "Шилжүүлгийн зөрүү", groups: ["admin", "warehouse"], priority: 5, tags: ["warning"], clickSection: "receiving" },
  // stock.low / stock.out go to the location's own group (warehouse or
  // store) plus admin -- see stockLedger.ts, which passes the groups.
  "stock.low": { label: "Нөөц бага болсон", groups: ["warehouse", "admin"], priority: 3, tags: ["chart_with_downwards_trend"], clickSection: "products" },
  "stock.out": { label: "Нөөц дууссан", groups: ["warehouse", "admin"], priority: 4, tags: ["x"], clickSection: "products" },
  "stock.total_out": { label: "Онлайн нөөц дууссан", groups: ["admin", "warehouse"], priority: 4, tags: ["no_entry"], clickSection: "products" },
  "admin.handoff_approved": { label: "Утсаар баталгаажуулж admin нээгдсэн", groups: ["admin"], priority: 4, tags: ["closed_lock_with_key"], clickSection: "security" },
  "stock.ledger_drift": { label: "Нөөцийн бүртгэлийн зөрүү", groups: ["admin"], priority: 3, tags: ["mag"], clickSection: "dashboard" },
  // Loud on purpose: the automatic stock sync stopped itself, so the shelf
  // figures are now as stale as the last successful pull until someone looks.
  "stock.vendor_sync_blocked": { label: "Вендорын үлдэгдэл автоматаар бичигдсэнгүй", groups: ["warehouse", "admin"], priority: 5, tags: ["warning"], clickSection: "receiving" },
  "transfer.stale": { label: "Хүлээн аваагүй шилжүүлэг", groups: ["admin", "warehouse"], priority: 3, tags: ["hourglass"], clickSection: "receiving" },
  "integration.test": { label: "Туршилтын мэдэгдэл", groups: [], priority: 3, tags: ["bell"], clickSection: "notifications" },
};

const deliveryLabel = (method: DeliveryMethod, pickupBranchName: string | null) =>
  method === "store_pickup" ? `Очиж авах${pickupBranchName ? ` · ${pickupBranchName}` : ""}` : "УБ хүргэлт";

const paymentLabel = (method: string) =>
  method === "qpay" ? "QPay" : method === "storepay" ? "StorePay" : method === "bank_transfer" ? "Дансаар" : method === "card" ? "Карт" : method === "cash_on_delivery" ? "Хүргэлтээр бэлнээр" : method === "store_credit" ? "Дэлгүүрийн зээл" : method;

const pieces = (count: number) => `${count} ширхэг`;

/**
 * Title + body for one event. Pure, so every message is unit-tested. Reads
 * ONLY the fields declared in the payload type above -- the privacy rule.
 */
export function buildNotificationMessage<K extends NotificationEventType>(type: K, payload: NotificationPayloads[K]): { title: string; message: string } {
  switch (type) {
    case "order.placed": {
      const p = payload as NotificationPayloads["order.placed"];
      return { title: `Шинэ захиалга ${p.orderNumber}`, message: `${formatMnt(p.totalMnt)} · ${pieces(p.itemCount)}\n${deliveryLabel(p.deliveryMethod, p.pickupBranchName)} · ${paymentLabel(p.paymentMethod)}` };
    }
    case "order.paid": {
      const p = payload as NotificationPayloads["order.paid"];
      const via = p.paymentMethod ? `${paymentLabel(p.paymentMethod)}-аар ` : "";
      return { title: `Төлбөр төлөгдлөө ${p.orderNumber}`, message: `${formatMnt(p.totalMnt)} ${via}төлөгдсөн. Захиалгыг баглаж болно.` };
    }
    case "payment.paid_on_closed_order": {
      const p = payload as NotificationPayloads["payment.paid_on_closed_order"];
      return { title: `Хаагдсан захиалгад төлбөр орлоо ${p.orderNumber}`, message: `Захиалгын төлөв: ${p.orderStatus}, төлбөр: ${p.paymentStatus}. QPay мөнгө хүлээн авсан тул буцаан олголт шаардлагатай эсэхийг шалгана уу.` };
    }
    case "payment.duplicate": {
      const p = payload as NotificationPayloads["payment.duplicate"];
      return { title: `Давхар төлбөр ${p.orderNumber}`, message: `Аль хэдийн төлөгдсөн захиалгад ${p.provider === "storepay" ? "StorePay" : "QPay"}-аар дахин ${formatMnt(p.totalMnt)} орлоо. Нэг төлбөрийг буцаан олгоно уу.` };
    }
    case "payment.underpaid": {
      const p = payload as NotificationPayloads["payment.underpaid"];
      return { title: `Дутуу төлбөр ${p.orderNumber}`, message: `${p.paidMnt === null ? "Тодорхойгүй дүн" : formatMnt(p.paidMnt)} төлөгдсөн, захиалгын дүн ${formatMnt(p.totalMnt)}. Захиалга баталгаажаагүй.` };
    }
    case "order.cancelled_by_customer": {
      const p = payload as NotificationPayloads["order.cancelled_by_customer"];
      return { title: `Захиалга цуцлагдлаа ${p.orderNumber}`, message: `Харилцагч өөрөө цуцалсан (${formatMnt(p.totalMnt)} · ${pieces(p.itemCount)}). Баглаж эхэлсэн бол зогсооно уу, нөөц буцаж орсон.` };
    }
    case "order.return_requested": {
      const p = payload as NotificationPayloads["order.return_requested"];
      return { title: `Буцаалтын хүсэлт ${p.orderNumber}`, message: `Харилцагч ${formatMnt(p.totalMnt)}-ийн захиалгаа буцаахыг хүслээ. Шалтгааныг Захиалга хэсгээс үзээд шийднэ үү.` };
    }
    case "careers.application_received": {
      const p = payload as NotificationPayloads["careers.application_received"];
      return { title: `Шинэ анкет: ${p.positionTitle}`, message: `${p.hasCv ? "CV хавсаргасан. " : ""}Админ → Баримт бичиг → Ирсэн анкетууд хэсгээс үзнэ үү.` };
    }
    case "refund.recorded": {
      const p = payload as NotificationPayloads["refund.recorded"];
      return { title: `Буцаан олголт ${p.orderNumber}`, message: `${formatMnt(p.refundMnt)} буцаан олголт бүртгэгдлээ.${p.restocked ? " Бараа нөөцөд буцаж орсон." : ""}` };
    }
    case "stock.low_digest": {
      const p = payload as NotificationPayloads["stock.low_digest"];
      const shown = p.items.slice(0, 8).map(item => `• ${item.name} (${item.sku}) — ${item.quantity}`).join("\n");
      const more = p.count > 8 ? `\n… болон өөр ${p.count - 8}` : "";
      return { title: `Нөөц дуусч буй ${p.count} бараа`, message: `${shown}${more}` };
    }
    case "receipt.posted": {
      const p = payload as NotificationPayloads["receipt.posted"];
      return { title: `Бараа хүлээн авлаа ${p.code}`, message: `${p.branchName}: ${p.lineCount} төрөл · ${pieces(p.pieces)}${p.supplierName ? `\nНийлүүлэгч: ${p.supplierName}` : ""}${p.unknownCount ? `\n⚠ ${p.unknownCount} бүртгэлгүй код нөөцөд ороогүй` : ""}` };
    }
    case "count.submitted": {
      const p = payload as NotificationPayloads["count.submitted"];
      return { title: `Тооллого батлах ${p.code}`, message: `${p.branchName}: ${p.lineCount} бараа тоолсон, ${p.varianceLines} нь системээс зөрүүтэй. Батлахыг хүлээж байна.` };
    }
    case "count.posted": {
      const p = payload as NotificationPayloads["count.posted"];
      return { title: `${p.isOpening ? "Эхний үлдэгдэл" : "Тооллого"} батлагдлаа ${p.code}`, message: `${p.branchName}: ${p.adjustedLines} бараа засагдсан, нийт ${p.netDelta > 0 ? "+" : ""}${p.netDelta} ширхэг.` };
    }
    case "stock.vendor_sync_blocked": {
      const p = payload as NotificationPayloads["stock.vendor_sync_blocked"];
      return { title: "Вендорын үлдэгдэл шалгуулж байна", message: `Smart POS-ын жагсаалт ${p.previous} → ${p.current} бараа болж ${p.dropPercent}%-иар багассан тул автоматаар бичсэнгүй. Бараа хүлээн авах → Тооллого дээр шалгаад батална уу.` };
    }
    case "transfer.sent": {
      const p = payload as NotificationPayloads["transfer.sent"];
      const detail = p.blind ? "" : `: ${p.lineCount} төрөл · ${pieces(p.pieces)}`;
      return { title: `Шилжүүлэг замд ${p.code}`, message: `${p.fromBranchName} → ${p.toBranchName}${detail}. Ирэхэд "Бараа хүлээн авах → Шилжүүлэг"-ээс уншуулж хүлээн авна уу.` };
    }
    case "transfer.received": {
      const p = payload as NotificationPayloads["transfer.received"];
      return { title: `Шилжүүлэг хүлээн авлаа ${p.code}`, message: `${p.toBranchName}: илгээсэн ${pieces(p.sentPieces)}, хүлээн авсан ${pieces(p.receivedPieces)}.` };
    }
    case "transfer.discrepancy": {
      const p = payload as NotificationPayloads["transfer.discrepancy"];
      const parts = [p.shortLines ? `${p.shortLines} бараа дутуу (−${p.missingPieces})` : "", p.overLines ? `${p.overLines} илүү` : "", p.unexpectedLines ? `${p.unexpectedLines} жагсаалтад байгаагүй` : ""].filter(Boolean).join(", ");
      return { title: `Шилжүүлгийн зөрүү ${p.code}`, message: `${p.toBranchName}: ${parts}.${p.examples.length ? `\n${p.examples.join("\n")}` : ""}\nАдмин шийдвэр гаргана уу.` };
    }
    case "stock.low": {
      const p = payload as NotificationPayloads["stock.low"];
      return { title: `Нөөц бага: ${p.productName}`, message: `${p.branchName}: ${p.quantity} ширхэг үлдлээ (босго ${p.threshold}).\n${p.sku}` };
    }
    case "stock.out": {
      const p = payload as NotificationPayloads["stock.out"];
      return { title: `Нөөц дууслаа: ${p.productName}`, message: `${p.branchName}-д үлдэгдэл 0 боллоо.\n${p.sku}` };
    }
    case "stock.total_out": {
      const p = payload as NotificationPayloads["stock.total_out"];
      return { title: `Онлайнд дууслаа: ${p.productName}`, message: `Сайт дээр зарагдах нөөц 0 боллоо — худалдан авагч захиалах боломжгүй.\n${p.sku}` };
    }
    case "admin.handoff_approved": {
      const p = payload as NotificationPayloads["admin.handoff_approved"];
      return { title: "Admin панель утсаар нээгдлээ", message: `Камергүй компьютер (${p.device}) дээрх admin хандалтыг царайгаар баталгаажууллаа. Хэрэв энэ та биш бол нууц үгээ яг одоо солиод бүх төхөөрөмжөөс гарна уу.` };
    }
    case "stock.ledger_drift": {
      const p = payload as NotificationPayloads["stock.ledger_drift"];
      return { title: "Нөөцийн бүртгэл үлдэгдэлтэй таарахгүй байна", message: `${p.count} салбар/бараа дээр нөөц бүртгэлгүйгээр өөрчлөгдсөн (хуучин код эсвэл гар засвар). scripts/stock-ledger-rebaseline.ts-ээр шалгана уу.` };
    }
    case "transfer.stale": {
      const p = payload as NotificationPayloads["transfer.stale"];
      return { title: `Хүлээн аваагүй шилжүүлэг ${p.code}`, message: `${p.toBranchName} руу илгээснээс хойш ${p.hours} цаг өнгөрсөн ч хүлээн аваагүй байна.` };
    }
    case "integration.test": {
      const p = payload as NotificationPayloads["integration.test"];
      return { title: "Туршилтын мэдэгдэл", message: `"${p.groupLabel}" бүлгийн мэдэгдэл энэ утсан дээр ирж байна.` };
    }
  }
  const exhaustive: never = type;
  return exhaustive;
}

/** Parses the comma-separated `disabledEvents` ntfy setting. */
export function parseDisabledEvents(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map(part => part.trim()).filter(Boolean));
}

/** YYYY-MM-DD in Ulaanbaatar -- for "once per day" dedupe keys (UTC would
 *  roll the day over at 08:00 local time, mid-shift). */
export function ubDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
