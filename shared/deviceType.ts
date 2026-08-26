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
