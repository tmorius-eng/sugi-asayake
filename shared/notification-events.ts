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
  "order.paid": { orderNumber: string; totalMnt: number };
  "payment.paid_on_closed_order": { orderNumber: string; orderStatus: string; paymentStatus: string };
  "payment.underpaid": { orderNumber: string; paidMnt: number | null; totalMnt: number };
  "order.cancelled_by_customer": { orderNumber: string; totalMnt: number; itemCount: number };
  "refund.recorded": { orderNumber: string; refundMnt: number; restocked: boolean };
  "stock.low_digest": { count: number; items: { sku: string; name: string; quantity: number }[] };
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
  "payment.underpaid": { label: "Дутуу төлбөр", groups: ["finance", "admin"], priority: 5, tags: ["warning"], clickSection: "orders" },
  "order.cancelled_by_customer": { label: "Харилцагч захиалгаа цуцалсан", groups: ["warehouse", "admin"], priority: 4, tags: ["x"], clickSection: "orders" },
  "refund.recorded": { label: "Буцаан олголт бүртгэгдсэн", groups: ["finance", "admin"], priority: 3, tags: ["money_with_wings"], clickSection: "orders" },
  "stock.low_digest": { label: "Нөөц дуусч буй бараа (өдрийн тойм)", groups: ["warehouse", "admin"], priority: 3, tags: ["chart_with_downwards_trend"], clickSection: "products" },
  "integration.test": { label: "Туршилтын мэдэгдэл", groups: [], priority: 3, tags: ["bell"], clickSection: "notifications" },
};

const deliveryLabel = (method: DeliveryMethod, pickupBranchName: string | null) =>
  method === "store_pickup" ? `Очиж авах${pickupBranchName ? ` · ${pickupBranchName}` : ""}` : "УБ хүргэлт";

const paymentLabel = (method: string) =>
  method === "qpay" ? "QPay" : method === "bank_transfer" ? "Дансаар" : method === "card" ? "Карт" : method === "cash_on_delivery" ? "Хүргэлтээр бэлнээр" : method;

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
      return { title: `Төлбөр төлөгдлөө ${p.orderNumber}`, message: `${formatMnt(p.totalMnt)} QPay-аар төлөгдсөн. Захиалгыг баглаж болно.` };
    }
    case "payment.paid_on_closed_order": {
      const p = payload as NotificationPayloads["payment.paid_on_closed_order"];
      return { title: `Хаагдсан захиалгад төлбөр орлоо ${p.orderNumber}`, message: `Захиалгын төлөв: ${p.orderStatus}, төлбөр: ${p.paymentStatus}. QPay мөнгө хүлээн авсан тул буцаан олголт шаардлагатай эсэхийг шалгана уу.` };
    }
    case "payment.underpaid": {
      const p = payload as NotificationPayloads["payment.underpaid"];
      return { title: `Дутуу төлбөр ${p.orderNumber}`, message: `${p.paidMnt === null ? "Тодорхойгүй дүн" : formatMnt(p.paidMnt)} төлөгдсөн, захиалгын дүн ${formatMnt(p.totalMnt)}. Захиалга баталгаажаагүй.` };
    }
    case "order.cancelled_by_customer": {
      const p = payload as NotificationPayloads["order.cancelled_by_customer"];
      return { title: `Захиалга цуцлагдлаа ${p.orderNumber}`, message: `Харилцагч өөрөө цуцалсан (${formatMnt(p.totalMnt)} · ${pieces(p.itemCount)}). Баглаж эхэлсэн бол зогсооно уу, нөөц буцаж орсон.` };
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
    case "integration.test": {
      const p = payload as NotificationPayloads["integration.test"];
      return { title: "SUGI ASAYAKE — туршилт", message: `"${p.groupLabel}" бүлгийн мэдэгдэл энэ утсан дээр ирж байна.` };
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
