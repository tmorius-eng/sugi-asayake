import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Sparkles } from "lucide-react";

export type HeroSlide = {
  /** The slot key this slide came from -- a stable React key, and useful in the DOM for debugging. */
  key: string;
  imageUrl: string;
  badgeValue: string;
  badgeLabel: string;
  markerLabel: string;
  cornerLabel: string;
  caption: string;
};

/**
 * The hero photograph, as a three-slide show (2026-09-12).
 *
 * Tom: "нүүрний хамгийн эхэнд байдаг энэ зургийг 3 өөр зургаар slide-аар
 * animation болгож болох уу? … 5 sec тутамд … хамгийн гол нь зураг бүрийн
 * badge, marker, label, caption бас давхар зэрэгцээд солигдмоор байна …
 * вебсайт нь амьд юм шиг мэдрэгдээд."
 *
 * WHY NOT anime.js, WHICH TOM ASKED ABOUT: researched, and it is the wrong
 * tool for this particular job. anime.js v4 is ~17KB gzipped, and what this
 * hero needs is a crossfade plus a staggered fade-and-rise -- precisely the
 * category that native CSS transitions cover at zero bundle cost. This
 * project's own audit already flags 462KB of main-chunk JS against a
 * 17 Mbps median mobile connection, so paying 17KB for an effect CSS does
 * natively would be a real cost for no capability. A library earns its
 * place when motion is physics-driven, interruptible mid-flight, or
 * sequenced across dozens of targets; none of that is true here.
 *
 * THE ACCESSIBILITY CALL, which is genuinely contested:
 *
 * The standards (W3C WAI carousel tutorial, WebAIM) ask for an explicit
 * pause control, a 5-7s interval, pause on hover and on keyboard focus, and
 * respect for prefers-reduced-motion. Everything in that list is
 * implemented here EXCEPT freezing under reduced motion, and that exception
 * is deliberate and documented rather than an oversight.
 *
 * Tom's own machine has the OS reduce-motion setting on. Four times now --
 * the sunrise ribbon, the shop ribbon, the promo ticker, the brands
 * carousel -- a correctly-gated animation has reached him as a frozen
 * element and been reported as a bug ("ANIMATION AJILHGU BAINA SHWW"). So
 * instead of stopping, reduced motion removes the MOVING parts: no Ken
 * Burns drift on the photo, no rise on the text, no sliding progress bar --
 * only a plain opacity crossfade, which is the accommodation that matters
 * for vestibular triggers (it is motion, not change, that causes harm).
 * The real WCAG 2.2.2 obligation, that a person can stop it, is met by the
 * pause button rather than by guessing from an OS setting.
 */

/** Standards guidance is 5-7s; Tom asked for 5. */
const SLIDE_MS = 5000;

export default function HeroImageSlideshow({ slides, imageAlt }: { slides: HeroSlide[]; imageAlt: string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  /** Set by the pause button only. Hovering must never override a deliberate choice. */
  const [stoppedByUser, setStoppedByUser] = useState(false);
  const count = slides.length;

  const go = useCallback((next: number) => setActive(((next % count) + count) % count), [count]);

  // A single slide is a still photograph: no timer, no controls, no
  // roledescription -- the whole apparatus would be describing something
  // that never moves. This is also what happens before an admin has
  // uploaded the second and third pictures.
  const running = count > 1 && !paused && !stoppedByUser;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setActive(current => (current + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [running, active, count]);

  // A backgrounded tab shouldn't silently advance through the whole set.
  useEffect(() => {
    const sync = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const regionRef = useRef<HTMLDivElement>(null);

  if (!count) return null;

  const single = count === 1;

  return (
    <div
      ref={regionRef}
      className="hero-image"
      // Pause on hover and on keyboard focus, both required by the W3C
      // carousel guidance so a reader is never raced by the timer.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // KEYBOARD focus only, via :focus-visible. Plain onFocus also fires
      // for the click that focuses a button, so pressing play left focus on
      // the play button, which immediately re-paused -- the control looked
      // dead. The mouse case is already covered by the hover handlers above.
      onFocusCapture={event => {
        if ((event.target as Element).matches?.(":focus-visible")) setPaused(true);
      }}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
      {...(single
        ? { role: "img", "aria-label": imageAlt }
        : { role: "group", "aria-roledescription": "слайд шоу", "aria-label": imageAlt })}
    >
      {slides.map((slide, index) => {
        const isActive = index === active;
        return (
          <div
            key={slide.key}
            className={`hero-slide${isActive ? " is-active" : ""}`}
            style={{ backgroundImage: `url(${slide.imageUrl})` }}
            // Hidden slides are removed from the accessibility tree entirely,
            // so a screen reader reads one hero, not three stacked ones.
            aria-hidden={!isActive}
            data-slot={slide.key}
          >
            <div className="hero-image-shade" />
            {/* Each overlay carries its own transition-delay in CSS, so the
                four pieces arrive in sequence rather than all at once --
                that stagger is what reads as "alive" rather than as a
                slideshow swapping frames. */}
            <div className="hero-image-badge" aria-hidden="true">
              <span>{slide.badgeValue}</span>
              <small>{slide.badgeLabel}</small>
            </div>
            <div className="hero-image-marker" aria-hidden="true">
              <Sparkles size={15} />
              <span>{slide.markerLabel}</span>
            </div>
            <div className="hero-image-label"><span>{slide.cornerLabel}</span></div>
            <div className="hero-image-caption">{slide.caption}</div>
          </div>
        );
      })}

      {!single && (
        <div className="hero-slide-controls">
          <button
            type="button"
            className="hero-slide-toggle"
            onClick={() => setStoppedByUser(current => !current)}
            aria-label={stoppedByUser ? "Зургийн солилтыг үргэлжлүүлэх" : "Зургийн солилтыг зогсоох"}
            title={stoppedByUser ? "Үргэлжлүүлэх" : "Зогсоох"}
          >
            {stoppedByUser ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <div className="hero-slide-dots" role="group" aria-label="Зураг сонгох">
            {slides.map((slide, index) => (
              <button
                key={slide.key}
                type="button"
                className={`hero-slide-dot${index === active ? " is-active" : ""}`}
                onClick={() => go(index)}
                aria-label={`${index + 1}-р зураг`}
                aria-current={index === active}
              >
                {/* The fill is the timer made visible: it drains over exactly
                    SLIDE_MS, so the wait is legible instead of arbitrary. */}
                <span className="hero-slide-dot-fill" data-running={index === active && running ? "true" : "false"} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
