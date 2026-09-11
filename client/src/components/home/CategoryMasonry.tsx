import type { CSSProperties, ComponentType } from "react";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { getCategoryPlaceholderImage } from "@shared/catalog-filter";
import { useSiteText } from "@/hooks/useSiteText";
import SectionHeading from "./SectionHeading";

// 2026-09-12: this shape is now produced by useCategories() from the real
// product_categories table plus the admin's image slots, instead of a
// hardcoded array. `number` is gone -- the numbering was retired in the
// 2026-09-11 audit (categories are not a sequence) and nothing read it.
export type HomeCategory = {
  name: string;
  detail: string;
  slug: string;
  Icon: ComponentType<{ size?: number }>;
  imageUrl?: string;
};

/**
 * Tier 3 of the home redesign, corrected against the reference image's
 * actual "02 Categories" crop (see docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md
 * and the approved plan's v3 fix spec). Structure: a 2-column top row
 * (heading block left, large lifestyle anchor photo right), then a 3x2
 * grid of the 6 real category cards below it.
 *
 * v5 (2026-08-31): every card is now the same width/height (uniform
 * repeat(3,1fr) grid, one shared min-height in the CSS) and the whole
 * grid -- not individual cards -- is shifted up by a single margin-top so
 * all of row 1 overlaps the anchor's bottom edge by the same modest
 * amount. Earlier versions gave individual cards different widths,
 * heights, and per-card translateY overlap/offset amounts; Tom rejected
 * that as "positions all over the place" -- and the per-card transform
 * approach also left dead space in the grid track, since a transformed
 * element's original box still reserves its layout space. See the
 * .cat-mosaic-grid comment in client/src/index.css for the full
 * reasoning.
 *
 * v2 (2026-08-31): the reference shows every small card as a real
 * photographed product, not a line-art icon -- so all 6 cards are
 * photo-led, using `category.imageUrl` (one real, currently-published
 * product photo per category, queried from the DB and set in Home.tsx's
 * `categories` array -- not invented/stock imagery). Falls back to
 * `getCategoryPlaceholderImage(category.slug)` (the same real per-category
 * placeholder art used on /shop) only if a category's chosen photo is
 * ever missing.
 *
 * Data: `categories` is the same real, curated 6-category array from
 * Home.tsx (icon/order/description is editorial curation, not fabricated
 * data) -- confirmed against the real `product_categories` table. Each
 * tile links to `/shop?category=<real category name>` (exact-match filter
 * in shared/catalog-filter.ts).
 */
export default function CategoryMasonry({
  categories,
  anchorImageStyle,
  anchorHref = "#stores",
  symbolImage,
}: {
  categories: HomeCategory[];
  anchorImageStyle: CSSProperties | undefined;
  anchorHref?: string;
  symbolImage: string;
}) {
  const textFor = useSiteText();
  const [headingLine1, headingLine2] = textFor("home-text-cat-heading", "Японы бүтээгдэхүүний\nүндсэн ангилал.").split("\n");
  const [anchorLine1, anchorLine2] = textFor("home-text-cat-anchor-heading", "Нэг өдөрт\nхэрэгтэй бүх зүйл.").split("\n");
  return (
    <section className="cat-mosaic-section page-section" id="collection" data-reveal>
      {/* 2026-09-11 audit: the repeated eyebrow was removed here. Eight of nine
          homepage sections opened with the same all-caps label + heading pair,
          which is the strongest single reason the page read as templated. The
          label also said nothing the heading below it did not already say.
          Three eyebrows survive sitewide, each carrying real information:
          the hero's brand line, the membership label, and the locator's live
          branch count. The `home-text-*` CMS slot stays in shared/site-text.ts
          so nothing breaks if this is ever reinstated. */}

      <div className="cat-mosaic-top">
        <div className="cat-mosaic-heading-block">
          <SectionHeading>{headingLine1}<br /><em>{headingLine2}</em></SectionHeading>
          <p>{textFor("home-text-cat-description", "Арьс арчилгаа, гоо сайхан, эрүүл ахуй, гэр бүлийн өдөр тутмын хэрэгцээг 900+ сонголтоос нэг дороос.")}</p>
          <a className="quiet-link" href="#stores">{textFor("home-text-cat-link-label", "Дэлгэрэнгүй үзэх")} <ArrowUpRight size={16} /></a>
        </div>
        <a className="cat-mosaic-anchor" href={anchorHref} style={anchorImageStyle} aria-label="Ойр салбараа олох">
          <div className="cat-mosaic-anchor-shade" aria-hidden="true" />
          <div className="cat-mosaic-anchor-card">
            <span>{textFor("home-text-cat-anchor-eyebrow", "OUR SELECTION")}</span>
            <strong>{anchorLine1}<br />{anchorLine2}</strong>
            <em>{textFor("home-text-cat-anchor-cta", "Ойр салбараа олох")} <ArrowUpRight size={15} /></em>
          </div>
        </a>
      </div>

      <div className="cat-mosaic-grid">
        {categories.map((category) => {
          const imageSrc = category.imageUrl || getCategoryPlaceholderImage(category.slug);
          // The description an admin types in /admin -> Ангилал is the
          // card's second line; the per-card text slot stays as an override
          // for anyone who wants different wording on the homepage than in
          // the catalogue itself.
          // Category TITLE is never a text slot -- it's also the exact-match
          // /shop?category= filter value (see shared/catalog-filter.ts), so
          // free-text editing it here could silently break that link. Only
          // the descriptive `detail` line is admin-editable.
          const detail = textFor(`home-text-cat-detail-${category.slug}`, category.detail);

          return (
            <Link
              href={`/shop?category=${encodeURIComponent(category.name)}`}
              className="cat-mosaic-item"
              key={category.slug}
            >
              {/* v9 (2026-09-01): a real <img> (not a background-image span)
                  inside a neutral "shelf" panel (.cat-mosaic-item-photo,
                  background: var(--muted)), with the image itself set to
                  object-fit:contain + mix-blend-mode:multiply -- Tom's
                  explicit request (Aesop.com-style product photography
                  treatment). mix-blend-mode blends an element against
                  whatever is painted BEHIND it in the same stacking
                  context, which a background-image can never do against
                  its own element's background-color -- hence the switch to
                  a real nested <img>. Multiply lets the photo's own
                  white/light background melt into the panel's --muted
                  cream instead of sitting on it as a visible rectangle,
                  while never touching the actual brand colors (still
                  var(--muted), nothing new introduced). Real <img> also
                  means a real alt text instead of a decorative
                  background-image with no accessible name. */}
              <span className="cat-mosaic-item-photo">
                <img src={imageSrc} alt={category.name} loading="lazy" />
              </span>
              <span className="cat-mosaic-item-body">
                {/* 2026-09-11 audit: the "01".."06" index was removed. The six
                    categories are not a sequence, so numbering them encoded
                    nothing a reader could use -- ornament in the costume of
                    information, and one of the clearest dated-design tells on
                    the page. `category.number` stays in categories-data.ts;
                    nothing else reads it. */}
                <span className="cat-mosaic-item-title">{category.name}</span>
                <span className="cat-mosaic-item-detail">{detail}</span>
                <ArrowUpRight size={16} className="cat-mosaic-item-arrow" />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="cat-mosaic-note">
        <img src={symbolImage} alt="" />
        <span>{textFor("home-text-cat-note", "Бидний тавиур дээрх бүтээгдэхүүн бүр өдөр тутмын хэрэгцээнээс эхэлнэ.")}</span>
      </div>
    </section>
  );
}
