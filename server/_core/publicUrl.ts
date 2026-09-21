import { ENV } from "./env";

/**
 * Сайтын өөрийн нийтийн origin дээр суурилсан АБСОЛЮТ URL (2026-09-20).
 *
 * Энэ логик нэг үеэ бодоход ГУРВАН газар үсэг үсгээрээ давхардсан байв —
 * `indexHtml.ts` (og:image), `routeMeta.ts` (бараа/нийтлэлийн og + canonical),
 * `ogImage.ts` (хуваалцах картын эх зураг). Гуравт нь ижил дүрэм хэрэгтэй:
 * crawler, Facebook/Messenger-ийн preview, QPay/StorePay-ийн callback бүгд
 * "/cdn/..." хэлбэрийн зам биш, бүтэн хаяг шаарддаг.
 *
 * `PUBLIC_BASE_URL` тавигдаагүй бол домэйн рүү буцаж унана (production-д
 * startup дээр warning өгдөг — `_core/context.ts`).
 */
const FALLBACK_ORIGIN = "https://sugiasayake.mn";

export function publicOrigin(): string {
  return (ENV.publicBaseUrl || FALLBACK_ORIGIN).replace(/\/$/, "");
}

/**
 * ⛔ `sitemap.ts` ба `merchantFeed.ts`-ийн origin туслагчдыг ЭНД НЭГТГЭХГҮЙ.
 * Тэд `PUBLIC_BASE_URL` байхгүй үед **хүсэлтийн өөрийн host** руу (`req.protocol`
 * + `Host`) унадаг — учир нь crawler-т өгөх URL нь түүнийг үйлчилж буй хаягтай
 * таарах ёстой (tunnel домэйн, ирээдүйн домэйн). Энэ модуль харин хүсэлтийн
 * контекстгүй газраас (кэшлэгдсэн `resolveValues`, OG мета) дуудагддаг тул
 * тогтмол домэйн руу унадаг. Хоёр өөр зан төлөв, хоёулаа зөв.
 */

/** Аль хэдийн http(s) бол хэвээр; хоосон/null бол хоосон мөр. */
export function absoluteUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${publicOrigin()}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * `/cdn/<key>` → R2-ийн нийтийн хаяг шууд (2026-09-21). `/cdn/*` нь storageProxy.ts-д
 * 302 redirect: DB-д хадгалагдсан зам R2-оос хамааралгүй (нүүлгэхэд DB хөндөхгүй)
 * гэсэн зөв шалтгаантай, гэхдээ hero зургийн ЭХНИЙ хүсэлтэд нэг RTT нэмж, зургийн
 * татаж эхлэхийг хойшлуулдаг (Lighthouse "load delay" ~1 с). Storefront-ийн эхний
 * render-д очих URL-уудыг (preload, shell, bootstrap, content.siteMedia) сервер
 * render хийх мөчид шууд хаяг болгоно — DB хэвээр `/cdn/`, тиймээс хөрвүүлэх чадвар
 * алдагдахгүй. Тохируулаагүй (S3_PUBLIC_BASE_URL хоосон) бол хэвээр буцаана.
 */
export function directStorageUrl(url: string): string {
  const key = storageKeyOf(url);
  return key && ENV.s3PublicBaseUrl ? `${ENV.s3PublicBaseUrl}/${key}` : url;
}

/** `/cdn/<key>` эсвэл `${S3_PUBLIC_BASE_URL}/<key>` → `<key>`; бусад URL → null. */
export function storageKeyOf(url: string): string | null {
  if (url.startsWith("/cdn/")) return url.slice("/cdn/".length);
  if (ENV.s3PublicBaseUrl && url.startsWith(`${ENV.s3PublicBaseUrl}/`)) return url.slice(ENV.s3PublicBaseUrl.length + 1);
  return null;
}
