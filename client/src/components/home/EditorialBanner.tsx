import type { CSSProperties, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

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
  imageAlt,
}: {
  variant: "image-right" | "image-left" | "full-bleed-dark";
  tag?: string;
  eyebrow: string;
  headingLine1: string;
  headingLine2?: string;
  description: string;
  points?: string[];
  ctaLabel?: string;
  ctaHref?: string;
  imageStyle?: CSSProperties;
  imageAlt: string;
}): ReactNode {
  const heading = <h2>{headingLine1}{headingLine2 ? <>{" "}{headingLine2}</> : null}</h2>;
  const cta = ctaLabel && ctaHref ? <Link className="inline-link" href={ctaHref}>{ctaLabel} <ArrowUpRight size={16} /></Link> : null;

  if (variant === "full-bleed-dark") {
    return (
      <section className={`editorial-banner editorial-banner--full-bleed`} style={imageStyle} aria-label={imageAlt} data-reveal>
        <div className="editorial-banner-shade" />
        <div className="editorial-banner-copy">
          <p className="eyebrow"><span /> {eyebrow}</p>
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
      <div className="editorial-banner-image" style={imageStyle} role="img" aria-label={imageAlt}>
        {tag ? <span className="editorial-banner-tag">{tag}</span> : null}
      </div>
      <div className="editorial-banner-copy">
        <p className="eyebrow"><span /> {eyebrow}</p>
        {heading}
        <p>{description}</p>
        {points?.length ? <ul className="editorial-banner-points">{points.map(point => <li key={point}>{point}</li>)}</ul> : null}
        {cta}
      </div>
    </section>
  );
}
