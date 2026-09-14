/**
 * Харилцагчийн Web Push-ийн хөтчийн тал (2026-09-13). main.tsx-д бүртгэсэн
 * service worker (зөвхөн production) болон push.subscribe / push.unsubscribe-
 * тэй ярина. Бүгд хамгаалагдсан: SW-гүй, PushManager-гүй, зөвшөөрөл татгалзсан,
 * эсвэл http:// LAN origin бүгд throw хийхгүй "unsupported" болно (профайлын
 * toggle унахын оронд шалтгааныг тайлбарлана).
 */

export type PushSupport = "unsupported" | "denied" | "ready";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (!window.isSecureContext) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  // Dev builds never register the worker (main.tsx); do it here on demand so
  // the toggle can still be tried against `pnpm dev`.
  try { return await navigator.serviceWorker.register("/sw.js", { scope: "/" }); } catch { return null; }
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** Asks permission (if needed) and subscribes; returns the JSON the server stores. */
export async function subscribeToPush(vapidPublicKey: string): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } } | null> {
  const reg = await registration();
  if (!reg) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

export async function unsubscribeFromPush(): Promise<string | null> {
  const sub = await currentPushSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  return endpoint;
}
