import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { adminAuditLogs, branches, branchStock, notificationOutbox, productCategories, products, productVariants, stockMovements, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { getStockLedgerDrift } from "./stockLedger";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

/**
 * Warehouse -> store transfers (2026-09-11, Phase 4): goods leave the
 * warehouse when sent, the store counts blind, differences are recorded and
 * resolved by an admin, every stock change is on the ledger. Throwaway
 * branches, products and users only; everything cascades away afterwards.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeWithDatabase("stock transfers: warehouse -> store, scan-to-reconcile", () => {
  const marker = `trf${Date.now().toString(36)}`;
  const ids = { admin: 0, warehouse: 0, staff: 0, otherStaff: 0 };
  let warehouseId = 0;
  let storeId = 0;
  let otherStoreId = 0;
  let categoryId = 0;
  const productIds: number[] = [];
  let variantA = 0;
  let variantB = 0;
  const stamp = Date.now().toString().slice(-10);
  const skuA = `970${stamp}`;
  const skuB = `971${stamp}`;

  function caller(key: keyof typeof ids, role: string) {
    return appRouter.createCaller({
      user: { id: ids[key], email: `${marker}-${key}@example.invalid`, name: `Transfer ${key}`, role, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as TrpcContext["user"],
      req: { protocol: "https", headers: {}, ip: `203.0.190.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.190.1" }, get: () => "localhost" } as unknown as TrpcContext["req"],
      res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
    });
  }
  const admin = () => caller("admin", "admin");
  const warehouse = () => caller("warehouse", "warehouse");
  const staff = () => caller("staff", "staff");

  async function shelf(branchId: number, variantId: number) {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const [row] = await db.select({ quantity: branchStock.stockQuantity }).from(branchStock).where(and(eq(branchStock.branchId, branchId), eq(branchStock.variantId, variantId))).limit(1);
    return row?.quantity ?? 0;
  }

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    for (const [key, role] of [["admin", "admin"], ["warehouse", "warehouse"], ["staff", "staff"], ["otherStaff", "staff"]] as const) {
      ids[key] = Number((await db.insert(users).values({ email: `${marker}-${key}@example.invalid`, passwordHash: await hashPassword("TransferPassw0rd!"), name: `Transfer ${key}`, role, emailVerifiedAt: new Date() }))[0].insertId);
    }
    warehouseId = (await admin().admin.createBranch({ name: `${marker} агуулах`, slug: `${marker}-wh`, address: "Transfer test warehouse", isActive: true, kind: "warehouse", countsTowardOnlineStock: false })).id;
    storeId = (await admin().admin.createBranch({ name: `${marker} дэлгүүр`, slug: `${marker}-store`, address: "Transfer test store", isActive: true, countsTowardOnlineStock: false })).id;
    otherStoreId = (await admin().admin.createBranch({ name: `${marker} өөр`, slug: `${marker}-other`, address: "Transfer test other", isActive: true, countsTowardOnlineStock: false })).id;
    await admin().admin.updateUserBranch({ userId: ids.staff, branchId: storeId });
    await admin().admin.updateUserBranch({ userId: ids.otherStaff, branchId: otherStoreId });
    categoryId = Number((await db.insert(productCategories).values({ name: "Transfer test category", slug: `${marker}-category`, sortOrder: 99999, isActive: true }))[0].insertId);
    for (const [sku, name] of [[skuA, "Transfer test A"], [skuB, "Transfer test B"]] as const) {
      const productId = Number((await db.insert(products).values({ categoryId, name, slug: `${marker}-${sku}`, sku, priceMnt: 1000, stockQuantity: 0, isPublished: true }))[0].insertId);
      productIds.push(productId);
      const variantId = Number((await db.insert(productVariants).values({ productId, sku, priceMnt: 1000, stockQuantity: 0, isDefault: true }))[0].insertId);
      if (sku === skuA) variantA = variantId; else variantB = variantId;
    }
    // Warehouse holds 4 of A and 3 of B, recorded on the ledger.
    await admin().admin.setBranchStock({ branchId: warehouseId, variantId: variantA, quantity: 4 });
    await admin().admin.setBranchStock({ branchId: warehouseId, variantId: variantB, quantity: 3 });
    // 4 password hashes + ~15 sequential Aiven round trips: more than the
    // default 10s hook budget.
  }, 60_000);

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(notificationOutbox).where(like(notificationOutbox.message, `%${marker}%`));
    if (productIds.length) await db.delete(products).where(inArray(products.id, productIds));
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    const branchIds = [warehouseId, storeId, otherStoreId].filter(Boolean);
    const userIds = Object.values(ids).filter(Boolean);
    await db.update(users).set({ branchId: null }).where(inArray(users.id, userIds));
    if (branchIds.length) await db.delete(branches).where(inArray(branches.id, branchIds));
    await db.delete(adminAuditLogs).where(inArray(adminAuditLogs.actorUserId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }, 60_000);

  let transferId = 0;

  it("lets only warehouse/admin pack and send, and refuses to send what the shelf does not have", async () => {
    await expect(staff().inventory.createTransfer({ fromBranchId: warehouseId, toBranchId: storeId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const transfer = await warehouse().inventory.createTransfer({ fromBranchId: warehouseId, toBranchId: storeId });
    transferId = transfer.id;
    expect(transfer.code).toMatch(/^TR-\d{6}-[A-Z0-9]{4}$/);
    // Before sending, the destination store does not see it at all.
    await expect(staff().inventory.transfer({ id: transferId })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await warehouse().inventory.saveTransferLines({ id: transferId, lines: [{ code: skuA, quantity: 9 }, { code: "4999999999990", quantity: 1 }] });
    await expect(warehouse().inventory.sendTransfer({ id: transferId })).rejects.toThrow(/бүртгэлгүй/);
    await warehouse().inventory.saveTransferLines({ id: transferId, lines: [{ code: skuA, quantity: 9 }] });
    await expect(warehouse().inventory.sendTransfer({ id: transferId })).rejects.toThrow(/байгаа 4, илгээх 9/);
    expect(await shelf(warehouseId, variantA)).toBe(4);

    await warehouse().inventory.saveTransferLines({ id: transferId, lines: [{ code: skuA, quantity: 3 }] });
    const sent = await warehouse().inventory.sendTransfer({ id: transferId });
    expect(sent.status).toBe("sent");
    expect(await shelf(warehouseId, variantA)).toBe(1);
    await expect(warehouse().inventory.sendTransfer({ id: transferId })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await shelf(warehouseId, variantA)).toBe(1);
  });

  it("shows the receiving store a blind count, and nothing to other stores", async () => {
    const seen = await staff().inventory.transfer({ id: transferId });
    expect(seen.blind).toBe(true);
    expect(seen.lines.every(line => line.qtySent === null)).toBe(true);
    expect(seen.reconciliation).toBeNull();
    const listed = (await staff().inventory.transfers()).find(row => row.id === transferId);
    expect(listed).toMatchObject({ pieces: null, lineCount: null });
    await expect(caller("otherStaff", "staff").inventory.transfer({ id: transferId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("otherStaff", "staff").inventory.confirmTransfer({ id: transferId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("adds what arrived to the store, records the difference, and alerts admin", async () => {
    // Sent 3 of A; 2 arrived, plus one B that was never on the list.
    await staff().inventory.saveTransferReceived({ id: transferId, lines: [{ code: skuA, quantity: 2 }, { code: skuB, quantity: 1 }] });
    const received = await staff().inventory.confirmTransfer({ id: transferId, note: `${marker} box torn` });
    expect(received).toMatchObject({ status: "received", discrepancyStatus: "open" });
    expect(received.reconciliation).toMatchObject({ short: 1, unexpected: 1, missingPieces: 1 });
    expect(await shelf(storeId, variantA)).toBe(2);
    expect(await shelf(storeId, variantB)).toBe(1);
    await expect(staff().inventory.confirmTransfer({ id: transferId })).rejects.toMatchObject({ code: "CONFLICT" });

    const db = await getDb();
    if (!db) throw new Error("no db");
    const pushes = await db.select({ eventType: notificationOutbox.eventType, groupKey: notificationOutbox.groupKey, priority: notificationOutbox.priority }).from(notificationOutbox).where(like(notificationOutbox.dedupeKey, `%|transfer:${transferId}`));
    expect(pushes.filter(row => row.eventType === "transfer.sent").map(row => row.groupKey).sort()).toEqual(["admin", "store"]);
    expect(pushes.filter(row => row.eventType === "transfer.discrepancy").every(row => row.priority === 5)).toBe(true);
    expect(pushes.some(row => row.eventType === "transfer.received")).toBe(true);
  });

  it("leaves every mismatch to an admin, and records each decision as real stock", async () => {
    const detail = await admin().inventory.transfer({ id: transferId });
    const lineA = detail.lines.find(line => line.code === skuA)!;
    const lineB = detail.lines.find(line => line.code === skuB)!;
    await expect(staff().inventory.resolveTransferLine({ lineId: lineA.id, resolution: "write_off" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin().inventory.resolveTransferLine({ lineId: lineA.id, resolution: "accepted_over" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // The missing A was found back at the warehouse.
    await admin().inventory.resolveTransferLine({ lineId: lineA.id, resolution: "returned_to_source", note: "Тавиур дээр үлдсэн" });
    expect(await shelf(warehouseId, variantA)).toBe(2);
    // The extra B really came from the warehouse shelf.
    const resolved = await admin().inventory.resolveTransferLine({ lineId: lineB.id, resolution: "deducted_from_source" });
    expect(await shelf(warehouseId, variantB)).toBe(2);
    expect(resolved.discrepancyStatus).toBe("resolved");
    await expect(admin().inventory.resolveTransferLine({ lineId: lineA.id, resolution: "write_off" })).rejects.toMatchObject({ code: "CONFLICT" });

    const db = await getDb();
    if (!db) throw new Error("no db");
    const moves = await db.select({ type: stockMovements.type, delta: stockMovements.delta, branchId: stockMovements.branchId }).from(stockMovements).where(and(eq(stockMovements.refType, "transfer"), eq(stockMovements.refId, transferId))).orderBy(stockMovements.id);
    expect(moves.map(row => [row.type, row.branchId === warehouseId ? "wh" : "store", row.delta])).toEqual([
      ["transfer_out", "wh", -3], ["transfer_in", "store", 2], ["transfer_in", "store", 1], ["transfer_return", "wh", 1], ["transfer_out", "wh", -1],
    ]);
    const drift = (await getStockLedgerDrift(db, 100_000)).examples.filter(row => [warehouseId, storeId].includes(row.branchId));
    expect(drift).toEqual([]);
  });

  it("returns a cancelled in-transit transfer to the warehouse (admin only)", async () => {
    const transfer = await warehouse().inventory.createTransfer({ fromBranchId: warehouseId, toBranchId: storeId });
    await warehouse().inventory.saveTransferLines({ id: transfer.id, lines: [{ code: skuB, quantity: 2 }] });
    await warehouse().inventory.sendTransfer({ id: transfer.id });
    expect(await shelf(warehouseId, variantB)).toBe(0);
    await expect(warehouse().inventory.cancelTransfer({ id: transfer.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await admin().inventory.cancelTransfer({ id: transfer.id });
    expect(await shelf(warehouseId, variantB)).toBe(2);
    expect((await admin().inventory.transfer({ id: transfer.id })).status).toBe("cancelled");
  });
});
