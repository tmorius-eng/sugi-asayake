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
const CACHE_VERSION = "sugi-v4"; // v4 (2026-09-23): хуримтлагдсан хуучин chunk-уудыг нэг удаа цэвэрлэнэ
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];
// 2026-09-23: /assets/-ийн нэр deploy бүрт солигддог ч service worker өөрөө
// солигддоггүй тул CACHE_VERSION ч солигдохгүй — хуучин chunk-ууд кэшэд
// мөнхөд хуримтлагдаж (deploy бүрт ~1 MB) утасны хадгалах санг дүүргэдэг
// байв. Бичлэг бүрийн дараа хамгийн хуучныг нь (Cache.keys() оруулалтын
// дарааллаар буцаадаг) хасна; PRECACHE-ийг хэзээ ч хасахгүй.
const MAX_CACHED_ENTRIES = 120;
async function putAndTrim(request, response) {
  const cache = await caches.open(CACHE_VERSION);
  await cache.put(request, response);
  const keys = await cache.keys();
  let excess = keys.length - MAX_CACHED_ENTRIES;
  if (excess <= 0) return;
  const keep = new Set(PRECACHE.map(path => new URL(path, self.location.origin).href));
  for (const key of keys) {
    if (excess <= 0) break;
    if (keep.has(key.url)) continue;
    await cache.delete(key);
    excess -= 1;
  }
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

// Only Vite's /assets/ output is content-hashed and therefore safe to keep
// forever. /icons, /images and /fonts are copied verbatim from client/public
// (the server sends them with no-cache for exactly that reason), so a new
// logo or app icon would never reach a returning visitor if they were
// cached first -- 2026-09-20: those now serve the cached copy and refresh it
// in the background (stale-while-revalidate).
const isImmutableAsset = url => url.origin === self.location.origin && url.pathname.startsWith("/assets/");
const isRevalidatedAsset = url =>
  url.origin === self.location.origin
  && (url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/images/"));

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
    if (!open) return self.clients.openWindow(url);
    // 2026-09-23: `navigate()` зөвхөн энэ service worker-ийн УДИРДДАГ цонхонд
    // ажилладаг — `includeUncontrolled`-оор олдсон цонх (hard reload хийсэн
    // таб) дээр reject болж мэдэгдэл дарахад юу ч болдоггүй байв. Бүтэлгүйтвэл
    // (эсвэл null буцаавал) шинэ цонх нээнэ.
    return open.focus()
      .then(client => client.navigate(url))
      .then(client => client || self.clients.openWindow(url))
      .catch(() => self.clients.openWindow(url));
  }));
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/cdn-cgi/")) return;

  if (request.mode === "navigate") {
    // 2026-09-23: offline.html кэшэд байхгүй бол (install тасалдсан, хөтөч
    // хадгалах санг цэвэрлэсэн) `undefined` нь respondWith-ийг TypeError-оор
    // унагадаг байв — тэгвэл сүлжээний алдааг ердийнхөөр нь буцаана.
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) event.waitUntil(putAndTrim(request, response.clone()).catch(() => undefined));
        return response;
      })),
    );
    return;
  }

  if (isRevalidatedAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const refresh = fetch(request).then(async response => {
        if (response.ok) await putAndTrim(request, response.clone());
        return response;
      });
      if (!cached) return refresh; // Офлайн бөгөөд кэшгүй: сүлжээний алдаа ердийнхөөрөө гарна.
      // `waitUntil` ЗААВАЛ: үүнгүйгээр хөтөч кэшлэгдсэн хариуг өгмөгц service
      // worker-ээ зогсоож болох ба шинэчлэлт дуусалгүй тасарна — тэгвэл энэ нь
      // "шинэчлэгддэг" биш, мөнхийн cache-first хэвээр үлдэнэ (яг засах гэсэн
      // алдаа). Хариуг нь хүлээхгүй, зөвхөн процессыг амьд байлгана.
      event.waitUntil(refresh.catch(() => undefined));
      return cached;
    })());
  }
});
