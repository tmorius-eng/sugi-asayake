import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { branches, branchStock, externalRefs, integrationSyncState, notificationOutbox, productCategories, products, productVariants, stockCountLines, stockCounts, stockMovements, users } from "../drizzle/schema";
import { getDb } from "./db";
import { postCount } from "./inventory";
import { applyBranchStockDelta } from "./stockLedger";
import { FakeInventorySyncProvider, runPullSales, runPullSnapshot, runPushMovements, seedSyncCursor, setBranchExternalId, type StockSnapshot } from "./integrations/inventorySync";
import { hashPassword } from "./_core/password";

/**
 * The vendor-neutral sync runners (server/integrations/inventorySync.ts)
 * against the real database, driven by FakeInventorySyncProvider -- the
 * bookkeeping the Smart Software adapter depends on: which movements are
 * eligible to push, that a pulled sale is recorded exactly once, and that a
 * stock snapshot becomes a stocktake to APPROVE rather than a stock write.
 *
 * Everything runs in its own provider namespace (never "smartsoftware"), so
 * the shop's own sync cursors and branch codes are untouched even if this
 * runs against production data; all throwaway rows are deleted in afterAll.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("inventory sync runners (fake provider)", () => {
  const marker = `sync${Date.now().toString(36)}`;
  const namespace = `test-${marker}`;
  // autoApply is pinned per test rather than read from the shop's settings
  // row: these cases are about the bookkeeping, and the default (on) is
  // exercised by its own describe block at the bottom of this file.
  const options = { namespace, lagSeconds: 0, autoApply: false };
  const skuA = `98${Date.now().toString().slice(-11)}`;
  const skuB = `97${Date.now().toString().slice(-11)}`;
  const locationId = `LOC-${marker}`;
  let branchId = 0;
  let otherBranchId = 0;
  let adminId = 0;
  let categoryId = 0;
  const productIds: number[] = [];
  let variantA = 0;
  let variantB = 0;

  async function db() {
    const database = await getDb();
    if (!database) throw new Error("DATABASE_URL is required.");
    return database;
  }

  async function shelf(variantId: number) {
    const [row] = await (await db()).select({ quantity: branchStock.stockQuantity }).from(branchStock).where(and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, variantId))).limit(1);
    return row?.quantity ?? 0;
  }

  async function openCounts() {
    return (await db()).select({ id: stockCounts.id, code: stockCounts.code, status: stockCounts.status }).from(stockCounts).where(eq(stockCounts.branchId, branchId));
  }

  const snapshotOf = (stock: Record<string, Record<string, number>>): StockSnapshot => ({
    products: Object.entries(stock).map(([sku, byLocation]) => ({ sku, name: `Vendor ${sku}`, stock: byLocation })),
    locationIds: Array.from(new Set(Object.values(stock).flatMap(byLocation => Object.keys(byLocation)))),
    fetchedAt: new Date(),
  });

  beforeAll(async () => {
    const database = await db();
    adminId = Number((await database.insert(users).values({ email: `${marker}-admin@example.invalid`, passwordHash: await hashPassword("SyncPassw0rd!"), name: "Sync admin", role: "admin", emailVerifiedAt: new Date() }))[0].insertId);
    branchId = Number((await database.insert(branches).values({ name: `${marker} store`, slug: `${marker}-store`, address: "Sync test", isActive: true, sortOrder: 9999 }))[0].insertId);
    otherBranchId = Number((await database.insert(branches).values({ name: `${marker} other`, slug: `${marker}-other`, address: "Sync test other", isActive: true, sortOrder: 9999 }))[0].insertId);
    categoryId = Number((await database.insert(productCategories).values({ name: `${marker} category`, slug: `${marker}-category`, sortOrder: 99999, isActive: true }))[0].insertId);
    for (const sku of [skuA, skuB]) {
      const productId = Number((await database.insert(products).values({ categoryId, name: `Sync test ${sku}`, slug: `${marker}-${sku}`, sku, priceMnt: 10_000, stockQuantity: 0, isPublished: true }))[0].insertId);
      productIds.push(productId);
      const variantId = Number((await database.insert(productVariants).values({ productId, sku, priceMnt: 10_000, stockQuantity: 0, isDefault: true }))[0].insertId);
      if (sku === skuA) variantA = variantId; else variantB = variantId;
      await database.insert(branchStock).values({ branchId, variantId, stockQuantity: 0 });
    }
    await setBranchExternalId(branchId, locationId, options);
  });

  afterAll(async () => {
    const database = await getDb();
    if (!database) return;
    const countRows = await database.select({ id: stockCounts.id }).from(stockCounts).where(inArray(stockCounts.branchId, [branchId, otherBranchId]));
    if (countRows.length) {
      await database.delete(stockCountLines).where(inArray(stockCountLines.countId, countRows.map(row => row.id)));
      await database.delete(stockCounts).where(inArray(stockCounts.id, countRows.map(row => row.id)));
    }
    await database.delete(stockMovements).where(inArray(stockMovements.branchId, [branchId, otherBranchId]));
    await database.delete(branchStock).where(inArray(branchStock.branchId, [branchId, otherBranchId]));
    await database.delete(externalRefs).where(eq(externalRefs.provider, namespace));
    await database.delete(integrationSyncState).where(eq(integrationSyncState.provider, namespace));
    await database.delete(notificationOutbox).where(inArray(notificationOutbox.dedupeKey, countRows.map(row => `count.submitted|count:${row.id}`)));
    await database.delete(productVariants).where(inArray(productVariants.id, [variantA, variantB]));
    await database.delete(products).where(inArray(products.id, productIds));
    await database.delete(productCategories).where(eq(productCategories.id, categoryId));
    await database.delete(branches).where(inArray(branches.id, [branchId, otherBranchId]));
    await database.delete(users).where(eq(users.id, adminId));
  });

  it("files the vendor's figures as a stocktake to approve, and never writes stock itself", async () => {
    await applyBranchStockDelta(await db(), branchId, variantA, 4, { type: "receipt", note: `${marker} seed` });
    const provider = new FakeInventorySyncProvider();
    // The vendor says 7 of A (we think 4) and 0 of B (we also think 0).
    provider.snapshot = snapshotOf({ [skuA]: { [locationId]: 7 }, [skuB]: { [locationId]: 0 } });

    const result = await runPullSnapshot(provider, options);
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.matchedProducts).toBe(2);
    const [branchResult] = result.branches;
    expect(branchResult.countId).toBeGreaterThan(0);
    // Only the line that actually differs is proposed.
    expect(branchResult.lines).toBe(1);
    expect(await shelf(variantA)).toBe(4); // stock untouched until someone approves

    const database = await db();
    const [count] = await database.select().from(stockCounts).where(eq(stockCounts.id, branchResult.countId!)).limit(1);
    expect(count.status).toBe("submitted"); // waiting in the approval queue
    expect(count.scope).toBe("partial"); // never zeroes what the vendor did not report
    expect(count.note).toContain("Smart POS");
    const lines = await database.select().from(stockCountLines).where(eq(stockCountLines.countId, count.id));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ scannedCode: skuA, variantId: variantA, countedQty: 7, systemQtyAtFirstScan: 4 });

    // Approving it moves the shelf through the normal count path, on the ledger.
    await postCount({ id: adminId, role: "admin", branchId: null }, count.id);
    expect(await shelf(variantA)).toBe(7);
    const movements = await database.select().from(stockMovements).where(and(eq(stockMovements.branchId, branchId), eq(stockMovements.type, "count_adjust")));
    expect(movements.map(movement => movement.delta)).toEqual([3]);
  });

  it("proposes nothing when the vendor agrees with our shelves", async () => {
    const provider = new FakeInventorySyncProvider();
    provider.snapshot = snapshotOf({ [skuA]: { [locationId]: 7 } });
    const before = (await openCounts()).length;
    const result = await runPullSnapshot(provider, options);
    expect(result.ran && result.branches[0].countId).toBeNull();
    expect((await openCounts()).length).toBe(before);
  });

  it("reports unmapped locations and barcodes we do not stock, instead of guessing", async () => {
    const provider = new FakeInventorySyncProvider();
    provider.snapshot = snapshotOf({ [skuA]: { [locationId]: 7, "SOMEWHERE-ELSE": 3 }, "0000000000000": { [locationId]: 9 } });
    const result = await runPullSnapshot(provider, options);
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.unmappedLocations).toContain("SOMEWHERE-ELSE");
    expect(result.unknownSkus).toContain("0000000000000");
    expect(result.matchedProducts).toBe(1);
  });

  it("keeps one open proposal per branch: a newer snapshot cancels the older one", async () => {
    const provider = new FakeInventorySyncProvider();
    provider.snapshot = snapshotOf({ [skuA]: { [locationId]: 11 } });
    const first = await runPullSnapshot(provider, options);
    provider.snapshot = snapshotOf({ [skuA]: { [locationId]: 12 } });
    const second = await runPullSnapshot(provider, options);
    expect(first.ran && second.ran).toBe(true);
    if (!first.ran || !second.ran) return;
    const open = (await openCounts()).filter(count => count.status === "submitted" || count.status === "draft");
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe(second.branches[0].countId);
  });

  it("matches a barcode the vendor spaced or hyphenated, rather than calling it unknown", async () => {
    const provider = new FakeInventorySyncProvider();
    // The same barcode as skuA, formatted the way a code picked out of a
    // spreadsheet or a printed list arrives.
    const spaced = `${skuA.slice(0, 4)} ${skuA.slice(4, 8)}-${skuA.slice(8)}`;
    provider.snapshot = snapshotOf({ [spaced]: { [locationId]: 21 } });
    const result = await runPullSnapshot(provider, options);
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.unknownSkuCount).toBe(0);
    expect(result.matchedProducts).toBe(1);
    expect(result.branches[0].countId).toBeGreaterThan(0);
    const lines = await (await db()).select().from(stockCountLines).where(eq(stockCountLines.countId, result.branches[0].countId!));
    // Stored under OUR barcode, not the vendor's spacing.
    expect(lines[0]).toMatchObject({ scannedCode: skuA, countedQty: 21 });
  });


  // ---- auto-apply (2026-09-15) ------------------------------------------
  // Tom's call: stock posts by itself, so nobody approves a stocktake every
  // fifteen minutes. What must still hold is that it posts THROUGH the count
  // path -- on the ledger, with a stocktake left behind as the record -- and
  // that it stops itself when the vendor's feed stops making sense.
  const autoOptions = { ...options, autoApply: true };

  it("posts the vendor's figures straight to stock, on the ledger, with no person attached", async () => {
    const database = await db();
    const provider = new FakeInventorySyncProvider();
    const before = await shelf(variantA);
    provider.snapshot = snapshotOf({ [skuA]: { [locationId]: before + 5 }, [skuB]: { [locationId]: 0 } });

    const result = await runPullSnapshot(provider, autoOptions);
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.autoApplied).toHaveLength(1);
    expect(result.autoApplySkipped).toBeNull();
    expect(await shelf(variantA)).toBe(before + 5);

    const countId = result.branches[0].countId!;
    const [count] = await database.select().from(stockCounts).where(eq(stockCounts.id, countId)).limit(1);
    // Posted, not merely closed: the stocktake is the history of what moved.
    expect(count.status).toBe("posted");
    // An automatic adjustment is never attributed to whoever was logged in.
    expect(count.postedByUserId).toBeNull();
    const movements = await database.select().from(stockMovements).where(and(eq(stockMovements.refType, "count"), eq(stockMovements.refId, countId)));
    expect(movements).toHaveLength(1);
    expect(movements[0].actorUserId).toBeNull();
    expect(movements[0].delta).toBe(5);
  });

  it("leaves a product the vendor did not send completely alone", async () => {
    const database = await db();
    await applyBranchStockDelta(database, branchId, variantB, 6, { type: "receipt", note: `${marker} keep` });
    const kept = await shelf(variantB);
    const provider = new FakeInventorySyncProvider();
    // Only A is in the feed. B must not be read as "the vendor says zero".
    provider.snapshot = snapshotOf({ [skuA]: { [locationId]: 3 } });
    await runPullSnapshot(provider, autoOptions);
    expect(await shelf(variantB)).toBe(kept);
  });

  it("stops itself when the vendor's list collapses, and says so", async () => {
    const database = await db();
    const provider = new FakeInventorySyncProvider();
    // A full feed first, so the next run has something to compare against.
    provider.snapshot = snapshotOf({ [skuA]: { [locationId]: 9 }, [skuB]: { [locationId]: 9 } });
    await runPullSnapshot(provider, { ...autoOptions, sanityDropPercent: 30 });
    const settled = await shelf(variantA);

    // Their docs' own warning made real: untick "ECommerce борлуулах бараа"
    // in Retail and the feed shrinks. Applied blindly, the rest of the
    // catalogue would be zeroed in one run.
    provider.snapshot = snapshotOf({ [skuA]: { [locationId]: 1 } });
    const result = await runPullSnapshot(provider, { ...autoOptions, sanityDropPercent: 30 });
    expect(result.ran).toBe(true);
    if (!result.ran) return;
    expect(result.autoApplied).toHaveLength(0);
    expect(result.autoApplySkipped).toContain("%");
    expect(await shelf(variantA)).toBe(settled);

    const countId = result.branches[0].countId!;
    const [count] = await database.select().from(stockCounts).where(eq(stockCounts.id, countId)).limit(1);
    expect(count.status).toBe("submitted"); // back in the approval queue
    const alerts = await database.select().from(notificationOutbox).where(eq(notificationOutbox.eventType, "stock.vendor_sync_blocked"));
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("keeps the approval queue quiet while it is posting its own counts", async () => {
    const database = await db();
    const provider = new FakeInventorySyncProvider();
    const before = (await database.select({ id: notificationOutbox.id }).from(notificationOutbox).where(eq(notificationOutbox.eventType, "count.submitted"))).length;
    provider.snapshot = snapshotOf({ [skuA]: { [locationId]: (await shelf(variantA)) + 2 } });
    await runPullSnapshot(provider, autoOptions);
    const after = (await database.select({ id: notificationOutbox.id }).from(notificationOutbox).where(eq(notificationOutbox.eventType, "count.submitted"))).length;
    // A "please approve this" push every fifteen minutes for something
    // nobody has to approve is how a notification channel gets muted.
    expect(after).toBe(before);
  });

  it("pushes only movements at a mapped branch, never the ones that came from the vendor", async () => {
    const database = await db();
    // Start the stream at "now": a fresh namespace must not begin by walking
    // the shop's entire movement history.
    const [{ latest }] = await database.select({ latest: sql<number>`COALESCE(MAX(${stockMovements.id}), 0)` }).from(stockMovements);
    await seedSyncCursor("push", String(Number(latest)), options);
    // one ordinary movement, one echoed back from the vendor
    await applyBranchStockDelta(database, branchId, variantB, 5, { type: "receipt", note: `${marker} push` });
    await applyBranchStockDelta(database, branchId, variantB, -1, { type: "sale_pos_external", refType: "external", note: `${marker} echo` }, { allowNegative: true });
    await applyBranchStockDelta(database, otherBranchId, variantB, 2, { type: "receipt", note: `${marker} unmapped` });

    const provider = new FakeInventorySyncProvider();
    const result = await runPushMovements(provider, options);
    expect(result.pushed).toBe(1);
    expect(provider.received).toHaveLength(1);
    expect(provider.received[0]).toMatchObject({ branchExternalId: locationId, sku: skuB, delta: 5, type: "receipt" });
  });

  it("holds the cursor at the first refused movement so nothing after it is skipped", async () => {
    const database = await db();
    const provider = new FakeInventorySyncProvider();
    await applyBranchStockDelta(database, branchId, variantB, 1, { type: "receipt", note: `${marker} first` });
    await applyBranchStockDelta(database, branchId, variantB, 1, { type: "receipt", note: `${marker} second` });
    const pending = await database.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.branchId, branchId), eq(stockMovements.variantId, variantB)));
    const refused = pending[pending.length - 2].id;
    provider.refuse.set(refused, { reason: "vendor busy", retryable: true });
    const result = await runPushMovements(provider, options);
    expect(result.pushed).toBeLessThan(pending.length);
    const [state] = await database.select().from(integrationSyncState).where(and(eq(integrationSyncState.provider, namespace), eq(integrationSyncState.stream, "push")));
    expect(Number(state.cursor)).toBeLessThan(refused);
    expect(state.lastError).toContain("vendor busy");
  });

  it("records a pulled sale exactly once, however often it is served", async () => {
    const sale = { externalId: `${marker}-sale-1`, branchExternalId: locationId, occurredAt: new Date(), lines: [{ sku: skuA, quantity: 2 }] };
    const before = await shelf(variantA);
    const first = await runPullSales(new FakeInventorySyncProvider([sale]), options);
    expect(first.recorded).toBe(1);
    expect(await shelf(variantA)).toBe(before - 2);
    // The vendor serves the same sale again (a retried page, a restarted cursor).
    const second = await runPullSales(new FakeInventorySyncProvider([sale]), { ...options, namespace });
    expect(second.recorded).toBe(0);
    expect(await shelf(variantA)).toBe(before - 2);
  });

  it("does not invent a shelf for a sale at a location nobody mapped", async () => {
    const sale = { externalId: `${marker}-sale-2`, branchExternalId: "NOT-MAPPED", occurredAt: new Date(), lines: [{ sku: skuA, quantity: 1 }] };
    // The fake serves its list from the stored cursor; rewind so this new
    // list is actually offered.
    await seedSyncCursor("sales", "0", options);
    const result = await runPullSales(new FakeInventorySyncProvider([sale]), options);
    expect(result.recorded).toBe(0);
    expect(result.problems?.[0]).toContain("unknown store");
  });
});
