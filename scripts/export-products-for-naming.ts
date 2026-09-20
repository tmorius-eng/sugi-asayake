// Монгол нэр өгөх ажлын ЭКСПОРТ (2026-09-20). Монгол нэргүй үлдсэн барааг
// багцаар нь хэвлэнэ — нэг мөр нэг бараа: id, брэнд, ангилал, төрөл, латин нэр.
// Орчуулгыг нэг нэгээр нь бичээд `docs/product-names-mn.csv`-д хийж,
// `scripts/generate-product-names-mn.ts --apply --from-csv`-ээр бичнэ.
//
//   pnpm exec tsx scripts/export-products-for-naming.ts            # эхний 120
//   pnpm exec tsx scripts/export-products-for-naming.ts 120 240    # offset, limit
import "dotenv/config";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "../server/db";
import { productCategories, products } from "../drizzle/schema";

(async () => {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  const offset = Number(process.argv[2] ?? 0);
  const limit = Number(process.argv[3] ?? 120);
  const rows = await db.select({
    id: products.id, name: products.name, brand: products.brand,
    productType: products.productType, category: productCategories.name, sku: products.sku,
  }).from(products).leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(eq(products.isPublished, true), isNull(products.nameMn)))
    .orderBy(asc(products.id)).limit(limit).offset(offset);
  for (const row of rows) {
    console.log(`${row.id}\t${row.brand ?? "-"}\t${row.category ?? "-"}\t${row.productType ?? "-"}\t${row.name}`);
  }
  console.log(`---- ${rows.length} мөр (offset ${offset}) ----`);
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
