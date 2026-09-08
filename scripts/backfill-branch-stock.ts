// "Controls everything" admin overhaul (2026-09-08, Phase K). One-time
// backfill, NOT a repeatable migration -- run once against the real Aiven
// database, kept here as a permanent historical record (same convention as
// scripts/backfill-order-districts.ts).
//
// No real historical per-branch stock split exists (every branch has always
// shared one global productVariants.stockQuantity number), so this is the
// only honest starting point: every existing variant's current stock
// becomes its opening balance at the designated isFulfillmentDefault
// branch, and every OTHER active branch starts at 0 (never a guessed
// split). Tom can move stock between branches afterward via the admin
// per-branch stock editor (Phase L) as physical inventory is actually
// counted branch-by-branch.
//
// Idempotent: skips any (branchId, variantId) pair that already has a row,
// so re-running this is always safe and never double-seeds.
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
