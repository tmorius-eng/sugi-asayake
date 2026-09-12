import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { createTimer } from "animejs";

export type HeroSlide = {
  key: string;
  imageUrl: string;
  caption: string;
  href: string;
};

/**
 * The homepage's opening row of square feature tiles -- built 2026-09-12
 * against cosmekitchen-webstore.jp, the reference Tom chose: 450px square
 * photographs with one short caption under each.
 *
 * Motion, after three rounds of Tom's feedback ("hudluhgui baina",
 * "animejs ees heregtei animation code av", "zuunees baruun tiishee
 * ursahgui baina zogsoltgui"): the row is a **continuous marquee**, not a
 * slideshow that jumps every few seconds. The photographs drift steadily to
 * the right and never stop.
 *
 *   - The ticker is anime.js (`createTimer`, an infinite timer). Each frame
 *     it moves the rail's own scrollLeft by speed x elapsed time, so the
 *     travel is a constant number of pixels per second regardless of the
 *     display's refresh rate. It is a real scroll position, not a
 *     transform, so a finger can still grab the row and the browser's own
 *     momentum takes over.
 *   - "Endless" is three copies of the list laid end to end. The view
 *     starts on the middle copy, and whenever the drift carries it more
 *     than half a set out of that copy the position shifts by exactly one
 *     set width -- onto the identical photograph, so nothing visibly jumps.
 *   - Nothing pauses on hover. An earlier version did, and since a
 *     visitor's cursor usually rests over the hero, it looked frozen. It
 *     pauses only while a finger is on it (otherwise the drift fights the
 *     swipe) and while the browser tab is hidden, and it does not run at all
 *     for a visitor whose system asks for reduced motion.
 *
 * The clones are aria-hidden and untabbable, so a screen reader and the
 * keyboard meet each photograph exactly once. The photographs are the
 * admin's own hero slots (up to six, see HeroSection) and each caption is a
 * site-text slot.
 */
/** One photograph passes every this many milliseconds. Tom tuned this by
 *  eye, each step slower than the last: 4000 stepped ("too slow"), then as a
 *  drift 2500 -> 3500 -> 5000 -> 10000. At ten seconds the row reads as a
 *  slow tide rather than a scroller, which is the register the reference
 *  site sits in. */
const MS_PER_SLIDE = 10000;
const COPIES = 3;

export default function HeroImageSlideshow({ slides, imageAlt }: { slides: HeroSlide[]; imageAlt: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const setWidth = useRef(0);
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);
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

  /** Keep the view inside the middle copy; the shift lands on a twin tile. */
  const wrap = useCallback(() => {
    const rail = railRef.current;
    const width = setWidth.current;
    if (!rail || !loop || !width) return;
    if (rail.scrollLeft < width * 0.5) rail.scrollLeft += width;
    else if (rail.scrollLeft > width * 1.5) rail.scrollLeft -= width;
  }, [loop]);

  // Start on the middle copy, and re-measure when the layout changes.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !loop) return;
    rail.scrollLeft = measure();
    const onResize = () => {
      const before = setWidth.current || 1;
      const ratio = rail.scrollLeft / before;
      rail.scrollLeft = ratio * measure();
    };
    window.addEventListener("resize", onResize);
    // The photographs load lazily; their arrival can change the set width.
    const observer = new ResizeObserver(() => { measure(); });
    observer.observe(rail);
    return () => { window.removeEventListener("resize", onResize); observer.disconnect(); };
  }, [loop, measure, count]);

  // The drift itself.
  useEffect(() => {
    if (!loop || held || hidden) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = 0;
    const timer = createTimer({
      duration: Infinity,
      onUpdate: self => {
        const rail = railRef.current;
        if (!rail) return;
        const now = self.currentTime;
        const elapsed = last ? Math.min(now - last, 100) : 0;
        last = now;
        if (!setWidth.current) measure();
        // Speed is derived from the tile pitch rather than fixed in pixels,
        // so one photograph passes every MS_PER_SLIDE at any width
        // -- on a phone the tiles are smaller and the drift slows to match.
        const first = rail.querySelector<HTMLElement>("[data-hero-tile]");
        if (!first) return;
        const styles = getComputedStyle(rail);
        const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
        const pitch = first.getBoundingClientRect().width + gap;
        // Right-drifting content means a decreasing scroll position.
        rail.scrollLeft -= (pitch * elapsed) / MS_PER_SLIDE;
        wrap();
      },
    });
    return () => { timer.pause(); timer.revert(); };
  }, [loop, held, hidden, measure, wrap]);

  // Which photograph is nearest the centre, for the dots.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let frame = 0;
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
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(settle); };
    rail.addEventListener("scroll", onScroll, { passive: true });
    settle();
    return () => { rail.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [count]);

  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  /** A dot jumps the drift to that photograph and lets it carry on. */
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
      onTouchStart={() => setHeld(true)}
      onTouchEnd={() => setHeld(false)}
      onTouchCancel={() => setHeld(false)}
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
