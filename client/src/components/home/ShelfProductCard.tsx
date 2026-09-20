import { Star } from "lucide-react";
import { Link } from "wouter";
import { getSalePercent } from "@shared/catalog-filter";
import { imageSrcSet } from "@shared/image-variants";
import { formatMnt } from "@shared/format";
import { useProductName } from "@/hooks/useProductName";

const fallbackImage = "/product-placeholder.svg";

export type ShelfProduct = {
  id: number;
  slug: string;
  name: string;
  nameMn?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
  priceMnt: number;
  compareAtPriceMnt?: number | null;
  reviewCount?: number;
  avgRating?: number | null;
};

/**
 * The product card of every homepage rail -- 2026-09-12, the reference's
 * card: the rank ("No.1") in a thin gold line ABOVE the card rather than a
 * badge on the photograph, then a white hairline-bordered frame holding the
 * square photograph, a pale band with the brand, the name on two lines, a
 * light 18px price and, when there are real reviews, gold stars. No
 * shadow, no rounded corners, no hover lift -- the frame darkens a touch.
 */
export default function ShelfProductCard({ product, rank }: { product: ShelfProduct; rank?: number }) {
  const salePercent = getSalePercent(product.priceMnt, product.compareAtPriceMnt);
  const names = useProductName()(product);
  return (
    <Link href={`/product/${product.slug}`} className="shelf-card">
      {/* Нэг text node ("No.1") — тусдаа "No." node нь орчуулгын толь бичгийн "No"-тэй таарч япон хэлэнд "いいえ.1" болж байсан. */}
      {rank !== undefined && <span className="shelf-card-rank">{`No.${rank}`}</span>}
      <span className="shelf-card-frame">
        <span className="shelf-card-image">
          {salePercent ? <span className="shop-sale-badge">-{salePercent}%</span> : null}
          <img src={product.imageUrl ?? fallbackImage} alt={names.primary} loading="lazy" {...(imageSrcSet(product.imageUrl, 1600) ? { srcSet: imageSrcSet(product.imageUrl, 1600)!, sizes: "220px" } : {})} />
        </span>
        <span className="shelf-card-body">
          <p>{product.brand ?? "SUGI ASAYAKE"}</p>
          <h3>{names.primary}</h3>
          {names.secondary ? <span className="product-name-secondary">{names.secondary}</span> : null}
          <span className="shelf-card-price">
            <strong>{formatMnt(product.priceMnt)}</strong>
            {salePercent ? <s>{formatMnt(product.compareAtPriceMnt!)}</s> : null}
          </span>
          {!!product.reviewCount && product.reviewCount > 0 && (
            <span className="shelf-card-rating">
              <span className="shelf-card-stars" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => <Star key={index} size={11} fill={index < Math.round(product.avgRating ?? 0) ? "currentColor" : "none"} />)}
              </span>
              {product.avgRating?.toFixed(1)} <em>({product.reviewCount})</em>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
