import { getActiveSitePromotion, getSiteMedia, getSiteText, getStoreSettingValue, getStorefrontBranches } from "../db";
import { renderHeroShell } from "./heroShell";
import { getSiteTextSlot, type SiteTextSlotKey } from "../../shared/site-text";
import { checkStoreSettingFormat } from "../../shared/store-settings";
import { getSiteMediaSlot } from "../../shared/site-media";
import { HERO_FULL_WIDTH, HERO_IMAGE_SIZES } from "../../shared/image-variants";
import { responsiveImagePreload, responsiveImagePreloadTag } from "./imagePreload";
import { resolveRouteMeta } from "./routeMeta";
// Open Graph needs absolute URLs; storage URLs may already be absolute (R2
// public host) or site-relative (/cdn/...). Нэг хэрэгжилт: ./publicUrl.
import { absoluteUrl, directStorageUrl, publicOrigin } from "./publicUrl";
import { ENV } from "./env";

/**
 * `<link rel="preconnect">` R2-ийн нийтийн хост руу (2026-09-21). Hero зураг
 * `/cdn/…` → 302 → `pub-….r2.dev` замаар ирдэг: өөр origin тул DNS + TCP + TLS
 * (утсанд 3 RTT ≈ 450 мс) hero-ийн хүсэлтийн ӨМНӨ л явдаг байв. Preconnect нь
 * HTML уншиж байхад холболтыг бэлдэнэ; тохируулаагүй бол хоосон.
 */
function cdnPreconnectTag(): string {
  try {
    const origin = ENV.s3PublicBaseUrl ? new URL(ENV.s3PublicBaseUrl).origin : "";
    if (!origin || origin === publicOrigin()) return "";
    return `<link rel="preconnect" href="${escapeAttribute(origin)}" /><link rel="dns-prefetch" href="${escapeAttribute(origin)}" />`;
  } catch {
    return "";
  }
}

/**
 * Substitutes the admin-editable site-wide SEO values into
 * client/index.html on the way out (2026-09-12).
 *
 * WHY THE SERVER AND NOT REACT: every other piece of copy on this site is
 * swapped in the browser by useSiteText(). That cannot work here. A Google
 * crawler, and more importantly a Facebook/Messenger/Viber link preview,
 * reads the HTML document as delivered and never runs the app's
 * JavaScript -- so the <title>, the og: tags and the schema.org block a
 * shopper sees when someone shares the shop's link are whatever the static
 * file says. Before this, those said "Улаанбаатар хотод 3 салбартай" while
 * the database had four, and carried a phone number that existed in the
 * HTML and nowhere an admin could reach.
 *
 * The values come from the same `site_text` / `store_settings` rows the
 * rest of the site reads, so one edit in /admin changes both the page and
 * its link preview.
 *
 * The `{N}` token inside a description is replaced with the live count of
 * active branches -- the same discipline the storefront already follows of
 * never printing a hand-typed number that the database can answer.
 */

/** Values are read per request, so cache briefly rather than hit MySQL on every page load. */
const CACHE_TTL_MS = 60_000;
let cache: { renderedAt: number; values: Map<string, string> } | null = null;

/** Escapes a value for an HTML attribute (every placeholder lands in one, except the JSON-LD block). */
export const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Escapes a value that lands INSIDE a double-quoted JavaScript string in
 * the inline consent-manager config -- a different context from the HTML
 * attributes above, where `&quot;` would be printed literally instead of
 * closing nothing. JSON.stringify produces exactly the right escaping for a
 * JS string literal; the surrounding quotes are already in index.html, so
 * they are sliced off. `</script>` is neutralised as well, since an
 * admin-typed one would otherwise end the tag early.
 */
