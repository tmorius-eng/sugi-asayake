import { Link } from "wouter";
import { BadgeCheck, ChevronRight } from "lucide-react";
import { getSiteMediaSlot, type SiteMediaSlotKey } from "@shared/site-media";
import { useSiteText } from "@/hooks/useSiteText";
import { useT } from "@/hooks/useLocale";
import HeroImageSlideshow, { type HeroSlide } from "./HeroImageSlideshow";
import { storefrontThemeInfo } from "@/lib/bootstrap";
import { brandName } from "@/lib/brand";

// Баярын мэндчилгээ (Брэнд студи) — серверийн hero shell-тэй ИЖИЛ мөр (heroShell.ts).
const themeGreeting = storefrontThemeInfo()?.greeting ?? null;

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
export default function HeroSection({ imageFor, mediaReady = true }: {
  /** Resolves a site_media slot to an uploaded URL, or its brand default. */
  imageFor: (slotKey: string, fallbackUrl: string | null) => string | null;
  /** False while the admin's uploads are still loading -- see Home.tsx. */
  mediaReady?: boolean;
}) {
  const textFor = useSiteText();
  const t = useT();
  // Admins type the heading as up to three lines; here they read as one
  // centred sentence, wrapping wherever the viewport needs it.
  const heading = textFor("home-text-hero-heading", "ГЭР БҮЛИЙН\nГИШҮҮН БҮРТ\nЯПОН ЧАНАР").split("\n").filter(Boolean).join(" ");

  /**
   * Each tile takes the admin's uploaded photo for its slot, falling back
   * to the brand default registered for that slot in shared/site-media.ts,
   * so the row runs with three real photographs from the first deploy. A
   * tile with no resolvable image is dropped rather than shown empty.
   *
   * 2026-09-12 (Tom): the caption under each photograph is gone, and with
   * it the per-slide text slots in /admin. A photograph now carries no
   * words, so `label` is what names its link for a screen reader -- derived
   * from where the tile leads rather than from editable copy, so the link
   * can never end up nameless.
   */
  const slideFor = (slotKey: SiteMediaSlotKey, href: string, label: string): HeroSlide | null => {
    const imageUrl = imageFor(slotKey, getSiteMediaSlot(slotKey).fallbackUrl);
    if (!imageUrl) return null;
    return { key: slotKey, imageUrl, href, label };
  };

  /**
   * Six slots (Tom, 2026-09-12: "admin deer limit n 6 zurag"). The first
   * three ship with a real photograph behind them; 4-6 are empty until an
   * admin uploads one, and an empty slot is dropped rather than shown as a
   * blank frame -- so the row is three tiles today and up to six the moment
   * /admin -> Зураг has more.
   */
  const shopLabel = t("Бүтээгдэхүүн үзэх");
  const slides = [
    slideFor("home-hero", "/shop", shopLabel),
    slideFor("home-hero-2", "/shop", shopLabel),
    slideFor("home-hero-3", "#stores", t("Салбар олох")),
    slideFor("home-hero-4", "/shop", shopLabel),
    slideFor("home-hero-5", "/shop", shopLabel),
    slideFor("home-hero-6", "/shop", shopLabel),
  ].filter((slide): slide is HeroSlide => slide !== null);

  return (
    <section className="hero-section" aria-labelledby="hero-title">
      {mediaReady
        ? <HeroImageSlideshow slides={slides} imageAlt={`${brandName()} everyday-care products`} />
        : <div className="hero-rail-reserve" aria-hidden="true" />}
      <div className="hero-copy">
        {themeGreeting ? <p className="hero-greeting">{themeGreeting}</p> : null}
        {/* Tom, 2026-09-12: the brand half sits on the house red and the
            place half on the house blue, same typeface and size as before.
            The slash in the admin's own text is what separates them, so an
            admin can retitle either half (or drop the slash, in which case
            the whole line renders as one red mark). */}
        <p className="eyebrow hero-eyebrow">
          {(() => {
            const raw = textFor("home-text-hero-eyebrow", `${brandName()} / MONGOLIA`);
            const [brandPart, ...rest] = raw.split("/");
            const placePart = rest.join("/").trim();
            return <>
              <span className="hero-eyebrow-brand">{brandPart.trim()}</span>
              {/* Tom: the slash he types stays visible between the two
                  marks, not just as the thing that separates them. */}
              {placePart ? <span className="hero-eyebrow-sep" aria-hidden="true">/</span> : null}
              {placePart ? <span className="hero-eyebrow-place">{placePart}</span> : null}
            </>;
          })()}
        </p>
        <h1 id="hero-title">{heading}</h1>
        <p className="hero-description">{textFor("home-text-hero-description", "Японоос баталгаат бүтээгдэхүүнүүдийг албан ёсны эрхтэйгээр танд хүргэж байна.")}</p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/shop">{t("Бүтээгдэхүүн үзэх")} <ChevronRight size={16} /></Link>
          <a className="quiet-link" href="#stores">{t("Салбар олох")}</a>
        </div>
        <div className="hero-trust">
          <BadgeCheck size={18} />
          <div><strong>{textFor("home-text-hero-trust-title", "100% албан ёсны эрхтэй")}</strong><span>{textFor("home-text-hero-trust-subtitle", "SUGI Drug Store Japan-ийн охин компани")}</span></div>
        </div>
      </div>
    </section>
  );
}
