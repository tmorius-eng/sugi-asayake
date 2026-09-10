import { useEffect } from "react";

/**
 * Hides the Silktide consent manager's persistent floating cookie button
 * (#stcm-icon) ten seconds after the visitor has finished choosing their
 * cookie preferences.
 *
 * Tom, 2026-09-10: "bainga haragdaad uneheer tuvugtei baina" -- the button is
 * fixed to the bottom-left corner of every page, forever, on a site where the
 * consent choice is a one-time action. Ten seconds is long enough that a
 * visitor who wants to immediately correct a mis-click can still find it.
 *
 * Hiding it costs nothing in terms of the visitor's rights, because it is not
 * the only way back: SiteFooter.tsx's "Күкийн тохиргоо" button calls
 * `silktideConsentManager.resetConsent()`, which clears the stored choice and
 * brings the full banner back. That is checked below -- when consent is
 * cleared this un-hides the icon and restarts the countdown, so the pair stays
 * consistent no matter which route the visitor takes.
 *
 * Implementation notes:
 *  - The vendor script owns `#stcm-icon`'s inline `style.display`, flipping it
 *    between "flex" and "none" (see showCookieIcon/hideCookieIcon in
 *    client/public/vendor/silktide-consent-manager.js). Rather than fight it
 *    by writing the same property, this adds a class whose rule is
 *    `!important` so it wins over the vendor's inline style, and reads the
 *    INLINE value to know what the vendor currently intends.
 *  - A short poll rather than a MutationObserver: consent can be granted
 *    without the icon's attributes changing at all (the vendor may leave it
 *    already `display: flex`), so an observer alone can miss the moment the
 *    countdown should start. A 500ms interval reading two properties is
 *    cheaper than the bug.
 *  - `stcm.hasConsented` is the vendor's own "a choice has been made" flag
 *    (_buildHasConsentedKey). Its PRESENCE is the signal, not its contents:
 *    setHasConsented() writes the literal "1" and getHasConsented() returns
 *    `value !== null`. Checked against the shipped vendor source, and then
 *    against the real stored value in a browser -- an initial `=== "true"`
 *    guess here (copied from cookieConsent.ts, which is correct for the
 *    different `stcm.consent.*` keys) silently never matched, so the icon
 *    never hid.
 */
const HIDE_AFTER_MS = 10_000;
const HIDDEN_CLASS = "sugi-consent-icon-hidden";
const POLL_MS = 500;

function hasConsented(): boolean {
  try {
    return window.localStorage.getItem("stcm.hasConsented") !== null;
  } catch {
    // Private browsing / blocked storage: treat as "no choice recorded" so the
    // icon stays put rather than vanishing on someone who cannot store one.
    return false;
  }
}

export function useConsentIconAutoHide() {
  useEffect(() => {
    let shownSince: number | null = null;

    const tick = () => {
      const icon = document.getElementById("stcm-icon");
      if (!icon) return;

      // Choice cleared (e.g. the footer's "Күкийн тохиргоо" reset) -- give the
      // button back and start counting again from the next choice.
      if (!hasConsented()) {
        icon.classList.remove(HIDDEN_CLASS);
        shownSince = null;
        return;
      }

      // The vendor itself has the icon hidden; nothing to count down.
      if (icon.style.display === "none") {
        shownSince = null;
        return;
      }

      if (icon.classList.contains(HIDDEN_CLASS)) return;
      if (shownSince === null) shownSince = Date.now();
      else if (Date.now() - shownSince >= HIDE_AFTER_MS) icon.classList.add(HIDDEN_CLASS);
    };

    const timer = window.setInterval(tick, POLL_MS);
    tick();
    return () => window.clearInterval(timer);
  }, []);
}
