import { avifSrcSet, avifVariantKey, imageSrcSet } from "../../shared/image-variants";
import { storageObjectExists } from "../storage";
import { escapeAttribute } from "./indexHtml";
import { storageKeyOf } from "./publicUrl";

/**
 * `<link rel="preload" as="image">` нь хөтчийн `<img>`/`<picture>`-ийн ЯГ
 * СОНГОХ файлыг заах ёстой (2026-09-21).
 *
 * Зөрвөл хөтөч хоёр файл татна: preload-оор нэгийг эрт, <picture>-ээр өөрийг
 * хожуу — өөрөөр хэлбэл хурдасгах гэсэн preload удаашруулна. Энэ яг ингэж
 * болсон: AVIF нэмсний дараа барааны хуудас WebP-г 181 мс-т preload хийж,
 * <picture> нь AVIF-г 962 мс-т дахин татаж, production-д LCP 4.8 -> 5.8 с
 * болсон. Hero нь аль хэдийн зөв байсан (indexHtml.ts) — хоёр газар одоо энэ
 * нэг функцийг ашиглана.
 *
 *   - `sizes` нь `<img>`-ийнхтэй ИЖИЛ байх ёстой (shared/image-variants.ts-ийн
 *     *_SIZES тогтмолууд).
 *   - AVIF-г зөвхөн R2-д бодитоор байгаа үед preload хийнэ (заавал биш —
 *     ResponsivePicture байхгүй бол WebP руу буцдаг); `type` нь AVIF
 *     дэмждэггүй хөтөчид preload-ыг алгасуулна.
 */
export async function responsiveImagePreload(url: string, fullWidth: number, sizes: string): Promise<string> {
  const avif = await hasAvif(url);
  return responsiveImagePreloadTag(url, fullWidth, sizes, avif);
}

/** Синхрон хувилбар (DB/R2 унтарсан үеийн fallback-д — AVIF гэж таамаглахгүй). */
export function responsiveImagePreloadTag(url: string, fullWidth: number, sizes: string, avif: boolean): string {
  const srcset = avif ? avifSrcSet(url, fullWidth) : imageSrcSet(url, fullWidth);
  const responsive = srcset ? ` imagesrcset="${escapeAttribute(srcset)}" imagesizes="${escapeAttribute(sizes)}"` : "";
  const type = avif ? ` type="image/avif"` : "";
  const href = avif ? avifVariantKey(url) : url;
  return `<link rel="preload" as="image"${type} href="${escapeAttribute(href)}"${responsive} fetchpriority="high" />`;
}

/** /cdn/<key>.webp зургийн AVIF хувилбар R2-д бий эсэх (10 минут кэштэй).
 *  heroShell.ts ч ашиглана: серверийн зурсан <picture> нь байхгүй AVIF-г заавал
 *  бол хөтөч эвдэрсэн зураг үзүүлнэ (ResponsivePicture шиг onError fallback-гүй). */
// Репод AVIF-тайгаа хамт ирдэг локал зургууд (server/holiday-posters.test.ts бүх файлыг шалгана).
const LOCAL_AVIF_PREFIXES = ["/images/holidays/"];

export async function hasAvif(url: string): Promise<boolean> {
  if (LOCAL_AVIF_PREFIXES.some(prefix => url.startsWith(prefix)) && url.endsWith(".webp") && !url.endsWith("-600w.webp")) return true;
  // `/cdn/<key>` ба R2-ийн шууд хаяг хоёулаа (publicUrl.ts-ийн directStorageUrl).
  const key = storageKeyOf(url);
  if (!key || !url.endsWith(".webp") || url.endsWith("-600w.webp")) return false;
  // Хоёр AVIF хувилбар хамт үүсдэг (imageProcessing.ts, backfill) — нэгийг шалгахад хангалттай.
  return storageObjectExists(avifVariantKey(key));
}
