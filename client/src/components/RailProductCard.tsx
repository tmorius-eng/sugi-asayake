import { Eye } from "lucide-react";
import { Link } from "wouter";
import type { QuickViewProduct } from "@/components/QuickViewDialog";
import { getCategoryPlaceholderImage } from "@shared/catalog-filter";
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
  return <article className="recently-viewed-card">
    <Link href={`/product/${product.slug}`} onClick={() => onRemember?.(product.id)}>
      {/* .recently-viewed-card img is a fixed 104px (112px on mobile)
          thumbnail -- the 600px derivative covers it even at 3x DPR, so
          there is no reason to ship the 1600px original here. Falls back
          to a plain single-source <img> for pre-derivative uploads. */}
      <img src={product.imageUrl ?? getCategoryPlaceholderImage(product.categorySlug)} alt={product.name} loading="lazy" {...(imageSrcSet(product.imageUrl, 1600) ? { srcSet: imageSrcSet(product.imageUrl, 1600)!, sizes: "112px" } : {})} />
      <div><p>{product.brand ?? product.categoryName ?? "SUGI ASAYAKE"}</p><h3>{product.name}</h3><strong>{formatMnt(product.priceMnt)}</strong></div>
    </Link>
    <button type="button" onClick={() => onQuickView(product)} aria-label={`${product.name} шуурхай харах`}>Шуурхай харах <Eye size={14} /></button>
  </article>;
}
