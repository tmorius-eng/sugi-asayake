import { Star } from "lucide-react";
import { Link } from "wouter";
import { getSalePercent } from "@shared/catalog-filter";
import { imageSrcSet } from "@shared/image-variants";
import { formatMnt } from "@shared/format";

const fallbackImage = "/product-placeholder.svg";

// NEWVISION.md Tier 1: the card CarouselShelf renders for bestsellers,
// recommended, and each of the 6 category shelves. Reuses
// getSalePercent()/.shop-sale-badge (already proven on /shop) rather than
// inventing a second sale-badge convention -- see the Phase B commit that
// consolidated this exact bestseller/recommended card duplication in
// Home.tsx (BestsellerRailCard) for why reviewCount/avgRating are optional:
// getRecommendedProducts' cold-start fallback tier returns a leaner shape
// with no review-stats columns at all.
export type ShelfProduct = {
  id: number;
  slug: string;
  name: string;
  brand?: string | null;
  imageUrl?: string | null;
  priceMnt: number;
  compareAtPriceMnt?: number | null;
  reviewCount?: number;
  avgRating?: number | null;
};

export default function ShelfProductCard({ product, rank }: { product: ShelfProduct; rank?: number }) {
  const salePercent = getSalePercent(product.priceMnt, product.compareAtPriceMnt);
  return (
    <Link href={`/product/${product.slug}`} className="shelf-card">
      <div className="shelf-card-image">
        {rank !== undefined && <span className="shelf-card-rank">{rank}</span>}
        {salePercent ? <span className="shop-sale-badge">-{salePercent}%</span> : null}
        <img src={product.imageUrl ?? fallbackImage} alt={product.name} loading="lazy" {...(imageSrcSet(product.imageUrl, 1600) ? { srcSet: imageSrcSet(product.imageUrl, 1600)!, sizes: "220px" } : {})} />
      </div>
      <div className="shelf-card-body">
        <p>{product.brand ?? "SUGI ASAYAKE"}</p>
        <h3>{product.name}</h3>
        {!!product.reviewCount && product.reviewCount > 0 && <span className="shelf-card-rating"><Star size={11} fill="#17181b" stroke="#17181b" /> {product.avgRating?.toFixed(1)} <em>({product.reviewCount})</em></span>}
        <div className="shelf-card-price">
          <strong>{formatMnt(product.priceMnt)}</strong>
          {salePercent ? <s>{formatMnt(product.compareAtPriceMnt!)}</s> : null}
        </div>
      </div>
    </Link>
  );
}
