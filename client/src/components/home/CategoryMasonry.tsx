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
};

// Per-index visual treatment for the 6-card grid below the anchor row.
// Indices 1/2 (top row, under the anchor photo) are image-led AND pulled
// up to overlap the anchor's bottom edge; indices 3/4 get a resting
// downward stagger instead; 0 and 5 stay the plain ivory icon+text card.
// Hand-mapped for a fixed count of 6 real categories, same approach as
// the rest of this section's geometry -- see the plan's v3 fix spec.
const CARD_TREATMENT: Record<number, "overlap-1" | "overlap-2" | "offset-1" | "offset-2" | undefined> = {
  1: "overlap-1",
  2: "overlap-2",
  3: "offset-1",
  4: "offset-2",
};

/**
 * Tier 3 of the home redesign, corrected against the reference image's
 * actual "02 Categories" crop (see docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md
 * and the approved plan's v3 fix spec). Structure: a 2-column top row
 * (heading block left, large lifestyle anchor photo right), then a 3x2
 * grid of the 6 real category cards below it -- 2 image-led cards overlap
 * the anchor's bottom edge, 2 more cards get a resting vertical offset, so
 * the section reads as a layered composition rather than an evenly-gapped
 * grid.
 *
 * Data: `categories` is the same real, curated 6-category array from
 * Home.tsx (icon/order/description is editorial curation, not fabricated
 * data) -- confirmed against the real `product_categories` table. Each
 * tile links to `/shop?category=<real category name>` (exact-match filter
 * in shared/catalog-filter.ts). The image-led cards use
 * `getCategoryPlaceholderImage(category.slug)` -- the same real,
 * already-shipped per-category placeholder art used on /shop, not an
 * invented image.
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
        {categories.map((category, index) => {
          const treatment = CARD_TREATMENT[index];
          const isImageLed = treatment === "overlap-1" || treatment === "overlap-2";
          const classNames = ["cat-mosaic-item", isImageLed ? "cat-mosaic-item--image" : "", treatment ? `cat-mosaic-item--${treatment}` : ""]
            .filter(Boolean)
            .join(" ");
          const imageStyle: CSSProperties | undefined = isImageLed
            ? { backgroundImage: `url(${getCategoryPlaceholderImage(category.slug)})` }
            : undefined;

          return (
            <Link
              href={`/shop?category=${encodeURIComponent(category.title)}`}
              className={classNames}
              style={imageStyle}
              key={category.number}
            >
              {isImageLed && <span className="cat-mosaic-item-shade" aria-hidden="true" />}
              <span className="cat-mosaic-item-top">
                <span className="cat-mosaic-item-icon"><category.Icon size={16} /></span>
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
