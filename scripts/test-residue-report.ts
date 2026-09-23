import "dotenv/config";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "../server/db";
import { branchStock, carts, orderItems, orders, productCategories, productVariants, products, stockCountLines, stockCounts, stockMovements, users } from "../drizzle/schema";

/**
 * Read-only inventory of throwaway rows earlier test runs left behind in the
 * live database (docs/PROJECT-GUIDE.md's open item, approved for deletion by Tom
 * 2026-09-12). Prints exactly what a deletion would touch -- products, the
 * orders that reference them, and the users those orders belong to -- so the
 * decision is made on the real numbers rather than a name guess.
 *
 *   pnpm exec tsx scripts/test-residue-report.ts
 *
 * The deleting counterpart is scripts/test-residue-purge.ts.
 */

// Deliberately narrow: each pattern matched a KNOWN test fixture name, and
// "%test%" on its own is not used -- a real product could legitimately be
// called that.
export const TEST_PRODUCT_PATTERNS = [
  "Ledger test product",
  "Telemetry Test Product",
  "Order Notify Test Product",
  "Analytics Test%",
  "Inventory test product",
  "Sync test %",
  "Branch stock test product",
  "Store credit checkout test product",
  "Store settings checkout test product",
  "Branches checkout test product",
  "Guest checkout test product",
  "Transfer test product%",
  "Alert test product%",
  // 2026-09-23: тасалсан run-аас үлдэж, дараагийн run-уудыг унагаж байсан
  // хоёр fixture (хайлтын тест "Gokujyun" гэж хайхад хуучин бараа гарч ирсэн).
  // Хайлтын тестийн нэр бодит брэндтэй ("Hada Labo …") тул БРЭНДЭЭР биш,
  // зөвхөн нэрийн төгсгөлийн өвөрмөц тэмдгээр (`search-test-<timestamp>`)
  // тааруулна — бодит барааны нэрэнд тэр мөр хэзээ ч байхгүй.
  "Automation test product",
  "%search-test-%",
  // 2026-09-23: suite-ийн бусад fixture — "Idempotency test product" нь
  // тасарсан run-аас үлдэж production-ы /shop дээр худалдан авагчдад
  // ХАРАГДАЖ байв. Эдгээр нь тестийн яг нэрс (grep "name: \"… test product")
  // тул бодит бараатай давхцахгүй.
  "Idempotency test product",
  "Cancel test product",
  "Notify test product",
  "OTP test product",
  "POS test product%",
  "Refund test product",
  "Unwind test product",
  "Wishlist test product",
];

export const TEST_USER_PATTERNS = ["%@example.invalid", "guest-checkout-test-%"];

/**
 * Orders a test wrote directly. Matched by the CUSTOMER NAME a fixture used,
 * because the products they referenced are long deleted (order_items.productId
 * is SET NULL) -- which is exactly how two "Telemetry Test Shopper" orders
 * stayed in the live revenue figures unnoticed.
 *
 * Every pattern here is a fixture name no shopper would type. "%tester%" is
 * NOT among them: the catalogue really does sell "Honey amproom tester".
 */
export const TEST_ORDER_CUSTOMER_PATTERNS = ["Telemetry Test %", "Analytics Test %", "Order Notify %", "Bulk Test Customer%", "Inventory test %", "Sync test %"];

export const TEST_CATEGORY_PATTERNS = ["Telemetry Test%", "Order Notify Test%", "Analytics Test%", "Inventory test category", "%test category%"];

