import { useEffect } from "react";
import { translate } from "@shared/i18n";
import { useLocale, useTranslationsVersion } from "@/hooks/useLocale";

/**
 * Translates the rendered page (2026-09-12).
 *
 * The storefront has ~500 Mongolian strings spread over a hundred
 * components. Threading a `t()` call through every one of them would be a
 * week of edits and would still miss the next string someone writes, so the
 * translation happens once, here, over the DOM the app has already
 * rendered: any text node the dictionary recognises is replaced, and so are
 * the `placeholder`, `title`, `aria-label` and `alt` attributes.
 *
 * What that buys, and what it costs:
 *   - Every component is covered without touching it, including ones added
 *     later; anything not in the dictionary is left exactly as written.
 *   - It only matches WHOLE strings, or a dictionary pattern like
 *     "{name}-г сагсанд нэмэх". A sentence built by concatenation at
 *     runtime is not translated unless its pieces are their own entries.
 *   - React owns these nodes, so every re-render restores the Mongolian and
 *     the observer below translates it again. That is why this watches the
 *     tree instead of running once.
 *
 * It reads whatever language a node is in now and renders the wanted one,
 * because shared/i18n.ts indexes every phrase under all three of its
 * wordings (2026-09-12, Tom: "language solihoor hagas dutuu soligdood
 * baiuna zaawal refresh hiij baij buren soligdoj baina"). So English ->
 * Japanese, and the way back to Mongolian, work without a reload and
 * without this keeping any record of what a node used to say.
 */

/** True once anything has been translated, so Mongolian-only visits do no work. */
let everTranslated = false;

export default function TranslateSurface() {
  const locale = useLocale();
  // Орчуулгын толь нь тусдаа chunk (2026-09-16) — ирэхээс өмнө хийсэн орчуулгын
  // алхам эх монголоор үлддэг тул толь ирмэгц дахин ажиллана.
  const translationsVersion = useTranslationsVersion();

  useEffect(() => {
    if (locale === "mn" && !everTranslated) return;

    const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

    const translateText = (text: Text) => {
      const current = text.nodeValue ?? "";
      const trimmed = current.trim();
      if (!trimmed) return;
      const next = translate(trimmed, locale);
      if (next === trimmed) return;
      text.nodeValue = current.replace(trimmed, next);
      everTranslated = true;
    };

    const translateElement = (element: Element) => {
      for (const attr of ATTRS) {
        const current = element.getAttribute(attr);
        if (!current) continue;
        const next = translate(current, locale);
        if (next === current) continue;
        element.setAttribute(attr, next);
        everTranslated = true;
      }
    };

    const translateTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateText(root as Text);
        return;
      }
      if (!(root instanceof Element)) return;
      translateElement(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const pending: Text[] = [];
      let node = walker.nextNode();
      while (node) {
        pending.push(node as Text);
        node = walker.nextNode();
      }
      for (const text of pending) translateText(text);
      root.querySelectorAll("[placeholder], [title], [aria-label], [alt]").forEach(translateElement);
    };

    const run = () => {
      // The tab title lives outside <body>, so the walker never sees it.
      const title = translate(document.title, locale);
      if (title !== document.title) document.title = title;
      const main = document.body;
      if (!main) return;
      for (const child of Array.from(main.children)) {
        // The cookie banner (#stcm-wrapper, vendor-rendered from the admin's
        // site text) used to be skipped; since 2026-09-14 it is translated
        // like any other node (Tom: "Cookie needs to be translated also").
        if (child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
        // /admin has its own language and its own switch; never touch it.
        if (child.querySelector?.(".admin-shell") || child.classList.contains("admin-shell")) continue;
        translateTree(child);
      }
    };

    run();
    // A timer, not requestAnimationFrame: rAF is throttled to nothing in a
    // background tab, which left everything that arrived after the first
    // pass -- a shelf fetched over the network, a dialog -- in Mongolian.
    let pending: ReturnType<typeof setTimeout> | 0 = 0;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => { pending = 0; run(); }, 16);
    });
    // `attributes` too: a placeholder React re-renders in Mongolian has to be
    // caught, and nothing else notices an attribute changing on its own.
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributeFilter: [...ATTRS] });
    return () => { observer.disconnect(); if (pending) clearTimeout(pending); };
  }, [locale, translationsVersion]);

  return null;
}
