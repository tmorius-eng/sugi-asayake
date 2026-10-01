/**
 * Web Push endpoint allowlist (2026-10-01, security audit D4). The server POSTs
 * to whatever endpoint a browser registered, so accepting any https host makes
 * `push.subscribe` a blind-SSRF primitive (and a way to hang the order-status
 * pipeline). Real browsers only ever hand out their vendor's push service, so
 * we accept exactly those -- the strongest check available without DNS.
 */

const EXACT_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);
const HOST_SUFFIXES = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some(suffix => host.endsWith(suffix) && host.length > suffix.length);
}

/** Per-user cap on stored push subscriptions (oldest are dropped first). */
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;
