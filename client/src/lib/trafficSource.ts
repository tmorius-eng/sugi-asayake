/**
 * Эхний хүрэлтийн traffic source — хөтчийн session бүрт нэг удаа авч, тэр session-
 * д хийсэн захиалга бүрд дахин ашиглана. Checkout-д хүрэх үед document.referrer
 * бараг үргэлж сайтын өөрийн өмнөх хуудас (сагс/дэлгүүр) болсон байдаг, анхны
 * гадаад referrer биш — тиймээс хамгийн эхний ачаалалт дээр ажиллаж sessionStorage-
 * д хадгалагдах ёстой, checkout үед шинээр уншихгүй.
 *
 * Дараалал: utm_source (санаатай кампанийн tag) > бодит гадаад referrer-ийн
 * hostname > "Шууд орсон" (referrer-гүй — URL бичсэн, bookmark, эсвэл referrer
 * хасдаг апп).
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
        const referrer = new URL(document.referrer);
        // 2026-09-23: сайтын өөрийн хуудаснаас (target=_blank → шинэ
        // sessionStorage) ирсэн бол эх сурвалж нь "sugi.karkaron.com" биш.
        source = referrer.hostname === window.location.hostname ? "Шууд орсон" : referrer.hostname.replace(/^www\./, "");
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
