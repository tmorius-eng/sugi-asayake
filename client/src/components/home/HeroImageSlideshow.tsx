import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";

export type HeroSlide = {
  key: string;
  imageUrl: string;
  caption: string;
  href: string;
};

/**
 * The homepage's opening row of square feature tiles -- rebuilt 2026-09-12
 * against cosmekitchen-webstore.jp (now MASH GO GREEN STORE), the reference
 * Tom chose: a row of 450px square images, one short caption under each,
 * a line of dots. No overlays, badges or markers on the photographs.
 *
 * Mechanism: a real scroll container with scroll-snap, so on a phone the
 * swipe is the browser's own. When every tile fits the viewport (three
 * tiles at 1440px) nothing scrolls and nothing auto-advances -- the row is
 * simply centred. When the tiles overflow (a phone shows one at a time)
 * the row advances on its own every five seconds, pauses while the hand or
 * the pointer is on it, and the dots show where it is.
 *
 * The three photographs come from the same admin slots as before
 * (home-hero / home-hero-2 / home-hero-3) and the caption under each is the
 * same site-text slot; the four overlay slots of the previous slideshow
 * stay registered in shared/site-text.ts and are simply not rendered.
 */
const SLIDE_MS = 5000;

export default function HeroImageSlideshow({ slides, imageAlt }: { slides: HeroSlide[]; imageAlt: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [scrollable, setScrollable] = useState(false);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior) => {
    const rail = railRef.current;
    const slide = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !slide) return;
    rail.scrollTo({ left: slide.offsetLeft - (rail.clientWidth - slide.clientWidth) / 2, behavior });
  }, []);

  // Which tile sits nearest the centre, and whether the row scrolls at all.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setScrollable(rail.scrollWidth > rail.clientWidth + 4);
      const centre = rail.scrollLeft + rail.clientWidth / 2;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      Array.from(rail.children).forEach((child, index) => {
        const el = child as HTMLElement;
        const distance = Math.abs(el.offsetLeft + el.clientWidth / 2 - centre);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
      });
      setActive(best);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    rail.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(rail);
    return () => { rail.removeEventListener("scroll", schedule); observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [count]);

  // Auto-advance only when there is somewhere to go.
  useEffect(() => {
    if (!scrollable || paused || count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => scrollToIndex((active + 1) % count, "smooth"), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [scrollable, paused, active, count, scrollToIndex]);

  useEffect(() => {
    const sync = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  if (!count) return null;

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
        {slides.map((slide, index) => (
          <figure className={`hero-rail-slide${scrollable && index === active ? " is-active" : ""}`} key={slide.key} data-slot={slide.key}>
            <Link href={slide.href} className="hero-rail-link" draggable={false}>
              <img src={slide.imageUrl} alt={slide.caption} draggable={false} {...(index === 0 ? { fetchPriority: "high" as const } : { loading: "lazy" as const })} />
            </Link>
            <figcaption>{slide.caption}</figcaption>
          </figure>
        ))}
      </div>
      {scrollable && count > 1 && (
        <div className="hero-rail-dots" role="group" aria-label="Зураг сонгох">
          {slides.map((slide, index) => (
            <button
              key={slide.key}
              type="button"
              className={`hero-rail-dot${index === active ? " is-active" : ""}`}
              onClick={() => scrollToIndex(index, "smooth")}
              aria-label={`${index + 1}-р зураг`}
              aria-current={index === active}
            />
          ))}
        </div>
      )}
    </div>
  );
}
