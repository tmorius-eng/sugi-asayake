import { useEffect } from "react";

/**
 * Reveals editorial sections once while honoring a visitor's reduced-motion preference.
 *
 * 2026-09-09: sections that mount AFTER this effect has run (anything gated on
 * tRPC data -- quick stats, brand story, bestsellers, category mosaic, store
 * locator) were never observed, so they kept the un-revealed
 * `translate3d(0, 18px, 0)` forever. Transforms don't take part in layout, so
 * each stuck section painted 18px over the one below it -- most visibly the
 * store locator's tinted panel hanging into the red footer band. Tom reported
 * it as "overlapping error". A MutationObserver now hands newly mounted
 * [data-reveal] nodes to the same IntersectionObserver; `refreshKey` stays
 * for callers that already re-run the effect on their own signal.
 */
export function useScrollReveal(refreshKey?: string | number | boolean) {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      const revealAll = () => document.querySelectorAll<HTMLElement>("[data-reveal]").forEach(node => node.classList.add("is-revealed"));
      revealAll();
      const mutations = new MutationObserver(revealAll);
      mutations.observe(document.body, { childList: true, subtree: true });
      return () => mutations.disconnect();
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px" },
    );

    const observed = new WeakSet<Element>();
    const observeNew = () => {
      document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-revealed)").forEach(node => {
        if (observed.has(node)) return;
        observed.add(node);
        observer.observe(node);
      });
    };
    observeNew();

    // Coalesce bursts of DOM changes (a React commit is many mutations) into
    // one scan per frame.
    let frame = 0;
    const mutations = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; observeNew(); });
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
    };
  }, [refreshKey]);
}
