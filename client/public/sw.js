/* SUGI ASAYAKE service worker (2026-09-13).
 *
 * Deliberately small. It does three things and nothing else:
 *  1. Hashed build assets (/assets/*, fonts, icons) are cached on first use
 *     and served cache-first -- their names change on every deploy, so a
 *     cached copy can never be stale.
 *  2. Page navigations are NETWORK-FIRST. The HTML is what carries the
 *     current asset names and the CSP nonce, and a cached page would defeat
 *     the stale-chunk auto-reload in client/src/lib/lazyRetry.ts. Only when
 *     the network is unreachable does the offline page appear.
 *  3. API calls (/api/*) are never touched: prices, stock and the cart must
 *     always be live.
 * Bump CACHE_VERSION when changing this file; old caches are dropped on
 * activate.
 */
const CACHE_VERSION = "sugi-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

const isImmutableAsset = url =>
  url.origin === self.location.origin
  && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/images/"));

// Customer Web Push (2026-09-13): payload is JSON {title, body, url, icon, badge, tag}.
self.addEventListener("push", event => {
  let data = { title: "SUGI ASAYAKE", body: "", url: "/profile?tab=orders", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: undefined };
  try { data = { ...data, ...event.data.json() }; } catch { if (event.data) data.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: data.icon, badge: data.badge, tag: data.tag, data: { url: data.url }, lang: "mn" }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(client => client.url.startsWith(self.location.origin));
    if (open) return open.focus().then(client => ("navigate" in client ? client.navigate(url) : client));
    return self.clients.openWindow(url);
  }));
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/cdn-cgi/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
