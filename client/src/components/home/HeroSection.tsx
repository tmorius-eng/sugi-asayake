import type { CSSProperties } from "react";
import { Link } from "wouter";
import { ArrowUpRight, BadgeCheck, ChevronRight, Flower2, Sparkles } from "lucide-react";
import { useSiteText } from "@/hooks/useSiteText";

/**
 * Homepage hero -- extracted verbatim from the old inline
 * client/src/pages/Home.tsx (Tier 1 of the home redesign, see
 * docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md). No visual or
 * behavioral change: the existing asymmetric split (.88fr/1.12fr, ~44/56%),
 * rotated image treatment, and "800+" badge already match the master
 * prompt's Tier-11 hero geometry, so this tier is a structural extraction
 * only -- not a redesign of the hero itself.
 *
 * heroImageStyle comes from Home.tsx's bgStyle("home-hero", heroImage) --
 * that R2-fallback lookup stays owned by the page (it depends on the
 * siteMedia query), this component just renders whatever style object it's
 * given, same as the old inline markup did.
 */
export default function HeroSection({ heroImageStyle, productCountLabel }: { heroImageStyle: CSSProperties | undefined; productCountLabel: string }) {
  const textFor = useSiteText();
  const [headingLine1, headingLine2, headingLine3] = textFor("home-text-hero-heading", "ГЭР БҮЛИЙН\nГИШҮҮН БҮРТ\nЯПОН ЧАНАР").split("\n");
  return (
    <section className="hero-section hero-sunrise" aria-labelledby="hero-title">
      <div className="hero-color-orbit orbit-one" aria-hidden="true" />
      <div className="hero-color-orbit orbit-two" aria-hidden="true" />
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
      <div className="hero-image" style={heroImageStyle} aria-label="SUGI ASAYAKE everyday-care products" role="img">
        <div className="hero-image-shade" />
        {/* 2026-09-04: this badge used to hardcode "800+" directly (never
            admin-editable, and stale the moment the real catalog outgrew
            it -- confirmed at 937 published products). Now derived from a
            real COUNT(*) (see getPublishedProductCount, Home.tsx), rounded
            down to the nearest hundred so it still reads as marketing
            copy ("900+") rather than an oddly precise number, and never
            overstates. CategoryMasonry/WhyChooseUs still carry their own
            "800+"-containing sentences as free CMS text (an admin can
            already edit those directly) -- only this one was purely
            hardcoded code with no way to fix it short of a deploy. */}
        <div className="hero-image-sun" aria-hidden="true"><span>{productCountLabel}</span><small>{textFor("home-text-hero-badge-label", "DAILY CHOICES")}</small></div>
        <div className="hero-image-marker" aria-hidden="true"><Sparkles size={15} /><span>{textFor("home-text-hero-marker-label", "THE MORNING OF CARE")}</span></div>
        <div className="hero-image-label"><span>JAPAN QUALITY</span><strong>01</strong></div>
        <div className="hero-image-caption">{textFor("home-text-hero-image-caption", "Өдөр бүрийн арчилгаа, илүү ойрхон")}</div>
      </div>
    </section>
  );
}
