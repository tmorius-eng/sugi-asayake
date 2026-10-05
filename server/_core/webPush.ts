/**
 * Харилцагчийн Web Push (2026-09-13, growth tier). `web-push` сангаар стандарт VAPID
 * push: хөтөч service worker-т (client/public/sw.js) бүртгүүлж endpoint + түлхүүрээ
 * бидэнд өгнө (push.subscribe); захиалгын төлөвийн өөрчлөлт эндээс харилцагчийн
 * зөвшөөрсөн хөтөч бүрт тархана.
 *
 * - VAPID_PUBLIC_KEY/PRIVATE_KEY тавигдаагүй бол юу ч илгээгдэхгүй.
 * - 404/410 хариулсан push endpoint бүрмөсөн алга (хөтөч хүчингүй болгосон) тул
 *   мөр устгагдаж, хүсэлтийн төлбөр төлөхөө болино.
 * - Payload захиалгын дугаараас хэтэрсэн хувийн мэдээлэл авч явахгүй; утас / хаяг
 *   серверээс хэзээ ч гарахгүй (ажилтны ntfy сувагтай ижил дүрэм).
 * - Алдаа дуудагч руу хэзээ ч тархахгүй: push-ийн алдаа түүнийг өдөөсөн захиалгын
 *   шинэчлэлийг унагаах ёсгүй.
 */

import webpush from "web-push";
import { ENV } from "./env";
import { deletePushSubscription, getPushSubscriptionsForUser, getStoreSettingValue, touchPushSubscriptions } from "../db";
import { fillTemplate, type StoreSettingKey } from "../../shared/store-settings";
import { isAllowedPushEndpoint } from "../../shared/push-endpoint";
import { mapLimit } from "./mapLimit";

// 2026-10-01: at most 4 pushes in flight per call, and the whole fan-out gives up
// after this long (each send also has its own 10 s timeout below).
const PUSH_CONCURRENCY = 4;
const PUSH_OVERALL_DEADLINE_MS = 30_000;

