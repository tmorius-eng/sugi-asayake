// Frontend performance audit (2026-09-02) follow-up: fills in any missing
// `-600w.webp` grid derivative for an already-`.webp` stored image.
//
// Why this was needed: the first revision of processUploadedImageVariants
// returned `grid: null` when the source was already <= 600px, on the theory
// that a same-size second copy bought nothing. That silently broke the
// invariant the design depends on -- shared/image-variants.ts derives the
// grid URL from the `.webp` extension ALONE, so an image without its
// sibling produces a srcset candidate that 404s, which a browser renders as
// a broken image (a listed candidate has no fallback). 224 of 529 stored
// images were in that state. processUploadedImageVariants now always emits
// a grid; this repairs the ones written before that fix.
//
// Idempotent: HEADs each derived grid URL first and only writes the ones
// actually missing. Never touches the full-size object or any DB row.
//
// Usage:
//   pnpm exec tsx scripts/repair-image-grid-variants.ts          # dry run
//   pnpm exec tsx scripts/repair-image-grid-variants.ts --apply

import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { products, siteMedia } from "../drizzle/schema";
import { gridVariantUrl } from "../shared/image-variants";
import { processUploadedImageVariants, IMAGE_MAX_DIMENSION } from "../server/_core/imageProcessing";
import { storagePutExactKey } from "../server/storage";

const APPLY = process.argv.includes("--apply");
const PUBLIC_BASE = process.env.S3_PUBLIC_BASE_URL ?? "";
const publicUrl = (storagePath: string) => `${PUBLIC_BASE}${storagePath.replace("/manus-storage", "")}`;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  if (!PUBLIC_BASE) throw new Error("S3_PUBLIC_BASE_URL is required.");

  const rows = [
    ...(await db.select({ id: products.id, imageUrl: products.imageUrl })
      .from(products).where(sql`${products.imageUrl} like '%.webp'`))
      .map(r => ({ ...r, kind: "product", maxDimension: IMAGE_MAX_DIMENSION.product })),
    ...(await db.select({ id: siteMedia.id, imageUrl: siteMedia.imageUrl })
      .from(siteMedia).where(sql`${siteMedia.imageUrl} like '%.webp'`))
      .map(r => ({ ...r, kind: "siteMedia", maxDimension: IMAGE_MAX_DIMENSION.siteMedia })),
  ];

  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing written -- pass --apply to commit)");
  console.log(`stored .webp images to check: ${rows.length}\n`);

  let present = 0, repaired = 0, failed = 0;

  for (const row of rows) {
    const gridPath = gridVariantUrl(row.imageUrl);
    if (!gridPath) continue;
    try {
      const head = await fetch(publicUrl(gridPath), { method: "HEAD" });
      if (head.ok) { present++; continue; }

      const source = await fetch(publicUrl(row.imageUrl!));
      if (!source.ok) { failed++; console.log(`  SKIP ${row.kind} ${row.id} -- full-size fetch ${source.status}`); continue; }
      const variants = await processUploadedImageVariants(Buffer.from(await source.arrayBuffer()), row.maxDimension);

      if (APPLY) {
        // Exact key, no new hash: the grid URL is derived from the full-size
        // one that is already stored in the DB, so it must land there.
        await storagePutExactKey(gridPath.replace("/manus-storage/", ""), variants.grid, "image/webp");
      }
      repaired++;
      if (repaired % 25 === 0) console.log(`  ...${repaired} repaired`);
    } catch (error) {
      failed++;
      console.log(`  FAIL ${row.kind} ${row.id} -- ${(error as Error).message}`);
    }
  }

  console.log(`\nalready present: ${present}   ${APPLY ? "repaired" : "would repair"}: ${repaired}   failed: ${failed}`);
  if (!APPLY) console.log("\nThis was a dry run -- nothing was written.");
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
