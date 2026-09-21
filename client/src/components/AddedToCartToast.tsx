import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ADDED_TO_CART_EVENT } from "@/lib/addedToCartToast";

// 2026-09-07 (Tom, bsb.mn reference, explicit): visited bsb.mn live as a
// mobile user and watched their real add-to-cart confirmation -- a toast
// slides up from the very bottom of the screen with a thin countdown bar
// underneath that visibly depletes, then it dismisses itself. Tom asked for
// this exact MOTION, explicitly with SUGI's own colors instead of bsb's
// blue/green -- dark charcoal card (matches .commerce-header/.bottom-nav-bar's
// own dark surfaces elsewhere on the site) with the marigold badge + red
// progress bar this site already uses for accents (bestseller badges,
// .shop-sale-badge), not a literal green "success" color.
//
// A plain <div>, not sonner's <Toaster/> -- sonner's position is one global
// setting for every toast on the site (errors, admin "Тайлан татагдлаа"
// confirmations, etc.), and repositioning all of those to bottom-center to
// match bsb.mn's placement for just this one moment would be a much bigger,
// unasked-for change. This stays fully self-contained and only ever fires
// for the one thing Tom actually asked about.
const DURATION_MS = 3200;

export default function AddedToCartToast() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  // Bumped on every fire so the progress-bar span below gets a fresh `key`
  // -- React then mounts a brand-new DOM node instead of reusing the old
  // one, which restarts its CSS animation even if a second item is added
  // in quick succession while the first toast is still showing.
  const [nonce, setNonce] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      if (!detail?.message) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setMessage(detail.message);
      setVisible(true);
      setNonce(n => n + 1);
      timeoutRef.current = setTimeout(() => setVisible(false), DURATION_MS);
    };
    window.addEventListener(ADDED_TO_CART_EVENT, handler);
    return () => {
      window.removeEventListener(ADDED_TO_CART_EVENT, handler);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className={`added-to-cart-toast${visible ? " is-visible" : ""}`} role="status" aria-live="polite" aria-hidden={!visible}>
      <span className="added-to-cart-toast-icon"><Check size={13} strokeWidth={3} aria-hidden="true" /></span>
      <p>{message}</p>
      {/* tabIndex -1 while hidden (2026-09-21, a11y): the toast hides with
          opacity/pointer-events, not display:none, so its close button stayed
          in the Tab order of EVERY page as an invisible stop (BackToTop.tsx has
          the same guard). */}
      <button type="button" onClick={() => setVisible(false)} aria-label="Хаах" tabIndex={visible ? 0 : -1} style={{ padding: 6, margin: -6 }}><X size={14} aria-hidden="true" /></button>
      {visible && <span key={nonce} className="added-to-cart-toast-bar" style={{ animationDuration: `${DURATION_MS}ms` }} />}
    </div>
  );
}
