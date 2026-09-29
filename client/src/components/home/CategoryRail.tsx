import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * One endless, swipeable row (2026-09-12, Tom: "3 дээр 3 доор биш, бүгдийг
 * нэг мөрөнд, хуруугаараа / хулганаараа swipe хийдэг, endless").
 *
 * How it works, and why this way:
 *
 *   - It is a real horizontally scrolling element with scroll-snap. On a
 *     phone that gives the native swipe, momentum and rubber-banding for
 *     free -- nothing hand-rolled ever feels as right as the OS's own.
 *   - A mouse cannot swipe a scroll container, so pointer events add a
 *     drag for mouse/pen only: press, move, release. Past a few px of
 *     travel the gesture counts as a drag and the click that follows is
 *     swallowed, so dragging over a card never opens it. Touch input is
 *     left entirely to the browser.
 *   - "Endless" is three copies of the list in a row. The view starts on
 *     the middle copy; whenever scrolling drifts into the first or last
 *     copy by more than half a set, the position is shifted by one set
 *     width without animation. The clones are aria-hidden and untabbable,
 *     so a screen reader or keyboard user meets each category exactly
 *     once, in the middle copy.
 *   - Arrows move one card at a time and are the keyboard route.
 */
type Props<T> = {
  items: T[];
  keyOf: (item: T) => string;
  renderCard: (item: T, clone: boolean) => ReactNode;
  ariaLabel: string;
};

const DRAG_THRESHOLD_PX = 8;
const COPIES = 3;

export default function CategoryRail<T>({ items, keyOf, renderCard, ariaLabel }: Props<T>) {
  const railRef = useRef<HTMLDivElement>(null);
  const setWidth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, travelled: 0, pointerId: -1 });
  const suppressClick = useRef(false);

  // One set = the distance between a card and its twin in the next copy.
  // Not scrollWidth / 3: the last copy has no trailing gap, so that divides
  // to a set 8px short and every wrap-around would nudge the view by 8px.
  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return 0;
    const cards = rail.querySelectorAll<HTMLElement>("[data-rail-card]");
    const perCopy = cards.length / COPIES;
    setWidth.current = perCopy > 0 && cards.length > perCopy ? cards[perCopy].offsetLeft - cards[0].offsetLeft : rail.scrollWidth / COPIES;
    return setWidth.current;
  }, []);

  // Start on the middle copy, before the first paint.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail || items.length === 0) return;
    const width = measure();
    rail.scrollLeft = width;
    const onResize = () => {
      const before = setWidth.current || 1;
      const ratio = rail.scrollLeft / before;
      const after = measure();
      rail.scrollLeft = ratio * after;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [items, measure]);

  // Keep the view inside the middle copy; a jump by one set width lands on
  // the identical card, so it is invisible.
  const recentre = useCallback(() => {
    const rail = railRef.current;
    const width = setWidth.current;
    if (!rail || !width) return;
    if (rail.scrollLeft < width * 0.5) rail.scrollLeft += width;
    else if (rail.scrollLeft > width * 1.5) rail.scrollLeft -= width;
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; recentre(); });
    };
    rail.addEventListener("scroll", onScroll, { passive: true });
    return () => { rail.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [recentre]);

  const cardStep = () => {
    const rail = railRef.current;
    const first = rail?.querySelector<HTMLElement>("[data-rail-card]");
    if (!rail || !first) return 0;
    const gap = Number.parseFloat(getComputedStyle(rail).columnGap || getComputedStyle(rail).gap || "0") || 0;
    return first.getBoundingClientRect().width + gap;
  };
  const go = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * cardStep(), behavior: "smooth" });
  };

  // Mouse / pen drag. Touch is the browser's own scrolling.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    const rail = railRef.current;
    if (!rail) return;
    drag.current = { active: true, startX: event.clientX, startLeft: rail.scrollLeft, travelled: 0, pointerId: event.pointerId };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const rail = railRef.current;
    if (!state.active || !rail) return;
    const dx = event.clientX - state.startX;
    state.travelled = Math.max(state.travelled, Math.abs(dx));
    if (state.travelled > DRAG_THRESHOLD_PX && !dragging) {
      setDragging(true);
      rail.setPointerCapture(state.pointerId);
    }
    if (state.travelled > DRAG_THRESHOLD_PX) rail.scrollLeft = state.startLeft - dx;
  };
  const endDrag = () => {
    const state = drag.current;
    const rail = railRef.current;
    if (!state.active) return;
    state.active = false;
    if (state.travelled > DRAG_THRESHOLD_PX) {
      suppressClick.current = true;
      // Let the snap settle on the nearest card once the hand lets go.
      if (rail && rail.hasPointerCapture(state.pointerId)) rail.releasePointerCapture(state.pointerId);
    }
    setDragging(false);
  };
  // 2026-09-27: pointercancel (system interrupt -- e.g. a browser gesture
  // stealing the pointer mid-drag) never fires the click event that would
  // otherwise clear suppressClick, so it stayed true forever and silently
  // ate the very next genuine click anywhere on the rail.
  const onPointerCancel = () => {
    endDrag();
    setTimeout(() => { suppressClick.current = false; }, 0);
  };
  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="cat-rail-wrap">
      <div
        ref={railRef}
        className={`cat-rail${dragging ? " is-dragging" : ""}`}
        role="region"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={onPointerCancel}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
      >
        {Array.from({ length: COPIES }, (_, copy) => items.map(item => {
          const clone = copy !== 1;
          return (
            <div className="cat-rail-card" data-rail-card="" key={`${keyOf(item)}-${copy}`} aria-hidden={clone || undefined}>
              {renderCard(item, clone)}
            </div>
          );
        }))}
      </div>
      <div className="fbrand-arrows cat-rail-arrows" role="group" aria-label="Ангиллын навигаци">
        <button type="button" className="fbrand-arrow" onClick={() => go(-1)} aria-label="Өмнөх ангилал"><ChevronLeft size={22} /></button>
        <button type="button" className="fbrand-arrow" onClick={() => go(1)} aria-label="Дараагийн ангилал"><ChevronRight size={22} /></button>
      </div>
    </div>
  );
}
