/**
 * Silktide Consent Manager-ийн (өөрөө hosting) localStorage-д хадгалсан
 * "analytics" зөвшөөрлийг уншина — consentTypes тодорхойлолт client/index.html-
 * ийн silktideConsentManager.init() дуудлагад. `namespace` тохируулаагүй тул
 * Silktide сонголтыг `stcm.consent.analytics` түлхүүрээр хадгална — баримт биш,
 * бодит `client/public/vendor/silktide-consent-manager.js` эх кодоос
 * (`_buildConsentKey`) уншиж баталгаажуулсан. Хадгалагдсан утга `"true"`/
 * `"false"` мөр (Silktide-ийн `setConsentChoice` `accepted.toString()` хийдэг,
 * `getConsentChoice` `value === 'true'` гэж харьцуулдаг) — сангийн логикоос
 * зөрж болох "truthy" шалгалт биш, яг ижил харьцуулалт.
 *
 * Энэ бол pageviewTracking.ts-ийн beacon илгээх эсэхийг шийддэг энгийн уншилт
 * (shared/const.ts VISITOR_SESSION_COOKIE_NAME — сайтын тавьдаг цорын ганц
 * analytics күки), script injection интеграц биш.
 */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("stcm.consent.analytics") === "true";
  } catch {
    return false; // private-browsing/blocked storage -- default to no tracking, never throw
  }
}

// Silktide Consent Manager (client/public/vendor/silktide-consent-manager.js)
// attaches itself to window as a plain global, loaded via a <script> tag in
// client/index.html rather than an ES import -- this ambient declaration is
// what lets TypeScript see `window.silktideConsentManager` project-wide
// (e.g. SiteFooter.tsx's "Күкийн тохиргоо" button) without every call site
// needing its own `as any` cast. Confirmed safe to add: no other .d.ts or
// global Window augmentation exists anywhere in client/, server/, or shared/.
declare global {
  interface Window {
    silktideConsentManager?: {
      init: (config: Record<string, unknown>) => void;
      update: (config: Record<string, unknown>) => void;
      getInstance: () => unknown;
      resetConsent: () => void;
    };
  }
}
