/**
 * Instant scrolling that wins over `html { scroll-behavior: smooth }`
 * (2026-09-12). Two phone bugs came from the same root: a smooth scroll that
 * is still animating when the document changes height gets clamped or
 * cancelled by the browser (measured on /shop: the grid unmounted into a
 * skeleton, the page shrank from 8170 to 4414 px mid-animation). A scroll
 * that has to land somewhere exact -- top of a new route, top of the product
 * grid on "Дараах" -- must therefore be instant and happen after render.
 *
 * Setting `scroll-behavior: auto` inline for one frame is the only reliable
 * way to make `scrollTo` instant while the global smooth rule stays for the
 * anchor links and the back-to-top button that want it.
 */
export function scrollToNow(top: number) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo({ top, left: 0, behavior: "auto" });
  requestAnimationFrame(() => { root.style.scrollBehavior = previous; });
}

/** Height of a sticky/fixed <header>, so content scrolled "to the top" is
 *  not hidden under it. 0 when the header scrolls with the page. */
export function stickyHeaderOffset(): number {
  const header = document.querySelector("header");
  if (!header) return 0;
  const position = getComputedStyle(header).position;
  if (position !== "sticky" && position !== "fixed") return 0;
  return Math.ceil(header.getBoundingClientRect().height);
}

/** Put `element`'s top edge just under the sticky header, instantly. */
export function scrollElementToTopNow(element: HTMLElement, extraGap = 8) {
  const top = element.getBoundingClientRect().top + window.scrollY - stickyHeaderOffset() - extraGap;
  scrollToNow(Math.max(0, top));
}
