import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";
import type { FreeBlockProps } from "@shared/home-sections";
import EditorialBanner from "./EditorialBanner";

/**
 * "Чөлөөт зурвас" (Брэнд студи A3, 2026-10-05) — админ Нүүрний бүтэц табаас гарчиг, текст, товч,
 * Content & Media → home-free-N-ээс зураг өгдөг хэсэг. Зурагтай хувилбар нь байгаа EditorialBanner
 * (сайтын нэг хэв маяг), "зөвхөн текст" эсвэл зураггүй бол төвлөрсөн богино хэсэг. Гарчиг хоосон бол
 * огт зурагдахгүй (хагас бөглөсөн хэсэг нүүрэнд гарахгүй).
 */
export default function FreeBlock({ variant, props, imageUrl }: { variant: string; props?: FreeBlockProps; imageUrl: string | null }) {
  if (!props?.heading) return null;
  const cta = props.ctaLabel && props.ctaHref ? { label: props.ctaLabel, href: props.ctaHref } : null;
  if (variant !== "text-only" && imageUrl) {
    return (
      <EditorialBanner
        variant={variant === "image-right" ? "image-right" : "image-left"}
        headingLine1={props.heading}
        description={props.text}
        ctaLabel={cta?.label}
        ctaHref={cta?.href}
        imageUrl={imageUrl}
        imageAlt={props.heading}
      />
    );
  }
  return (
    <section className="free-block page-section" data-reveal>
      <h2>{props.heading}</h2>
      {props.text ? <p>{props.text}</p> : null}
      {cta ? (cta.href.startsWith("#") ? <a className="inline-link" href={cta.href}>{cta.label} <ArrowUpRight size={16} /></a> : <Link className="inline-link" href={cta.href}>{cta.label} <ArrowUpRight size={16} /></Link>) : null}
    </section>
  );
}
