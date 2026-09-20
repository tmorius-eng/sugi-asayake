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