export const escapeJsString = (value: string) => {
  const quoted = JSON.stringify(value);
  // 2026-09-23: `<`-ийг БҮГДИЙГ escape-лэнэ, зөвхөн `</script`-ийг биш.
  // Эдгээр утга нь `<script type="application/json" id="cookie-consent-config">`
  // дотор буудаг ба HTML-ийн tokenizer нь `<!--<script>`-ийг харвал
  // "double-escaped" төлөв рүү шилждэг тул жинхэнэ `</script>` элементийг
  // хаахаа больж, толгойн үлдсэн хэсэг (analytics + bootstrap блок) нэг
  // script дотор залгигддаг. Бусад гурван JSON блок аль хэдийн ингэж
  // хийдэг (PROJECT-GUIDE-ийн "`<` тэмдэгтийг сервер escape-лэнэ" дүрэм).
  return quoted.slice(1, -1).replace(/</g, "\\u003c");
};

async function resolveValues(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && now - cache.renderedAt < CACHE_TTL_MS) return cache.values;

  const [rows, branches, phoneDigits, facebookUrl, instagramUrl, mediaRows, googleVerification, facebookVerification, promo] = await Promise.all([
    getSiteText(),
    getStorefrontBranches(),
    getStoreSettingValue("contact-phone-tel"),
    getStoreSettingValue("contact-facebook-url"),
    getStoreSettingValue("contact-instagram-url"),
    getSiteMedia(),
    getStoreSettingValue("seo-google-site-verification"),
    getStoreSettingValue("seo-facebook-domain-verification"),
    getActiveSitePromotion(),
  ]);
  // 2026-09-21: R2-ийн шууд хаяг (publicUrl.ts-ийн directStorageUrl) — preload, shell,
  // bootstrap, OG бүгд нэг URL: `/cdn/` 302-ын нэг RTT hero-ийн замаас хасагдана.
  // content.siteMedia (routers.ts) ижил хөрвүүлэлт хийдэг тул React дахин татахгүй.
  const media = mediaRows.map(row => ({ ...row, imageUrl: directStorageUrl(row.imageUrl) }));
  // Measurement ids (2026-09-14): handed to /vendor/analytics-init.js as a
  // JSON data block; the tags themselves load only after cookie consent.
  const [ga4Id, pixelId] = await Promise.all([getStoreSettingValue("analytics-ga4-measurement-id"), getStoreSettingValue("analytics-meta-pixel-id")]);
  // The format lives in shared/store-settings.ts so the admin screen, the
  // save mutation and this renderer cannot disagree. Blanking a malformed id
  // stays as defence in depth -- a row saved before the format existed is
  // still readable, and must not reach gtag().
  const keepValid = (key: "analytics-ga4-measurement-id" | "analytics-meta-pixel-id", value: string) =>
    checkStoreSettingFormat(key, value) ? "" : value.trim();
  const analyticsConfig = JSON.stringify({
    ga4: keepValid("analytics-ga4-measurement-id", ga4Id),
    metaPixel: keepValid("analytics-meta-pixel-id", pixelId),
  }).replace(/</g, "\\u003c");
  // Search Console / Meta Business verification tokens (2026-09-14): pasted
  // in /admin -> Дэлгүүрийн тохиргоо, rendered as the <meta> each service
  // asks for. Empty setting = no tag at all.
  const verificationTags = [
    googleVerification.trim() ? `<meta name="google-site-verification" content="${escapeAttribute(googleVerification.trim())}" />` : "",
    facebookVerification.trim() ? `<meta name="facebook-domain-verification" content="${escapeAttribute(facebookVerification.trim())}" />` : "",
  ].filter(Boolean).join("\n    ");

  // LCP (2026-09-13, measured on a throttled phone: 3.4s, of which 2.8s was
  // "load delay"): the hero photograph is the largest thing on the first
  // screen, but the browser only learned its URL after index.js had loaded,
  // React had rendered, and the siteMedia tRPC call had returned. Naming it
  // in the HTML head lets the fetch start with the document itself. Must be
  // byte-identical to the src HeroSection renders (admin slot, else the
  // slot's default), or the preload is wasted.
  const heroUrl = media.find(row => row.slotKey === "home-hero")?.imageUrl || getSiteMediaSlot("home-hero").fallbackUrl;

  // Brand logo (2026-09-17): the header wordmark is above the fold on every
  // page, so it cannot wait for a tRPC round trip -- resolving it here means
  // the first paint already carries the admin's uploaded logo instead of
  // painting the previous one and swapping. Same "uploaded row, else the
  // slot's registered default" precedence the client uses.
  // 2026-09-21: everything the storefront's FIRST render needs, in the
  // document itself (client/src/lib/bootstrap.ts hydrates react-query from
  // it): all site media rows (the hero rail waited on that tRPC call and
  // painted a reserved blank until it returned -- most of a phone's LCP),
  // the saved site text (no fallback-then-admin-wording swap) and the
  // active promo (its banner used to arrive a round trip later and push the
  // whole page down). A few KB; Date columns travel as ISO strings.
  const bootstrapJson = JSON.stringify({
    siteMedia: media,
    siteText: rows,
    promo,
  }).replace(/</g, "\\u003c");

  const saved = new Map(rows.map(row => [row.slotKey, row.textValue]));
  const branchCount = String(branches.length);
  const textFor = (key: SiteTextSlotKey) =>
    (saved.get(key) || getSiteTextSlot(key).fallbackValue).replaceAll("{N}", branchCount);

  const siteName = textFor("seo-text-site-name");
  // A social URL is "not set" unless it really is a link -- same rule as the
  // client's useShopContact, so an admin who types "-" to hide the footer
  // icon also drops the profile from the structured data instead of
  // publishing "-" to Google as a social page.
  const sameAs = [facebookUrl, instagramUrl].filter(url => /^https?:\/\//i.test(url.trim())).map(url => url.trim());

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: siteName,
    description: textFor("seo-text-ld-description"),
    // The setting holds dialling digits ("94509911"); Google wants E.164.
    telephone: `+976${phoneDigits.replace(/\D/g, "")}`,
    address: { "@type": "PostalAddress", addressLocality: "Ulaanbaatar", addressCountry: "MN" },
    ...(sameAs.length ? { sameAs } : {}),
  };

  const values = new Map<string, string>([
    ["SEO_TITLE", escapeAttribute(textFor("seo-text-home-title"))],
    ["SEO_DESCRIPTION", escapeAttribute(textFor("seo-text-home-description"))],
    ["SEO_SITE_NAME", escapeAttribute(siteName)],
    ["SEO_OG_DESCRIPTION", escapeAttribute(textFor("seo-text-og-description"))],
    ["SEO_TWITTER_DESCRIPTION", escapeAttribute(textFor("seo-text-twitter-description"))],
    ["SEO_CANONICAL", escapeAttribute(publicOrigin())],
    // JSON.stringify already escapes quotes/controls; the one thing it does
    // not guard is a literal "</script>" inside an admin-typed string, which
    // would end the tag early. Escaping the slash keeps it inert and is still
    // valid JSON.
    ["SEO_STRUCTURED_DATA", JSON.stringify(structuredData).replace(/</g, "\\u003c")],
    ["SEO_HERO_PRELOAD", heroUrl ? await responsiveImagePreload(heroUrl, HERO_FULL_WIDTH, HERO_IMAGE_SIZES) : ""],
    ["SEO_OG_IMAGE", escapeAttribute(absoluteUrl(heroUrl))],
    ["SEO_OG_TYPE", "website"],
    ["SEO_OG_IMAGE_META", ""],
    ["SEO_VERIFICATION", verificationTags],

    // The consent banner's copy, which lands inside a JS string literal
    // rather than an HTML attribute -- hence escapeJsString, not escapeAttribute.
    ["COOKIE_PROMPT_DESCRIPTION", escapeJsString(textFor("cookie-text-prompt-description"))],
    ["COOKIE_ACCEPT_ALL", escapeJsString(textFor("cookie-text-accept-all"))],
    ["COOKIE_REJECT", escapeJsString(textFor("cookie-text-reject"))],
    ["COOKIE_PREFERENCES_BUTTON", escapeJsString(textFor("cookie-text-preferences-button"))],
    ["COOKIE_PREFERENCES_TITLE", escapeJsString(textFor("cookie-text-preferences-title"))],
    ["COOKIE_PREFERENCES_DESCRIPTION", escapeJsString(textFor("cookie-text-preferences-description"))],
    ["COOKIE_SAVE", escapeJsString(textFor("cookie-text-save"))],
    ["COOKIE_ESSENTIAL_LABEL", escapeJsString(textFor("cookie-text-essential-label"))],
    ["COOKIE_ESSENTIAL_DESCRIPTION", escapeJsString(textFor("cookie-text-essential-description"))],
    ["COOKIE_ANALYTICS_LABEL", escapeJsString(textFor("cookie-text-analytics-label"))],
    ["COOKIE_ANALYTICS_DESCRIPTION", escapeJsString(textFor("cookie-text-analytics-description"))],
    ["COOKIE_MARKETING_LABEL", escapeJsString(textFor("cookie-text-marketing-label"))],
    ["COOKIE_MARKETING_DESCRIPTION", escapeJsString(textFor("cookie-text-marketing-description"))],
    ["ANALYTICS_CONFIG_JSON", analyticsConfig],
    ["STOREFRONT_BOOTSTRAP_JSON", bootstrapJson],
    ["STOREFRONT_CDN_PRECONNECT", cdnPreconnectTag()],
    // Нүүрний дээд хэсэг серверээс (heroShell.ts). `HERO_SHELL=0` = унтраах
    // (kill switch); renderIndexHtml нь зөвхөн "/" дээр л оруулна.
    ["SITE_HERO_SHELL", process.env.HERO_SHELL === "0" ? "" : await renderHeroShell({
      media,
      textFor,
      brandLogo: media.find(row => row.slotKey === "brand-logo")?.imageUrl || getSiteMediaSlot("brand-logo").fallbackUrl || "",
      promo,
    })],
  ]);

  cache = { renderedAt: now, values };
  return values;
}

