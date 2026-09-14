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
import { deletePushSubscription, getPushSubscriptionsForUser, touchPushSubscriptions } from "../db";

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

/** Sends to every subscription of one user. Returns how many were delivered. */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<number> {
  if (!webPushEnabled()) return 0;
  const subscriptions = await getPushSubscriptionsForUser(userId);
  if (subscriptions.length === 0) return 0;
  const body = JSON.stringify({ ...payload, url: payload.url ?? "/profile?tab=orders", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" });
  const delivered: number[] = [];
  await Promise.all(subscriptions.map(async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 60 * 60 * 24, urgency: "normal" });
      delivered.push(sub.id);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await deletePushSubscription(sub.endpoint).catch(() => undefined);
      else console.warn(`[push] user=${userId} status=${status ?? "?"} ${error instanceof Error ? error.message : error}`);
    }
  }));
  await touchPushSubscriptions(delivered).catch(() => undefined);
  return delivered.length;
}

const STATUS_TEXT: Record<string, { title: string; body: string }> = {
  confirmed: { title: "Захиалга баталгаажлаа", body: "Захиалга {n} баталгаажлаа. Бид бэлтгэж эхэллээ." },
  processing: { title: "Захиалгыг бэлтгэж байна", body: "Захиалга {n}-г бэлтгэж байна." },
  shipped: { title: "Хүргэлтэд гарлаа", body: "Захиалга {n} хүргэлтэд гарлаа. Удахгүй хүрнэ." },
  delivered: { title: "Хүргэгдлээ", body: "Захиалга {n} хүргэгдлээ. Баярлалаа!" },
  completed: { title: "Захиалга дууслаа", body: "Захиалга {n} амжилттай дууслаа. Сэтгэгдэл үлдээгээрэй." },
  cancelled: { title: "Захиалга цуцлагдлаа", body: "Захиалга {n} цуцлагдлаа. Асуулт байвал бидэнтэй холбогдоорой." },
  ready_for_pickup: { title: "Салбараас авахад бэлэн", body: "Захиалга {n} салбар дээр танийг хүлээж байна." },
};

/** Fire-and-forget order status push; safe to await inside the same try as the email. */
export async function sendOrderStatusPush(order: { id: number; userId: number | null; orderNumber: string; status: string }): Promise<void> {
  if (!order.userId) return;
  const text = STATUS_TEXT[order.status];
  if (!text) return;
  try {
    await sendPushToUser(order.userId, { title: text.title, body: text.body.replace("{n}", order.orderNumber), url: "/profile?tab=orders", tag: `order-${order.id}` });
  } catch (error) {
    console.warn("[push] order status push failed", error instanceof Error ? error.message : error);
  }
}
