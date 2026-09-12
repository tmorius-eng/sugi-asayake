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
import { useMemo, useState } from "react";
import CartDrawer from "@/components/CartDrawer";
import CommerceHeader from "@/components/CommerceHeader";
import SiteFooter from "@/components/SiteFooter";
import HeroSection from "@/components/home/HeroSection";
import CategoryMasonry from "@/components/home/CategoryMasonry";
import BrandStorySection from "@/components/home/BrandStorySection";
import EditorialBanner from "@/components/home/EditorialBanner";
import StoreLocatorSection from "@/components/home/StoreLocatorSection";
import QuickStatsSection from "@/components/home/QuickStatsSection";
import FeaturedBrandsCarousel from "@/components/home/FeaturedBrandsCarousel";
import KeywordChips from "@/components/home/KeywordChips";
import CarouselShelf from "@/components/home/CarouselShelf";
import ShelfProductCard from "@/components/home/ShelfProductCard";
import { useCategories } from "@/hooks/useCategories";
import { useShopContact } from "@/hooks/useShopContact";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { useSiteText } from "@/hooks/useSiteText";
import { trpc } from "@/lib/trpc";

// These have no bundled fallback photo (unlike product shots, there's no
// generic stand-in for real store/lifestyle photography) -- null here
// means "nothing to show until an admin uploads one for this slot", which
// lets the .hero-image/.cat-mosaic-anchor/.editorial-banner-image CSS
// gradient show through instead of a broken <img>. Upload real photos via
// /admin -> Content & Media for slots: home-hero, home-categories,
// home-family.
const assortmentImage = "/product-placeholder.svg";
const familyImage = null;
const symbolImage = "/cdn/sugi-symbol_0a534a76.png";

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
  const contact = useShopContact();
  // The catalogue categories, from the database rather than a hardcoded
  // array -- see useCategories() for how the photo/icon halves are joined.
  const categories = useCategories();
  // The homepage previously relied on index.html's static <title>; it now
  // owns its own so an admin can edit what Google and a shared link show.
  // {N} is the live branch count, never a hardcoded "3".
  useDocumentMeta(
    textFor("seo-text-home-title", "SUGI ASAYAKE Mongolia — Япон чанарыг гэр бүл бүрт"),
    textFor("seo-text-home-description", "SUGI ASAYAKE Mongolia — Японоос баталгаат бүтээгдэхүүнүүдийг албан ёсны эрхтэйгээр хүргэж байна. Улаанбаатар хотод {N} салбартай.").replace("{N}", String(branchCount)),
  );
  const [careHeadingLine1, careHeadingLine2] = textFor("home-text-care-heading", "Багахан итгэл.\nИх халамж.").split("\n");
  const [finalCtaHeadingLine1, finalCtaHeadingLine2] = textFor("home-text-finalcta-heading", "Сайн сонголт\nойрхон байна.").split("\n");
  return (
    <div className="sugi-site" id="top">
      <CommerceHeader cartCount={cartCount} onCartOpen={() => setCartOpen(true)} backLabel="SUGI ASAYAKE" marketingNav />

      <main>
        <HeroSection imageFor={imageFor} productCountLabel={productCountLabel} branchCount={branchCount} />

        {/* The reference's popular-keyword box, built from this shop's own
            real categories and featured brands rather than invented terms. */}
        <KeywordChips categories={categories} brands={featuredBrands} />

        {/* matsukiyococokara-online.com's bestseller ranking, adapted:
            real paid-order history via getBestsellingProducts, never a
            curated list. 2026-09-12: the 6-up grid of shadowed cards became
            the reference's own shape -- one horizontal rail of bordered
            cards under a centred heading, each rank set as "No.1" above its
            card. CarouselShelf/ShelfProductCard are the primitives
            ProductDetail already uses, so the site has one product-card
            treatment rather than two. emptyState={null} keeps the existing
            rule: hidden entirely once loaded with zero results. */}
        {(bestsellersQuery.isLoading || bestsellers.length > 0) && (
          <CarouselShelf
            title={textFor("home-text-bestseller-heading", "Их зарагддаг\nбараанууд.").split("\n").join(" ")}
            viewAllHref="/shop"
            viewAllLabel={textFor("home-text-bestseller-all-link", "Бүх бүтээгдэхүүн үзэх")}
            loading={bestsellersQuery.isLoading}
            emptyState={null}
          >
            {bestsellers.map((product, index) => <ShelfProductCard product={product} rank={index + 1} key={product.id} />)}
          </CarouselShelf>
        )}

        {/* Preference Profile v2 (2026-09-01): the same catalog.recommended
            endpoint /shop's rail uses -- public, and backed by a bestseller
            fallback server-side, so this hides only on a genuinely failed
            request rather than on "no preferences yet". No rank number here:
            a recommendation is not a ranking. */}
        {(recommendedQuery.isLoading || recommended.length > 0) && (
          <CarouselShelf
            title={textFor("home-text-recommended-heading", "Танд санал\nболгож байна.").split("\n").join(" ")}
            loading={recommendedQuery.isLoading}
            emptyState={null}
          >
            {recommended.map(product => <ShelfProductCard product={product} key={product.id} />)}
          </CarouselShelf>
        )}

        {/* Restored 2026-09-06 (Tom: "we need Top Brands, must have!!"), then
            rebuilt 2026-09-10 against matsuyaginza.com/en's "Featured Brands"
            at Tom's request -- the CarouselShelf/BrandTileCard version was a
            static row of shadowed, rounded tiles with the name overlaid on the
            photo ("zgrl neg durvuljin tegsen shadow edrtei utaggui"). The old
            home-text-brands-eyebrow/-heading slots went with it: Tom asked for
            "Тансаг брэндүүд." to be deleted outright, and the reference has no
            eyebrow at all. See AdminBrandsPanel.tsx for the CRUD side (it now
            takes a brand logo too); #top-brands is the header nav's anchor. */}
        {featuredBrands.length > 0 && (
          <div id="top-brands">
            <FeaturedBrandsCarousel
              brands={featuredBrands}
              heading={textFor("home-text-featured-brands-heading", "Онцлох брэндүүд")}
            />
          </div>
        )}

        {/* Photo precedence (admin upload -> the category's own imageUrl
            -> this codebase's per-slot default -> placeholder) is resolved
            inside useCategories(), so every surface that shows a category
            picture resolves it the same way. */}
        <CategoryMasonry
          categories={categories}
          anchorImageStyle={bgStyle("home-categories", assortmentImage)}
          symbolImage={symbolImage}
        />

        <BrandStorySection branchCount={branchCount} productCountLabel={productCountLabel} featuredReviews={featuredReviews} />

        {/* Home redesign Tier 7 -- replaces the old membership-strip promo
            panel (generic "3-10%" prose, no real data) with a real,
            server-authoritative membership summary. See
            client/src/components/home/QuickStatsSection.tsx. */}
        <QuickStatsSection />

        {/* 2026-09-06: the old hand-rolled .care-section markup (image half +
            text half + a rotated "sun stamp" badge) replaced by the
            already-built-but-previously-unused EditorialBanner primitive
            (NEWVISION.md Tier 2 generalized exactly this split, but nothing
            ever called it) -- same real content (heading/description/3
            points, all still admin-editable via the same site-text slots),
            no decorative circle badge. */}
        {/* 2026-09-11 audit: this band carried three stacked labels above one
            heading -- "03 / FAMILY CARE", then "ГЭР БҮЛИЙН ӨДӨР БҮРТ", then the
            heading itself. The "03" belonged to a section numbering that no
            longer exists, and the eyebrow repeated the heading. One tag now. */}
        <EditorialBanner
          variant="image-left"
          tag={textFor("home-text-care-tag", "FAMILY CARE")}
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
        ctaBanner={{
          eyebrow: textFor("home-text-finalcta-eyebrow", "NEED A LITTLE HELP?"),
          headingLine1: finalCtaHeadingLine1,
          headingLine2: finalCtaHeadingLine2,
          phoneLabel: contact.phone,
        }}
      />
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </div>
  );
}
