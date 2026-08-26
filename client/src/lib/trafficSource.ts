/**
 * First-touch traffic source, captured once per browser session and reused
 * for every order placed in that session. By the time someone reaches
 * checkout, document.referrer is almost always the site's own previous page
 * (cart/shop), not the original external referrer -- so this has to run on
 * the very first page load and be stashed in sessionStorage, not read fresh
 * at checkout time.
 *
 * Preference order: utm_source (deliberate campaign tagging) > a real
 * external referrer's hostname > "Шууд орсон" (direct, no referrer -- typed
 * the URL, used a bookmark, or came from an app that strips referrers).
 */
const STORAGE_KEY = "sugi_traffic_source";

export function captureTrafficSource(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(STORAGE_KEY)) return; // already captured this session

    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source");
    let source: string;
    if (utmSource) {
      const utmMedium = params.get("utm_medium");
      source = utmMedium ? `${utmSource} / ${utmMedium}` : utmSource;
    } else if (document.referrer) {
      try {
        source = new URL(document.referrer).hostname.replace(/^www\./, "");
      } catch {
        source = "Шууд орсон";
      }
    } else {
      source = "Шууд орсон";
    }
    window.sessionStorage.setItem(STORAGE_KEY, source);
  } catch {
    // sessionStorage can throw in a locked-down/private context -- traffic
    // source is a nice-to-have, never worth breaking the page over.
  }
}

export function getStoredTrafficSource(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
