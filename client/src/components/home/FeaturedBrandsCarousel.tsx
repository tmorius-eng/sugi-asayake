import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { imageSrcSet } from "@shared/image-variants";

/**
 * Featured Brands carousel, built against matsuyaginza.com/en's section of
 * the same name (Tom, 2026-09-10: "yg ene shig hiilguulmeer baina").
 *
 * The previous version (BrandTileCard + CarouselShelf) was a static row of
 * rounded, shadowed tiles with the brand name and tagline overlaid on the
 * photo. Tom's verdict -- "zgrl neg durvuljin tegsen shadow edrtei utaggui"
 * -- is the same complaint that killed CategoryMasonry v5 (shadow) and v6
 * (text overlaid on the image instead of sitting in its own band). The
 * reference does none of that: flat square photo, no radius, no shadow, no
 * scrim, and NO text on the slide at all -- brand identity is carried by the
 * brand's own logo in a separate band underneath.
 *
 * The mechanism, measured off the reference's live computed DOM rather than
 * eyeballed from a screenshot, is TWO nested transforms per slide:
 *
 *   outer  translateX(px) + opacity + z-index   -- where the slide sits
 *   inner  scale(S), transform-origin: top left -- how big it is
 *
 * with S = 2.25 for the active slide and 1 for every other. That single
 * scaled slide IS the design; rendering equal-sized cards in a row (which is
 * what CategoryMasonry v4 did with its "nudge two cards" grid) loses the
 * entire idea. Both transforms share the reference's 1000ms `ease`.
 *
 * Geometry lives in CSS (.fbrand-* custom properties) so the breakpoints
 * have one home; this component reads the computed values back so its height
 * math and its "is this slide off-screen" test always agree with what CSS
 * actually applied. Reference values at 1440px: base width 227.26px
 * (= 15.78vw), gap 40px, active slide parked at x=90 -- flush with the
 * heading -- and a 100px logo band.
 */

export type FeaturedBrandSlide = {
  id: number;
  brandName: string;
  photoUrl: string | null;
  logoUrl: string | null;
};

/** How long a brand holds the spotlight before the next one takes it.
 *  The glide itself is the reference's `--carousel-speed: 1000ms` + `ease`,
 *  set in CSS (.fbrand-slide / .fbrand-scale) so the reduced-motion
 *  exemption there has a single place to override. */
const AUTOPLAY_MS = 4000;
/** Past this much pointer travel a drag counts as a deliberate swipe, not a click. */
const DRAG_CLICK_SUPPRESS_PX = 8;
/** How many brands should be on screen at once, viewport permitting. Matches
 *  the reference, which shows 7 of its 8 featured brands on a ~1900px window. */
const TARGET_VISIBLE = 7;
/** Ceiling on how much of the window the spotlighted slide may occupy. Without
 *  it, "fill the width" on a 5K monitor produces a slide taller than the
 *  screen (Tom, 2026-09-10: "herwee uur hun mangar tom display geer orwol"). */
const MAX_ACTIVE_VIEWPORT_FRACTION = 0.72;

type Metrics = { base: number; scale: number; left: number; gap: number; logo: number; viewport: number; viewportTop: number };
const INITIAL_METRICS: Metrics = { base: 0, scale: 2.25, left: 90, gap: 40, logo: 100, viewport: 0, viewportTop: 0 };

