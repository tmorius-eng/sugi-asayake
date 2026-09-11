import { Link } from "wouter";
import { ArrowUpRight, BadgeCheck, ChevronRight, Flower2 } from "lucide-react";
import { getSiteMediaSlot, type SiteMediaSlotKey } from "@shared/site-media";
import { useSiteText } from "@/hooks/useSiteText";
import HeroImageSlideshow, { type HeroSlide } from "./HeroImageSlideshow";

/**
 * Homepage hero -- extracted verbatim from the old inline
 * client/src/pages/Home.tsx (Tier 1 of the home redesign, see
 * docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md). The existing
 * asymmetric split (.88fr/1.12fr, ~44/56%) and badge geometry already match
 * the master prompt's Tier-11 hero.
 *
 * 2026-09-12: the single photograph became a three-slide show (see
 * HeroImageSlideshow for the mechanism and the accessibility reasoning).
 * The left-hand copy deliberately does NOT change with the slides -- it
 * carries the <h1> and the primary call to action, and a heading that
 * rewrote itself every five seconds would be both disorienting and bad for
 * search. Only the photograph and its own four overlays rotate.
 */
export default function HeroSection({ imageFor, productCountLabel, branchCount }: {
  /** Resolves a site_media slot to an uploaded URL, or its brand default. */
  imageFor: (slotKey: string, fallbackUrl: string | null) => string | null;
  productCountLabel: string;
  branchCount: number;
}) {
  const textFor = useSiteText();
  const [headingLine1, headingLine2, headingLine3] = textFor("home-text-hero-heading", "ГЭР БҮЛИЙН\nГИШҮҮН БҮРТ\nЯПОН ЧАНАР").split("\n");

  /**
   * Keeps a headline number true while leaving the words around it
   * editable -- the same reason the catalogue size stopped being the
   * hardcoded "800+" it once was. An admin types {бараа} or {салбар}; the
   * live count is substituted here.
   */
  const withCounts = (value: string) =>
    value.replaceAll("{бараа}", productCountLabel).replaceAll("{салбар}", String(branchCount));

  /**
   * Each slide takes the admin's uploaded photo for its slot, falling back
   * to the brand default registered for that slot in shared/site-media.ts
   * -- so the slideshow runs with three real photographs from the first
   * deploy, and clearing a slot in /admin returns it to that default rather
   * than to an empty frame. A slide with no resolvable image at all is
   * dropped instead of crossfading into nothing.
   */
  const slideFor = (slotKey: SiteMediaSlotKey, prefix: string, defaults: Omit<HeroSlide, "key" | "imageUrl">): HeroSlide | null => {
    const imageUrl = imageFor(slotKey, getSiteMediaSlot(slotKey).fallbackUrl);
    if (!imageUrl) return null;
    return {
      key: slotKey,
      imageUrl,
      badgeValue: withCounts(textFor(`${prefix}badge-value`, defaults.badgeValue)),
      badgeLabel: textFor(`${prefix}badge-label`, defaults.badgeLabel),
      markerLabel: textFor(`${prefix}marker-label`, defaults.markerLabel),
      cornerLabel: textFor(`${prefix}label`, defaults.cornerLabel),
      caption: textFor(`${prefix}image-caption`, defaults.caption),
    };
  };

  const slides = [
    slideFor("home-hero", "home-text-hero-", {
      badgeValue: "{бараа}", badgeLabel: "DAILY CHOICES", markerLabel: "THE MORNING OF CARE",
      cornerLabel: "JAPAN QUALITY", caption: "Өдөр бүрийн арчилгаа, илүү ойрхон",
    }),
    slideFor("home-hero-2", "home-text-hero-2-", {
      badgeValue: "24–48", badgeLabel: "ЦАГТ ХҮРГЭНЭ", markerLabel: "DELIVERED IN ULAANBAATAR",
      cornerLabel: "FAST DELIVERY", caption: "Захиалгаа хоёр өдрийн дотор гартаа",
    }),
    slideFor("home-hero-3", "home-text-hero-3-", {
      badgeValue: "{салбар}", badgeLabel: "САЛБАР", markerLabel: "ALWAYS CLOSE TO YOU",
      cornerLabel: "NEAR YOU", caption: "Улаанбаатарын салбаруудаас өөрөө аваарай",
    }),
  ].filter((slide): slide is HeroSlide => slide !== null);

  return (
    <section className="hero-section hero-sunrise" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="hero-topline">
          <p className="eyebrow"><span /> {textFor("home-text-hero-eyebrow", "SUGI ASAYAKE / MONGOLIA")}</p>
          <span className="hero-time">ASAYAKE / 06:07</span>
        </div>
        <h1 id="hero-title">{headingLine1}<br /><span>{headingLine2}</span><br /><strong>{headingLine3}</strong></h1>
        <p className="hero-description">{textFor("home-text-hero-description", "Японоос баталгаат бүтээгдэхүүнүүдийг албан ёсны эрхтэйгээр танд хүргэж байна.")}</p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/shop">Бүтээгдэхүүн үзэх <ArrowUpRight size={16} /></Link>
          <a className="quiet-link" href="#stores">Салбар олох <ChevronRight size={16} /></a>
        </div>
        <div className="hero-trust">
          <BadgeCheck size={20} />
          <div><strong>{textFor("home-text-hero-trust-title", "100% албан ёсны эрхтэй")}</strong><span>{textFor("home-text-hero-trust-subtitle", "SUGI Drug Store Japan-ийн охин компани")}</span></div>
        </div>
        <div className="hero-signature" aria-label="SUGI ASAYAKE daily care signature">
          <Flower2 size={17} />
          <span>{textFor("home-text-hero-signature", "Өглөөнөөс орой хүртэл таны өдөр тутмын сонголт.")}</span>
        </div>
      </div>
      <HeroImageSlideshow slides={slides} imageAlt="SUGI ASAYAKE everyday-care products" />
    </section>
  );
}
