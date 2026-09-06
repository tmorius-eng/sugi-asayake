// Frontend performance audit (2026-09-02): converts already-stored product
// and site-media photos to the WebP + 600px-derivative pipeline that new
// uploads now use (server/_core/imageProcessing.ts's
// processUploadedImageVariants + server/storage.ts's
// storagePutImageVariants).
//
// Why this exists: shared/image-variants.ts treats the `.webp` extension as
// the signal that a grid derivative exists, so components only emit srcset
// for images that actually have one. That makes the migration safe and
// incremental -- but it also means the ~390 photos uploaded before this
// shipped keep getting the full 1600px original on a 300px grid card until
// they are converted. This converts them.
//
// Safety properties:
//   - Writes NEW objects under a fresh hash; never overwrites or deletes an
//     existing R2 object, so the old URL keeps working until the DB row is
//     updated, and nothing is destroyed if this is interrupted.
//   - Updates each row's imageUrl only after both variants are stored.
//   - Skips anything already `.webp` (idempotent -- safe to re-run).
//   - --dry-run (the default) writes nothing at all; pass --apply to commit.
//
// Usage:
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
