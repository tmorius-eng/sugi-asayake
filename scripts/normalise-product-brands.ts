// Хайлт v3 (2026-09-20): `products.brand`-ийн бичлэгийн хувилбаруудыг
// `brand_aliases`-ийн canonical бичлэг рүү засна (SSELECT → S-Select, BAYU → BA-YU,
// CICAmethod → CICA method, LoveLiner/Loveline → Love Liner …). Мөн
// `featured_brands.brandName` ижил дүрмээр — тэр хүснэгт products.brand-тай
// утгаар нийлдэг тул хуваагдсан бичлэг нь брэндийн tile-ийг хоосон болгодог.
//
// Анхдагчаар DRY RUN (юу өөрчлөгдөхийг хэвлэнэ). Бодит DB дээр --apply
// хийхээсээ өмнө backup: powershell scripts/db-backup.ps1
//
//   pnpm exec tsx scripts/normalise-product-brands.ts           # dry run
//   pnpm exec tsx scripts/normalise-product-brands.ts --apply   # бичнэ
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { featuredBrands, products } from "../drizzle/schema";
import { getBrandAliasMap } from "../server/search/dictionaries";
import { canonicalBrand } from "../shared/brand-aliases";

const APPLY = process.argv.includes("--apply");

(async () => {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  const aliases = await getBrandAliasMap();

  const rows = await db.select({ brand: products.brand, count: sql<number>`COUNT(*)`.mapWith(Number) }).from(products)
    .where(sql`${products.brand} IS NOT NULL AND ${products.brand} <> ''`).groupBy(products.brand);
  const changes = rows
    .map(row => ({ raw: row.brand!, canonical: canonicalBrand(aliases, row.brand), count: row.count }))
    .filter(row => row.canonical && row.canonical !== row.raw);

  const tiles = await db.select({ id: featuredBrands.id, brandName: featuredBrands.brandName }).from(featuredBrands);
  const tileChanges = tiles
    .map(tile => ({ id: tile.id, raw: tile.brandName, canonical: canonicalBrand(aliases, tile.brandName) }))
    .filter(tile => tile.canonical && tile.canonical !== tile.raw);

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — products.brand: ${changes.length} бичлэг, featured_brands: ${tileChanges.length} мөр\n`);
  for (const change of changes) console.log(`  ${String(change.count).padStart(4)}  "${change.raw}"  →  "${change.canonical}"`);
  for (const tile of tileChanges) console.log(`  tile #${tile.id}  "${tile.raw}"  →  "${tile.canonical}"`);

  if (!APPLY) {
    console.log("\nDry run — юу ч бичээгүй. Бодитоор засахын тулд --apply.");
    process.exit(0);
  }
  let updated = 0;
  for (const change of changes) {
    const result = await db.update(products).set({ brand: change.canonical!, updatedAt: new Date() }).where(eq(products.brand, change.raw));
    updated += Number((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
  }
  for (const tile of tileChanges) {
    await db.update(featuredBrands).set({ brandName: tile.canonical!, updatedAt: new Date() }).where(eq(featuredBrands.id, tile.id));
  }
  console.log(`\n${updated} бараа, ${tileChanges.length} tile шинэчлэгдлээ.`);
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
