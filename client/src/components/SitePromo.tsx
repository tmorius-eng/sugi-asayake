import { Fragment, useEffect, useRef, useState } from "react";
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
  const tickerRef = useRef<HTMLDivElement>(null);
  // Real promo copy varies wildly in length (a short "50% хямдрал!" vs. a
  // full sentence) -- computed once, unconditionally, so both the duration
  // effect below and the JSX further down stay in sync with the same string.
  const promoText = promo ? (promo.message ? `${promo.headline} — ${promo.message}` : promo.headline) : "";

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

  // 2026-09-04 (Tom, explicit): the ticker must always read as one
  // continuous, unhurried line -- but `animation: Ns linear infinite` moves
  // by exactly one row-width every N seconds, so a fixed duration means a
  // long headline+message would fly past far faster (px/second) than a
  // short one repeated the same tickerRepeats times. Measuring the actual
  // rendered row width and deriving the duration from a fixed px/second
  // target keeps the visual pace consistent (similar to the sunrise/shop
  // ribbons' own unhurried speed) regardless of how long the admin's copy
  // is. Published as a CSS variable (not a plain inline animation-duration)
  // specifically so the reduced-motion 24/7 override in index.css -- which
  // must win via !important -- can reference the same computed value
  // instead of re-hardcoding a duration here.
  useEffect(() => {
    const el = tickerRef.current;
    const firstRow = el?.firstElementChild as HTMLElement | null | undefined;
    if (!el || !firstRow) return;
    const TARGET_PX_PER_SECOND = 42;
    const MIN_DURATION_SECONDS = 12;
    const seconds = Math.max(MIN_DURATION_SECONDS, firstRow.scrollWidth / TARGET_PX_PER_SECOND);
    el.style.setProperty("--promo-ticker-duration", `${seconds.toFixed(1)}s`);
  }, [showBanner, promoText]);

  if (!promo || !eligiblePage || dismissed || !visible) return null;

  const dismiss = () => {
    setVisible(false);
    setDismissed(true);
    try { sessionStorage.setItem(dismissedKey(promo.id), "1"); } catch { /* ignore */ }
  };

  if (promo.displayMode === "banner") {
    // 2026-09-04 (Tom, explicit): a long headline+message used to wrap onto
    // a second centered line -- he asked for this to always read as ONE
    // line instead, scrolling continuously "24 цагийн турш" the same way
    // the sunrise ribbon (Home) and shop ribbon (Shop) already do. Reuses
    // that exact technique verbatim -- two identical rows sharing the
    // sunrise-track keyframe, so the mid-loop jump swaps to the visually
    // identical second row and reads as seamless, endless motion -- rather
    // than inventing a new animation. Repeated tickerRepeats times per row
    // just guarantees the row is wider than any realistic viewport (so
    // there's no gap between the two rows) -- the duration effect above is
    // what actually keeps the visual speed sane regardless of this count.
    const tickerRepeats = 6;
    const tickerRow = (keyPrefix: string) => (
      <>
        {Array.from({ length: tickerRepeats }, (_, index) => (
          <Fragment key={`${keyPrefix}-${index}`}><span>{promoText}</span><i /></Fragment>
        ))}
      </>
    );
    return <div ref={bannerRef} className="site-promo-banner sticky top-0 z-[60] flex items-center gap-3 bg-[#17181b] px-4 py-2.5 text-white">
      <div ref={tickerRef} className="site-promo-ticker" aria-label={promoText}>
        <div>{tickerRow("promo-a")}</div>
        <div aria-hidden="true">{tickerRow("promo-b")}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {promo.ctaLabel && promo.ctaUrl ? <a href={promo.ctaUrl} className="shrink-0 rounded-full bg-[#df1f3d] px-3 py-1 text-[11px] font-bold text-white transition hover:bg-[#bc1732]">{promo.ctaLabel}</a> : null}
        <button type="button" onClick={dismiss} aria-label="Зарыг хаах" className="shrink-0 text-white/60 transition hover:text-white"><X size={16} /></button>
      </div>
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
