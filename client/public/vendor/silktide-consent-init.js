// Cookie-consent bootstrap (2026-09-12).
//
// This used to be an inline <script> in index.html. Production sends
// `Content-Security-Policy: script-src 'self'`, which forbids inline scripts,
// so in production the banner never initialised at all -- since the CSP
// (2026-09-02) met the inline init (2026-09-06). Development has no CSP, so
// every local check saw a working banner. Found through the public tunnel
// on 2026-09-12 (the console said so on the first load).
//
// The wording is editable from /admin (site text) and is rendered by the
// server into a JSON data block in index.html; a JSON block is data, not a
// script, so CSP does not apply to it. This file is served from /vendor/
// like the manager itself, which 'self' permits.
(function () {
  var manager = window.silktideConsentManager;
  var block = document.getElementById("cookie-consent-config");
  if (!manager || !block) return;
  var text;
  try { text = JSON.parse(block.textContent || "{}"); } catch (_) { return; }
  manager.init({
    prompt: { position: "bottomRight" },
    icon: { position: "bottomLeft" },
    backdrop: { show: false },
    consentTypes: [
      { id: "essential", label: text.essentialLabel, description: text.essentialDescription, required: true },
      { id: "analytics", label: text.analyticsLabel, description: text.analyticsDescription, required: false, defaultValue: false },
    ],
    text: {
      prompt: {
        description: text.promptDescription,
        acceptAllButtonText: text.acceptAll,
        rejectNonEssentialButtonText: text.reject,
        preferencesButtonText: text.preferencesButton,
        // Accessible name for the icon-only "close preferences" button;
        // without it the vendor renders an unlabeled <button>.
        preferencesButtonAccessibleLabel: "Күүкийн тохиргоог хаах",
      },
      preferences: {
        title: text.preferencesTitle,
        description: text.preferencesDescription,
        saveButtonText: text.save,
      },
    },
  });
})();
