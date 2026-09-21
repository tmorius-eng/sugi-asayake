// AVIF хувилбарыг ОДОО БАЙГАА зурагт нэмнэ (2026-09-21).
//
// Шинэ upload бүр "photo" бол AVIF хоёр хувилбартай үүсдэг
// (server/_core/imageProcessing.ts). Энэ скрипт нь тэрнээс өмнө орсон, DB-д
// ИШЛЭГДСЭН .webp зураг бүрд ижил хоёр хувилбарыг ижил нэрээр нэмнэ:
//   x.webp        -> x.avif
//   x-600w.webp   -> x-600w.avif
//
// Юуг хөндөхгүй: WebP файл, DB мөр — юу ч дарж бичихгүй, зөвхөн ШИНЭ объект
// нэмнэ. Лого / тунгалаг / хөдөлгөөнт зураг алгасагдана (upload-тай ижил
// дүрэм: lossy AVIF үсгийн ирмэгийг будлиулна, хөдөлгөөнийг зогсооно).
// Дахин ажиллуулахад аюулгүй: AVIF аль хэдийн байгаа зургийг алгасна.
//
//   pnpm exec tsx scripts/image-avif-backfill.ts            # dry run
//   pnpm exec tsx scripts/image-avif-backfill.ts --apply    # бичнэ
//
// AVIF нь заавал биш (ResponsivePicture байхгүй бол WebP руу буцдаг) тул
// энэ скрипт тасарсан ч сайт эвдрэхгүй — зөвхөн тэр зургууд WebP-ээр үлдэнэ.
import "dotenv/config";
import { isNotNull } from "drizzle-orm";
import { getDb } from "../server/db";
import { featuredBrands, posts, productCategories, products, productVariants, siteMedia } from "../drizzle/schema";
import { avifVariantKey, gridVariantUrl } from "../shared/image-variants";
import { IMAGE_MAX_DIMENSION, processUploadedImageVariants } from "../server/_core/imageProcessing";
import { storagePutExactKey } from "../server/storage";

const APPLY = process.argv.includes("--apply");
const CONCURRENCY = 4;
const PUBLIC_BASE = process.env.S3_PUBLIC_BASE_URL ?? "";
const publicUrl = (storagePath: string) => `${PUBLIC_BASE}${storagePath.replace("/cdn", "")}`;

async function collectUrls(): Promise<Map<string, number>> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  const found = new Map<string, number>();
  const add = (url: string | null | undefined, maxDimension: number) => {
    if (url && url.startsWith("/cdn/") && url.endsWith(".webp") && !url.endsWith("-600w.webp")) found.set(url, Math.max(found.get(url) ?? 0, maxDimension));
  };

  for (const row of await db.select({ imageUrl: products.imageUrl, galleryJson: products.galleryJson }).from(products)) {
    add(row.imageUrl, IMAGE_MAX_DIMENSION.product);
    try {
      for (const url of JSON.parse(row.galleryJson ?? "[]") as unknown[]) if (typeof url === "string") add(url, IMAGE_MAX_DIMENSION.product);
    } catch { /* malformed gallery — the main image above is still covered */ }
  }
  for (const row of await db.select({ url: productVariants.imageUrl }).from(productVariants).where(isNotNull(productVariants.imageUrl))) add(row.url, IMAGE_MAX_DIMENSION.product);
  for (const row of await db.select({ url: siteMedia.imageUrl }).from(siteMedia)) add(row.url, IMAGE_MAX_DIMENSION.siteMedia);
  for (const row of await db.select({ url: productCategories.imageUrl }).from(productCategories)) add(row.url, IMAGE_MAX_DIMENSION.siteMedia);
  for (const row of await db.select({ url: featuredBrands.photoUrl }).from(featuredBrands)) add(row.url, IMAGE_MAX_DIMENSION.siteMedia);
  for (const row of await db.select({ url: posts.coverImageUrl }).from(posts)) add(row.url, IMAGE_MAX_DIMENSION.siteMedia);
  return found;
}

async function main() {
  if (!PUBLIC_BASE) throw new Error("S3_PUBLIC_BASE_URL is required.");
  const urls = await collectUrls();
  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing written -- pass --apply to write)");
  console.log(`referenced .webp images: ${urls.size}\n`);

  const tally = { present: 0, added: 0, graphic: 0, animated: 0, failed: 0, webpBytes: 0, avifBytes: 0 };
  const queue = [...urls.entries()];

  async function worker() {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const [url, maxDimension] = next;
      const gridUrl = gridVariantUrl(url)!;
      try {
        // Both AVIF siblings already there -> nothing to do (re-runnable).
        const [fullHead, gridHead] = await Promise.all([avifVariantKey(url), avifVariantKey(gridUrl)].map(u => fetch(publicUrl(u), { method: "HEAD", signal: AbortSignal.timeout(15_000) })));
        if (fullHead.ok && gridHead.ok) { tally.present++; continue; }

        const source = await fetch(publicUrl(url), { signal: AbortSignal.timeout(30_000) });
        if (!source.ok) { tally.failed++; console.log(`  SKIP ${url} -- source ${source.status}`); continue; }
        const variants = await processUploadedImageVariants(Buffer.from(await source.arrayBuffer()), maxDimension);
        if (variants.kind === "graphic") { tally.graphic++; continue; }
        if (variants.kind === "animated") { tally.animated++; continue; }

        tally.webpBytes += variants.full.length + variants.grid.length;
        tally.avifBytes += variants.fullAvif!.length + variants.gridAvif!.length;
        if (APPLY) {
          // EXACT keys, no new hash: the AVIF name is derived from the WebP URL
          // already stored in the DB, so it must land exactly there.
          await storagePutExactKey(avifVariantKey(url).replace("/cdn/", ""), variants.fullAvif!, "image/avif");
          await storagePutExactKey(avifVariantKey(gridUrl).replace("/cdn/", ""), variants.gridAvif!, "image/avif");
        }
        tally.added++;
        if (tally.added % 50 === 0) console.log(`  ...${tally.added} ${APPLY ? "written" : "would be written"}`);
      } catch (error) {
        tally.failed++;
        console.log(`  FAIL ${url} -- ${(error as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const kb = (n: number) => `${Math.round(n / 1024).toLocaleString()} KB`;
  console.log(`\nalready had AVIF: ${tally.present}   ${APPLY ? "added" : "would add"}: ${tally.added}   skipped graphic: ${tally.graphic}   skipped animated: ${tally.animated}   failed: ${tally.failed}`);
  if (tally.added) console.log(`same images as WebP: ${kb(tally.webpBytes)}  ->  as AVIF: ${kb(tally.avifBytes)}  (${Math.round((1 - tally.avifBytes / tally.webpBytes) * 100)}% smaller)`);
  if (!APPLY) console.log("\nThis was a dry run -- nothing was written.");
  process.exit(tally.failed ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(1); });
