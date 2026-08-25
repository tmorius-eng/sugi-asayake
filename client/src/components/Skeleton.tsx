// A content-shaped loading placeholder instead of a generic spinner —
// spinners tell a shopper "something is happening" but a skeleton the same
// size/shape as the real content tells them roughly WHAT's about to load
// and where it'll sit, so the page doesn't visibly jump once data arrives.
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Mimics .shop-product-card's shape (image + brand line + title + price row). */
export function ProductCardSkeleton() {
  return (
    <div className="shop-product-card skeleton-card">
      <div className="shop-product-image"><Skeleton style={{ position: "absolute", inset: 0, borderRadius: 0 }} /></div>
      <div className="shop-product-copy">
        <Skeleton className="skeleton-line" style={{ width: "40%", height: "9px" }} />
        <Skeleton className="skeleton-line" style={{ width: "85%", height: "15px", marginTop: "10px" }} />
        <Skeleton className="skeleton-line" style={{ width: "60%", height: "11px", marginTop: "6px" }} />
        <Skeleton className="skeleton-line" style={{ width: "35%", height: "24px", marginTop: "19px" }} />
      </div>
    </div>
  );
}

/** A single text line placeholder, width customizable via style. */
export function LineSkeleton({ width = "100%", height = "13px", style }: { width?: string; height?: string; style?: React.CSSProperties }) {
  return <Skeleton className="skeleton-line" style={{ width, height, ...style }} />;
}