let configured = false;
export function webPushEnabled(): boolean {
  if (!ENV.vapidPublicKey || !ENV.vapidPrivateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(ENV.vapidSubject, ENV.vapidPublicKey, ENV.vapidPrivateKey);
    configured = true;
  }
  return true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

let skippedPushWarned = false;
function warnSkippedPushEndpoints(count: number) {
  if (skippedPushWarned) return;
  skippedPushWarned = true;
  console.warn(JSON.stringify({ event: "push_endpoint_skipped", reason: "not_allowlisted", count }));
}

/** Sends to every subscription of one user. Returns how many were delivered. */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<number> {
  if (ENV.notificationsSuppressed) {
    console.log(JSON.stringify({ event: "notification_not_sent", channel: "push", reason: "suppressed", userId }));
    return 0;
  }
  if (!webPushEnabled()) return 0;
  const stored = await getPushSubscriptionsForUser(userId);
  // Rows saved before the host allowlist existed (or inserted some other way)
  // must never be dialled. They are SKIPPED, not deleted: an allowlist gap must
  // not destroy real subscriptions (only a 404/410 from the provider does).
  const subscriptions = stored.filter(sub => isAllowedPushEndpoint(sub.endpoint));
  if (subscriptions.length < stored.length) warnSkippedPushEndpoints(stored.length - subscriptions.length);
  if (subscriptions.length === 0) return 0;
  const body = JSON.stringify({ ...payload, url: payload.url ?? "/profile?tab=orders", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" });
  const delivered: number[] = [];
  const deadline = Date.now() + PUSH_OVERALL_DEADLINE_MS;
  await mapLimit(subscriptions, PUSH_CONCURRENCY, async sub => {
    if (Date.now() > deadline) return;
    try {
      // C1: no timeout meant a slow/hung push service endpoint could hold
      // this open indefinitely -- every other outbound fetch in this
      // codebase has one (docs/PROJECT-GUIDE.md), web-push forwards its
      // own `timeout` option straight to the underlying request.
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 60 * 60 * 24, urgency: "normal", timeout: 10_000 });
      delivered.push(sub.id);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await deletePushSubscription(sub.endpoint).catch(() => undefined);
      else console.warn(`[push] user=${userId} status=${status ?? "?"} ${error instanceof Error ? error.message : error}`);
    }
  });
  await touchPushSubscriptions(delivered).catch(() => undefined);
  return delivered.length;
}

/**
 * 2026-09-27 (C15): маps a real `orders.status` (drizzle/schema.ts's enum:
 * pending/confirmed/packed/out_for_delivery/completed/cancelled/returned)
 * to one of the admin-editable push template keys in
 * shared/store-settings.ts (confirmed/processing/shipped/delivered/
 * completed/cancelled/ready_for_pickup). These two lists were never the
 * same set of names -- the old code compared `order.status` directly
 * against the TEMPLATE names, so `packed`, `out_for_delivery` and
 * `returned` (real statuses) never matched anything and silently never
 * pushed, while `processing`/`shipped`/`delivered`/`ready_for_pickup`
 * (template names) sat there as templates nothing could ever select.
 *
 * `packed`/`completed` are pickup-aware: a store-pickup order should say
 * "ready for pickup", not "shipped". `deliveryMethod` is optional here --
 * callers that do not pass it (not yet wired through server/routers.ts's
 * `OrderStatusNotifiable`) fall back to the delivery-flow templates, same
 * as before this fix for every status that already worked.
 */
export function templateKeyForOrderStatus(status: string, deliveryMethod?: string | null): string | null {
  switch (status) {
    case "confirmed": return "confirmed";
    case "packed": return deliveryMethod === "store_pickup" ? "ready_for_pickup" : "processing";
    case "out_for_delivery": return "shipped";
    case "completed": return deliveryMethod === "store_pickup" ? "completed" : "delivered";
    case "cancelled": return "cancelled";
    // "pending" is the initial state, nothing to announce; "returned" has
    // no push-title-order-returned/push-body-order-returned slot today.
    default: return null;
  }
}

/**
 * Fire-and-forget order status push; safe to await inside the same try as the email.
 *
 * 2026-09-16: гарчиг/текст нь ХАТУУ бичигдсэн байснаа `store_settings` рүү
 * шилжив (`shared/store-settings.ts`-ийн "Автомат мэдэгдэл (push)" бүлэг) —
 * Tom: *"admin тохиргоо сайн суу, editable, on/off, юу явуулахаа засварлаж
 * болдог"*. Унтраах хоёр зам: `push-order-notifications = 0` (бүгд), эсвэл
 * тухайн төлөвийн **биеийг хоосон болгох** (зөвхөн тэр нэг).
 */
/** Буцаах утга (2026-10-05): бодитоор илгээхийг оролдсон бол true — /admin → Процесс-ийн "notify.customer" мөрд. */
export async function sendOrderStatusPush(order: { id: number; userId: number | null; orderNumber: string; status: string; deliveryMethod?: string | null }): Promise<boolean> {
  if (!order.userId) return false;
  const templateKey = templateKeyForOrderStatus(order.status, order.deliveryMethod);
  if (!templateKey) return false;
  try {
    if ((await getStoreSettingValue("push-order-notifications")).trim() === "0") return false;
    const [title, body] = await Promise.all([
      getStoreSettingValue(`push-title-order-${templateKey}` as StoreSettingKey),
      getStoreSettingValue(`push-body-order-${templateKey}` as StoreSettingKey),
    ]);
    // Хоосон бие = энэ төлөвийг унтраасан. Гарчиг нь хоосон бол мэдэгдэл
    // нэргүй гарах тул мөн илгээхгүй.
    if (!body.trim() || !title.trim()) return false;
    const values = { "{захиалга}": order.orderNumber };
    await sendPushToUser(order.userId, {
      title: fillTemplate(title, values),
      body: fillTemplate(body, values),
      url: "/profile?tab=orders",
      tag: `order-${order.id}`,
    });
    return true;
  } catch (error) {
    console.warn("[push] order status push failed", error instanceof Error ? error.message : error);
    return false;
  }
}
