import type { CSSProperties } from "react";
import { Link } from "wouter";
import { ArrowUpRight, BadgeCheck, ChevronRight, Flower2, Sparkles } from "lucide-react";

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
export default function HeroSection({ heroImageStyle }: { heroImageStyle: CSSProperties | undefined }) {
  return (
    <section className="hero-section hero-sunrise" aria-labelledby="hero-title">
      <div className="hero-color-orbit orbit-one" aria-hidden="true" />
      <div className="hero-color-orbit orbit-two" aria-hidden="true" />
      <div className="hero-copy">
        <div className="hero-topline">
          <p className="eyebrow"><span /> SUGI ASAYAKE / MONGOLIA</p>
          <span className="hero-time">ASAYAKE / 06:07</span>
        </div>
        <h1 id="hero-title">ГЭР БҮЛИЙН<br /><span>ГИШҮҮН БҮРТ</span><br /><strong>ЯПОН ЧАНАР</strong></h1>
        <p className="hero-description">Японоос баталгаат бүтээгдэхүүнүүдийг албан ёсны эрхтэйгээр танд хүргэж байна.</p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/shop">Бүтээгдэхүүн үзэх <ArrowUpRight size={16} /></Link>
          <a className="quiet-link" href="#stores">Салбар олох <ChevronRight size={16} /></a>
        </div>
        <div className="hero-trust">
          <BadgeCheck size={20} />
          <div><strong>100% албан ёсны эрхтэй</strong><span>SUGI Drug Store Japan-ийн охин компани</span></div>
        </div>
        <div className="hero-signature" aria-label="SUGI ASAYAKE daily care signature">
          <Flower2 size={17} />
          <span>Өглөөнөөс орой хүртэл<br />таны өдөр тутмын сонголт.</span>
        </div>
      </div>
      <div className="hero-image" style={heroImageStyle} aria-label="SUGI ASAYAKE everyday-care products" role="img">
        <div className="hero-image-shade" />
        <div className="hero-image-sun" aria-hidden="true"><span>800+</span><small>DAILY<br />CHOICES</small></div>
        <div className="hero-image-marker" aria-hidden="true"><Sparkles size={15} /><span>THE MORNING<br />OF CARE</span></div>
        <div className="hero-image-label"><span>JAPAN QUALITY</span><strong>01</strong></div>
        <div className="hero-image-caption">Өдөр бүрийн арчилгаа, илүү ойрхон</div>
      </div>
    </section>
  );
}
