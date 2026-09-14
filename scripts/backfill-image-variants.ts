// Frontend гүйцэтгэлийн аудит (2026-09-02): аль хэдийн хадгалагдсан барааны болон
// site-media зургуудыг шинэ upload-ын ашигладаг WebP + 600px derivative pipeline
// руу хөрвүүлнэ (server/_core/imageProcessing.ts processUploadedImageVariants +
// server/storage.ts storagePutImageVariants).
//
// Яагаад: shared/image-variants.ts `.webp` өргөтгөлийг grid derivative байгаагийн
// дохио гэж үздэг тул компонентууд зөвхөн бодитоор derivative-тэй зурагт srcset
// гаргана. Энэ нь migration-ийг аюулгүй, алхам алхмаар болгодог — гэхдээ энэ
// гарахаас өмнө upload хийгдсэн ~390 зураг хөрвүүлэгдэх хүртэл 300px grid картад
// 1600px эхийг илгээсээр байна гэсэн үг. Энэ script тэдгээрийг хөрвүүлнэ.
//
// Аюулгүй байдлын шинжүүд:
//   - ШИНЭ объектуудыг шинэ hash-аар бичнэ; байгаа R2 объектыг хэзээ ч дарж/устгахгүй
//     тул DB мөр шинэчлэгдэх хүртэл хуучин URL ажиллана, тасалдвал юу ч устахгүй.
//   - Мөр бүрийн imageUrl-ийг хоёр variant хадгалагдсаны дараа л шинэчилнэ.
//   - Аль хэдийн `.webp` бол алгасна (idempotent — дахин ажиллуулахад аюулгүй).
//   - --dry-run (анхдагч) юу ч бичихгүй; --apply өгвөл бичнэ.
//
// Хэрэглээ:
//   pnpm exec tsx scripts/backfill-image-variants.ts            # dry run
//   pnpm exec tsx scripts/backfill-image-variants.ts --apply

import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { products, siteMedia } from "../drizzle/schema";
import { processUploadedImageVariants, IMAGE_MAX_DIMENSION } from "../server/_core/imageProcessing";
import { storagePutImageVariants } from "../server/storage";

const APPLY = process.argv.includes("--apply");
const PUBLIC_BASE = process.env.S3_PUBLIC_BASE_URL ?? "";

type Row = { id: number; imageUrl: string | null; label: string };

/** "/cdn/catalog/products/1/x_ab12.jpg" -> "catalog/products/1/x_ab12.jpg" */
function storageKeyOf(url: string): string | null {
  const prefix = "/cdn/";
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

/** Strips the extension so storagePutImageVariants can re-hash a fresh ".webp" key. */
function baseStemOf(key: string): string {
  return key.replace(/\.[^./]+$/, "");
}

async function convert(row: Row, maxDimension: number): Promise<{ url: string; before: number; after: number } | null> {
  const key = row.imageUrl && storageKeyOf(row.imageUrl);
  if (!key) return null;

  const response = await fetch(`${PUBLIC_BASE}/${key}`);
  if (!response.ok) {
    console.log(`  SKIP  ${row.label} -- source fetch ${response.status}`);
    return null;
  }
  const original = Buffer.from(await response.arrayBuffer());
  const variants = await processUploadedImageVariants(original, maxDimension);
  const after = variants.full.length + (variants.grid?.length ?? 0);

  if (!APPLY) return { url: `${row.imageUrl} -> (dry run)`, before: original.length, after };

  const stored = await storagePutImageVariants(`${baseStemOf(key)}.webp`, variants);
  return { url: stored.url, before: original.length, after };
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  if (!PUBLIC_BASE) throw new Error("S3_PUBLIC_BASE_URL is required.");

  const productRows = (await db
    .select({ id: products.id, imageUrl: products.imageUrl, name: products.name })
    .from(products)
    .where(sql`${products.imageUrl} LIKE '/cdn/%' AND ${products.imageUrl} NOT LIKE '%.webp'`))
    .map(r => ({ id: r.id, imageUrl: r.imageUrl, label: `product ${r.id} ${r.name.slice(0, 42)}` }));

  const mediaRows = (await db
    .select({ id: siteMedia.id, imageUrl: siteMedia.imageUrl, slotKey: siteMedia.slotKey })
    .from(siteMedia)
    .where(sql`${siteMedia.imageUrl} LIKE '/cdn/%' AND ${siteMedia.imageUrl} NOT LIKE '%.webp'`))
    .map(r => ({ id: r.id, imageUrl: r.imageUrl, label: `siteMedia ${r.id} ${r.slotKey}` }));

  console.log(`${APPLY ? "APPLYING" : "DRY RUN (nothing written -- pass --apply to commit)"}`);
  console.log(`products to convert : ${productRows.length}`);
  console.log(`site media to convert: ${mediaRows.length}\n`);

  let converted = 0, failed = 0, beforeTotal = 0, afterTotal = 0;

  for (const [rows, maxDimension, table] of [
    [productRows, IMAGE_MAX_DIMENSION.product, products] as const,
    [mediaRows, IMAGE_MAX_DIMENSION.siteMedia, siteMedia] as const,
  ]) {
    for (const row of rows) {
      try {
        const result = await convert(row, maxDimension);
        if (!result) { failed++; continue; }
        beforeTotal += result.before;
        afterTotal += result.after;
        if (APPLY) {
          await db.update(table).set({ imageUrl: result.url }).where(eq(table.id, row.id));
        }
        converted++;
        if (converted % 25 === 0) console.log(`  ...${converted} converted`);
      } catch (error) {
        failed++;
        console.log(`  FAIL  ${row.label} -- ${(error as Error).message}`);
      }
    }
  }

  const saved = beforeTotal - afterTotal;
  console.log(`\nconverted: ${converted}   failed/skipped: ${failed}`);
  console.log(`bytes before: ${(beforeTotal / 1024 / 1024).toFixed(1)} MB`);
  console.log(`bytes after : ${(afterTotal / 1024 / 1024).toFixed(1)} MB  (full + 600w derivative combined)`);
  if (beforeTotal) console.log(`saved       : ${(saved / 1024 / 1024).toFixed(1)} MB (${Math.round((saved / beforeTotal) * 100)}%)`);
  if (!APPLY) console.log("\nThis was a dry run -- nothing was written.");
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
