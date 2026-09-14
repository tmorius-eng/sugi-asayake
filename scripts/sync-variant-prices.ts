// 2026-09-13: бараа бүрийн үнийг (ганц) variant дээр нь хуулна.
//
// Яагаад: storefront products.priceMnt харуулдаг бол сагс, checkout, захиалгын мөр
// бүр product_variants.priceMnt уншдаг (cart_items variant руу заадаг). Admin-ийн
// үнийн засвар зөвхөн барааны мөрийг шинэчилдэг тул тестлэгч /shop-д 25,000₮,
// сагсанд 22,500₮ харсан — бодит захиалга хуучин, доогуур үнээр төлөгдөж байв.
// Бичих үед 937 variant-аас 814 нь зөрүүтэй (686 нь барааны үнийн 90%, 75 нь 50%,
// 27 нь 80%).
//
// Одоо бараа бүр яг нэг variant-тай тул барааны мөр эзний бодитоор хадгалдаг үнэ
// бөгөөд variant түүнийг тусгах ёстой. server/db.ts syncSoleVariantFromProduct
// (2026-09-11) барааны засвар бүрт үнийн өөрчлөлтийг хуулдаг болсон тул тэр
// өдрөөс хойших засварт дахин үүсэхгүй; зөрсөн мөрүүд түүнээс өмнөх засвараас.
// Энэ script нэг удаа засна.
//
//   pnpm exec tsx scripts/sync-variant-prices.ts            # dry run: юу өөрчлөгдөхийг харуулна
//   pnpm exec tsx scripts/sync-variant-prices.ts --apply    # JSON backup хадгалсны дараа бичнэ
//
// Аппын өөрийн TLS холболтын төлөвлөгөө (DATABASE_URL .env-ээс). Санаатайгаар,
// гараар ажиллуул — амьд каталогт бичнэ.
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