/**
 * Replaces every %SEO_*% placeholder in the template. Falls back to leaving
 * the document untouched-but-valid if the database is unreachable: an
 * outage should degrade the link preview, never take down the page itself.
 */
export async function renderIndexHtml(template: string, pathname = "/"): Promise<string> {
  let values: Map<string, string>;
  try {
    values = await resolveValues();
  } catch (error) {
    console.error("[seo] Could not read site SEO values; serving the fallback document.", error);
    values = new Map();
  }
  // A product or journal post carries its own title, description, image
  // and structured data (server/_core/routeMeta.ts); everything else keeps
  // the site-wide values.
  const siteName = values.get("SEO_SITE_NAME") ?? getSiteTextSlot("seo-text-site-name").fallbackValue;
  const routeMeta = await resolveRouteMeta(pathname, siteName.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  // Хуудас бүрийн canonical нь ӨӨРИЙНХӨӨ хаяг (2026-09-20).
  //
  // Өмнө нь бараа/нийтлэлээс бусад БҮХ хуудас canonical-аа нүүр хуудас гэж
  // зарладаг байв — өөрөөр хэлбэл /shop, /brands, /journal, /help, /returns,
  // /about, /careers бүгд Google-д "энэ бол нүүр хуудасны хуулбар" гэж
  // хэлдэг байсан тул индексээс хасагдах эрсдэлтэй байв (Lighthouse
  // "Document does not have a valid rel=canonical", 2026-09-21-нд хэмжсэн).
  //
  // Query string-ийг ЗОРИУД хасна: /shop?q=…&page=3 бүгд /shop руу нэгтгэгдэх
  // нь шүүлтүүрийн хязгааргүй хослолыг индекслүүлэхгүйн тулд зөв зан төлөв.
  if (!routeMeta?.has("SEO_CANONICAL")) {
    const path = pathname.split("?")[0].replace(/\/+$/, "");
    values.set("SEO_CANONICAL", escapeAttribute(`${publicOrigin()}${path}`));
  }
  // Серверийн зурсан hero зөвхөн нүүр хуудсанд — бусад зам дээр React өөр
  // хуудас зурах тул shell нэг агшин "буруу" дэлгэц үзүүлнэ.
  const isHome = (pathname.split("?")[0].replace(/\/+$/, "") || "/") === "/";
  return template.replace(/%((?:SEO|COOKIE|ANALYTICS|STOREFRONT|SITE)_[A-Z_]+)%/g, (match, key: string) => {
    if (key === "SITE_HERO_SHELL" && !isHome) return "";
    return routeMeta?.get(key) ?? values.get(key) ?? fallbackFor(key) ?? match;
  });
}

/**
 * Used only when the database is unreachable -- the registry's own
 * committed copy, so an outage still serves a correct page and, critically,
 * a legally accurate consent banner rather than a raw "%COOKIE_SAVE%".
 */
const COOKIE_FALLBACK_SLOTS: Record<string, SiteTextSlotKey> = {
  COOKIE_PROMPT_DESCRIPTION: "cookie-text-prompt-description",
  COOKIE_ACCEPT_ALL: "cookie-text-accept-all",
  COOKIE_REJECT: "cookie-text-reject",
  COOKIE_PREFERENCES_BUTTON: "cookie-text-preferences-button",
  COOKIE_PREFERENCES_TITLE: "cookie-text-preferences-title",
  COOKIE_PREFERENCES_DESCRIPTION: "cookie-text-preferences-description",
  COOKIE_SAVE: "cookie-text-save",
  COOKIE_ESSENTIAL_LABEL: "cookie-text-essential-label",
  COOKIE_ESSENTIAL_DESCRIPTION: "cookie-text-essential-description",
  COOKIE_ANALYTICS_LABEL: "cookie-text-analytics-label",
  COOKIE_ANALYTICS_DESCRIPTION: "cookie-text-analytics-description",
  COOKIE_MARKETING_LABEL: "cookie-text-marketing-label",
  COOKIE_MARKETING_DESCRIPTION: "cookie-text-marketing-description",
};

function fallbackFor(key: string): string | undefined {
  const cookieSlot = COOKIE_FALLBACK_SLOTS[key];
  if (cookieSlot) return escapeJsString(getSiteTextSlot(cookieSlot).fallbackValue);
  switch (key) {
    case "SEO_TITLE": return escapeAttribute(getSiteTextSlot("seo-text-home-title").fallbackValue);
    case "SEO_DESCRIPTION": return escapeAttribute(getSiteTextSlot("seo-text-home-description").fallbackValue.replaceAll("{N}", "4"));
    case "SEO_SITE_NAME": return escapeAttribute(getSiteTextSlot("seo-text-site-name").fallbackValue);
    case "SEO_OG_DESCRIPTION": return escapeAttribute(getSiteTextSlot("seo-text-og-description").fallbackValue.replaceAll("{N}", "4"));
    case "SEO_TWITTER_DESCRIPTION": return escapeAttribute(getSiteTextSlot("seo-text-twitter-description").fallbackValue);
    case "SEO_CANONICAL": return escapeAttribute(publicOrigin());
    case "SEO_STRUCTURED_DATA": return "{}";
    // DB унтарсан ч блок зөв JSON байх ёстой: түүхий "%STOREFRONT_BOOTSTRAP_JSON%"
    // нь JSON.parse-д унана. Хоосон объект = хэсэг бүр байхгүй = ердийн query
    // (лого, hero нь slot-ын brand default руу буцна — яг DB-гүй үеийн зөв дүр).
    case "STOREFRONT_BOOTSTRAP_JSON": return "{}";
    case "STOREFRONT_CDN_PRECONNECT": return cdnPreconnectTag();
    case "SITE_HERO_SHELL": return "";
    case "SEO_OG_TYPE": return "website";
    case "SEO_OG_IMAGE_META": return "";
    case "SEO_VERIFICATION": return "";
    case "ANALYTICS_CONFIG_JSON": return '{"ga4":"","metaPixel":""}';
    case "SEO_OG_IMAGE": return escapeAttribute(absoluteUrl(getSiteMediaSlot("home-hero").fallbackUrl));
    case "SEO_HERO_PRELOAD": {
      const fallback = getSiteMediaSlot("home-hero").fallbackUrl;
      // DB унтарсан үед R2 руу ч асуухгүй — WebP-ийн аюулгүй зам.
      return fallback ? responsiveImagePreloadTag(fallback, HERO_FULL_WIDTH, HERO_IMAGE_SIZES, false) : "";
    }
    default: return undefined;
  }
}

/** Called after an admin saves an SEO slot or a contact setting, so the change is visible immediately. */
export function invalidateIndexHtmlCache() {
  cache = null;
}
