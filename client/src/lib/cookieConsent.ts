/**
 * Reads the (self-hosted) Silktide Consent Manager's own localStorage choice
 * for the "analytics" consent type -- see client/index.html's
 * silktideConsentManager.init() call for the consentTypes definition. No
 * `namespace` is configured there, so Silktide stores the choice under the
 * literal key `stcm.consent.analytics` -- confirmed by reading the actual
 * shipped `client/public/vendor/silktide-consent-manager.js` source
 * (`_buildConsentKey`), not the docs. The stored value is the literal string
 * `"true"`/`"false"` (Silktide's own `setConsentChoice` does
 * `accepted.toString()`, and its own `getConsentChoice` compares with
 * `value === 'true'`) -- matched exactly here rather than re-deriving a
 * "truthy" check that could silently diverge from the library's own logic.
 *
 * This is a plain read gating whether pageviewTracking.ts's beacon fires at
 * all (see shared/const.ts VISITOR_SESSION_COOKIE_NAME, the one real
 * analytics cookie this site sets) -- not a script-injection integration,
 * since no 3rd-party analytics script exists anywhere in this codebase to
 * conditionally load.
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
