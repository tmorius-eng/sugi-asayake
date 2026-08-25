import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

// Admin-controlled marketing popup/banner (new-arrival, sale, store event).
// See sitePromotions in drizzle/schema.ts and AdminPromotionsPanel.tsx for
// where an admin writes the content this renders verbatim -- there is no
// fabricated urgency here (no fake countdown, no invented stock numbers),
// only whatever an admin actually typed for whatever window they scheduled.
const dismissedKey = (id: number) => `sugi-promo-dismissed-${id}`;

export default function SitePromo() {
  const [location] = useLocation();
  // A popup has nothing useful to say inside the admin panel, and mid-checkout
  // it would only be a distraction from finishing an order -- keep it off both.
  const eligiblePage = !location.startsWith("/admin") && location !== "/checkout";
  const promoQuery = trpc.promotions.active.useQuery(undefined, { enabled: eligiblePage });
  const promo = promoQuery.data;
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!promo) { setVisible(false); return; }
    try {
      if (sessionStorage.getItem(dismissedKey(promo.id)) === "1") { setDismissed(true); return; }
    } catch {
      // Private-browsing / storage-blocked: fall through and just show it.
    }
    setDismissed(false);
    const timer = setTimeout(() => setVisible(true), promo.displayMode === "popup" ? 900 : 0);
    return () => clearTimeout(timer);
  }, [promo]);

  const showBanner = Boolean(promo && eligiblePage && !dismissed && visible && promo.displayMode === "banner");

  // Home's own header (.site-header in index.css) is position:fixed, so it
  // ignores this banner's normal document flow entirely -- it would just get
  // painted over. Publishing the banner's real height as a CSS variable lets
  // that fixed header read it and shift itself down by exactly that much.
  // ResizeObserver (not just an effect on mount) because the banner's text
  // can wrap to a second line at narrow widths, changing its height.
  useEffect(() => {
    if (!showBanner || !bannerRef.current) {
      document.documentElement.style.setProperty("--promo-banner-offset", "0px");
      return;
    }
    const el = bannerRef.current;
    const publish = () => document.documentElement.style.setProperty("--promo-banner-offset", `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--promo-banner-offset", "0px");
    };
  }, [showBanner]);

  if (!promo || !eligiblePage || dismissed || !visible) return null;

  const dismiss = () => {
    setVisible(false);
    setDismissed(true);
    try { sessionStorage.setItem(dismissedKey(promo.id), "1"); } catch { /* ignore */ }
  };

  if (promo.displayMode === "banner") {
    // sticky (not fixed, not plain static): it occupies real space in normal
    // flow -- which is what correctly pushes non-fixed headers (e.g.
    // CommerceHeader) down -- and then pins to the viewport top once
    // scrolled past, so it never leaves a gap above Home's fixed
    // .site-header (which reads --promo-banner-offset, set below, to shift
    // itself down by this element's real height).
    return <div ref={bannerRef} className="sticky top-0 z-[60] flex items-center justify-center gap-3 bg-[#17181b] px-4 py-2.5 text-center text-xs font-semibold text-white sm:text-sm">
      <span>{promo.headline}{promo.message ? <span className="hidden font-normal text-white/70 sm:inline"> — {promo.message}</span> : null}</span>
      {promo.ctaLabel && promo.ctaUrl ? <a href={promo.ctaUrl} className="shrink-0 rounded-full bg-[#df1f3d] px-3 py-1 text-[11px] font-bold text-white transition hover:bg-[#bc1732]">{promo.ctaLabel}</a> : null}
      <button type="button" onClick={dismiss} aria-label="Зарыг хаах" className="shrink-0 text-white/60 transition hover:text-white"><X size={16} /></button>
    </div>;
  }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" aria-label={promo.headline} onClick={dismiss}>
    <div className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] bg-[#f8f5ef] shadow-[0_30px_80px_rgba(0,0,0,.35)]" onClick={event => event.stopPropagation()}>
      <button type="button" onClick={dismiss} aria-label="Хаах" className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/85 text-[#17181b] transition hover:bg-white"><X size={16} /></button>
      {promo.imageUrl ? <img src={promo.imageUrl} alt="" className="h-44 w-full object-cover" /> : null}
      <div className="p-7 text-center sm:p-8">
        <p className="text-[10px] font-extrabold tracking-[.2em] text-[#df1f3d]">SUGI ASAYAKE</p>
        <h2 className="mt-3 font-[var(--font-display)] text-2xl font-semibold tracking-[-.04em] text-[#17181b] sm:text-3xl">{promo.headline}</h2>
        {promo.message ? <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#5c5d61]">{promo.message}</p> : null}
        {promo.ctaLabel && promo.ctaUrl
          ? <a href={promo.ctaUrl} onClick={dismiss} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-[#df1f3d] px-7 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]">{promo.ctaLabel}</a>
          : <button type="button" onClick={dismiss} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-black/10 px-7 text-sm font-bold text-[#17181b] transition hover:bg-black/5">Ойлголоо</button>}
      </div>
    </div>
  </div>;
}
