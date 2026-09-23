// Measurement (2026-09-14): Google Analytics 4 + Meta Pixel, consent-gated.
//
// Reads the ids the server rendered into #analytics-config (from /admin →
// Дэлгүүрийн тохиргоо). Nothing is loaded until the cookie banner reports
// the visitor's choice through window.sugiConsent: "analytics" gates GA4,
// "marketing" gates the Pixel. Rejecting later turns tracking off for the
// rest of the visit and drops the cookies GA/Meta set on this domain.
//
// SPA navigations: wouter uses history.pushState, which no tag observes, so
// pushState/replaceState/popstate are wrapped to send page views. The app
// reports commerce events through window.sugiTrack (client/src/lib/analytics.ts).
(function () {
  var block = document.getElementById("analytics-config");
  var config = { ga4: "", metaPixel: "" };
  try { config = JSON.parse((block && block.textContent) || "{}") || config; } catch (_) { /* leave defaults */ }
  var state = { analytics: false, marketing: false, gaLoaded: false, fbLoaded: false };

  // 2026-09-23: хэмжилт рүү ЯМАР хаяг явахыг нэг газар шийднэ. Өмнө нь
  // `location.href` бүтнээрээ явдаг байсан тул /face-approve?token=… (admin-ий
  // царайны QR-ийн ИДЭВХТЭЙ токен) Google руу очдог байв. Admin/царайны
  // хуудсууд огт хэмжигдэхгүй, бусад хаягаас нууц параметрүүд хасагдана.
  var PRIVATE_PATH = /^\/(admin|face-approve)(\/|$)/;
  var SECRET_PARAMS = ["token", "redirect", "code", "state"];
  function isPrivatePage() { return PRIVATE_PATH.test(location.pathname); }
  function safeLocation() {
    try {
      var url = new URL(location.href);
      SECRET_PARAMS.forEach(function (name) { url.searchParams.delete(name); });
      url.hash = "";
      return url.toString();
    } catch (_) { return location.origin + location.pathname; }
  }

  function loadScript(src) {
    var s = document.createElement("script");
    s.async = true; s.src = src;
    document.head.appendChild(s);
  }
  function loadGa() {
    if (state.gaLoaded || !config.ga4) return;
    state.gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    // Автомат page_view-г унтраана: тэр нь бүтэн `location.href`-ийг
    // илгээдэг. Эхний хуудсыг доорх pageView() цэвэрлэсэн хаягаар илгээнэ.
    // `set`: дараагийн БҮХ event (add_to_cart гэх мэт) цэвэрлэсэн хаягийг авна;
    // pageView() зам солигдох бүрт шинэчилнэ.
    window.gtag("set", { page_location: safeLocation() });
    window.gtag("config", config.ga4, { anonymize_ip: true, send_page_view: false });
    if (!isPrivatePage()) window.gtag("event", "page_view", { page_location: safeLocation(), page_path: location.pathname, page_title: document.title });
    loadScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(config.ga4));
  }
  function loadFb() {
    if (state.fbLoaded || !config.metaPixel) return;
    state.fbLoaded = true;
    if (!window.fbq) {
      var n = window.fbq = function () { if (n.callMethod) n.callMethod.apply(n, arguments); else n.queue.push(arguments); };
      window._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      loadScript("https://connect.facebook.net/en_US/fbevents.js");
    }
    window.fbq("init", config.metaPixel);
    if (!isPrivatePage()) window.fbq("track", "PageView");
  }
  function clearCookies(prefixes) {
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (!prefixes.some(function (p) { return name.indexOf(p) === 0; })) return;
      var host = location.hostname;
      ["", "." + host, "." + host.split(".").slice(-2).join(".")].forEach(function (domain) {
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + (domain ? "; domain=" + domain : "");
      });
    });
  }

  window.sugiConsent = function (type, granted) {
    if (type === "analytics") {
      state.analytics = !!granted;
      // 2026-09-23: татгалзаад дахин зөвшөөрөхөд `ga-disable-*` true хэвээр,
      // loadGa нь gaLoaded-аар шууд буцдаг тул хэмжилт тэр айлчлалд дахин
      // хэзээ ч сэргэдэггүй байв.
      if (granted) { if (config.ga4) window["ga-disable-" + config.ga4] = false; loadGa(); }
      else if (state.gaLoaded) { window["ga-disable-" + config.ga4] = true; clearCookies(["_ga", "_gid", "_gat"]); }
    }
    if (type === "marketing") {
      state.marketing = !!granted;
      // 2026-09-23: "revoke"-ийн дараа дахин зөвшөөрөхөд "grant" илгээгээгүй
      // тул Pixel тэр айлчлалд чимээгүй хэвээр байв.
      if (granted) { if (state.fbLoaded && window.fbq) window.fbq("consent", "grant"); loadFb(); }
      else if (state.fbLoaded && window.fbq) { window.fbq("consent", "revoke"); clearCookies(["_fbp", "_fbc"]); }
    }
  };
  var queued = window.__sugiConsentQueue || [];
  window.__sugiConsentQueue = { push: function (entry) { window.sugiConsent(entry[0], entry[1]); } };
  queued.forEach(function (entry) { window.sugiConsent(entry[0], entry[1]); });

  var FB_EVENT = { purchase: "Purchase", add_to_cart: "AddToCart", view_item: "ViewContent", begin_checkout: "InitiateCheckout", search: "Search" };
  window.sugiTrack = function (event, params) {
    params = params || {};
    if (state.analytics && state.gaLoaded && window.gtag) window.gtag("event", event, params);
    if (state.marketing && state.fbLoaded && window.fbq) {
      var name = FB_EVENT[event];
      var fbParams = { currency: params.currency || "MNT", value: params.value };
      if (params.items) { fbParams.content_ids = params.items.map(function (i) { return i.item_id; }); fbParams.content_type = "product"; }
      // GA4 calls it search_term, Meta's Search event expects search_string.
      // Rebuilding fbParams from scratch dropped it entirely.
      if (params.search_term) fbParams.search_string = params.search_term;
      if (name) window.fbq("track", name, fbParams); else window.fbq("trackCustom", event, fbParams);
    }
  };

  // 2026-09-23: зөвхөн ЗАМ солигдоход page view. Өмнө нь replaceState бүр
  // (Shop-ийн шүүлтүүр, хайлтын үг бичих бүр URL-ийг солидог) шинэ page view
  // болж тоо хэд дахин хөөрдөг байв.
  var lastPath = location.pathname;
  function pageView() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    if (state.gaLoaded && window.gtag) window.gtag("set", { page_location: safeLocation() });
    if (isPrivatePage()) return;
    if (state.analytics && state.gaLoaded && window.gtag) window.gtag("event", "page_view", { page_location: safeLocation(), page_path: location.pathname, page_title: document.title });
    if (state.marketing && state.fbLoaded && window.fbq) window.fbq("track", "PageView");
  }
  ["pushState", "replaceState"].forEach(function (method) {
    var original = history[method];
    history[method] = function () { var result = original.apply(this, arguments); setTimeout(pageView, 50); return result; };
  });
  window.addEventListener("popstate", function () { setTimeout(pageView, 50); });
})();
