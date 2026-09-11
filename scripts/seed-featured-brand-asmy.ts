// 2026-09-11 (Tom: "bestseller deer prieclat cocochi asmy giin buh set iin
// nem"): PRIECLAT and Cocochi were already rows in `featured_brands` (the
// admin-managed table behind /admin -> Брэнд, the Топ брэнд rail, and — as of
// this date — the filler slots of the homepage "Их зарагддаг бараа" rail).
// Asmy was not, despite having 5 published, in-stock products. This adds it
// as a normal featured-brand row so all three brands surface together.
//
// Deliberately a content row, never an order: the bestseller rail ranks by
// real settled sales first (getBestsellingProducts), and nothing here
// fabricates a sale, so genuine bestsellers displace this filler the moment
// orders exist. Everything below is editable/removable from the admin panel.
//
// Idempotent: skips when a row with this brandName already exists, so
// re-running is always safe. Same convention as scripts/seed-branches.ts.
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { featuredBrands, products } from "../drizzle/schema";

// Exact casing as stored on products.brand — featured_brands.brandName joins
// against it by value, so "ASMY" would match nothing.
const BRAND_NAME = "Asmy";
const TAGLINE = "Японы өдөр тутмын арчилгааны цуврал";
const SORT_ORDER = 1; // beside PRIECLAT (1); Cocochi leads at 0

(async () => {
  const db = await getDb();
  if (!db) {
    console.error("No database connection — check DATABASE_URL in .env.");
    process.exit(1);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(products)
    .where(eq(products.brand, BRAND_NAME));
  if (Number(count) === 0) {
    console.error(`No products carry brand "${BRAND_NAME}" — refusing to create a tile that points at nothing.`);
    process.exit(1);
  }

  const existing = await db
    .select({ id: featuredBrands.id, isActive: featuredBrands.isActive })
    .from(featuredBrands)
    .where(eq(featuredBrands.brandName, BRAND_NAME))
    .limit(1);

  if (existing.length) {
    if (!existing[0].isActive) {
      await db.update(featuredBrands).set({ isActive: true }).where(eq(featuredBrands.id, existing[0].id));
      console.log(`"${BRAND_NAME}" already existed but was inactive — reactivated (id ${existing[0].id}).`);
    } else {
      console.log(`"${BRAND_NAME}" is already an active featured brand (id ${existing[0].id}) — nothing to do.`);
    }
    process.exit(0);
  }

  await db.insert(featuredBrands).values({
    brandName: BRAND_NAME,
    tagline: TAGLINE,
    photoUrl: null, // falls back to the newest real published product photo
    sortOrder: SORT_ORDER,
    isActive: true,
  });
  console.log(`Added "${BRAND_NAME}" as a featured brand (${count} published products behind it).`);
  process.exit(0);
})();
