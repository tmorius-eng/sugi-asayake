import { Fragment, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLocation } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { bootstrapSlice } from "@/lib/bootstrap";

// 2026-09-21: the active promo rides in the document (client/src/lib/bootstrap.ts)
// so the banner is in the very first React render -- before, it arrived a
// round trip later and pushed the whole page down by its own height.
const promoBootstrap = bootstrapSlice<RouterOutputs["promotions"]["active"]>("promo");

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
  const promoQuery = trpc.promotions.active.useQuery(undefined, {
    enabled: eligiblePage,
    ...(promoBootstrap ? { initialData: promoBootstrap.data, initialDataUpdatedAt: promoBootstrap.at } : {}),
  });
  const promo = promoQuery.data;
  // 2026-09-27: hoisted above the early-return below so both the popup's new
  // Escape-key handler (which must be wired in a hook, and hooks can't run
  // after a conditional return) and the JSX further down can share it.
  const dismiss = () => {
    if (!promo) return;
    setVisible(false);
    setDismissed(true);
    try { sessionStorage.setItem(dismissedKey(promo.id), "1"); } catch { /* ignore */ }
  };
  // 2026-09-21: the banner's initial state is decided synchronously from the
  // bootstrap promo, so it is in React's very FIRST commit. Before, both flags
  // started false and the effect below flipped them a tick later -- the bar
  // then appeared and pushed the whole page down by its own height (40px CLS
  // on every load), and the server-rendered hero shell (heroShell.ts), which
  // includes the bar, would have visibly jumped at mount. The popup mode keeps
  // its 900ms delay through the effect.
  const initiallyDismissed = (() => {
    try { return Boolean(promoBootstrap?.data && sessionStorage.getItem(dismissedKey(promoBootstrap.data.id)) === "1"); } catch { return false; }
  })();
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  const [visible, setVisible] = useState(Boolean(promoBootstrap?.data && promoBootstrap.data.displayMode === "banner" && !initiallyDismissed));
  const bannerRef = useRef<HTMLDivElement>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
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

  // 2026-09-27: the popup is `role="dialog" aria-modal="true"` but had no
  // Escape key, no focus trap, no scroll lock and no focus return -- a
  // keyboard/screen-reader visitor could tab OUT into page content that a
  // sighted mouse user can't reach (it's visually covered by the backdrop),
  // and the page behind it kept scrolling. Purely behavioural (no new
  // markup/classes), so the look is unchanged.
  const showPopup = Boolean(promo && eligiblePage && !dismissed && visible && promo.displayMode !== "banner");
  useEffect(() => {
    if (!showPopup) return;
    const dialog = popupRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute("disabled"))
      : [];
    // 2026-09-27: focusing the close (X) button here drew a visible
    // focus-visible ring around it the instant the popup opened, even though
    // nobody pressed a key to get there -- a look-changing side effect of
    // what was meant to be purely behavioural. The dialog container itself
    // (tabIndex={-1} + no outline, below) is the WAI-ARIA-recommended initial
    // focus target for a dialog with no obviously-primary field anyway.
    dialog?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); dismiss(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPopup]);

  if (!promo || !eligiblePage || dismissed || !visible) return null;

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
    return <div ref={bannerRef} className="site-promo-banner sticky top-0 z-[60] flex items-center gap-3 bg-[var(--promo-bar-bg)] px-4 py-2.5 text-[var(--promo-bar-fg)]">
      <div ref={tickerRef} className="site-promo-ticker" aria-label={promoText}>
        <div>{tickerRow("promo-a")}</div>
        <div aria-hidden="true">{tickerRow("promo-b")}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {promo.ctaLabel && promo.ctaUrl ? <a href={promo.ctaUrl} className="shrink-0 rounded-full bg-[var(--primary)] px-3 py-1 text-[11px] font-bold text-[var(--primary-foreground)] transition hover:bg-[var(--primary-hover)]">{promo.ctaLabel}</a> : null}
        <button type="button" onClick={dismiss} aria-label="Зарыг хаах" className="-m-1.5 shrink-0 p-1.5 text-[var(--promo-bar-fg)] opacity-60 transition hover:opacity-100"><X size={16} /></button>
      </div>
    </div>;
  }

  // 2026-09-07 (bsb.mn mobile-UX pass): redesigned for mobile after visiting
  // bsb.mn myself as a real 390px mobile user (not just from a screenshot) --
  // cleared their own popup's sessionStorage dismissal key to watch it fire
  // fresh. Their card is genuinely near-edge-to-edge (~16-18px margins, not a
  // centered max-w-md card), the image is the dominant visual, and the
  // backdrop is barely dimmed. Their "big bold headline" turned out to be
  // baked directly into the promotional image itself, not HTML text overlaid
  // on a photo -- deliberately NOT copying that part: this codebase's promo
  // images are whatever an admin uploads day to day (AdminPromotionsPanel.tsx),
  // not always a pre-composed graphic with legible built-in text, so the
  // existing headline/message/CTA fields stay as the reliable, always-legible
  // copy -- just with the image made much more dominant and the card sized
  // like a real mobile card instead of a shrunk desktop modal. All hook/
  // timing/sessionStorage/suppression logic above this line is unchanged.
  {/* Every mobile-only change below uses `max-sm:` (Tailwind: "at or below
      the 640px sm breakpoint") specifically so every unprefixed class stays
      the exact original desktop value -- verified: at any viewport >=640px
      the computed classes here are byte-for-byte identical to before this
      pass, only <640px gets the new near-edge-to-edge/bigger-image/lighter-
      backdrop treatment. */}
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 max-sm:bg-black/35 max-sm:px-3.5" role="dialog" aria-modal="true" aria-label={promo.headline} onClick={dismiss}>
    <div ref={popupRef} tabIndex={-1} style={{ outline: "none" }} className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] bg-[#f8f5ef] shadow-[0_30px_80px_rgba(0,0,0,.35)] max-sm:max-w-[calc(100vw-28px)]" onClick={event => event.stopPropagation()}>
      <button type="button" onClick={dismiss} aria-label="Хаах" className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/85 text-[#17181b] transition hover:bg-white"><X size={16} /></button>
      {promo.imageUrl ? <img src={promo.imageUrl} alt="" className="h-44 w-full object-cover max-sm:aspect-[4/5] max-sm:h-auto" /> : null}
      <div className="p-7 text-center sm:p-8">
        <p className="text-[10px] font-extrabold tracking-[.2em] text-[var(--primary)]">SUGI ASAYAKE</p>
        <h2 className="mt-3 font-[var(--font-display)] text-2xl font-semibold tracking-[-.04em] text-[#17181b] sm:text-3xl max-sm:text-[2rem] max-sm:leading-[1.05]">{promo.headline}</h2>
        {promo.message ? <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#5c5d61]">{promo.message}</p> : null}
        {promo.ctaLabel && promo.ctaUrl
          ? <a href={promo.ctaUrl} onClick={dismiss} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--primary)] px-7 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[var(--primary-hover)] active:scale-[.97]">{promo.ctaLabel}</a>
          : <button type="button" onClick={dismiss} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-black/10 px-7 text-sm font-bold text-[#17181b] transition hover:bg-black/5">Ойлголоо</button>}
      </div>
    </div>
  </div>;
}
