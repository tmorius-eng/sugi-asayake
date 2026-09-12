import { useEffect } from "react";
import { UI_STRINGS, translate } from "@shared/i18n";
import { useLocale } from "@/hooks/useLocale";

/**
 * Translates the rendered page (2026-09-12).
 *
 * The storefront has ~500 Mongolian strings spread over a hundred
 * components. Threading a `t()` call through every one of them would be a
 * week of edits and would still miss the next string someone writes, so the
 * translation happens once, here, over the DOM the app has already
 * rendered: any text node whose exact trimmed content is in the dictionary
 * is replaced, and so are the `placeholder`, `title`, `aria-label` and
 * `alt` attributes.
 *
 * What that buys, and what it costs:
 *   - Every component is covered without touching it, including ones added
 *     later; anything not in the dictionary is left exactly as written.
 *   - It only matches WHOLE strings. A sentence built by concatenation at
 *     runtime ("155,000₮ · 2 ширхэг") is not translated unless its pieces
 *     are their own dictionary entries.
 *   - React owns these nodes, so every re-render restores the Mongolian and
 *     the observer below translates it again. That is why this watches the
 *     tree instead of running once.
 *
 * It does nothing at all in Mongolian, which is the default, so the normal
 * case costs one early return.
 */
export default function TranslateSurface() {
  const locale = useLocale();

  useEffect(() => {
    if (locale === "mn") return;

    const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
    const translateElement = (element: Element) => {
      for (const attr of ATTRS) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        const next = translate(value, locale);
        if (next !== value) element.setAttribute(attr, next);
      }
    };

    const translateTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        const raw = root.nodeValue ?? "";
        const trimmed = raw.trim();
        if (trimmed && UI_STRINGS[trimmed]) {
          const next = translate(trimmed, locale);
          if (next !== trimmed) root.nodeValue = raw.replace(trimmed, next);
        }
        return;
      }
      if (!(root instanceof Element)) return;
      // /admin has its own language and its own switch; never touch it.
      if (root.closest?.("#stcm-wrapper")) return;
      translateElement(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const pending: Text[] = [];
      let node = walker.nextNode();
      while (node) {
        pending.push(node as Text);
        node = walker.nextNode();
      }
      for (const text of pending) {
        const raw = text.nodeValue ?? "";
        const trimmed = raw.trim();
        if (!trimmed || !UI_STRINGS[trimmed]) continue;
        const next = translate(trimmed, locale);
        if (next !== trimmed) text.nodeValue = raw.replace(trimmed, next);
      }
      root.querySelectorAll("[placeholder], [title], [aria-label], [alt]").forEach(translateElement);
    };

    const run = () => {
      const main = document.body;
      if (!main) return;
      for (const child of Array.from(main.children)) {
        if (child.id === "stcm-wrapper" || child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
        if (child.querySelector?.(".admin-shell") || child.classList.contains("admin-shell")) continue;
        translateTree(child);
      }
    };

    run();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; run(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [locale]);

  return null;
}
