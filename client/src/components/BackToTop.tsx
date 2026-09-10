import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ChevronUp } from "lucide-react";

/**
 * "Back to top" button for the whole storefront (Tom, 2026-09-10: "humuus
 * manai website ali ch buh page iin hamgiin doorn ochihoor ... deeshee
 * butsdag button tai bolmoor baina ... entire front store doo").
 *
 * Mounted once in App.tsx next to BottomNavBar rather than per page, so every
 * route gets it -- including the long ones this is really for (/shop, /brands,
 * /journal, a product page). /admin is excluded: it has its own shell, its own
 * scroll containers, and its own chrome, and the same exclusion is already how
 * BottomNavBar decides not to render.
 *
 * Deliberately small (44px, the minimum comfortable touch target) rather than
 * a large floating panel -- Tom: "gehdee neeh tom bish shww".
 *
 * Positioning is the fiddly part, because three other things already claim the
 * bottom of the screen: BottomNavBar's sticky tab bar on mobile, ProductDetail's
 * sticky add-to-cart bar, and the Silktide cookie button. It sits bottom-RIGHT
 * (the cookie button is bottom-left, so they never collide) and lifts above the
 * mobile bar using the same --mobile-sticky-bar-h / --safe-bottom variables
 * #stcm-icon already uses -- see index.css.
 */
const SHOW_AFTER_PX = 400;

export default function BackToTop() {
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);

  // Route changes usually reset the scroll position; re-evaluate rather than
  // leaving the button on screen at the top of a freshly-opened page.
  useEffect(() => {
    setVisible(window.scrollY > SHOW_AFTER_PX);
  }, [location]);

  if (location.startsWith("/admin")) return null;

  const toTop = () => {
    // Honour a reduce-motion preference here (unlike the brand carousel, where
    // Tom explicitly asked for motion regardless): a long smooth scroll is the
    // kind of large-area movement that setting exists for, and jumping
    // straight to the top still does exactly what the button promises.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      className={`back-to-top${visible ? " is-visible" : ""}`}
      aria-label="Хуудасны эхэнд буцах"
      // Kept out of the tab order while off-screen so keyboard users don't
      // land on an invisible control.
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : true}
    >
      <ChevronUp size={22} strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}
