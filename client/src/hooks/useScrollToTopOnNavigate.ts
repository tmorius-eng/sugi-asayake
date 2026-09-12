import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { scrollToNow } from "@/lib/scroll";

/**
 * Start every forward navigation at the top of the new page (2026-09-12).
 *
 * A single-page app keeps the window's scroll offset across route changes
 * unless something resets it, and nothing did. Measured on a phone: leaving
 * /shop at 7,326 px and tapping a footer link opened /privacy at 4,488 of
 * 5,331 px -- the browser clamped the old offset while the new page was
 * still short, then the page grew around it, so the reader was dropped
 * near the footer of a page they had never seen. Tom's "every new page
 * opens at the bottom".
 *
 * Back/forward are deliberately left alone: the browser restores the
 * position the reader left, which is what a back button is for. A hash in
 * the new location is left alone too, so in-page anchors still work.
 */
export function useScrollToTopOnNavigate() {
  const [location] = useLocation();
  const previous = useRef(location);
  const cameFromHistory = useRef(false);

  useEffect(() => {
    const onPop = () => { cameFromHistory.current = true; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (location === previous.current) return;
    previous.current = location;
    const fromHistory = cameFromHistory.current;
    cameFromHistory.current = false;
    if (fromHistory || window.location.hash) return;
    scrollToNow(0);
  }, [location]);
}
