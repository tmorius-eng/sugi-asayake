// 2026-09-11 (Tom: "bestseller deer prieclat cocochi asmy giin buh set iin nem"):
// PRIECLAT, Cocochi `featured_brands`-д (/admin -> Брэнд, Топ брэнд rail, энэ
// өдрөөс нүүрний "Их зарагддаг бараа" rail-ийн filler-ийн ард байгаа admin
// хүснэгт) аль хэдийн мөртэй байв. Asmy 5 нийтлэгдсэн, нөөцтэй бараатай атлаа
// байсангүй. Гурван брэнд хамт гарахын тулд ердийн featured-brand мөрөөр нэмнэ.
//
// Санаатайгаар контентын мөр, захиалга хэзээ ч биш: bestseller rail эхлээд бодит
// төлөгдсөн борлуулалтаар эрэмбэлдэг (getBestsellingProducts), энд юу ч борлуулалт
// зохиодоггүй тул захиалга гармагц жинхэнэ bestseller энэ filler-ийг шахна. Доорх
// бүгд admin панелаас засварлагдах/устгагдах боломжтой.
//
// Idempotent: энэ brandName-тай мөр байвал алгасна, дахин ажиллуулах аюулгүй.
// scripts/seed-branches.ts-тэй ижил конвенц.
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
