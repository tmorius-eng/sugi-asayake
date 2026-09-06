import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ProductCardSkeleton } from "@/components/Skeleton";

// NEWVISION.md Tier 1: SUGI has never had a horizontally-scrolling
// "shelf" merchandising rail -- CategoryMasonry is a static grid,
// SeasonalCampaignCarousel is a single fading slide. Native
// overflow-x:auto + scroll-snap (not a JS carousel library) so it's
// cheap, keyboard/trackpad-scrollable for free, and degrades to a
// plain scrollable row if JS never runs.
//
// `emptyState`/`loading` follow this codebase's existing, deliberate
// per-rail discipline (see Home.tsx's bestseller vs recommended
// comments): pass `emptyState={null}` for a rail that should vanish
// entirely when it has nothing real to show (e.g. bestsellers, before
// enough paid orders exist), or a real fallback node for a rail that's
// designed to never be empty (e.g. recommended, category shelves).
//
// prefers-reduced-motion: reduce -> `behavior:"auto"` for the
// prev/next button scroll (instant jump, not smooth) -- unlike the
// sunrise/shop-ribbon/promo-ticker's deliberate always-animate
// exemption (Tom, 2026-09-01/04, explicit and repeated), NOTHING about
// this component asked for that exemption, so it gets the default,
// standard-respecting behavior.
export default function CarouselShelf({
  title,
  eyebrow,
  description,
  viewAllHref,
  viewAllLabel = "Бүгдийг үзэх",
  loading,
  emptyState,
  cardWidth = 220,
  children,
}: {
  // Tom, 2026-09-05 (explicit, re: the 6 category shelves): "X сонголт."
  // repeated the category name a shelf's own eyebrow already shows, just
  // bigger -- optional now so a caller can render just eyebrow +
  // viewAllHref with no h2 at all, instead of every caller being forced
  // into a title.
  title?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  viewAllHref?: string;
  viewAllLabel?: string;
  loading?: boolean;
  emptyState?: ReactNode;
  cardWidth?: number;
  children: ReactNode[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollPrev(el.scrollLeft > 4);
    setCanScrollNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateEdges();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => { el.removeEventListener("scroll", updateEdges); observer.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.length, loading]);

  const scrollBy = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * (cardWidth + 16) * 2, behavior: reduceMotion ? "auto" : "smooth" });
  };

  const isEmpty = !loading && children.length === 0;
  if (isEmpty && emptyState === null) return null;

  return (
    <section className="carousel-shelf-section" data-reveal>
      <div className="carousel-shelf-heading">
        <div>
          {eyebrow ? <p className="eyebrow"><span /> {eyebrow}</p> : null}
          {title ? <h2>{title}</h2> : null}
          {description ? <p className="carousel-shelf-description">{description}</p> : null}
        </div>
        {viewAllHref ? <a className="carousel-shelf-all-link" href={viewAllHref}>{viewAllLabel} <ChevronRight size={16} /></a> : null}
      </div>
      {loading ? (
        <div className="carousel-shelf-track" aria-busy="true" aria-label="Ачаалж байна">
          {Array.from({ length: 6 }, (_, index) => <div className="shelf-card-slot" key={index} style={{ width: cardWidth }}><ProductCardSkeleton /></div>)}
        </div>
      ) : isEmpty ? (
        <div className="carousel-shelf-empty">{emptyState}</div>
      ) : (
        <div className="carousel-shelf-outer">
          <button type="button" className="carousel-shelf-btn prev" onClick={() => scrollBy(-1)} disabled={!canScrollPrev} aria-label="Өмнөх бараанууд"><ChevronLeft size={18} /></button>
          <div className="carousel-shelf-track" ref={trackRef} role="list">
            {children.map((child, index) => <div className="shelf-card-slot" role="listitem" style={{ width: cardWidth }} key={index}>{child}</div>)}
          </div>
          <button type="button" className="carousel-shelf-btn next" onClick={() => scrollBy(1)} disabled={!canScrollNext} aria-label="Дараагийн бараанууд"><ChevronRight size={18} /></button>
        </div>
      )}
    </section>
  );
}
