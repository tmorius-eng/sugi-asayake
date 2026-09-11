import type { QuickViewProduct } from "@/components/QuickViewDialog";
import RailProductCard from "@/components/RailProductCard";
import { useSiteText } from "@/hooks/useSiteText";

/**
 * Preference Profile v2 (2026-09-01): extracted out of Shop.tsx (where this
 * originated as PREMIUM-FEATURES.md TIER 1's "recommended for you" rail).
 * See server/db.ts's getRecommendedProducts for how the list is scored.
 * Always has content now (guest and never-tagged shoppers both get a
 * bestseller-backed fallback server-side), so this no longer needs an
 * isAuthenticated gate the way it used to.
 *
 * 2026-09-04 cohesion audit: the doc-comment here used to claim "so Home.tsx
 * can reuse the exact same card markup" -- false in the current code, Home
 * never imports this component and reimplements its own bestseller-style
 * card instead (see Home.tsx's BestsellerRailCard). What this component's
 * card markup IS genuinely shared with is Shop.tsx's own RecentlyViewed
 * section, via the extracted RailProductCard below.
 */
export type RecommendedForYouProps = {
  products: QuickViewProduct[];
  onRemember: (id: number) => void;
  onQuickView: (product: QuickViewProduct) => void;
};

export default function RecommendedForYou({ products, onRemember, onQuickView }: RecommendedForYouProps) {
  const textFor = useSiteText();
  const [recommendedLine1, recommendedLine2] = textFor("shop-text-recommended-heading", "Танд\nсанал болгож байна.").split("\n");
  if (!products.length) return null;
  return <section className="recently-viewed-section" data-reveal>
    <div className="recently-viewed-heading">
      <div>
        <p className="shop-kicker"><span /> {textFor("shop-text-recommended-kicker", "ТАНД ЗОРИУЛАН")}</p>
        <h2>{recommendedLine1} <em>{recommendedLine2}</em></h2>
      </div>
      <p>{textFor("shop-text-recommended-description", "Таны профайл дээр хадгалсан арьсны төрөл, арчилгааны сонирхол, интерьер загварт тохирсон бүтээгдэхүүнүүд.")}</p>
    </div>
    <div className="recently-viewed-grid">{products.map(product => <RailProductCard product={product} onRemember={onRemember} onQuickView={onQuickView} key={product.id} />)}</div>
  </section>;
}
