import "dotenv/config";
import { and, eq, inArray, like, lt, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { TEST_SUPPRESSED_MARKER } from "../server/notificationOutbox";
import { adminAuditLogs, branches, branchStock, cartItems, carts, loginAttempts, notificationOutbox, orderItems, orders, productCategories, productVariants, products, stockCountLines, stockCounts, stockMovements, users } from "../drizzle/schema";
import { collectResidue } from "./test-residue-report";

/**
 * Deletes the throwaway rows earlier test runs left in the live database
 * (approved by Tom, 2026-09-12; reported first by
 * scripts/test-residue-report.ts, which owns the matching rules).
 *
 *   pnpm exec tsx scripts/test-residue-purge.ts           # dry run
 *   pnpm exec tsx scripts/test-residue-purge.ts --apply   # delete
 *
 * Two safety rules, both learned the hard way on this project:
 *  - Nothing is matched by "%test%" alone; only known fixture names count,
 *    and an order mixing a real product with a test one is never touched
 *    (test-residue-report.ts reports those separately and leaves them).
 *  - A suite RUNNING right now creates rows that look exactly like residue.
 *    Anything created in the last hour is therefore skipped unless --force
 *    is passed, so a purge can never delete a live test's fixtures mid-run.
 */

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
const FRESH_MS = 60 * 60 * 1000;

const db = await getDb();
if (!db) throw new Error("DATABASE_URL is required.");

const residue = await collectResidue();
const cutoff = Date.now() - FRESH_MS;
const isOldEnough = (createdAt: Date) => force || createdAt.getTime() < cutoff;

const productsToDelete = residue.products.filter(product => isOldEnough(product.createdAt));
const usersToDelete = residue.users.filter(user => isOldEnough(user.createdAt));
const ordersToDelete = residue.orders.filter(order => isOldEnough(order.createdAt));
const skipped = (residue.products.length - productsToDelete.length) + (residue.users.length - usersToDelete.length) + (residue.orders.length - ordersToDelete.length);

console.log(`Устгах: ${productsToDelete.length} бараа, ${usersToDelete.length} хэрэглэгч, ${ordersToDelete.length} захиалга, ${residue.categories.length} ангилал.`);
if (skipped) console.log(`Сүүлийн 1 цагт үүссэн ${skipped} мөрийг алгаслаа (тест яг одоо ажиллаж байж магадгүй). Заавал устгах бол --force.`);
for (const product of productsToDelete) console.log(`  бараа #${product.id} ${product.name}`);
for (const user of usersToDelete) console.log(`  хэрэглэгч #${user.id} ${user.email}`);
for (const order of ordersToDelete) console.log(`  захиалга #${order.id} ${order.orderNumber}`);

if (!apply) {
  console.log("\nDry run. Бодитоор устгахын тулд --apply нэмнэ үү.");
  process.exit(0);
}

const productIds = productsToDelete.map(product => product.id);
const userIds = usersToDelete.map(user => user.id);
const orderIds = ordersToDelete.map(order => order.id);
const variantIds = productIds.length
  ? (await db.select({ id: productVariants.id }).from(productVariants).where(inArray(productVariants.productId, productIds))).map(row => row.id)
  : [];

// 2026-09-23: НЭГ транзакц. Өмнө нь мөр бүр тусдаа statement байсан тул
// дундуур нь унавал (жишээ нь шинэхэн тест ангиллын FK `restrict`) захиалга,
// бараа устчихсан, хэрэглэгч үлдсэн хагас цэвэрлэгдсэн DB үлддэг байв.
const suppressedRows = await db.transaction(async tx => {
  // Order matters: rows that reference others go first. (Several of these
  // cascade anyway; doing it explicitly keeps the counts honest in the log.)
  if (orderIds.length) {
    await tx.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    await tx.delete(orders).where(inArray(orders.id, orderIds));
  }
  if (variantIds.length) {
    await tx.delete(stockCountLines).where(inArray(stockCountLines.variantId, variantIds));
    await tx.delete(stockMovements).where(inArray(stockMovements.variantId, variantIds));
    await tx.delete(branchStock).where(inArray(branchStock.variantId, variantIds));
    await tx.delete(cartItems).where(inArray(cartItems.variantId, variantIds));
    await tx.delete(productVariants).where(inArray(productVariants.id, variantIds));
  }
  if (productIds.length) await tx.delete(products).where(inArray(products.id, productIds));
  // Ангилал: БОДИТООР устгасан бараанаас өөр бараагүй бол л (шинэхэн, алгассан
  // тест бараа байгаа ангиллыг устгахад `restrict` FK бүх транзакцыг унагадаг байв).
  for (const category of residue.categories) {
    const [{ remaining }] = await tx.select({ remaining: sql<number>`COUNT(*)` }).from(products).where(eq(products.categoryId, category.id));
    if (Number(remaining) === 0) await tx.delete(productCategories).where(eq(productCategories.id, category.id));
  }
  if (userIds.length) {
    const cartIds = (await tx.select({ id: carts.id }).from(carts).where(inArray(carts.userId, userIds))).map(row => row.id);
    if (cartIds.length) {
      await tx.delete(cartItems).where(inArray(cartItems.cartId, cartIds));
      await tx.delete(carts).where(inArray(carts.id, cartIds));
    }
    await tx.delete(adminAuditLogs).where(inArray(adminAuditLogs.actorUserId, userIds));
    await tx.delete(loginAttempts).where(inArray(loginAttempts.userId, userIds));
    await tx.delete(users).where(inArray(users.id, userIds));
  }
  // Stocktakes a sync test filed -- ONLY at the sync test's own throwaway
  // branches (address "Sync test…"). A bare `note LIKE '%Sync test%'` also
  // matched staff's free-text notes on real counts.
  const syncBranchIds = (await tx.select({ id: branches.id }).from(branches).where(like(branches.address, "Sync test%"))).map(row => row.id);
  if (syncBranchIds.length) {
    const orphanCounts = await tx.select({ id: stockCounts.id }).from(stockCounts)
      .where(and(inArray(stockCounts.branchId, syncBranchIds), inArray(stockCounts.status, ["draft", "submitted", "cancelled"])));
    if (orphanCounts.length) {
      const ids = orphanCounts.map(row => row.id);
      await tx.delete(stockCountLines).where(inArray(stockCountLines.countId, ids));
      await tx.delete(stockCounts).where(inArray(stockCounts.id, ids));
    }
  }
  // Зөвхөн ТЕСТИЙН дарагдсан мэдэгдэл (marker + 1 цагаас хуучин). Өмнө нь БҮХ
  // `suppressed` мөр — ntfy унтраалттай үеийн бодит мэдэгдэл, мөн яг одоо
  // ажиллаж буй suite-ийн шалгах гэж буй мөрүүд ч устдаг байв.
  const suppressed = await tx.delete(notificationOutbox).where(and(
    eq(notificationOutbox.status, "suppressed"),
    eq(notificationOutbox.lastError, TEST_SUPPRESSED_MARKER),
    force ? sql`1 = 1` : lt(notificationOutbox.createdAt, new Date(cutoff)),
  ));
  return Number(suppressed[0].affectedRows ?? 0);
});
console.log(`Дууслаа. Тестийн дарагдсан мэдэгдлийн ${suppressedRows} мөр мөн цэвэрлэгдлээ.`);
process.exit(0);
