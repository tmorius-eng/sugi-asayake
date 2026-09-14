// Admin шинэчлэл (2026-09-08, Phase K). Нэг удаагийн backfill, давтагдах
// migration БИШ — бодит DB дээр нэг удаа ажилласан, түүхийн бүртгэл болгож энд
// үлдээв (scripts/backfill-order-districts.ts-тэй ижил конвенц).
//
// Салбар бүрийн бодит түүхэн нөөцийн хуваарилалт байхгүй (бүх салбар үргэлж нэг
// global productVariants.stockQuantity тоог хуваалцаж байсан) тул үнэнч эхлэл нь:
// variant бүрийн одоогийн нөөц isFulfillmentDefault салбарын эхний үлдэгдэл болж,
// бусад идэвхтэй салбар бүр 0-ээс эхэлнэ (таамагласан хуваалт хэзээ ч биш). Дараа
// нь Tom бодит тооллогоор салбар хооронд admin-ийн салбарын нөөц засварлагчаар
// (Phase L) зөөнө.
//
// Idempotent: аль хэдийн мөртэй (branchId, variantId) хосыг алгасна тул дахин
// ажиллуулах үргэлж аюулгүй, давхар seed хийхгүй.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { branches, branchStock, productVariants } from "../drizzle/schema";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");

  const allBranches = await db.select().from(branches);
  if (!allBranches.length) throw new Error("No branches exist -- run scripts/seed-branches.ts first.");
  const fulfillmentBranch = allBranches.find(b => b.isFulfillmentDefault);
  if (!fulfillmentBranch) throw new Error("No branch is marked isFulfillmentDefault -- set one via the admin Branches panel first.");
  const otherBranches = allBranches.filter(b => b.id !== fulfillmentBranch.id);

  const existing = await db.select({ branchId: branchStock.branchId, variantId: branchStock.variantId }).from(branchStock);
  const existingKeys = new Set(existing.map(row => `${row.branchId}:${row.variantId}`));

  const allVariants = await db.select({ id: productVariants.id, stockQuantity: productVariants.stockQuantity }).from(productVariants);
  console.log(`${allVariants.length} variants, ${allBranches.length} branches (fulfillment default: "${fulfillmentBranch.name}"). ${existingKeys.size} branch_stock rows already exist.`);

  let inserted = 0;
  const rows: { branchId: number; variantId: number; stockQuantity: number }[] = [];
  for (const variant of allVariants) {
    if (!existingKeys.has(`${fulfillmentBranch.id}:${variant.id}`)) {
      rows.push({ branchId: fulfillmentBranch.id, variantId: variant.id, stockQuantity: variant.stockQuantity });
    }
    for (const branch of otherBranches) {
      if (!existingKeys.has(`${branch.id}:${variant.id}`)) {
        rows.push({ branchId: branch.id, variantId: variant.id, stockQuantity: 0 });
      }
    }
  }

  // Batched inserts (500 rows at a time) -- a single multi-thousand-row
  // insert statement risks hitting MySQL's max_allowed_packet.
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    if (batch.length) await db.insert(branchStock).values(batch);
    inserted += batch.length;
  }
  console.log(`Inserted ${inserted} branch_stock rows.`);

  // Sanity check: the fulfillment branch's total must equal the sum of
  // every variant's current cached stockQuantity (nothing added, nothing
  // lost in the split).
  const totalCached = allVariants.reduce((sum, v) => sum + v.stockQuantity, 0);
  const fulfillmentRows = await db.select({ stockQuantity: branchStock.stockQuantity }).from(branchStock).where(eq(branchStock.branchId, fulfillmentBranch.id));
  const fulfillmentTotal = fulfillmentRows.reduce((sum, r) => sum + r.stockQuantity, 0);
  console.log(`Sanity check: total cached stock across all variants = ${totalCached}; total seeded at fulfillment branch = ${fulfillmentTotal}. ${totalCached === fulfillmentTotal ? "OK" : "MISMATCH -- investigate before trusting per-branch stock."}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
