import { Link } from "wouter";

// NEWVISION.md §5 "Топ брэндүүд" -- links to /shop?brand=<real brand name>,
// which now actually filters (see shared/catalog-filter.ts's
// filterCatalogBrand and Shop.tsx's brand URL-state, added alongside this).
export type FeaturedBrandTile = { brandName: string; tagline: string | null; photoUrl: string | null };

export default function BrandTileCard({ brand }: { brand: FeaturedBrandTile }) {
  return (
    <Link href={`/shop?brand=${encodeURIComponent(brand.brandName)}`} className="brand-tile">
      <span className="brand-tile-image" style={brand.photoUrl ? { backgroundImage: `url(${brand.photoUrl})` } : undefined} />
      <span className="brand-tile-body">
        <strong>{brand.brandName}</strong>
        {brand.tagline ? <span>{brand.tagline}</span> : null}
      </span>
    </Link>
  );
}
