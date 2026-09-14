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
    window.gtag("config", config.ga4, { anonymize_ip: true, send_page_view: true });
    loadScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(config.ga4));
  }
  function loadFb() {
    if (state.fbLoaded || !config.metaPixel) return;
    state.fbLoaded = true;
    if (!window.fbq) {
      var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      window._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      loadScript("https://connect.facebook.net/en_US/fbevents.js");
    }
    window.fbq("init", config.metaPixel);
    window.fbq("track", "PageView");
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
      if (granted) loadGa();
      else if (state.gaLoaded) { window["ga-disable-" + config.ga4] = true; clearCookies(["_ga", "_gid", "_gat"]); }
    }
    if (type === "marketing") {
      state.marketing = !!granted;
      if (granted) loadFb();
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
      if (name) window.fbq("track", name, fbParams); else window.fbq("trackCustom", event, fbParams);
    }
  };

  function pageView() {
    if (state.analytics && state.gaLoaded && window.gtag) window.gtag("event", "page_view", { page_location: location.href, page_path: location.pathname + location.search, page_title: document.title });
    if (state.marketing && state.fbLoaded && window.fbq) window.fbq("track", "PageView");
  }
  ["pushState", "replaceState"].forEach(function (method) {
    var original = history[method];
    history[method] = function () { var result = original.apply(this, arguments); setTimeout(pageView, 50); return result; };
  });
  window.addEventListener("popstate", function () { setTimeout(pageView, 50); });
})();
