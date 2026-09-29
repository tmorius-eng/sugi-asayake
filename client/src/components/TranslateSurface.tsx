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

    // 2026-09-27: user-generated content (a review body, a customer's own
    // name, a reply draft the shopper is mid-typing) opts out via
    // translate="no" -- see ReviewThread.tsx/ProductDetail.tsx. `closest()`
    // finds an ancestor with the attribute, not just the node itself.
    const isOptedOut = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest('[translate="no"]') != null;

    const translateText = (text: Text) => {
      if (isOptedOut(text)) return;
      const current = text.nodeValue ?? "";
      const trimmed = current.trim();
      if (!trimmed) return;
      const next = translate(trimmed, locale);
      if (next === trimmed) return;
      text.nodeValue = current.replace(trimmed, next);
      everTranslated = true;
    };

    const translateElement = (element: Element) => {
      if (isOptedOut(element)) return;
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
      if (!(root instanceof Element) || isOptedOut(root)) return;
      translateElement(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => isOptedOut(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
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
    // 2026-09-27: once the visitor is back on mn, the initial run() above
    // already reverted any stale en/ja text -- everything React renders from
    // here on is already Mongolian (the app's native language), so there is
    // nothing left to watch for. Before this, the observer ran forever
    // (walking the ENTIRE document.body on every single DOM mutation across
    // the whole site) even after switching back to mn.
    if (locale === "mn") return;

    // A timer, not requestAnimationFrame: rAF is throttled to nothing in a
    // background tab, which left everything that arrived after the first
    // pass -- a shelf fetched over the network, a dialog -- in Mongolian.
    let pending: ReturnType<typeof setTimeout> | 0 = 0;
    // 2026-09-27: queued mutation records, processed (and only THEIR
    // subtrees re-walked) on flush -- run() previously re-walked the whole
    // document.body on every burst, which grew with total page size instead
    // of with what actually changed and got slower the longer a visit ran.
    let queued: MutationRecord[] = [];
    const flush = () => {
      pending = 0;
      const mutations = queued;
      queued = [];
      const seenNodes = new Set<Node>();
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach(node => {
            if (seenNodes.has(node)) return;
            seenNodes.add(node);
            translateTree(node);
          });
        } else if (mutation.type === "characterData") {
          if (mutation.target.nodeType === Node.TEXT_NODE) translateText(mutation.target as Text);
        } else if (mutation.type === "attributes" && mutation.target instanceof Element) {
          translateElement(mutation.target);
        }
      }
      // 2026-09-27: the tab title lives outside <body> (the MutationObserver
      // below only watches document.body), so an SPA route change --
      // useDocumentMeta setting a new document.title -- was never retranslated
      // after the initial run() above, even though the childList mutations a
      // navigation also produces keep flush() running. run() used to catch
      // this every time; the mutation-scoped rewrite lost it.
      const title = translate(document.title, locale);
      if (title !== document.title) { document.title = title; everTranslated = true; }
    };
    const observer = new MutationObserver(mutations => {
      queued.push(...mutations);
      if (pending) return;
      pending = setTimeout(flush, 16);
    });
    // `attributes` too: a placeholder React re-renders in Mongolian has to be
    // caught, and nothing else notices an attribute changing on its own.
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributeFilter: [...ATTRS] });
    return () => { observer.disconnect(); if (pending) clearTimeout(pending); };
  }, [locale, translationsVersion]);

  return null;
}
