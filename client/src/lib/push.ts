/**
 * Харилцагчийн Web Push-ийн хөтчийн тал (2026-09-13). main.tsx-д бүртгэсэн
 * service worker (зөвхөн production) болон push.subscribe / push.unsubscribe-
 * тэй ярина. Бүгд хамгаалагдсан: SW-гүй, PushManager-гүй, зөвшөөрөл татгалзсан,
 * эсвэл http:// LAN origin бүгд throw хийхгүй "unsupported" болно (профайлын
 * toggle унахын оронд шалтгааныг тайлбарлана).
 */

export type PushSupport = "unsupported" | "needs-install" | "denied" | "ready";

/**
 * iOS 16.4-өөс хойш Safari Web Push-ийг дэмждэг БОЛОВЧ **зөвхөн нүүр
 * дэлгэцэд суулгасан** апп дотор: энгийн Safari таб дээр `window.PushManager`
 * огт байдаггүй. Тиймээс iPhone дээр "дэмждэггүй" гэж хэлэх нь буруу —
 * зөв хариу нь "эхлээд суулгах хэрэгтэй" (2026-09-16).
 */
function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const missing = !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window);
  if (missing || !window.isSecureContext) {
    return isIosDevice() && !isInstalledApp() ? "needs-install" : "unsupported";
  }
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

function sameKey(existing: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  // Хөтөч түлхүүрийг ил гаргадаггүй бол (хуучин Safari) шалгах боломжгүй —
  // бүртгэлийг хадгална (товшилт бүрт шинэ endpoint үүсгэхгүй).
  if (!existing) return true;
  const bytes = new Uint8Array(existing);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

/** Asks permission (if needed) and subscribes; returns the JSON the server stores. */
export async function subscribeToPush(vapidPublicKey: string): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } } | null> {
  // 2026-09-23: зөвшөөрлийг ЭХЭНД асууна — Safari `requestPermission`-ийг
  // хэрэглэгчийн товшилтын шууд үргэлжлэл дотор л зөвшөөрдөг; өмнө нь SW
  // бүртгэлийг хүлээсний дараа асуудаг тул товшилтын идэвх алдагдаж болж байв.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const reg = await registration();
  if (!reg) return null;
  // Шинээр бүртгэсэн worker идэвхжээгүй байхад `subscribe` "no active
  // Service Worker" гэж унадаг.
  const active = reg.active ? reg : await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>(resolve => setTimeout(() => resolve(null), 10_000)),
  ]);
  if (!active) return null;
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  let sub = await active.pushManager.getSubscription();
  // VAPID түлхүүр солигдсон бол (эзэн солигдох, түлхүүр rotate) хуучин
  // бүртгэлийг дахин ашиглавал push үйлчилгээ шинэ түлхүүрийн гарын үсгийг
  // 403-оор татгалзаж, мэдэгдэл чимээгүй хэзээ ч ирэхгүй.
  if (sub && !sameKey(sub.options?.applicationServerKey, applicationServerKey)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  sub ??= await active.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey as BufferSource });
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
