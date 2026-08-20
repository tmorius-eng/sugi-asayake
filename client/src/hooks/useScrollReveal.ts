import { useEffect } from "react";

/** Reveals editorial sections once while honoring a visitor's reduced-motion preference. */
export function useScrollReveal(refreshKey?: string | number | boolean) {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!nodes.length) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      nodes.forEach(node => node.classList.add("is-revealed"));
      return;
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

    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [refreshKey]);
}
