import { useState, type ImgHTMLAttributes } from "react";
import { avifSrcSet, imageSrcSet } from "@shared/image-variants";

/**
 * Зургийг хамгийн жижиг форматаар, хамгийн тохирох хэмжээгээр (2026-09-21).
 *
 *   <picture>
 *     <source type="image/avif" srcset="x-600w.avif 600w, x.avif 1920w" sizes=…>
 *     <img src="x.webp" srcset="x-600w.webp 600w, x.webp 1920w" sizes=…>
 *   </picture>
 *
 * Хөтөч AVIF-г дэмжвэл түүнийг (WebP-ээс ~30% жижиг), эс бөгөөс WebP-г,
 * srcset-ээс дэлгэцийнхээ нягтралд тохирох өргөнийг сонгоно.
 *
 * ⚠️ `<picture>`-ийн fallback нь зөвхөн ФОРМАТ дэмжихгүй үед ажилладаг — файл
 * 404 болоход ДАРААГИЙН source руу шилждэггүй, зураг эвдэрдэг. AVIF хувилбар
 * нь заавал биш (лого/тунгалаг/хөдөлгөөнт зурагт үүсдэггүй, хуучин зурагт
 * backfill хүртэл байхгүй) тул `onError` дээр AVIF-гүйгээр дахин зурна: нэг
 * дэмий хүсэлт, эвдэрсэн зураг хэзээ ч биш.
 *
 * `<picture>` нь `display: contents` (index.css) — хуудсан дээр хайрцаг
 * үүсгэхгүй тул `<img>`-ийн байршил, хэмжээ, CSS яг хэвээр (дизайн хөндөхгүй).
 *
 * `.webp` биш URL (импортоор орсон хуучин JPG, SVG placeholder) бол энгийн
 * `<img>` — тэдэнд хувилбар байхгүй.
 */
type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  src: string;
  /** Эх файлын өргөн (srcset-ийн дээд `w`). */
  fullWidth: number;
  /** Зурагдах өргөн — CSS-тэй таарах ёстой. */
  sizes: string;
  /** Зарим газар (лого) AVIF хэрэггүй: lossy AVIF үсгийн ирмэгийг будлиулна. */
  avif?: boolean;
};

export default function ResponsivePicture({ src, fullWidth, sizes, avif = true, onError, ...img }: Props) {
  // src солигдвол (өөр бараа) AVIF-ийг дахин оролдоно.
  const [avifFailedFor, setAvifFailedFor] = useState<string | null>(null);
  const webp = imageSrcSet(src, fullWidth);
  const avifSet = avif && avifFailedFor !== src ? avifSrcSet(src, fullWidth) : null;

  const element = (
    <img
      {...img}
      src={src}
      {...(webp ? { srcSet: webp, sizes } : {})}
      onError={event => {
        if (avifSet) { setAvifFailedFor(src); return; }
        onError?.(event);
      }}
    />
  );
  if (!avifSet) return element;
  return (
    <picture className="responsive-picture">
      <source type="image/avif" srcSet={avifSet} sizes={sizes} />
      {element}
    </picture>
  );
}
