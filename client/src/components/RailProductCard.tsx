import { Eye } from "lucide-react";
import { Link } from "wouter";
import type { QuickViewProduct } from "@/components/QuickViewDialog";
import { getCategoryPlaceholderImage, getSalePercent } from "@shared/catalog-filter";
import { imageSrcSet } from "@shared/image-variants";
import { formatMnt } from "@shared/format";

// 2026-09-04 cohesion audit: this exact "small thumbnail + quick-view
// button" card (CSS class .recently-viewed-card, index.css) was independently
// hand-written twice on /shop -- once inside RecommendedForYou.tsx (the
// "Танд зориулан" rail) and again inside Shop.tsx's own local
// RecentlyViewed component (the "Таны сүүлд үзсэн" rail) -- identical
// markup, two copies. One component now; the two callers keep their own
// section-level chrome (heading, empty state, "N unavailable" notice --
// concerns of the SECTION, not the card).
export default function RailProductCard({ product, onRemember, onQuickView }: {
  product: QuickViewProduct;
  onRemember?: (id: number) => void;
  onQuickView: (product: QuickViewProduct) => void;
}) {
  // 2026-09-07 (Tom, bsb.mn reference): every other product card on the site
  // already renders getSalePercent() as a top-corner ".shop-sale-badge" over
  // the image plus a struck-through "was" price (Shop.tsx's grid, Home.tsx's
  // BestsellerRailCard, ProductDetail.tsx, QuickViewDialog.tsx, ShelfProductCard
  // -- all reuse the same helper/class) -- this was the one card that never
  // grew that conditional, so a discounted product here silently showed no
  // discount. Reuses the exact same class/helper rather than inventing a
  // smaller variant, for the "clean, consistent everywhere" outcome Tom asked
  // for -- real data only (compareAtPriceMnt from Aiven), never fabricated.
  const salePercent = getSalePercent(product.priceMnt, product.compareAtPriceMnt);
  return <article className="recently-viewed-card">
    <Link href={`/product/${product.slug}`} onClick={() => onRemember?.(product.id)}>
      {/* .recently-viewed-image is a fixed 104px (112px on mobile) thumbnail
          -- the 600px derivative covers it even at 3x DPR, so there is no
          reason to ship the 1600px original here. Falls back to a plain
          single-source <img> for pre-derivative uploads. */}
      <span className="recently-viewed-image">
        {salePercent ? <span className="shop-sale-badge">-{salePercent}%</span> : null}
        <img src={product.imageUrl ?? getCategoryPlaceholderImage(product.categorySlug)} alt={product.name} loading="lazy" {...(imageSrcSet(product.imageUrl, 1600) ? { srcSet: imageSrcSet(product.imageUrl, 1600)!, sizes: "112px" } : {})} />
      </span>
      <div><p>{product.brand ?? product.categoryName ?? "SUGI ASAYAKE"}</p><h3>{product.name}</h3><strong>{formatMnt(product.priceMnt)}</strong>{salePercent ? <s>{formatMnt(product.compareAtPriceMnt!)}</s> : null}</div>
    </Link>
    <button type="button" onClick={() => onQuickView(product)} aria-label={`${product.name} шуурхай харах`}>Шуурхай харах <Eye size={14} /></button>
  </article>;
}
