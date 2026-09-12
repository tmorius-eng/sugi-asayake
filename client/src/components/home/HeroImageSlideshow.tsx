import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";

export type HeroSlide = {
  key: string;
  imageUrl: string;
  caption: string;
  href: string;
};

/**
 * The homepage's opening row of square feature tiles -- built 2026-09-12
 * against cosmekitchen-webstore.jp, the reference Tom chose: 450px square
 * photographs, one short caption under each, a line of dots.
 *
 * It slides for real, always (Tom: "eniiig slide hiideg bolgoo") -- the
 * first version only moved when the tiles happened to overflow, so on a
 * wide screen with three tiles it sat still. The row is now the same
 * endless rail CategoryRail uses: the list is laid out three times over,
 * the view starts on the middle copy, and whenever scrolling drifts more
 * than half a set into the first or last copy the position jumps by exactly
 * one set width -- onto the identical tile, so the jump is invisible. That
 * guarantees there is always somewhere to advance to, at any width and with
 * any number of photographs.
 *
 * The clones are aria-hidden and untabbable, so a screen reader and the
 * keyboard meet each photograph exactly once. Auto-advance is one tile
 * every four seconds (Tom); it pauses under the pointer or a finger, while the
 * tab is hidden, and entirely for a visitor who asked for reduced motion.
 *
 * The photographs are the admin's own hero slots (up to six, see
 * HeroSection) and each caption is a site-text slot.
 */
const SLIDE_MS = 4000;
const COPIES = 3;

export default function HeroImageSlideshow({ slides, imageAlt }: { slides: HeroSlide[]; imageAlt: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const setWidth = useRef(0);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const loop = count > 1;

  /** One set = the distance between a tile and its twin in the next copy. */
  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return 0;
    const tiles = rail.querySelectorAll<HTMLElement>("[data-hero-tile]");
    const perCopy = tiles.length / COPIES;
    setWidth.current = perCopy > 0 && tiles.length > perCopy
      ? tiles[perCopy].offsetLeft - tiles[0].offsetLeft
      : rail.scrollWidth / COPIES;
    return setWidth.current;
  }, []);

  // Start on the middle copy, before the first paint.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !loop) return;
    const width = measure();
    rail.scrollLeft = width;
    const onResize = () => {
      const before = setWidth.current || 1;
      const ratio = rail.scrollLeft / before;
      rail.scrollLeft = ratio * measure();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [loop, measure, count]);

  /**
   * Shift the view by exactly one set, onto the identical tile. Only ever
   * called when no animation is running: doing it mid-glide fought the
   * in-flight smooth scroll and made the row jump backwards (measured --
   * the position oscillated instead of advancing).
   */
  const wrap = useCallback(() => {
    const rail = railRef.current;
    const width = setWidth.current;
    if (!rail || !loop || !width) return;
    if (rail.scrollLeft < width * 0.5) rail.scrollLeft += width;
    else if (rail.scrollLeft > width * 1.5) rail.scrollLeft -= width;
  }, [loop]);

  // Track which photograph is nearest the centre so the dots can follow it,
  // and wrap back into the middle copy once scrolling has actually stopped.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let frame = 0;
    let idle = 0;
    const settle = () => {
      frame = 0;
      const centre = rail.scrollLeft + rail.clientWidth / 2;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      rail.querySelectorAll<HTMLElement>("[data-hero-tile]").forEach((tile, index) => {
        const distance = Math.abs(tile.offsetLeft + tile.clientWidth / 2 - centre);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
      });
      setActive(best % count);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(settle);
      window.clearTimeout(idle);
      // 140ms of stillness means the glide (or the finger) is done.
      idle = window.setTimeout(wrap, 140);
    };
    rail.addEventListener("scroll", onScroll, { passive: true });
    settle();
    return () => { rail.removeEventListener("scroll", onScroll); window.clearTimeout(idle); if (frame) cancelAnimationFrame(frame); };
  }, [loop, count, wrap]);

  /** One tile, plus the gap between tiles. */
  const step = () => {
    const rail = railRef.current;
    const first = rail?.querySelector<HTMLElement>("[data-hero-tile]");
    if (!rail || !first) return 0;
    const styles = getComputedStyle(rail);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    return first.getBoundingClientRect().width + gap;
  };

  useEffect(() => {
    if (!loop || paused) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => {
      const rail = railRef.current;
      if (!rail) return;
      const distance = step();
      // Wrap first if the next tile would leave the middle copy, so the
      // glide itself never crosses the seam.
      if (setWidth.current && rail.scrollLeft + distance > setWidth.current * 1.5) rail.scrollLeft -= setWidth.current;
      rail.scrollBy({ left: distance, behavior: "smooth" });
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [loop, paused, active]);

  useEffect(() => {
    const sync = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  /** Scroll to a photograph by its position in the real (middle) copy. */
  const goTo = (index: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const tiles = rail.querySelectorAll<HTMLElement>("[data-hero-tile]");
    const tile = tiles[loop ? count + index : index];
    if (!tile) return;
    rail.scrollTo({ left: tile.offsetLeft - (rail.clientWidth - tile.clientWidth) / 2, behavior: "smooth" });
  };

  if (!count) return null;

  const copies = loop ? COPIES : 1;

  return (
    <div
      className="hero-rail-wrap"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}
    >
      <div ref={railRef} className="hero-rail" role="group" aria-roledescription="слайд шоу" aria-label={imageAlt}>
        {Array.from({ length: copies }, (_, copy) => slides.map((slide, index) => {
          const clone = loop && copy !== 1;
          return (
            <figure
              className="hero-rail-slide"
              data-hero-tile=""
              key={`${slide.key}-${copy}`}
              data-slot={slide.key}
              aria-hidden={clone || undefined}
            >
              <Link href={slide.href} className="hero-rail-link" draggable={false} tabIndex={clone ? -1 : undefined}>
                <img
                  src={slide.imageUrl}
                  alt={slide.caption}
                  draggable={false}
                  {...(copy === 0 && index === 0 ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
                />
              </Link>
              <figcaption>{slide.caption}</figcaption>
            </figure>
          );
        }))}
      </div>
      {loop && (
        <div className="hero-rail-dots" role="group" aria-label="Зураг сонгох">
          {slides.map((slide, index) => (
            <button
              key={slide.key}
              type="button"
              className={`hero-rail-dot${index === active ? " is-active" : ""}`}
              onClick={() => goTo(index)}
              aria-label={`${index + 1}-р зураг`}
              aria-current={index === active}
            />
          ))}
        </div>
      )}
    </div>
  );
}
