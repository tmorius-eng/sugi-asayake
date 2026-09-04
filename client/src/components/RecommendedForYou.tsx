import { Eye } from "lucide-react";
import { Link } from "wouter";
import type { QuickViewProduct } from "@/components/QuickViewDialog";
import { getCategoryPlaceholderImage } from "@shared/catalog-filter";
import { imageSrcSet } from "@shared/image-variants";
import { formatMnt } from "@shared/format";


/**
 * Preference Profile v2 (2026-09-01): extracted out of Shop.tsx (where this
 * originated as PREMIUM-FEATURES.md TIER 1's "recommended for you" rail) so
 * Home.tsx can reuse the exact same card markup -- see
 * server/db.ts's getRecommendedProducts for how the list is scored. Always
 * has content now (guest and never-tagged shoppers both get a
 * bestseller-backed fallback server-side), so this no longer needs an
 * isAuthenticated gate the way it used to.
 */
export type RecommendedForYouProps = {
  products: QuickViewProduct[];
  onRemember: (id: number) => void;
  onQuickView: (product: QuickViewProduct) => void;
};

export default function RecommendedForYou({ products, onRemember, onQuickView }: RecommendedForYouProps) {
  if (!products.length) return null;
  return <section className="recently-viewed-section" data-reveal>
    <div className="recently-viewed-heading">
      <div>
        <p className="shop-kicker"><span /> ТАНД ЗОРИУЛАН</p>
        <h2>Танд <em>санал болгож байна.</em></h2>
      </div>
      <p>Таны профайл дээр хадгалсан арьсны төрөл, арчилгааны сонирхол, интерьер загварт тохирсон бүтээгдэхүүнүүд.</p>
    </div>
    <div className="recently-viewed-grid">{products.map(product => <article className="recently-viewed-card" key={product.id}>
      <Link href={`/product/${product.slug}`} onClick={() => onRemember(product.id)}>
        {/* .recently-viewed-card img is a fixed 104px (112px on mobile)
            thumbnail -- the 600px derivative covers it even at 3x DPR, so
            there is no reason to ship the 1600px original here. Falls back
            to a plain single-source <img> for pre-derivative uploads. */}
        <img src={product.imageUrl ?? getCategoryPlaceholderImage(product.categorySlug)} alt={product.name} loading="lazy" {...(imageSrcSet(product.imageUrl, 1600) ? { srcSet: imageSrcSet(product.imageUrl, 1600)!, sizes: "112px" } : {})} />
        <div><p>{product.brand ?? product.categoryName ?? "SUGI ASAYAKE"}</p><h3>{product.name}</h3><strong>{formatMnt(product.priceMnt)}</strong></div>
      </Link>
      <button type="button" onClick={() => onQuickView(product)} aria-label={`${product.name} шуурхай харах`}>Шуурхай харах <Eye size={14} /></button>
    </article>)}</div>
  </section>;
}
