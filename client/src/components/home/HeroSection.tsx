import { Link } from "wouter";
import { BadgeCheck, ChevronRight } from "lucide-react";
import { getSiteMediaSlot, type SiteMediaSlotKey } from "@shared/site-media";
import { useSiteText } from "@/hooks/useSiteText";
import HeroImageSlideshow, { type HeroSlide } from "./HeroImageSlideshow";

/**
 * Homepage opening -- 2026-09-12, rebuilt against cosmekitchen-webstore.jp
 * at Tom's direction ("study that site with Playwright and bring over
 * everything useful; it has to be premium and professional").
 *
 * The reference opens with a full-width row of square feature photographs
 * and nothing else; its headings sit centred, light and letter-spaced
 * under each block. So the row of three admin photographs comes first,
 * and the copy that used to sit beside a single rotated photograph -- the
 * <h1>, the description, the call to action and the trust line -- now
 * sits centred underneath in that same quiet register. Every string is
 * the same site-text slot as before; nothing an admin typed is lost. The
 * "ASAYAKE / 06:07" stamp and the signature line are gone from the render
 * (the signature slot stays registered).
 *
 * The previous version is one checkout away at git tag
 * backup/pre-cosmekitchen-2026-09-12.
 */
export default function HeroSection({ imageFor, productCountLabel, branchCount }: {
  /** Resolves a site_media slot to an uploaded URL, or its brand default. */
  imageFor: (slotKey: string, fallbackUrl: string | null) => string | null;
  productCountLabel: string;
  branchCount: number;
}) {
  const textFor = useSiteText();
  // Admins type the heading as up to three lines; here they read as one
  // centred sentence, wrapping wherever the viewport needs it.
  const heading = textFor("home-text-hero-heading", "ГЭР БҮЛИЙН\nГИШҮҮН БҮРТ\nЯПОН ЧАНАР").split("\n").filter(Boolean).join(" ");

  /**
   * Keeps a headline number true while leaving the words around it
   * editable: an admin types {бараа} or {салбар}, the live count lands here.
   */
  const withCounts = (value: string) =>
    value.replaceAll("{бараа}", productCountLabel).replaceAll("{салбар}", String(branchCount));

  /**
   * Each tile takes the admin's uploaded photo for its slot, falling back
   * to the brand default registered for that slot in shared/site-media.ts,
   * so the row runs with three real photographs from the first deploy. A
   * tile with no resolvable image is dropped rather than shown empty.
   */
  const slideFor = (slotKey: SiteMediaSlotKey, prefix: string, defaultCaption: string, href: string): HeroSlide | null => {
    const imageUrl = imageFor(slotKey, getSiteMediaSlot(slotKey).fallbackUrl);
    if (!imageUrl) return null;
    return { key: slotKey, imageUrl, caption: withCounts(textFor(`${prefix}image-caption`, defaultCaption)), href };
  };

  /**
   * Six slots (Tom, 2026-09-12: "admin deer limit n 6 zurag"). The first
   * three ship with a real photograph behind them; 4-6 are empty until an
   * admin uploads one, and an empty slot is dropped rather than shown as a
   * blank frame -- so the row is three tiles today and up to six the moment
   * /admin -> Зураг has more.
   */
  const slides = [
    slideFor("home-hero", "home-text-hero-", "Өдөр бүрийн арчилгаа, илүү ойрхон", "/shop"),
    slideFor("home-hero-2", "home-text-hero-2-", "Захиалгаа хоёр өдрийн дотор гартаа", "/shop"),
    slideFor("home-hero-3", "home-text-hero-3-", "Улаанбаатарын салбаруудаас өөрөө аваарай", "#stores"),
    slideFor("home-hero-4", "home-text-hero-4-", "SUGI ASAYAKE", "/shop"),
    slideFor("home-hero-5", "home-text-hero-5-", "SUGI ASAYAKE", "/shop"),
    slideFor("home-hero-6", "home-text-hero-6-", "SUGI ASAYAKE", "/shop"),
  ].filter((slide): slide is HeroSlide => slide !== null);

  return (
    <section className="hero-section" aria-labelledby="hero-title">
      <HeroImageSlideshow slides={slides} imageAlt="SUGI ASAYAKE everyday-care products" />
      <div className="hero-copy">
        <p className="eyebrow">{textFor("home-text-hero-eyebrow", "SUGI ASAYAKE / MONGOLIA")}</p>
        <h1 id="hero-title">{heading}</h1>
        <p className="hero-description">{textFor("home-text-hero-description", "Японоос баталгаат бүтээгдэхүүнүүдийг албан ёсны эрхтэйгээр танд хүргэж байна.")}</p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/shop">Бүтээгдэхүүн үзэх <ChevronRight size={16} /></Link>
          <a className="quiet-link" href="#stores">Салбар олох</a>
        </div>
        <div className="hero-trust">
          <BadgeCheck size={18} />
          <div><strong>{textFor("home-text-hero-trust-title", "100% албан ёсны эрхтэй")}</strong><span>{textFor("home-text-hero-trust-subtitle", "SUGI Drug Store Japan-ийн охин компани")}</span></div>
        </div>
      </div>
    </section>
  );
}
