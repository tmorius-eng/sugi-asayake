import { getSiteMedia, getSiteText, getStoreSettingValue, getStorefrontBranches } from "../db";
import { getSiteTextSlot, type SiteTextSlotKey } from "../../shared/site-text";
import { getSiteMediaSlot } from "../../shared/site-media";
import { ENV } from "./env";

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
  return quoted.slice(1, -1).replace(/<\/script/gi, "<\\/script");
};

async function resolveValues(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && now - cache.renderedAt < CACHE_TTL_MS) return cache.values;

  const [rows, branches, phoneDigits, facebookUrl, instagramUrl, media] = await Promise.all([
    getSiteText(),
    getStorefrontBranches(),
    getStoreSettingValue("contact-phone-tel"),
    getStoreSettingValue("contact-facebook-url"),
    getStoreSettingValue("contact-instagram-url"),
    getSiteMedia(),
  ]);

  // LCP (2026-09-13, measured on a throttled phone: 3.4s, of which 2.8s was
  // "load delay"): the hero photograph is the largest thing on the first
  // screen, but the browser only learned its URL after index.js had loaded,
  // React had rendered, and the siteMedia tRPC call had returned. Naming it
  // in the HTML head lets the fetch start with the document itself. Must be
  // byte-identical to the src HeroSection renders (admin slot, else the
  // slot's default), or the preload is wasted.
  const heroUrl = media.find(row => row.slotKey === "home-hero")?.imageUrl || getSiteMediaSlot("home-hero").fallbackUrl;

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
    ["SEO_CANONICAL", escapeAttribute(ENV.publicBaseUrl || "https://sugiasayake.mn")],
    // JSON.stringify already escapes quotes/controls; the one thing it does
    // not guard is a literal "</script>" inside an admin-typed string, which
    // would end the tag early. Escaping the slash keeps it inert and is still
    // valid JSON.
    ["SEO_STRUCTURED_DATA", JSON.stringify(structuredData).replace(/</g, "\\u003c")],
    ["SEO_HERO_PRELOAD", heroUrl ? `<link rel="preload" as="image" href="${escapeAttribute(heroUrl)}" fetchpriority="high" />` : ""],

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
  ]);

  cache = { renderedAt: now, values };
  return values;
}

/**
 * Replaces every %SEO_*% placeholder in the template. Falls back to leaving
 * the document untouched-but-valid if the database is unreachable: an
 * outage should degrade the link preview, never take down the page itself.
 */
export async function renderIndexHtml(template: string): Promise<string> {
  let values: Map<string, string>;
  try {
    values = await resolveValues();
  } catch (error) {
    console.error("[seo] Could not read site SEO values; serving the fallback document.", error);
    values = new Map();
  }
  return template.replace(/%((?:SEO|COOKIE)_[A-Z_]+)%/g, (match, key: string) => values.get(key) ?? fallbackFor(key) ?? match);
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
    case "SEO_CANONICAL": return escapeAttribute(ENV.publicBaseUrl || "https://sugiasayake.mn");
    case "SEO_STRUCTURED_DATA": return "{}";
    case "SEO_HERO_PRELOAD": {
      const fallback = getSiteMediaSlot("home-hero").fallbackUrl;
      return fallback ? `<link rel="preload" as="image" href="${escapeAttribute(fallback)}" fetchpriority="high" />` : "";
    }
    default: return undefined;
  }
}

/** Called after an admin saves an SEO slot or a contact setting, so the change is visible immediately. */
export function invalidateIndexHtmlCache() {
  cache = null;
}
