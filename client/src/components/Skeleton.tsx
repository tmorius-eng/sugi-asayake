// Ердийн spinner-ийн оронд агуулгын хэлбэртэй ачааллын placeholder —
// spinner нь "ямар нэг зүйл болж байна" гэдгийг л хэлдэг бол бодит агуулгатай
// ижил хэмжээ/хэлбэртэй skeleton нь ЮУ, ХААНА ачаалагдахыг ойролцоогоор
// харуулдаг тул өгөгдөл ирэхэд хуудас үсрэхгүй.
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

/**
 * Mimics .bestseller-card's shape (square image + brand line + 2-line
 * title + price). Design consistency audit (2026-09-02): Home.tsx's
 * bestseller/recommended rails used to render nothing at all while their
 * query was still loading -- `{data.length > 0 && ...}` looks identical to
 * "this content doesn't exist" during a fresh load, even though Shop.tsx/
 * ProductDetail.tsx/Profile.tsx already used this Skeleton.tsx pattern for
 * exactly this. Deliberately separate from ProductCardSkeleton, since
 * .bestseller-card's proportions (rank badge, denser padding) aren't the
 * same as .shop-product-card's.
 */
export function BestsellerCardSkeleton() {
  return (
    <div className="bestseller-card skeleton-card">
      <Skeleton style={{ aspectRatio: "1", borderRadius: 0 }} />
      <div>
        <Skeleton className="skeleton-line" style={{ width: "35%", height: "8px" }} />
        <Skeleton className="skeleton-line" style={{ width: "85%", height: "14px", marginTop: "8px" }} />
        <Skeleton className="skeleton-line" style={{ width: "40%", height: "12px", marginTop: "8px" }} />
      </div>
    </div>
  );
}

/** A single text line placeholder, width customizable via style. */
export function LineSkeleton({ width = "100%", height = "13px", style }: { width?: string; height?: string; style?: React.CSSProperties }) {
  return <Skeleton className="skeleton-line" style={{ width, height, ...style }} />;
}