export async function collectResidue() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");

  const productRows = await db.select({ id: products.id, name: products.name, sku: products.sku, categoryId: products.categoryId, createdAt: products.createdAt })
    .from(products).where(or(...TEST_PRODUCT_PATTERNS.map(pattern => like(products.name, pattern))));
  const productIds = productRows.map(row => row.id);

  const userRows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users).where(or(...TEST_USER_PATTERNS.map(pattern => like(users.email, pattern))));
  const userIds = userRows.map(row => row.id);

  // Orders that are test data: placed by a test user, or made only of test
  // products. An order mixing a real product with a test one would be left
  // alone (and is reported separately).
  const orderItemRows = productIds.length
    ? await db.select({ orderId: orderItems.orderId, productId: orderItems.productId, name: orderItems.productName }).from(orderItems).where(inArray(orderItems.productId, productIds))
    : [];
  const touchedOrderIds = Array.from(new Set(orderItemRows.map(row => row.orderId)));
  const orderRows = await db.select({ id: orders.id, orderNumber: orders.orderNumber, userId: orders.userId, customerName: orders.customerName, status: orders.status, paymentStatus: orders.paymentStatus, totalMnt: orders.totalMnt, createdAt: orders.createdAt })
    .from(orders).where(or(
      touchedOrderIds.length ? inArray(orders.id, touchedOrderIds) : sql`0 = 1`,
      userIds.length ? inArray(orders.userId, userIds) : sql`0 = 1`,
      ...TEST_ORDER_CUSTOMER_PATTERNS.map(pattern => like(orders.customerName, pattern)),
    ))
    .orderBy(desc(orders.id));
  const mixedOrders: number[] = [];
  for (const order of orderRows) {
    const [{ total }] = await db.select({ total: sql<number>`COUNT(*)` }).from(orderItems).where(eq(orderItems.orderId, order.id));
    const [{ test }] = await db.select({ test: sql<number>`COUNT(*)` }).from(orderItems).where(and(eq(orderItems.orderId, order.id), productIds.length ? inArray(orderItems.productId, productIds) : sql`0 = 1`));
    const byName = TEST_ORDER_CUSTOMER_PATTERNS.some(pattern => new RegExp(`^${pattern.replace(/%/g, ".*")}$`, "i").test(order.customerName));
    if (!byName && Number(total) !== Number(test) && !userIds.includes(order.userId ?? -1)) mixedOrders.push(order.id);
  }

  const categoryRows = await db.select({ id: productCategories.id, name: productCategories.name, slug: productCategories.slug })
    .from(productCategories).where(or(...TEST_CATEGORY_PATTERNS.map(pattern => like(productCategories.name, pattern))));
  const categoriesInUse = new Set<number>();
  for (const category of categoryRows) {
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(products).where(and(eq(products.categoryId, category.id), productIds.length ? sql`${products.id} NOT IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})` : sql`1 = 1`));
    if (Number(count) > 0) categoriesInUse.add(category.id);
  }

  const variantRows = productIds.length ? await db.select({ id: productVariants.id, productId: productVariants.productId }).from(productVariants).where(inArray(productVariants.productId, productIds)) : [];
  const variantIds = variantRows.map(row => row.id);
  const [{ movements }] = variantIds.length
    ? await db.select({ movements: sql<number>`COUNT(*)` }).from(stockMovements).where(inArray(stockMovements.variantId, variantIds))
    : [{ movements: 0 }];
  const [{ shelves }] = variantIds.length
    ? await db.select({ shelves: sql<number>`COUNT(*)` }).from(branchStock).where(inArray(branchStock.variantId, variantIds))
    : [{ shelves: 0 }];
  const [{ countLines }] = variantIds.length
    ? await db.select({ countLines: sql<number>`COUNT(*)` }).from(stockCountLines).where(inArray(stockCountLines.variantId, variantIds))
    : [{ countLines: 0 }];
  const [{ cartRows }] = userIds.length
    ? await db.select({ cartRows: sql<number>`COUNT(*)` }).from(carts).where(inArray(carts.userId, userIds))
    : [{ cartRows: 0 }];
  const countRows = await db.select({ id: stockCounts.id, code: stockCounts.code, status: stockCounts.status }).from(stockCounts).where(like(stockCounts.note, "%Sync test%"));

  return {
    products: productRows,
    variantIds,
    users: userRows,
    orders: orderRows.filter(order => !mixedOrders.includes(order.id)),
    mixedOrders,
    categories: categoryRows.filter(category => !categoriesInUse.has(category.id)),
    categoriesInUse: categoryRows.filter(category => categoriesInUse.has(category.id)),
    counts: { movements: Number(movements), shelves: Number(shelves), countLines: Number(countLines), carts: Number(cartRows), stockCounts: countRows.length },
  };
}

if (process.argv[1]?.includes("test-residue-report")) {
  const residue = await collectResidue();
  console.log(`\nПродукт (${residue.products.length}):`);
  for (const product of residue.products) console.log(`  #${product.id} ${product.name} · SKU ${product.sku} · ${product.createdAt.toISOString().slice(0, 10)}`);
  console.log(`\nХэрэглэгч (${residue.users.length}):`);
  for (const user of residue.users) console.log(`  #${user.id} ${user.name} · ${user.email} · ${user.role}`);
  console.log(`\nЗахиалга (${residue.orders.length}):`);
  for (const order of residue.orders) console.log(`  #${order.id} ${order.orderNumber} · ${order.customerName} · ${order.status}/${order.paymentStatus} · ${order.totalMnt}₮`);
  console.log(`\nАнгилал устгах боломжтой (${residue.categories.length}): ${residue.categories.map(category => category.name).join(", ") || "—"}`);
  console.log(`Ангилал бодит бараатай тул ҮЛДЭНЭ (${residue.categoriesInUse.length}): ${residue.categoriesInUse.map(category => category.name).join(", ") || "—"}`);
  console.log(`\nХолбоотой мөрүүд: variant ${residue.variantIds.length}, хөдөлгөөн ${residue.counts.movements}, тавиур ${residue.counts.shelves}, тооллогын мөр ${residue.counts.countLines}, сагс ${residue.counts.carts}, тооллого ${residue.counts.stockCounts}`);
  console.log(`\nХолимог захиалга (бодит бараатай тул ҮЛДЭНЭ): ${residue.mixedOrders.join(", ") || "—"}`);
  process.exit(0);
}
