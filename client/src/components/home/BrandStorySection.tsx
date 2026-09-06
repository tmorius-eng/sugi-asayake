import { Star, MapPin, ShieldCheck, ShoppingBag } from "lucide-react";
import { useSiteText } from "@/hooks/useSiteText";
import SectionHeading from "./SectionHeading";

export type FeaturedReview = {
  id: number;
  rating: number;
  comment: string | null;
  reviewerName: string | null;
  productName: string;
};

/**
 * 2026-09-06 homepage consolidation (external design review + Tom's
 * "cut to ~6 sections" call, see CLAUDE.md): merges what used to be 3
 * separate sections doing overlapping trust-building work --
 * `.story-section` ("Бидний ялгаа", now-dead inline Home.tsx JSX),
 * `WhyChooseUs.tsx` (this file's direct predecessor, whose 3-card/anchor-
 * stat layout survives here unchanged), and the standalone
 * `customer-voices-section` (real reviews, previously its own full-width
 * cream section). One background, one heading, no redundant "who we are"
 * messaging repeated twice in two different sections with two near-
 * identical headings ("Японы чанарыг ойртуулна." vs "Япон чанарыг танд
 * ойртуулна.").
 *
 * Card content/layout is carried over verbatim from WhyChooseUs.tsx (real,
 * business-approved claims -- see that file's history for why card 1 is a
 * distinct anchor stat instead of a 3rd identical icon card). No page-
 * number badge here (Story's old "01" is retired, not moved) -- this
 * section never had one before the merge (WhyChooseUs didn't), and the
 * reviewer's core complaint was too much chapter-signposting, not too
 * little; CategoryMasonry ("02") and StoreLocatorSection keep theirs.
 */
export default function BrandStorySection({ branchCount, productCountLabel, featuredReviews }: { branchCount: number; productCountLabel: string; featuredReviews: FeaturedReview[] }) {
  const textFor = useSiteText();
  const [headingLine1, headingLine2] = textFor("home-text-wcu-heading", "Япон чанарыг\nтанд ойртуулна.").split("\n");
  return (
    <section className="wcu-section" data-reveal aria-label="Бидний ялгаа, яагаад биднийг сонгох вэ">
      <p className="eyebrow"><span /> {textFor("home-text-wcu-eyebrow-label", "ЯАГААД БИДНИЙГ СОНГОХ ВЭ")}</p>
      <div className="wcu-heading-row">
        <SectionHeading tone="onDark">{headingLine1}<br /><em>{headingLine2}</em></SectionHeading>
        {/* 2 lede paragraphs where there used to be 1 -- the old Story
            section's "who we are" sentence, now folded in ahead of this
            section's own "3 reasons" sentence, rather than dropped. */}
        <div className="wcu-lede">
          <p>{textFor("home-text-story-description", "SUGI ASAYAKE нь Японы SUGI Drug Store-ийн албан ёсны охин компани. Өдөр тутмын эрүүл мэнд, гоо сайхан, арчилгааг Монголын гэр бүл бүрт илүү ойртуулна.")}</p>
          <p>{textFor("home-text-wcu-description", "SUGI ASAYAKE-ийг сонгох гурван шалтгаан — өргөн сонголт, баталгаат импорт, ойрхон салбарууд.")}</p>
        </div>
      </div>
      <div className="wcu-cards">
        <div className="wcu-card wcu-card-stat">
          <strong className="wcu-stat-number">{productCountLabel}</strong>
          <span className="wcu-stat-label"><ShoppingBag size={16} /> {textFor("home-text-wcu-card1-title", "Сонголт")}</span>
          <p>{textFor("home-text-wcu-card1-desc", "Арчилгаа, гоо сайхан, эрүүл ахуйн 900+ төрөл")}</p>
        </div>
        <div className="wcu-card">
          <span className="wcu-card-icon"><ShieldCheck size={20} /></span>
          <strong>{textFor("home-text-wcu-card2-title", "Баталгаа")}</strong>
          <span>{textFor("home-text-wcu-card2-desc", "Японоос баталгаат, албан ёсны бүтээгдэхүүн")}</span>
        </div>
        <div className="wcu-card">
          <span className="wcu-card-icon"><MapPin size={20} /></span>
          <strong>{textFor("home-text-wcu-card3-title", "Ойрхон")}</strong>
          <span>{textFor("home-text-wcu-card3-prefix", "Улаанбаатарын")} {branchCount} {textFor("home-text-wcu-card3-suffix", "байршилд таныг хүлээнэ")}</span>
        </div>
      </div>
      {/* Absorbed customer-voices-section (2026-09-06): same "hidden
          entirely when there are no real qualifying reviews yet" discipline
          as the standalone section this replaces -- never padded with
          lower-rated/commentless reviews to fill the strip. */}
      {featuredReviews.length > 0 && (
        <div className="wcu-reviews">
          <p className="wcu-reviews-kicker">{textFor("home-text-voices-eyebrow", "ХАРИЛЦАГЧИЙН ҮГ")} — {textFor("home-text-voices-heading", "Юу ярьж байна вэ.")}</p>
          <div className="wcu-reviews-grid">
            {featuredReviews.slice(0, 3).map(review => (
              <div className="wcu-review-card" key={review.id}>
                <div className="wcu-review-stars">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={12} fill={index < review.rating ? "#f0b52d" : "none"} stroke={index < review.rating ? "#f0b52d" : "rgba(255,255,255,.3)"} />)}</div>
                {/* getFeaturedReviews already filters comment IS NOT NULL AND
                    <> '' at the DB level -- Drizzle's inferred type just
                    can't encode that SQL WHERE clause, so this is a
                    defensive guard against a case that shouldn't occur at
                    runtime, not an expected empty state. */}
                {review.comment && <p>&ldquo;{review.comment}&rdquo;</p>}
                <div className="wcu-review-footer">
                  <span className="wcu-review-avatar">{(review.reviewerName ?? "?").charAt(0).toUpperCase()}</span>
                  <div><strong>{review.reviewerName ?? "Нэргүй"}</strong><span>{review.productName}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
