import { Fragment, type CSSProperties } from "react";
import { BadgeCheck, Gift, Heart, Leaf, MapPin, Package, ShieldCheck, ShoppingBag, Smile, Sparkles, Star, Truck, type LucideIcon } from "lucide-react";
import { useSiteText } from "@/hooks/useSiteText";
import type { WcuIconName } from "@shared/site-text";
import SectionHeading from "./SectionHeading";

/** Every name in shared/site-text.ts WCU_ICON_NAMES, and nothing else --
 *  the Record type makes a missing entry a compile error. */
const WCU_ICONS: Record<WcuIconName, LucideIcon> = {
  "shopping-bag": ShoppingBag, "shield-check": ShieldCheck, "map-pin": MapPin, star: Star, heart: Heart, truck: Truck,
  sparkles: Sparkles, "badge-check": BadgeCheck, leaf: Leaf, gift: Gift, package: Package, smile: Smile,
};
const iconFor = (name: string, fallback: WcuIconName): LucideIcon => WCU_ICONS[name.trim().toLowerCase() as WcuIconName] ?? WCU_ICONS[fallback];
/** A 6-digit hex colour or the default -- an admin typo must not paint a
 *  transparent tile. */
const colorFor = (value: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback);

export type FeaturedReview = {
  id: number;
  rating: number;
  comment: string | null;
  reviewerName: string | null;
  productName: string;
};

/**
 * "Яагаад биднийг сонгох вэ" -- rebuilt on 2026-09-12 against Tom's
 * reference screenshot: a light panel, a centred tracked eyebrow over a
 * centred bold title, then three numbered columns, each a colour tile with
 * a line icon, the item number on the same row, a title and a two-line
 * description. The middle column sits lower than its neighbours and has a
 * larger tile -- that stagger is the whole character of the reference.
 *
 * What changed from the 2026-09-06 version (a dark band with a "900+" stat
 * card, two icon cards and two lede paragraphs): the lede paragraphs are
 * gone (their site-text slots stay registered, nothing else reads them),
 * the stat card is gone and the live product count now lands inside item
 * 01's sentence through a `{N}` token, same pattern Home.tsx and Shop.tsx
 * already use for branch counts. The customer reviews strip below is the
 * same real-data block, restyled for the light surface. The dark version is
 * one checkout away at git tag backup/pre-wcu-redesign-2026-09-12.
 *
 * Every string is a site-text slot (editable in /admin); none of the slot
 * keys changed, so saved overrides survive.
 */
export default function BrandStorySection({ branchCount, productCountLabel, featuredReviews }: { branchCount: number; productCountLabel: string; featuredReviews: FeaturedReview[] }) {
  const textFor = useSiteText();
  // One centred line by default; an admin can still press Enter for two.
  const headingLines = textFor("home-text-wcu-heading", "Яагаад SUGI ASAYAKE вэ?").split("\n").filter(Boolean);
  // Everything visible on an item -- icon, tile colour, title, description --
  // is a site-text slot in the "Яагаад биднийг сонгох вэ" group of /admin.
  const items = [
    {
      key: "selection",
      Icon: iconFor(textFor("home-text-wcu-card1-icon", "shopping-bag"), "shopping-bag"),
      color: colorFor(textFor("home-text-wcu-card1-color", "#e94e3c"), "#e94e3c"),
      title: textFor("home-text-wcu-card1-title", "Сонголт"),
      description: textFor("home-text-wcu-card1-desc", "Арчилгаа, гоо сайхан, эрүүл ахуйн {N} төрөл").replace("{N}", productCountLabel),
    },
    {
      key: "guarantee",
      Icon: iconFor(textFor("home-text-wcu-card2-icon", "shield-check"), "shield-check"),
      color: colorFor(textFor("home-text-wcu-card2-color", "#2b1d9e"), "#2b1d9e"),
      title: textFor("home-text-wcu-card2-title", "Баталгаа"),
      description: textFor("home-text-wcu-card2-desc", "Японоос баталгаат, албан ёсны бүтээгдэхүүн"),
    },
    {
      key: "nearby",
      Icon: iconFor(textFor("home-text-wcu-card3-icon", "map-pin"), "map-pin"),
      color: colorFor(textFor("home-text-wcu-card3-color", "#12b76a"), "#12b76a"),
      title: textFor("home-text-wcu-card3-title", "Ойрхон"),
      description: `${textFor("home-text-wcu-card3-prefix", "Улаанбаатарын")} ${branchCount} ${textFor("home-text-wcu-card3-suffix", "байршилд таныг хүлээнэ")}`,
    },
  ];
  return (
    <section className="wcu-section" data-reveal aria-label="Бидний ялгаа, яагаад биднийг сонгох вэ">
      <div className="wcu-head">
        {/* Tom, 2026-09-12: no eyebrow (the slot stays registered, unused),
            and the whole heading in the site's red accent -- the same <em>
            treatment every other section heading uses for its accent phrase,
            here applied to the full title like "Онцлох брэндүүд". */}
        <SectionHeading>
          <em>{headingLines.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>)}</em>
        </SectionHeading>
      </div>
      {/* The reference numbers its columns 01/02/03; Tom asked for those to
          go ("muuhai" -- ugly), so this is a plain list. */}
      <ul className="wcu-grid">
        {items.map(({ key, Icon, color, title, description }, index) => (
          <li className={index === 1 ? "wcu-item wcu-item--featured" : "wcu-item"} key={key} style={{ "--wcu-tile": color } as CSSProperties}>
            <span className="wcu-tile" aria-hidden="true"><Icon size={index === 1 ? 40 : 22} strokeWidth={1.75} /></span>
            <h3 className="wcu-item-title">{title}</h3>
            <p className="wcu-item-desc">{description}</p>
          </li>
        ))}
      </ul>
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
                <div className="wcu-review-stars">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={12} fill={index < review.rating ? "var(--accent)" : "none"} stroke={index < review.rating ? "var(--accent)" : "var(--border)"} />)}</div>
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
