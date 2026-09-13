// 2026-09-13: copy every product's price onto its (sole) variant.
//
// Why: the storefront shows products.priceMnt, but the cart, checkout and
// every order line read product_variants.priceMnt (cart_items point at a
// variant). Admin price edits updated the product row only, so a tester saw
// 25,000₮ in /shop and 22,500₮ in the cart -- and real orders were being
// charged the stale, lower price. 814 of 937 variants were out of step when
// this was written (686 at 90%, 75 at 50%, 27 at 80% of the product price).
//
// Every product currently has exactly one variant, so the product row is the
// price the owner actually maintains and the variant must mirror it.
// server/db.ts's syncSoleVariantFromProduct (2026-09-11) already copies price
// changes across on every product edit, so this cannot recur for edits made
// after that date; the drifted rows come from edits made before it existed.
// This script repairs them once.
//
//   pnpm exec tsx scripts/sync-variant-prices.ts            # dry run: shows what would change
//   pnpm exec tsx scripts/sync-variant-prices.ts --apply    # writes, after saving a JSON backup
//
// Uses the app's own TLS connection plan (DATABASE_URL from .env). Claude
// Code's auto-mode classifier refuses to run bulk writes against the live
// database itself, so Tom runs this.
import "dotenv/config";
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { planMysqlConnection } from "../server/_core/dbConnection";

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const conn = await mysql.createConnection(planMysqlConnection(url).options as never);

const [multi] = await conn.query<mysql.RowDataPacket[]>("SELECT productId, COUNT(*) n FROM product_variants GROUP BY productId HAVING n > 1");
if (multi.length > 0) {
  // With several variants per product the product price is no longer the
  // single source of truth; refuse rather than flatten real variant prices.
  throw new Error(`Refusing: ${multi.length} product(s) have more than one variant (${multi.map((r) => r.productId).join(", ")}). Fix those by hand first.`);
}

const [drift] = await conn.query<mysql.RowDataPacket[]>(`
  SELECT v.id AS variantId, v.productId, p.name,
         v.priceMnt AS variantPrice, p.priceMnt AS productPrice,
         v.compareAtPriceMnt AS variantCompareAt, p.compareAtPriceMnt AS productCompareAt
  FROM product_variants v JOIN products p ON p.id = v.productId
  WHERE v.priceMnt <> p.priceMnt OR NOT (v.compareAtPriceMnt <=> p.compareAtPriceMnt)
  ORDER BY p.id`);

console.log(`${drift.length} variant(s) differ from their product.`);
for (const r of drift.slice(0, 12)) console.log(`  #${r.productId} ${String(r.name).slice(0, 40).padEnd(40)} variant ${r.variantPrice} -> product ${r.productPrice}`);
if (drift.length > 12) console.log(`  ... and ${drift.length - 12} more`);

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write.");
  await conn.end();
  process.exit(0);
}

const backup = `variant-price-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
writeFileSync(backup, JSON.stringify(drift, null, 1));
console.log(`Backup of the old variant prices written to ./${backup} (gitignored *.json? -- delete when no longer needed).`);

const [result] = await conn.query<mysql.ResultSetHeader>(`
  UPDATE product_variants v JOIN products p ON p.id = v.productId
  SET v.priceMnt = p.priceMnt, v.compareAtPriceMnt = p.compareAtPriceMnt, v.updatedAt = NOW()
  WHERE v.priceMnt <> p.priceMnt OR NOT (v.compareAtPriceMnt <=> p.compareAtPriceMnt)`);
console.log(`Updated ${result.affectedRows} variant(s).`);

const [left] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) n FROM product_variants v JOIN products p ON p.id = v.productId WHERE v.priceMnt <> p.priceMnt");
console.log(`Remaining mismatches: ${left[0].n} (expect 0)`);
await conn.end();
