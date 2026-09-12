/*
 * Storefront light/dark, applied before the first paint (2026-09-12).
 *
 * Without this a shopper who chose dark sees a white page flash on every
 * load, because React only runs after the document has painted. It has to
 * be a file rather than an inline <script>: this site's CSP is
 * `script-src 'self'`, and an inline block is refused outright (a real
 * incident on 2026-09-12 -- the cookie banner was dead in production for
 * six days for exactly that reason).
 *
 * Keep in sync with client/src/hooks/useStorefrontTheme.ts: same storage
 * key, same attribute, same values.
 */
(function () {
  try {
    var stored = localStorage.getItem("sugi-storefront-theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-storefront-theme", theme);
    document.documentElement.style.colorScheme = theme;
    // The language follows the same path: applied before the first paint so
    // the header does not flash Mongolian at an English-speaking visitor.
    var locale = localStorage.getItem("sugi-locale");
    if (locale === "mn" || locale === "en" || locale === "ja") document.documentElement.setAttribute("lang", locale);
  } catch (error) {
    document.documentElement.setAttribute("data-storefront-theme", "light");
  }
})();
