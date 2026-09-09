/**
 * SUGI ASAYAKE professional direction: quiet Japanese retail authority with a
 * warm paper base, disciplined vermilion accents, editorial spacing, and clear
 * trust / shop / visit actions. This page intentionally avoids heavy overlays,
 * novelty effects, and oversized template-like compositions.
 *
 * 2026-09-06 homepage consolidation (external design review + Tom's explicit
 * "cut to ~6 sections" call -- see CLAUDE.md): the page used to stack up to
 * ~9 rail-like carousel blocks with almost no break between them (2
 * identical bestseller/recommended rails back-to-back, then up to 6 more
 * per-category rails with zero break), plus 3 separate sections doing
 * overlapping "why choose us" trust messaging. Retired from THIS page's
 * render tree (not from the codebase -- every component, its backend, and
 * its admin CRUD stay intact and reusable elsewhere, this is a JSX-level
 * change only): the per-category CarouselShelf loop, SeasonalCampaignCarousel,
 * JournalSection (still lives at /journal), and the standalone
 * customer-voices-section (its real reviews now show as a compact strip
 * inside BrandStorySection instead). Top Brands was briefly retired here
 * too, then restored the same day at Tom's explicit "must have" -- back in
 * its original position, between BrandStorySection and CategoryMasonry.
 * Final structure: Hero -> Quick Stats -> BrandStorySection (merges the old
 * story-section + WhyChooseUs + review strip) -> Top Brands rail ->
 * CategoryMasonry -> Bestseller rail -> Recommended rail -> EditorialBanner
 * (the old care-section's real content, restyled via the already-built-
 * but-previously-unused EditorialBanner primitive) -> StoreLocatorSection
 * -> Footer (absorbing the old standalone final-cta as an opt-in banner,
 * see SiteFooter.tsx).
 */
