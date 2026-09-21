import type { CSSProperties, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";
import ResponsivePicture from "@/components/ResponsivePicture";
import { BANNER_FULL_WIDTH, BANNER_IMAGE_SIZES } from "@shared/image-variants";

// NEWVISION.md Tier 2: a brand-story-takeover primitive SUGI didn't have --
// the closest existing thing, .story-section, is text-only (no image at
// all). Generalizes .care-section's proven image+copy split (image, dark
// gradient shade, a rotating corner "stamp" badge, a checklist of points)
// into a reusable component with 3 layouts instead of leaving it as one
// hand-tuned, one-off section.
//
// Content discipline: every prop here is real data the caller must supply
// (useSiteText/imageFor upstream) -- this component never fabricates
// copy, stats, or a CTA that doesn't go anywhere.
export default function EditorialBanner({
  variant,
  tag,
  eyebrow,
  headingLine1,
  headingLine2,
  description,
  points,
  ctaLabel,
  ctaHref,
  imageStyle,
  imageUrl,
  imageAlt,
}: {
  variant: "image-right" | "image-left" | "full-bleed-dark";
  tag?: string;
  /** Optional since 2026-09-11: the homepage banner dropped its eyebrow
   *  (the heading already said it). Kept for any future caller that has a
   *  label carrying information the heading does not. */
  eyebrow?: string;
  headingLine1: string;
  headingLine2?: string;
  description: string;
  points?: string[];
  ctaLabel?: string;
  ctaHref?: string;
  imageStyle?: CSSProperties;
  /**
   * 2026-09-21: the split variants take the photo as a URL and render a real
   * lazy `<img>` (AVIF/WebP, 600w on phones) instead of a background-image.
   * A background-image is fetched the moment the element exists -- on a phone
   * this band is several screens down, yet its 162 KB full-size WebP was the
   * first thing competing with the hero for bandwidth. `imageStyle` is still
   * honoured (full-bleed variant, or a caller with no variants for its file).
   */
  imageUrl?: string | null;
  imageAlt: string;
}): ReactNode {
  const heading = <h2>{headingLine1}{headingLine2 ? <>{" "}{headingLine2}</> : null}</h2>;
  const cta = ctaLabel && ctaHref ? <Link className="inline-link" href={ctaHref}>{ctaLabel} <ArrowUpRight size={16} /></Link> : null;

  if (variant === "full-bleed-dark") {
    return (
      <section className={`editorial-banner editorial-banner--full-bleed`} style={imageStyle} aria-label={imageAlt} data-reveal>
        <div className="editorial-banner-shade" />
        <div className="editorial-banner-copy">
          {eyebrow ? <p className="eyebrow"><span /> {eyebrow}</p> : null}
          {heading}
          <p>{description}</p>
          {points?.length ? <ul className="editorial-banner-points">{points.map(point => <li key={point}>{point}</li>)}</ul> : null}
          {cta}
        </div>
      </section>
    );
  }

  return (
    <section className={`editorial-banner editorial-banner--${variant}`} data-reveal>
      <div className="editorial-banner-image" style={imageStyle} {...(imageUrl ? {} : { role: "img", "aria-label": imageAlt })}>
        {imageUrl
          ? <ResponsivePicture src={imageUrl} fullWidth={BANNER_FULL_WIDTH} sizes={BANNER_IMAGE_SIZES} alt={imageAlt} loading="lazy" decoding="async" />
          : null}
        {tag ? <span className="editorial-banner-tag">{tag}</span> : null}
      </div>
      <div className="editorial-banner-copy">
        {eyebrow ? <p className="eyebrow"><span /> {eyebrow}</p> : null}
        {heading}
        <p>{description}</p>
        {points?.length ? <ul className="editorial-banner-points">{points.map(point => <li key={point}>{point}</li>)}</ul> : null}
        {cta}
      </div>
    </section>
  );
}
