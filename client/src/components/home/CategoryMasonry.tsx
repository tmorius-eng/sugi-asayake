import type { CSSProperties, ComponentType } from "react";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { getCategoryPlaceholderImage } from "@shared/catalog-filter";
import SectionEyebrow from "./SectionEyebrow";
import SectionHeading from "./SectionHeading";

export type HomeCategory = {
  number: string;
  title: string;
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
  return (
    <section className="cat-mosaic-section page-section" id="collection" data-reveal>
      <SectionEyebrow number="02" label="EVERYDAY JAPAN" />

      <div className="cat-mosaic-top">
        <div className="cat-mosaic-heading-block">
          <SectionHeading>Японы бүтээгдэхүүний<br /><em>үндсэн ангилал.</em></SectionHeading>
          <p>Арьс арчилгаа, гоо сайхан, эрүүл ахуй, гэр бүлийн өдөр тутмын хэрэгцээг 800+ сонголтоос нэг дороос.</p>
          <a className="quiet-link" href="#stores">Дэлгэрэнгүй үзэх <ArrowUpRight size={16} /></a>
        </div>
        <a className="cat-mosaic-anchor" href={anchorHref} style={anchorImageStyle} aria-label="Ойр салбараа олох">
          <div className="cat-mosaic-anchor-shade" aria-hidden="true" />
          <div className="cat-mosaic-anchor-card">
            <span>OUR SELECTION</span>
            <strong>Нэг өдөрт<br />хэрэгтэй бүх зүйл.</strong>
            <em>Ойр салбараа олох <ArrowUpRight size={15} /></em>
          </div>
        </a>
      </div>

      <div className="cat-mosaic-grid">
        {categories.map((category) => {
          const imageStyle: CSSProperties = {
            backgroundImage: `url(${category.imageUrl || getCategoryPlaceholderImage(category.slug)})`,
          };

          return (
            <Link
              href={`/shop?category=${encodeURIComponent(category.title)}`}
              className="cat-mosaic-item cat-mosaic-item--image"
              style={imageStyle}
              key={category.number}
            >
              <span className="cat-mosaic-item-shade" aria-hidden="true" />
              <span className="cat-mosaic-item-top">
                <span className="cat-mosaic-item-number">{category.number}</span>
              </span>
              <span className="cat-mosaic-item-body">
                <span className="cat-mosaic-item-title">{category.title}</span>
                <span className="cat-mosaic-item-detail">{category.detail}</span>
              </span>
              <ArrowUpRight size={16} className="cat-mosaic-item-arrow" />
            </Link>
          );
        })}
      </div>

      <div className="cat-mosaic-note">
        <img src={symbolImage} alt="" />
        <span>Бидний тавиур дээрх бүтээгдэхүүн бүр<br />өдөр тутмын хэрэгцээнээс эхэлнэ.</span>
      </div>
    </section>
  );
}