import { Fragment, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import CartDrawer from "@/components/CartDrawer";
import CommerceHeader from "@/components/CommerceHeader";
import SiteFooter from "@/components/SiteFooter";
import { footerLogoUrl, footerSocials } from "@/components/site-footer-data";
import HeroSection from "@/components/home/HeroSection";
import CategoryMasonry from "@/components/home/CategoryMasonry";
import BrandStorySection from "@/components/home/BrandStorySection";
import EditorialBanner from "@/components/home/EditorialBanner";
import StoreLocatorSection from "@/components/home/StoreLocatorSection";
import QuickStatsSection from "@/components/home/QuickStatsSection";
import BrandTileCard from "@/components/home/BrandTileCard";
import CarouselShelf from "@/components/home/CarouselShelf";
import { BestsellerCardSkeleton } from "@/components/Skeleton";
import { imageSrcSet } from "@shared/image-variants";
import { getSalePercent } from "@shared/catalog-filter";
import { categories } from "@/components/home/categories-data";
import { useSiteText } from "@/hooks/useSiteText";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";

// These have no bundled fallback photo (unlike product shots, there's no
// generic stand-in for real store/lifestyle photography) -- null here
// means "nothing to show until an admin uploads one for this slot", which
// lets the .hero-image/.cat-mosaic-anchor/.editorial-banner-image CSS
// gradient show through instead of a broken <img>. Upload real photos via
// /admin -> Content & Media for slots: home-hero, home-categories,
// home-family.
const heroImage = null;
const assortmentImage = "/product-placeholder.svg";
const familyImage = null;
const symbolImage = "/cdn/sugi-symbol_0a534a76.png";

const bestsellerFallbackImage = "/product-placeholder.svg";

// 2026-09-04 cohesion audit: the bestseller and recommended rails below used
// to each hand-write their own copy of this exact card markup -- identical
// except the bestseller version showed a rank badge and a rating, the
// recommended version showed neither. The missing rank badge on recommended
// cards is intentional (rank only means something for a "top sellers"
// ranking); the missing rating had no such reason -- a recommended product
// with real reviews just never showed them, purely because that copy of the
// markup happened not to include the conditional. One component now, `rank`
// optional, rating shown on both whenever reviewCount > 0.
// reviewCount/avgRating are optional, not just nullable: getRecommendedProducts'
// cold-start fallback tier (see server/db.ts) returns a leaner product shape
// with no review-stats columns at all when preference/bestseller matches run
// out, distinct from the bestseller rail's product shape which always has them.
//
// 2026-09-06 (design review): compareAtPriceMnt was missing from this card's
// type/markup entirely -- both getBestsellingProducts and getRecommendedProducts
// already select it (confirmed in server/db.ts), and the near-identical
// ShelfProductCard already renders a sale badge from it, so a discounted
// product on this rail simply never showed its discount, purely because
// this copy of the card markup never grew the conditional the other one has.
type BestsellerRailProduct = { id: number; slug: string; name: string; brand?: string | null; imageUrl?: string | null; priceMnt: number; compareAtPriceMnt?: number | null; reviewCount?: number; avgRating?: number | null };
function BestsellerRailCard({ product, rank }: { product: BestsellerRailProduct; rank?: number }) {
  const salePercent = getSalePercent(product.priceMnt, product.compareAtPriceMnt);
  return <Link href={`/product/${product.slug}`} className="bestseller-card">
    {rank !== undefined && <span className="bestseller-rank">{rank}</span>}
    {salePercent ? <span className="shop-sale-badge">-{salePercent}%</span> : null}
    {/* .bestseller-grid is 6-up desktop / 3-up under 980px, so each card
        image renders around 120-220 CSS px -- the 600px derivative covers
        it; null (plain <img>) for pre-derivative uploads. See
        shared/image-variants.ts. */}
    <img src={product.imageUrl ?? bestsellerFallbackImage} alt={product.name} loading="lazy" {...(imageSrcSet(product.imageUrl, 1600) ? { srcSet: imageSrcSet(product.imageUrl, 1600)!, sizes: "(max-width: 980px) 31vw, 16vw" } : {})} />
    <div>
      <p>{product.brand ?? "SUGI ASAYAKE"}</p>
      <h3>{product.name}</h3>
      {!!product.reviewCount && product.reviewCount > 0 && <span className="bestseller-rating"><Star size={11} fill="#17181b" stroke="#17181b" /> {product.avgRating?.toFixed(1)} <em>({product.reviewCount})</em></span>}
      <strong>{formatMnt(product.priceMnt)}</strong>
      {salePercent ? <s className="bestseller-compare-price">{formatMnt(product.compareAtPriceMnt!)}</s> : null}
    </div>
  </Link>;
}

export default function Home() {
  const [cartOpen, setCartOpen] = useState(false);
  // NEWVISION.md §8: Home used to have no cart integration in its header at
  // all -- a signed-in shopper browsing the homepage had no way to see
  // their cart without navigating to /shop first. Same trpc.cart.current
  // pattern every other page already uses.
  const cart = trpc.cart.current.useQuery();
  const cartCount = cart.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const siteMediaQuery = trpc.content.siteMedia.useQuery();
  // matsukiyococokara-online.com's 売れ筋ランキング (bestseller ranking) —
  // adapted as a real-data section, not a curated list. See
  // getBestsellingProducts in server/db.ts.
  const bestsellersQuery = trpc.catalog.bestsellers.useQuery();
  const bestsellers = bestsellersQuery.data ?? [];
  // Preference Profile v2 (2026-09-01): same public, always-populated (guest
  // and never-tagged shoppers get a bestseller-backed fallback server-side,
  // see getRecommendedProducts) endpoint /shop's RecommendedForYou uses --
  // reuses the bestseller rail's own card markup rather than /shop's
  // Recently-Viewed-style interactive card (no quick-view/remember affordance
  // exists on this page), so it reads as one consistent product-rail family.
  const recommendedQuery = trpc.catalog.recommended.useQuery();
  const recommended = recommendedQuery.data ?? [];
  // 2026-09-04 cohesion audit: the hero badge's "800+" used to be hardcoded
  // directly in HeroSection.tsx with no way to update it short of a code
  // deploy -- real count is 937 today. Rounds down to the nearest hundred so
  // it still reads as marketing copy ("900+") rather than an oddly precise
  // number, and can never overstate the real published catalog size. "…+"
  // while still loading, matching this page's other "don't show 0 while
  // fetching" conventions.
  const publishedCountQuery = trpc.catalog.publishedCount.useQuery();
  const productCountLabel = publishedCountQuery.data === undefined ? "…+" : `${Math.floor(publishedCountQuery.data / 100) * 100}+`;
  // "Controls everything" admin overhaul (2026-09-08, Phase J): replaces
  // locations-data.ts's hardcoded array length. Falls back to 4 (today's
  // real, live count) only for the brief instant before this loads, so it
  // never flashes a wrong/zero number -- corrected to the real live count
  // within one render either way.
  const branchesQuery = trpc.content.branches.useQuery();
  const branchCount = branchesQuery.data?.length ?? 4;
  // NEWVISION.md §6: real reviews only, hidden entirely (in BrandStorySection)
  // rather than padding itself with lower-rated/commentless reviews.
  const featuredReviewsQuery = trpc.reviews.featured.useQuery();
  const featuredReviews = featuredReviewsQuery.data ?? [];
  // NEWVISION.md §5 -- restored 2026-09-06 (Tom, same day it was briefly
  // retired during the design-review consolidation): hides entirely when
  // no brands are curated yet, same discipline as every other rail here.
  const featuredBrandsQuery = trpc.catalog.featuredBrands.useQuery();
  const featuredBrands = featuredBrandsQuery.data ?? [];
  const mediaBySlot = useMemo(() => new Map((siteMediaQuery.data ?? []).map(media => [media.slotKey, media.imageUrl])), [siteMediaQuery.data]);
  const imageFor = (slotKey: string, fallbackUrl: string | null) => mediaBySlot.get(slotKey) || fallbackUrl;
  // Only sets an inline background-image when there's an actual URL --
  // omitting the property entirely (rather than pointing it at a known-bad
  // URL) is what lets the CSS gradient fallback on these classes show
  // through until a real photo is uploaded for the slot.
  const bgStyle = (slotKey: string, fallbackUrl: string | null) => {
    const url = imageFor(slotKey, fallbackUrl);
    return url ? { backgroundImage: `url(${url})` } : undefined;
  };
  const textFor = useSiteText();
  const [bestsellerHeadingLine1, bestsellerHeadingLine2] = textFor("home-text-bestseller-heading", "Их зарагддаг\nбараанууд.").split("\n");
  const [careHeadingLine1, careHeadingLine2] = textFor("home-text-care-heading", "Багахан итгэл.\nИх халамж.").split("\n");
  const [finalCtaHeadingLine1, finalCtaHeadingLine2] = textFor("home-text-finalcta-heading", "Сайн сонголт\nойрхон байна.").split("\n");
  // The 3 phrases in the infinite sunrise-ribbon marquee below the hero.
  // Resolved once here and rendered via ribbonRow() into BOTH the visible
  // and the aria-hidden duplicate row, so an admin edit can never make the
  // two rows drift out of sync with each other.
  const ribbonPhrases = [
    textFor("home-text-ribbon-phrase1", "JAPANESE DAILY CARE"),
    textFor("home-text-ribbon-phrase2", "УЛААНБААТАР / MONGOLIA"),
    textFor("home-text-ribbon-phrase3", "ГЭР БҮЛИЙН ГИШҮҮН БҮРТ"),
  ];
  const ribbonRow = (keyPrefix: string) => (
    <>
      {ribbonPhrases.map((phrase, index) => (
        <Fragment key={`${keyPrefix}-${index}`}><span>{phrase}</span><i /></Fragment>
      ))}
    </>
  );

  return (
    <div className="sugi-site" id="top">
      <CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE" marketingNav />

      <main>
        <HeroSection heroImageStyle={bgStyle("home-hero", heroImage)} productCountLabel={productCountLabel} />

        <div className="sunrise-ribbon" aria-label="SUGI ASAYAKE brand promise">
          <div>{ribbonRow("ribbon-a")}</div>
          <div aria-hidden="true">{ribbonRow("ribbon-b")}</div>
        </div>

        {/* Home redesign Tier 7 -- replaces the old membership-strip promo
            panel (generic "3-10%" prose, no real data) with a real,
            server-authoritative membership summary. See
            client/src/components/home/QuickStatsSection.tsx. */}
        <QuickStatsSection />

        <BrandStorySection branchCount={branchCount} productCountLabel={productCountLabel} featuredReviews={featuredReviews} />

        {/* Restored 2026-09-06 (Tom: "we need Top Brands, must have!!") --
            same CarouselShelf horizontal-scroll primitive as the bestseller/
            recommended/category rails, real admin-curated brands only. See
            AdminBrandsPanel.tsx for the CRUD side; #top-brands is the header
            nav's anchor target. */}
        {featuredBrands.length > 0 && (
          <div id="top-brands">
            <CarouselShelf eyebrow={textFor("home-text-brands-eyebrow", "ТОП БРЭНД")} title={textFor("home-text-brands-heading", "Тансаг брэндүүд.")} cardWidth={240}>
              {featuredBrands.map(brand => <BrandTileCard brand={brand} key={brand.id} />)}
            </CarouselShelf>
          </div>
        )}

        <CategoryMasonry
          categories={categories.map(category => ({
            ...category,
            // Admin-uploaded photo (via /admin -> Content & Media, slot
            // "home-category-<slug>") wins if one exists; otherwise falls
            // back to the real catalog product photo already on the
            // category object. Same imageFor() pattern as every other
            // homepage image slot -- see shared/site-media.ts.
            imageUrl: imageFor(`home-category-${category.slug}`, category.imageUrl ?? null) ?? undefined,
          }))}
          anchorImageStyle={bgStyle("home-categories", assortmentImage)}
          symbolImage={symbolImage}
        />

        {/* matsukiyococokara-online.com's 売れ筋ランキング (bestseller ranking)
            section, adapted: real paid-order history via getBestsellingProducts,
            not a manually curated "featured" list. Hidden entirely (not shown
            with an empty state) once loaded with zero results — same "don't
            show a placeholder" rule as RecentlyViewed/RecommendedForYou on
            /shop. A skeleton grid (isLoading branch below) makes the loading
            state visible, matching Shop.tsx/ProductDetail.tsx/Profile.tsx. */}
        {bestsellersQuery.isLoading ? (
          <section className="bestseller-section" data-reveal aria-busy="true" aria-label="Онцлох сонголтуудыг бэлдэж байна">
            <div className="bestseller-heading">
              <div><p className="shop-kicker"><TrendingUp size={12} /> {textFor("home-text-bestseller-kicker", "ОНЦЛОХ СОНГОЛТ")}</p><h2>{bestsellerHeadingLine1}<br /><em>{bestsellerHeadingLine2}</em></h2></div>
              <p>{textFor("home-text-bestseller-description", "Манай захиалгын бодит түүхээр эрэмбэлсэн, хамгийн их итгэл олсон сонголтууд.")}</p>
            </div>
            <div className="bestseller-grid">{Array.from({ length: 6 }, (_, index) => <BestsellerCardSkeleton key={index} />)}</div>
          </section>
        ) : bestsellers.length > 0 && (
          <section className="bestseller-section" data-reveal>
            <div className="bestseller-heading">
              <div><p className="shop-kicker"><TrendingUp size={12} /> {textFor("home-text-bestseller-kicker", "ОНЦЛОХ СОНГОЛТ")}</p><h2>{bestsellerHeadingLine1}<br /><em>{bestsellerHeadingLine2}</em></h2></div>
              <p>{textFor("home-text-bestseller-description", "Манай захиалгын бодит түүхээр эрэмбэлсэн, хамгийн их итгэл олсон сонголтууд.")}</p>
            </div>
            <div className="bestseller-grid">
              {bestsellers.slice(0, 6).map((product, index) => <BestsellerRailCard product={product} rank={index + 1} key={product.id} />)}
            </div>
            <Link href="/shop" className="bestseller-all-link">{textFor("home-text-bestseller-all-link", "Бүх бүтээгдэхүүн үзэх")} <ArrowUpRight size={16} /></Link>
          </section>
        )}

        {/* Preference Profile v2 (2026-09-01): reuses catalog.recommended,
            the same endpoint /shop's "ТАНД ЗОРИУЛАН" rail uses -- now public
            and always backed by a bestseller fallback server-side, so this
            only hides on a genuinely failed/loading request, not "no
            preferences yet". */}
        {recommendedQuery.isLoading ? (
          <section className="bestseller-section" data-reveal aria-busy="true" aria-label="Танд санал болгож буй бүтээгдэхүүнийг бэлдэж байна">
            {(() => {
              const [line1, line2] = textFor("home-text-recommended-heading", "Танд санал\nболгож байна.").split("\n");
              return <div className="bestseller-heading">
                <div><p className="shop-kicker"><Sparkles size={12} /> {textFor("home-text-recommended-kicker", "ТАНД ЗОРИУЛАН")}</p><h2>{line1}<br /><em>{line2}</em></h2></div>
                <p>{textFor("home-text-recommended-description", "Таны профайл дээр хадгалсан тохиргоо, эсвэл манай хамгийн эрэлттэй сонголтуудад тулгуурласан жагсаалт.")}</p>
              </div>;
            })()}
            <div className="bestseller-grid">{Array.from({ length: 6 }, (_, index) => <BestsellerCardSkeleton key={index} />)}</div>
          </section>
        ) : recommended.length > 0 && (
          <section className="bestseller-section" data-reveal>
            {(() => {
              const [line1, line2] = textFor("home-text-recommended-heading", "Танд санал\nболгож байна.").split("\n");
              return <div className="bestseller-heading">
                <div><p className="shop-kicker"><Sparkles size={12} /> {textFor("home-text-recommended-kicker", "ТАНД ЗОРИУЛАН")}</p><h2>{line1}<br /><em>{line2}</em></h2></div>
                <p>{textFor("home-text-recommended-description", "Таны профайл дээр хадгалсан тохиргоо, эсвэл манай хамгийн эрэлттэй сонголтуудад тулгуурласан жагсаалт.")}</p>
              </div>;
            })()}
            <div className="bestseller-grid">
              {recommended.slice(0, 6).map(product => <BestsellerRailCard product={product} key={product.id} />)}
            </div>
          </section>
        )}

        {/* 2026-09-06: the old hand-rolled .care-section markup (image half +
            text half + a rotated "sun stamp" badge) replaced by the
            already-built-but-previously-unused EditorialBanner primitive
            (NEWVISION.md Tier 2 generalized exactly this split, but nothing
            ever called it) -- same real content (heading/description/3
            points, all still admin-editable via the same site-text slots),
            no decorative circle badge. */}
        <EditorialBanner
          variant="image-left"
          tag={textFor("home-text-care-tag", "03 / FAMILY CARE")}
          eyebrow={textFor("home-text-care-eyebrow", "ГЭР БҮЛИЙН ӨДӨР БҮРТ")}
          headingLine1={careHeadingLine1}
          headingLine2={careHeadingLine2}
          description={textFor("home-text-care-description", "Бидний сонголт зөвхөн бүтээгдэхүүн биш. Таны гэр бүлийн өдөр тутмын амар тайван байдал, итгэл, халамж юм.")}
          points={[
            textFor("home-text-care-point1", "Баталгаат Япон бүтээгдэхүүн"),
            textFor("home-text-care-point2", "Гэр бүл бүрт зориулсан сонголт"),
            textFor("home-text-care-point3", "24–48 цагийн дотор Улаанбаатарт хүргэнэ"),
          ]}
          imageStyle={bgStyle("home-family", familyImage)}
          imageAlt="SUGI ASAYAKE-ийн гэр бүлийн арчилгааны бүтээгдэхүүнүүд"
        />

        <StoreLocatorSection />
      </main>

      <SiteFooter
        logoUrl={footerLogoUrl}
        socials={footerSocials}
        ctaBanner={{
          eyebrow: textFor("home-text-finalcta-eyebrow", "NEED A LITTLE HELP?"),
          headingLine1: finalCtaHeadingLine1,
          headingLine2: finalCtaHeadingLine2,
          phoneLabel: "9450-9911",
        }}
      />
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </div>
  );
}