const readPx = (styles: CSSStyleDeclaration, name: string, fallback: number) => {
  const parsed = Number.parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function FeaturedBrandsCarousel({ brands, heading }: { brands: FeaturedBrandSlide[]; heading: string }) {
  const count = brands.length;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [paused, setPaused] = useState(false);
  const [dragDx, setDragDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragTravel = useRef(0);
  /**
   * Whether this gesture has actually become a drag and taken the pointer.
   *
   * 2026-09-12, Tom: "онцлох брэндүүд дээр дархаар тэр брэндийн барааны page
   * руу явахгүй байна". Confirmed with a real mouse click in a browser: the
   * slide's href was correct and hovering showed it, but clicking navigated
   * nowhere. The cause was setPointerCapture() being called on pointerdown —
   * once an element captures the pointer, the browser dispatches the
   * following `click` to the CAPTURING element rather than to whatever was
   * pressed, so the <Link> inside the slide never saw it. Capture is only
   * needed once a finger is genuinely dragging, so it is deferred until the
   * pointer has moved past the drag threshold; a plain click never captures
   * and reaches the link normally.
   */
  const dragCaptured = useRef(false);

  // NOTE: autoplay deliberately does NOT check prefers-reduced-motion.
  // The first cut of this component did, and Tom -- whose machine has the OS
  // reduce-motion setting on -- immediately reported the carousel frozen
  // ("ANIMATION AJILHGU BAINA SHWW URSAHGUI BAINA AUTO!!!"), the fourth time
  // he has asked for continuous motion after the sunrise ribbon, the shop
  // ribbon and the promo ticker. Measured before changing anything: with
  // reducedMotion emulated the active slide sat on brand 1 for 8.8s straight.
  // The matching CSS half of this exemption lives in index.css's
  // prefers-reduced-motion block, which would otherwise crush the 1000ms
  // glide to .01ms and make each change a hard cut.

  // Measure after layout, not after paint, so the first frame is already
  // positioned -- otherwise every slide renders stacked at x=0 for a frame.
  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => {
      const styles = getComputedStyle(element);
      const scale = readPx(styles, "--fbrand-scale", 2.25);
      const left = readPx(styles, "--fbrand-left", 90);
      const gap = readPx(styles, "--fbrand-gap", 40);
      const viewportWidth = element.clientWidth;
      // Slide width is solved for, not declared: pick the width at which
      // TARGET_VISIBLE brands are on screen at once (Tom: "haragdah brand toog
      // 7 bolgo"), then clamp it to the min/max the breakpoint allows.
      //
      // It is computed here rather than as a CSS clamp() for a concrete
      // reason: getComputedStyle does NOT resolve an unregistered custom
      // property, so `--fbrand-w: clamp(150px, 15.78vw, 240px)` came back as
      // the literal string "clamp(...)" and parseFloat gave NaN. Every
      // breakpoint silently fell through to this file's 227.26 fallback --
      // which happened to equal the reference value, so it looked correct
      // while the CSS did nothing at all.
      const wanted = Math.min(TARGET_VISIBLE, Math.max(count, 1));
      const maxWidth = readPx(styles, "--fbrand-w-max", 900);
      const fitted = wanted < 3
        ? maxWidth
        : (viewportWidth - left - (wanted - 2) * gap) / (scale + wanted - 2.6);
      // Second constraint, and the reason this is not just a width formula:
      // the active slide is `scale` times taller than a plain one, so on a
      // very wide monitor "fill the width" alone would produce a slide taller
      // than the screen. Cap it so the spotlighted brand always fits in view.
      const logoHeight = readPx(styles, "--fbrand-logo-h", 100);
      const heightCap = (window.innerHeight * MAX_ACTIVE_VIEWPORT_FRACTION) / scale - logoHeight;
      setMetrics({
        base: Math.max(readPx(styles, "--fbrand-w-min", 150), Math.min(maxWidth, fitted, heightCap)),
        scale,
        left,
        gap,
        logo: readPx(styles, "--fbrand-logo-h", 100),
        viewport: element.clientWidth,
        // Where the strip starts inside the section, so the controls can be
        // parked just under the short slides without hard-coding the
        // section padding (a clamp()) or the logo band (which collapses).
        viewportTop: element.offsetTop,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [count]);

  const go = useCallback((step: number) => {
    if (count === 0) return;
    setActive(current => ((current + step) % count + count) % count);
  }, [count]);

  useEffect(() => {
    if (paused || isDragging || count < 2) return;
    const timer = window.setInterval(() => go(1), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [paused, isDragging, count, go]);

  // NOTE: there is deliberately no pause-on-hover. The first cut had one, and
  // it is why Tom still saw a frozen strip after the reduce-motion fix -- a
  // visitor watching the section rests the cursor on it, which is exactly
  // when it must keep moving. Autoplay still yields to the things that mean
  // "I am driving this now": a drag, keyboard focus, a hidden tab. Those (plus
  // the arrows) are the pause mechanism WCAG 2.2.2 asks for.

  // A backgrounded tab shouldn't burn through the whole brand list unseen.
  useEffect(() => {
    const sync = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragStartX.current = event.clientX;
    dragTravel.current = 0;
    dragCaptured.current = false;
    setIsDragging(true);
    // Deliberately NOT capturing here -- see dragCaptured above.
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const delta = event.clientX - dragStartX.current;
    dragTravel.current = Math.max(dragTravel.current, Math.abs(delta));
    // Take the pointer the moment this stops being a click and becomes a
    // swipe, so the gesture keeps tracking even if it leaves the carousel.
    if (!dragCaptured.current && dragTravel.current > DRAG_CLICK_SUPPRESS_PX) {
      dragCaptured.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDragDx(delta);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragCaptured.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragCaptured.current = false;
    // Snap by whole slides: a short tug rounds to 0 and springs back, a real
    // swipe advances as many slides as it actually covered.
    const stride = metrics.base + metrics.gap;
    if (stride > 0) go(-Math.round(dragDx / stride));
    setDragDx(0);
  };

  // A drag that ends over a slide would otherwise fire that slide's link.
  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (dragTravel.current > DRAG_CLICK_SUPPRESS_PX) {
      event.preventDefault();
      event.stopPropagation();
    }
    dragTravel.current = 0;
  };

  // Ring position of every slide, computed before the early return so the
  // teleport bookkeeping below can be a hook.
  //
  // The ring is deliberately lopsided -- exactly ONE slide behind the active
  // one, every other slide ahead -- because that is the shape of the layout:
  // one half-cut slide at the left edge, and as many as will fit running off
  // to the right. It used to be centred (±count/2), which quietly capped the
  // strip at three slides to the right however many brands existed.
  const offsets = brands.map((_, index) => {
    const raw = ((index - active) % Math.max(count, 1) + count) % Math.max(count, 1); // 0 .. count-1
    return raw === count - 1 ? -1 : raw;
  });

  // A lopsided ring means the left-hand slide teleports to the far right once
  // per step. The reference never shows that jump because it keeps a spare
  // slide parked off-screen (8 brands, 7 shown) and recycles it there; with
  // every brand on screen there is no hiding place, so the jump is made
  // instant instead. The class lands in the same commit as the new transform,
  // so the browser has no transition left to run.
  const previous = useRef<{ active: number; offsets: Map<number, number> } | null>(null);
  const teleporting = new Set<number>();
  if (previous.current && previous.current.active !== active && count > 2) {
    brands.forEach((brand, index) => {
      const before = previous.current?.offsets.get(brand.id);
      // Only a genuine wrap, never a multi-slide drag: a wrap moves a slide by
      // the whole ring (count - 1), a two-step drag by 2.
      if (before !== undefined && Math.abs(offsets[index] - before) >= count - 1) teleporting.add(brand.id);
    });
  }
  useEffect(() => {
    previous.current = { active, offsets: new Map(brands.map((brand, index) => [brand.id, offsets[index]])) };
  });

  if (count === 0) return null;

  const stride = metrics.base + metrics.gap;
  const activeWidth = metrics.base * metrics.scale;
  // The logo band only takes up room once at least one brand actually has a
  // logo uploaded. Reserving it unconditionally left ~300px of dead space
  // under the strip on a catalogue where no logo exists yet -- caught by
  // looking at the rendered page, not by any of the geometry numbers, which
  // were all correct. It reappears by itself the moment a logo is added.
  /*
   * 2026-09-11 (Tom: "ene ontsloh branduud zurag logo ygd haragdhgu tsagaan
   * baigaan be?"). This was `brands.some(...)` -- the band appeared as soon as
   * ONE brand had a logo. In production exactly one of nine does (Cocochi), so
   * eight cards were reserving a 100px blank strip each and a third of every
   * tile rendered as empty space. The "leave it blank rather than invent a
   * wordmark" rule below is still Tom's call and still holds; what was wrong
   * was letting a single logo impose that blank on everyone else.
   *
   * 2026-09-12: resolved differently. The band is rendered per brand (only
   * under a photo that has a logo), so nobody reserves a blank strip and the
   * one logo'd brand still shows its logo. `anyLogo` is now only the height
   * budget: the viewport must be tall enough for a logo'd slide when one
   * exists at all.
   */
  const logoCount = brands.filter(brand => Boolean(brand.logoUrl)).length;
  const anyLogo = logoCount > 0;
  const logoBand = anyLogo ? metrics.logo : 0;
  // The scaled slide sets the section's height: both the square photo and
  // the logo band live inside the scaled box, so both scale with it.
  const trackHeight = (metrics.base + logoBand) * metrics.scale;
  // How far down an unscaled slide has to sit to share the tall slide's
  // centre line. Both boxes are (base + logoBand) tall before scaling.
  const shortSlideTop = ((metrics.base + logoBand) * (metrics.scale - 1)) / 2;
  return (
    <section className="fbrand-section" data-reveal aria-labelledby="fbrand-heading">
      <header className="fbrand-header">
        <h2 className="fbrand-title" id="fbrand-heading">{heading}</h2>
      </header>

      <div
        ref={viewportRef}
        className={`fbrand-viewport${isDragging ? " is-dragging" : ""}`}
        style={{ height: trackHeight ? `${trackHeight}px` : undefined }}
        role="region"
        aria-roledescription="carousel"
        aria-label={heading}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {brands.map((brand, index) => {
          const offset = offsets[index];
          const isActive = offset === 0;
          const x = isActive
            ? metrics.left
            : offset > 0
              ? metrics.left + activeWidth + metrics.gap + (offset - 1) * stride
              : metrics.left + offset * stride;
          // Hidden once it would sit outside the viewport or collide with the
          // nav column on the right -- same treatment the reference gives its
          // parked slides (opacity 0 + pointer-events none + aria-hidden).
          // Shown as soon as ANY part of it is inside the viewport, so the
          // strip runs edge to edge with a half-cut slide at each end -- the
          // reference's own look, and the reason it reads as a continuous
          // filmstrip rather than a short row.
          //
          // The first cut required the whole slide to fit AND reserved the
          // nav column's width on the right. That hid the outermost slide
          // and left a dead band beside the arrows: Tom, comparing the two
          // pages, counted 7 brand images on the reference against 4 here.
          // Neither restriction exists in the reference -- the arrows sit
          // BELOW the short slides, not beside them, so nothing needs
          // reserving.
          const slideWidth = isActive ? activeWidth : metrics.base;
          const visible = metrics.viewport === 0
            ? isActive
            : x < metrics.viewport && x + slideWidth > 0;
          const srcSet = imageSrcSet(brand.photoUrl, 1600);
          return (
            <div
              key={brand.id}
              className={`fbrand-slide${isActive ? " is-active" : ""}${teleporting.has(brand.id) ? " is-teleporting" : ""}`}
              style={{
                // Short slides ride the vertical centre of the tall one rather
                // than hanging off its top edge. Top-aligning them (which is
                // what the reference does) left a ~340px void under the row,
                // beside the spotlighted slide -- Tom: "yasan ih gap ... ene
                // hooson zaig yhiin". Centring splits that space above and
                // below, so it reads as deliberate air instead of a hole, and
                // costs nothing else about the reference's look.
                top: isActive ? 0 : `${shortSlideTop}px`,
                transform: `translateX(${x + dragDx}px)`,
                width: metrics.base ? `${metrics.base}px` : undefined,
                opacity: visible ? 1 : 0,
                zIndex: isActive ? 10 : visible ? 5 : 1,
                pointerEvents: visible ? undefined : "none",
              }}
              role="group"
              aria-roledescription="slide"
              aria-label={`${brand.brandName} — ${index + 1} / ${count}`}
              aria-hidden={visible ? undefined : true}
            >
              <div
                className="fbrand-scale"
                style={{ transform: `scale(${isActive ? metrics.scale : 1})` }}
              >
                <Link
                  href={`/shop?brand=${encodeURIComponent(brand.brandName)}`}
                  className="fbrand-link"
                  tabIndex={visible ? undefined : -1}
                  aria-label={`${brand.brandName} брэндийн бараанууд`}
                >
                  <span className="fbrand-photo">
                    {brand.photoUrl ? (
                      <img
                        src={brand.photoUrl}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        {...(srcSet ? { srcSet, sizes: `${Math.round(metrics.base * metrics.scale) || 512}px` } : {})}
                      />
                    ) : null}
                  </span>
                  {/* 2026-09-12 (Tom, with a reference: photo, then a white
                      band with the logo centred under it): the band belongs
                      to the brands that have a logo, and only to them. A
                      brand without one ends at its photo -- no blank strip
                      (the 2026-09-11 complaint), and no wordmark the brand
                      never approved. Photo tops stay aligned; a logo'd card
                      simply runs longer. */}
                  {brand.logoUrl ? (
                    <span className="fbrand-logo">
                      {/* 2026-09-21: 1920px өргөн wordmark (38–72 KB) ~52px-ээр зурагддаг. */}
                      <img src={brand.logoUrl} alt={brand.brandName} loading="lazy" draggable={false} {...(imageSrcSet(brand.logoUrl, 1920) ? { srcSet: imageSrcSet(brand.logoUrl, 1920)!, sizes: "120px" } : {})} />
                    </span>
                  ) : null}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* A row UNDER the strip, not a floating column beside it. The strip now
          runs edge to edge so seven brands fit, which left no clear column on
          the right -- the arrows and the CTA were colliding with the last
          slide. Putting them below also gives the band under the short slides
          something to hold. */}
      <div className="fbrand-controls">
        <div className="fbrand-arrows" role="group" aria-label="Каруселийн навигаци">
          <button type="button" className="fbrand-arrow" onClick={() => go(-1)} aria-label="Өмнөх брэнд">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
              <circle cx="26" cy="26" r="25.5" fill="#fff" fillOpacity="0.5" stroke="#d7d7d7" />
              <path d="M30 38L18 26L30 14" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <button type="button" className="fbrand-arrow" onClick={() => go(1)} aria-label="Дараагийн брэнд">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
              <circle cx="26" cy="26" r="25.5" fill="#fff" fillOpacity="0.5" stroke="#d7d7d7" />
              <path d="M22 14L34 26L22 38" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
        {/* The reference's "View Full Brand List", in Mongolian to match the
            heading (Tom, 2026-09-10) and the /brands page it opens. */}
        <Link href="/brands" className="fbrand-all">Бүх брэнд үзэх</Link>
      </div>
    </section>
  );
}
