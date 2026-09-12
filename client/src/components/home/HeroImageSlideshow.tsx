import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { createTimer } from "animejs";

export type HeroSlide = {
  key: string;
  imageUrl: string;
  href: string;
  /** Names the tile's link; the photographs carry no visible words. */
  label: string;
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
 *  drift 2500 -> 3500 -> 5000 -> 10000 -> 15000. At fifteen seconds the row
 *  barely reads as moving at all until you watch it, which is the register
 *  the reference site sits in. */
const MS_PER_SLIDE = 15000;
const COPIES = 3;

export default function HeroImageSlideshow({ slides, imageAlt }: { slides: HeroSlide[]; imageAlt: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const setWidth = useRef(0);
  /**
   * The drift's own position, in floating-point pixels.
   *
   * It cannot be read back from the element each frame: a scroll offset is
   * quantised (measured here -- assigning 1000.4 reads back as 1000.5), so
   * at a slow drift on a fast display each frame's fraction is smaller than
   * one quantum, gets rounded away, and the row sits still. Measured at 15s
   * per photograph and 165fps: 93px of intended travel produced 0.5px of
   * actual movement. Keeping the exact position here and writing it out
   * each frame makes the speed independent of both the refresh rate and the
   * quantum.
   */
  const position = useRef<number | null>(null);
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
    const at = position.current ?? rail.scrollLeft;
    let next = at;
    if (at < width * 0.5) next = at + width;
    else if (at > width * 1.5) next = at - width;
    if (next === at) return;
    position.current = next;
    rail.scrollLeft = next;
  }, [loop]);

  // Start on the middle copy, and re-measure when the layout changes.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !loop) return;
    rail.scrollLeft = measure();
    position.current = rail.scrollLeft;
    const onResize = () => {
      const before = setWidth.current || 1;
      const ratio = (position.current ?? rail.scrollLeft) / before;
      rail.scrollLeft = ratio * measure();
      position.current = rail.scrollLeft;
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
        position.current = (position.current ?? rail.scrollLeft) - (pitch * elapsed) / MS_PER_SLIDE;
        rail.scrollLeft = position.current;
        wrap();
      },
    });
    return () => { timer.pause(); timer.revert(); };
  }, [loop, held, hidden, measure, wrap]);

  // A finger, a swipe or the keyboard can move the row; adopt where it
  // actually is so the next frame carries on from there instead of yanking
  // it back to where the drift thought it was.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onScroll = () => {
      if (position.current === null || Math.abs(rail.scrollLeft - position.current) > 1.5) position.current = rail.scrollLeft;
    };
    rail.addEventListener("scroll", onScroll, { passive: true });
    return () => rail.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

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
              <Link href={slide.href} className="hero-rail-link" draggable={false} aria-label={slide.label} tabIndex={clone ? -1 : undefined}>
                <img
                  src={slide.imageUrl}
                  alt=""
                  draggable={false}
                  {...(copy === 0 && index === 0 ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
                />
              </Link>
            </figure>
          );
        }))}
      </div>
    </div>
  );
}
