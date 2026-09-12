import "dotenv/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { adminAuditLogs, branchStock, cartItems, carts, loginAttempts, notificationOutbox, orderItems, orders, productCategories, productVariants, products, stockCountLines, stockCounts, stockMovements, users } from "../drizzle/schema";
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

// Order matters: rows that reference others go first. (Several of these
// cascade anyway; doing it explicitly keeps the counts honest in the log.)
if (orderIds.length) {
  await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
  await db.delete(orders).where(inArray(orders.id, orderIds));
}
if (variantIds.length) {
  await db.delete(stockCountLines).where(inArray(stockCountLines.variantId, variantIds));
  await db.delete(stockMovements).where(inArray(stockMovements.variantId, variantIds));
  await db.delete(branchStock).where(inArray(branchStock.variantId, variantIds));
  await db.delete(cartItems).where(inArray(cartItems.variantId, variantIds));
  await db.delete(productVariants).where(inArray(productVariants.id, variantIds));
}
if (productIds.length) await db.delete(products).where(inArray(products.id, productIds));
if (residue.categories.length) await db.delete(productCategories).where(inArray(productCategories.id, residue.categories.map(category => category.id)));
if (userIds.length) {
  const cartIds = (await db.select({ id: carts.id }).from(carts).where(inArray(carts.userId, userIds))).map(row => row.id);
  if (cartIds.length) {
    await db.delete(cartItems).where(inArray(cartItems.cartId, cartIds));
    await db.delete(carts).where(inArray(carts.id, cartIds));
  }
  await db.delete(adminAuditLogs).where(inArray(adminAuditLogs.actorUserId, userIds));
  await db.delete(loginAttempts).where(inArray(loginAttempts.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}
// Stocktakes a sync test filed, and the notifications they queued.
const orphanCounts = await db.select({ id: stockCounts.id }).from(stockCounts)
  .where(and(sql`${stockCounts.note} LIKE '%Sync test%'`, inArray(stockCounts.status, ["draft", "submitted", "cancelled"])));
if (orphanCounts.length) {
  const ids = orphanCounts.map(row => row.id);
  await db.delete(stockCountLines).where(inArray(stockCountLines.countId, ids));
  await db.delete(stockCounts).where(inArray(stockCounts.id, ids));
}
const suppressed = await db.delete(notificationOutbox).where(eq(notificationOutbox.status, "suppressed"));
console.log(`Дууслаа. Дарагдсан мэдэгдлийн ${Number(suppressed[0].affectedRows ?? 0)} мөр мөн цэвэрлэгдлээ.`);
process.exit(0);
