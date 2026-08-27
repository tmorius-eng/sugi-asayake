/** Device-type bucket parsed from the request's User-Agent header. Deliberately
 *  coarse (mobile/tablet/desktop) rather than full UA-parsing (browser,
 *  OS, version) — that's a much bigger dependency for a metric that's used
 *  as one summary breakdown, not device-specific rendering. Anything that
 *  doesn't match a known pattern (missing header, an unusual bot/client)
 *  reports "unknown" rather than guessing. */
export function parseDeviceType(userAgent: string | string[] | undefined | null): "mobile" | "tablet" | "desktop" | "unknown" {
  const header = Array.isArray(userAgent) ? userAgent[0] : userAgent;
  if (!header) return "unknown";
  const ua = header.toLowerCase();
  if (/ipad|tablet(?!.*mobile)|playbook|silk(?!.*mobile)/.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/.test(ua)) return "mobile";
  if (/mozilla|windows nt|macintosh|linux|x11/.test(ua)) return "desktop";
  return "unknown";
}

/** Cheap, best-effort bot filter for the Tier E pageview beacon (server/
 *  routers.ts's telemetry.pageview) -- a User-Agent substring blocklist,
 *  the same first/cheapest layer real analytics tools (GA4's spider list,
 *  PostHog's client-side blocklist) use. Won't catch a UA-spoofing scraper
 *  -- an accepted, industry-standard limitation, not something to
 *  over-solve for one summary metric. Missing/empty UA also counts as a
 *  bot (a real browser always sends one). */
const BOT_UA_PATTERN = /bot|spider|crawl|curl|wget|python-requests|headless/i;
export function isLikelyBot(userAgent: string | string[] | undefined | null): boolean {
  const header = Array.isArray(userAgent) ? userAgent[0] : userAgent;
  return !header || BOT_UA_PATTERN.test(header);
}
