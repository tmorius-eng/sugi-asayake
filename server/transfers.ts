import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { sqlInt } from "./_core/sqlSafe";
import { alias } from "drizzle-orm/mysql-core";
import { branches, branchStock, products, productVariants, stockTransferLines, stockTransfers } from "../drizzle/schema";
import { normaliseBarcode } from "../shared/barcode";
import { OVER_RESOLUTIONS, reconcileTransfer, SHORT_RESOLUTIONS, type TransferResolution } from "../shared/transfer-reconcile";
import { getDb } from "./db";
import { assertCanOperateOnBranch, generateInventoryCode, InventoryError, resolveCodes, type InventoryActor } from "./inventory";
import { enqueueNotification } from "./notificationOutbox";
import { applyBranchStockDelta, StockShortageError } from "./stockLedger";

/**
 * Warehouse -> store transfers, checked by scanning at both ends
 * (2026-09-11, Phase 4 -- Tom's flow, see migration 0065):
 *
 *   draft     warehouse scans what goes in the box (qtySent per code)
 *   sent      goods leave the SOURCE shelf now ('transfer_out'), in transit
 *   received  the store scanned what arrived WITHOUT seeing qtySent (a
 *             blind count), confirmed; arrivals added to the DESTINATION
 *             ('transfer_in'); any mismatch recorded and pushed to admin
 *   cancelled a draft simply closes; a SENT transfer only by admin, and its
 *             goods go back to the source ('transfer_return')
 *
 * Mismatched lines stay open until an admin resolves each one. Every stock
 * change goes through server/stockLedger.ts, guarded, exactly once.
 */

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

const isWarehouseOrAdmin = (actor: InventoryActor) => actor.role === "admin" || actor.role === "warehouse";

type SaveLine = { code: string; quantity: number };

function cleanLines(lines: SaveLine[]) {
  const byCode = new Map<string, number>();
  for (const line of lines) {
    const code = normaliseBarcode(line.code);
    const quantity = Math.floor(line.quantity);
    if (!code || code.length > 80 || !Number.isFinite(quantity) || quantity <= 0) continue;
    byCode.set(code, Math.min(9999, quantity));
  }
  return Array.from(byCode, ([code, quantity]) => ({ code, quantity }));
}

async function describeVariants(variantIds: number[]) {
  const db = await requireDb();
  if (!variantIds.length) return new Map<number, { sku: string; name: string }>();
  const rows = await db.select({ id: productVariants.id, sku: productVariants.sku, name: products.name }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(inArray(productVariants.id, variantIds));
  return new Map(rows.map(row => [row.id, { sku: row.sku, name: row.name }]));
}

/** Transfers the actor can see: warehouse/admin all; a store consultant
 *  only those arriving at (or leaving) their own branch. */
export async function listTransfers(actor: InventoryActor, options: { branchId?: number; limit?: number } = {}) {
  const db = await requireDb();
  const fromBranch = alias(branches, "from_branch");
  const toBranch = alias(branches, "to_branch");
  const scope = actor.role === "staff" ? (actor.branchId ?? -1) : options.branchId;
  const rows = await db.select({
    id: stockTransfers.id, code: stockTransfers.code, status: stockTransfers.status, discrepancyStatus: stockTransfers.discrepancyStatus,
    fromBranchId: stockTransfers.fromBranchId, fromBranchName: fromBranch.name, toBranchId: stockTransfers.toBranchId, toBranchName: toBranch.name,
    createdAt: stockTransfers.createdAt, sentAt: stockTransfers.sentAt, receivedAt: stockTransfers.receivedAt,
    lineCount: sql<number>`(SELECT COUNT(*) FROM stock_transfer_lines l WHERE l.transferId = ${stockTransfers.id} AND l.qtySent > 0)`,
    pieces: sql<number>`(SELECT COALESCE(SUM(l.qtySent), 0) FROM stock_transfer_lines l WHERE l.transferId = ${stockTransfers.id})`,
  }).from(stockTransfers)
    .innerJoin(fromBranch, eq(fromBranch.id, stockTransfers.fromBranchId))
    .innerJoin(toBranch, eq(toBranch.id, stockTransfers.toBranchId))
    .where(scope !== undefined ? or(eq(stockTransfers.toBranchId, scope), eq(stockTransfers.fromBranchId, scope)) : undefined)
    .orderBy(desc(stockTransfers.id)).limit(options.limit ?? 40);
  // A store only ever sees transfers addressed to it once they are on the
  // way -- a warehouse draft is not the store's business yet.
  const visible = actor.role === "staff" ? rows.filter(row => row.toBranchId !== actor.branchId || row.status !== "draft") : rows;
  // Blind count: a consultant receiving a transfer must not learn from the
  // list how many pieces to expect either.
  const hideCounts = (row: (typeof rows)[number]) => actor.role === "staff" && row.status === "sent" && row.toBranchId === actor.branchId;
  return visible.map(row => ({ ...row, lineCount: hideCounts(row) ? null : Number(row.lineCount), pieces: hideCounts(row) ? null : Number(row.pieces) }));
}

/**
 * One transfer. `blind` hides what was sent from a store consultant while
 * the transfer is still arriving -- they must count what is really there,
 * not tick off a list. After confirmation everyone sees both sides.
 */
export async function getTransfer(actor: InventoryActor, id: number) {
  const db = await requireDb();
  const fromBranch = alias(branches, "from_branch");
  const toBranch = alias(branches, "to_branch");
  const [transfer] = await db.select({
    id: stockTransfers.id, code: stockTransfers.code, status: stockTransfers.status, discrepancyStatus: stockTransfers.discrepancyStatus,
    fromBranchId: stockTransfers.fromBranchId, fromBranchName: fromBranch.name, toBranchId: stockTransfers.toBranchId, toBranchName: toBranch.name,
    note: stockTransfers.note, createdAt: stockTransfers.createdAt, sentAt: stockTransfers.sentAt, receivedAt: stockTransfers.receivedAt, updatedAt: stockTransfers.updatedAt,
  }).from(stockTransfers)
    .innerJoin(fromBranch, eq(fromBranch.id, stockTransfers.fromBranchId))
    .innerJoin(toBranch, eq(toBranch.id, stockTransfers.toBranchId))
    .where(eq(stockTransfers.id, id)).limit(1);
  if (!transfer) throw new InventoryError("Шилжүүлэг олдсонгүй.", "NOT_FOUND");
  if (!isWarehouseOrAdmin(actor)) {
    if (actor.branchId !== transfer.toBranchId && actor.branchId !== transfer.fromBranchId) throw new InventoryError("Энэ шилжүүлэг таны салбарт хамаарахгүй.", "FORBIDDEN");
    if (transfer.status === "draft" && actor.branchId === transfer.toBranchId) throw new InventoryError("Шилжүүлэг хараахан илгээгдээгүй байна.", "FORBIDDEN");
  }
  const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id)).orderBy(desc(stockTransferLines.id));
  const blind = transfer.status === "sent" && !isWarehouseOrAdmin(actor);
  const reconciliation = transfer.status === "received" || transfer.status === "sent"
    ? reconcileTransfer(lines.map(line => ({ code: line.scannedCode, qtySent: line.qtySent, received: transfer.status === "received" ? (line.qtyReceived ?? 0) : (line.receivedDraftQty ?? 0) })))
    : null;
  return {
    ...transfer,
    blind,
    lines: lines.map(line => ({
      id: line.id, code: line.scannedCode, variantId: line.variantId, sku: line.sku, productName: line.productName,
      qtySent: blind ? null : line.qtySent,
      receivedDraftQty: line.receivedDraftQty, qtyReceived: line.qtyReceived, resolution: line.resolution, resolutionNote: line.resolutionNote,
    })),
    // The comparison is itself a hint at what was sent, so it is withheld
    // from a blind counter too.
    reconciliation: blind ? null : reconciliation,
  };
}

export async function createTransfer(actor: InventoryActor, input: { fromBranchId: number; toBranchId: number; note?: string | null }) {
  if (!isWarehouseOrAdmin(actor)) throw new InventoryError("Шилжүүлгийг агуулах эсвэл админ үүсгэнэ.", "FORBIDDEN");
  if (input.fromBranchId === input.toBranchId) throw new InventoryError("Илгээх, хүлээн авах салбар өөр байх ёстой.");
  const db = await requireDb();
  const found = await db.select({ id: branches.id }).from(branches).where(and(inArray(branches.id, [input.fromBranchId, input.toBranchId]), eq(branches.isActive, true)));
  if (found.length !== 2) throw new InventoryError("Идэвхтэй салбаруудыг сонгоно уу.");
  for (let attempt = 1; ; attempt++) {
    try {
      const inserted = await db.insert(stockTransfers).values({ code: generateInventoryCode("TR"), fromBranchId: input.fromBranchId, toBranchId: input.toBranchId, note: input.note?.trim() || null, createdByUserId: actor.id });
      return getTransfer(actor, Number(inserted[0].insertId));
    } catch (error) {
      if (attempt < 3 && String((error as { code?: string })?.code ?? error).includes("ER_DUP_ENTRY")) continue;
      throw error;
    }
  }
}

async function requireTransfer(id: number) {
  const db = await requireDb();
  const [transfer] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id)).limit(1);
  if (!transfer) throw new InventoryError("Шилжүүлэг олдсонгүй.", "NOT_FOUND");
  return transfer;
}

/** The warehouse's pick list, absolute quantities (draft only). */
export async function saveTransferLines(actor: InventoryActor, id: number, lines: SaveLine[]) {
  if (!isWarehouseOrAdmin(actor)) throw new InventoryError("Шилжүүлгийн жагсаалтыг агуулах бэлтгэнэ.", "FORBIDDEN");
  const transfer = await requireTransfer(id);
  if (transfer.status !== "draft") throw new InventoryError("Илгээсэн шилжүүлгийн жагсаалтыг өөрчлөх боломжгүй.", "CONFLICT");
  const clean = cleanLines(lines);
  const resolved = await resolveCodes(clean.map(line => line.code));
  const described = await describeVariants(Array.from(new Set(resolved.values())));
  const db = await requireDb();
  await db.transaction(async tx => {
    const [current] = await tx.select({ status: stockTransfers.status }).from(stockTransfers).where(eq(stockTransfers.id, id)).for("update").limit(1);
    if (current?.status !== "draft") throw new InventoryError("Илгээсэн шилжүүлгийн жагсаалтыг өөрчлөх боломжгүй.", "CONFLICT");
    await tx.delete(stockTransferLines).where(eq(stockTransferLines.transferId, id));
    if (clean.length) {
      await tx.insert(stockTransferLines).values(clean.map(line => {
        const variantId = resolved.get(line.code) ?? null;
        const info = variantId ? described.get(variantId) : undefined;
        return { transferId: id, scannedCode: line.code, variantId, sku: info?.sku ?? null, productName: info?.name ?? null, qtySent: line.quantity };
      }));
    }
    await tx.update(stockTransfers).set({ updatedAt: new Date() }).where(eq(stockTransfers.id, id));
  });
  return { saved: clean.length, unknownCodes: clean.filter(line => !resolved.has(line.code)).map(line => line.code) };
}

/**
 * Sends a draft: every line leaves the source shelf ('transfer_out'), in
 * one transaction. Checks all lines first so the warehouse sees EVERY
 * shortage at once, not one per attempt; the guarded decrements inside the
 * transaction are still the real race-proof enforcement.
 */
export async function sendTransfer(actor: InventoryActor, id: number) {
  if (!isWarehouseOrAdmin(actor)) throw new InventoryError("Шилжүүлгийг агуулах илгээнэ.", "FORBIDDEN");
  const transfer = await requireTransfer(id);
  if (transfer.status !== "draft") throw new InventoryError("Энэ шилжүүлэг аль хэдийн илгээгдсэн.", "CONFLICT");
  const db = await requireDb();
  const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
  if (!lines.length) throw new InventoryError("Шилжүүлэгт нэг ч бараа алга.");
  const unknown = lines.filter(line => line.variantId === null);
  if (unknown.length) throw new InventoryError(`Каталогт бүртгэлгүй ${unknown.length} код байна (${unknown.slice(0, 3).map(line => line.scannedCode).join(", ")}). Агуулахаас бүртгэлгүй бараа илгээх боломжгүй — хасах эсвэл барааг үүсгэнэ үү.`);
  const shelves = await db.select({ variantId: branchStock.variantId, quantity: branchStock.stockQuantity }).from(branchStock)
    .where(and(eq(branchStock.branchId, transfer.fromBranchId), inArray(branchStock.variantId, lines.map(line => line.variantId!))));
  const onShelf = new Map(shelves.map(row => [row.variantId, row.quantity]));
  const short = lines.filter(line => (onShelf.get(line.variantId!) ?? 0) < line.qtySent);
  if (short.length) throw new InventoryError(`Агуулахад хүрэлцэхгүй: ${short.slice(0, 5).map(line => `${line.productName ?? line.scannedCode} (байгаа ${onShelf.get(line.variantId!) ?? 0}, илгээх ${line.qtySent})`).join("; ")}${short.length > 5 ? ` … болон өөр ${short.length - 5}` : ""}.`);
  const [toBranch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, transfer.toBranchId)).limit(1);
  const [fromBranch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, transfer.fromBranchId)).limit(1);
  const pieces = lines.reduce((sum, line) => sum + line.qtySent, 0);
  try {
    await db.transaction(async tx => {
      const flipped = await tx.update(stockTransfers).set({ status: "sent", sentByUserId: actor.id, sentAt: new Date() }).where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, "draft")));
      if (Number(flipped[0].affectedRows ?? 0) !== 1) throw new InventoryError("Энэ шилжүүлгийг өөр хүн дөнгөж сая илгээсэн байна.", "CONFLICT");
      // 2026-09-23: мөрүүдийг транзакцын ДОТОР дахин уншина. Дээрх уншилт
      // транзакцаас ГАДНА байсан тул `saveTransferLines` (өөрөө транзакц)
      // хооронд мөрийн багцыг бүхэлд нь сольж чадна: төлвийн guarded flip нь
      // мөн адил амжилттай болж, дэвтэрт ХУУЧИН тоо, баримтад ШИНЭ тоо үлдэж,
      // хоёр нь мөнхөд зөрдөг байв (нэг ажилтан мөр засаж, нөгөө нь "Илгээх"
      // дарсан бол).
      const committedLines = await tx.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
      if (committedLines.length !== lines.length || committedLines.some(line => {
        const before = lines.find(candidate => candidate.id === line.id);
        return !before || before.qtySent !== line.qtySent || before.variantId !== line.variantId;
      })) {
        throw new InventoryError("Шилжүүлгийн мөрүүд дөнгөж сая өөрчлөгдсөн байна. Дахин шалгаад илгээнэ үү.", "CONFLICT");
      }
      for (const line of lines) {
        await applyBranchStockDelta(tx, transfer.fromBranchId, line.variantId!, -line.qtySent, { type: "transfer_out", refType: "transfer", refId: id, actorUserId: actor.id, note: `→ ${toBranch?.name ?? transfer.toBranchId}` }, { itemLabel: line.productName ?? line.scannedCode });
      }
      await enqueueNotification(tx, "transfer.sent", { code: transfer.code, fromBranchName: fromBranch?.name ?? "", toBranchName: toBranch?.name ?? "", lineCount: lines.length, pieces }, { dedupeKey: `transfer:${id}` });
    });
  } catch (error) {
    if (error instanceof StockShortageError) throw new InventoryError(`${error.message} Дахин шалгаад илгээнэ үү.`, "CONFLICT");
    throw error;
  }
  return getTransfer(actor, id);
}

/**
 * The store's count of what arrived (absolute quantities), saved while
 * scanning. A code that was not on the transfer becomes its own line with
 * qtySent 0, so an extra item in the box is recorded, not ignored.
 */
export async function saveReceivedDraft(actor: InventoryActor, id: number, lines: SaveLine[]) {
  const transfer = await requireTransfer(id);
  assertCanOperateOnBranch(actor, transfer.toBranchId);
  if (transfer.status !== "sent") throw new InventoryError(transfer.status === "received" ? "Энэ шилжүүлгийг аль хэдийн хүлээн авсан." : "Шилжүүлэг хараахан илгээгдээгүй байна.", "CONFLICT");
  const clean = cleanLines(lines);
  const byCode = new Map(clean.map(line => [line.code, line.quantity]));
  const db = await requireDb();
  const existing = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
  const existingCodes = new Set(existing.map(line => line.scannedCode));
  const extras = clean.filter(line => !existingCodes.has(line.code));
  const resolved = await resolveCodes(extras.map(line => line.code));
  const described = await describeVariants(Array.from(new Set(resolved.values())));
  await db.transaction(async tx => {
    const [current] = await tx.select({ status: stockTransfers.status }).from(stockTransfers).where(eq(stockTransfers.id, id)).for("update").limit(1);
    if (current?.status !== "sent") throw new InventoryError("Энэ шилжүүлгийг аль хэдийн хүлээн авсан.", "CONFLICT");
    for (const line of existing) {
      const quantity = byCode.get(line.scannedCode);
      if (line.qtySent === 0 && quantity === undefined) {
        await tx.delete(stockTransferLines).where(eq(stockTransferLines.id, line.id));
      } else if ((quantity ?? null) !== line.receivedDraftQty) {
        await tx.update(stockTransferLines).set({ receivedDraftQty: quantity ?? null }).where(eq(stockTransferLines.id, line.id));
      }
    }
    if (extras.length) {
      await tx.insert(stockTransferLines).values(extras.map(line => {
        const variantId = resolved.get(line.code) ?? null;
        const info = variantId ? described.get(variantId) : undefined;
        return { transferId: id, scannedCode: line.code, variantId, sku: info?.sku ?? null, productName: info?.name ?? null, qtySent: 0, receivedDraftQty: line.quantity };
      }));
    }
    await tx.update(stockTransfers).set({ updatedAt: new Date() }).where(eq(stockTransfers.id, id));
  });
  return { saved: clean.length };
}

/**
 * Confirms arrival: fixes qtyReceived per line, adds what arrived to the
 * store ('transfer_in'), and opens a discrepancy for anything that did not
 * match. Unknown codes that arrived are recorded but add nothing to stock
 * (there is no product to add them to) -- they show up in the discrepancy.
 */
export async function confirmTransferReceipt(actor: InventoryActor, id: number, note?: string | null) {
  const transfer = await requireTransfer(id);
  assertCanOperateOnBranch(actor, transfer.toBranchId);
  if (transfer.status !== "sent") throw new InventoryError(transfer.status === "received" ? "Энэ шилжүүлгийг аль хэдийн хүлээн авсан." : "Шилжүүлэг хараахан илгээгдээгүй байна.", "CONFLICT");
  const db = await requireDb();
  const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
  const reconciliation = reconcileTransfer(lines.map(line => ({ code: line.scannedCode, qtySent: line.qtySent, received: line.receivedDraftQty ?? 0 })));
  const [toBranch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, transfer.toBranchId)).limit(1);
  const [fromBranch] = await db.select({ name: branches.name }).from(branches).where(eq(branches.id, transfer.fromBranchId)).limit(1);
  let receivedPieces = 0;
  await db.transaction(async tx => {
    const flipped = await tx.update(stockTransfers).set({
      status: "received", receivedByUserId: actor.id, receivedAt: new Date(),
      discrepancyStatus: reconciliation.hasDiscrepancy ? "open" : "none",
      ...(note?.trim() ? { note: `${transfer.note ? `${transfer.note}\n` : ""}Хүлээн авах үед: ${note.trim()}`.slice(0, 500) } : {}),
    }).where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, "sent")));
    if (Number(flipped[0].affectedRows ?? 0) !== 1) throw new InventoryError("Энэ шилжүүлгийг өөр хүн дөнгөж сая хүлээн авсан байна.", "CONFLICT");
    for (const line of lines) {
      const received = line.receivedDraftQty ?? 0;
      await tx.update(stockTransferLines).set({ qtyReceived: received }).where(eq(stockTransferLines.id, line.id));
      if (received > 0 && line.variantId !== null) {
        await applyBranchStockDelta(tx, transfer.toBranchId, line.variantId, received, { type: "transfer_in", refType: "transfer", refId: id, actorUserId: actor.id, note: `← ${fromBranch?.name ?? transfer.fromBranchId}` });
        receivedPieces += received;
      }
    }
    await enqueueNotification(tx, "transfer.received", { code: transfer.code, toBranchName: toBranch?.name ?? "", receivedPieces, sentPieces: lines.reduce((sum, line) => sum + line.qtySent, 0) }, { dedupeKey: `transfer:${id}` });
    if (reconciliation.hasDiscrepancy) {
      const worst = reconciliation.lines.filter(line => line.status !== "matched").slice(0, 3).map(line => {
        const row = lines.find(candidate => candidate.scannedCode === line.code);
        return `${row?.productName ?? line.code} ${line.difference > 0 ? "+" : ""}${line.difference}`;
      });
      await enqueueNotification(tx, "transfer.discrepancy", { code: transfer.code, toBranchName: toBranch?.name ?? "", shortLines: reconciliation.short, overLines: reconciliation.over, unexpectedLines: reconciliation.unexpected, missingPieces: reconciliation.missingPieces, extraPieces: reconciliation.extraPieces, examples: worst }, { dedupeKey: `transfer:${id}` });
    }
  });
  return getTransfer(actor, id);
}

/**
 * An admin's decision about one mismatched line. Each one is a real,
 * recorded stock movement (or, for write-off / accepted-over, an explicit
 * decision that the numbers stand), and the transfer's discrepancy closes
 * when every mismatched line has a resolution.
 */
export async function resolveTransferLine(actor: InventoryActor, lineId: number, resolution: TransferResolution, note?: string | null) {
  if (actor.role !== "admin") throw new InventoryError("Шилжүүлгийн зөрүүг зөвхөн админ шийднэ.", "FORBIDDEN");
  const db = await requireDb();
  const [line] = await db.select().from(stockTransferLines).where(eq(stockTransferLines.id, lineId)).limit(1);
  if (!line) throw new InventoryError("Мөр олдсонгүй.", "NOT_FOUND");
  const transfer = await requireTransfer(line.transferId);
  if (transfer.status !== "received") throw new InventoryError("Зөвхөн хүлээн авсан шилжүүлгийн зөрүүг шийднэ.", "CONFLICT");
  if (line.resolution) throw new InventoryError("Энэ мөрийг аль хэдийн шийдсэн.", "CONFLICT");
  const difference = (line.qtyReceived ?? 0) - line.qtySent;
  if (difference === 0) throw new InventoryError("Энэ мөр таарсан тул шийдэх зүйлгүй.");
  if (difference < 0 && !(SHORT_RESOLUTIONS as readonly string[]).includes(resolution)) throw new InventoryError("Дутуу мөрөнд тохирохгүй шийдвэр.");
  if (difference > 0 && !(OVER_RESOLUTIONS as readonly string[]).includes(resolution)) throw new InventoryError("Илүү мөрөнд тохирохгүй шийдвэр.");
  if ((resolution === "returned_to_source" || resolution === "found_later" || resolution === "deducted_from_source") && line.variantId === null) {
    throw new InventoryError("Каталогт бүртгэлгүй бараанд нөөцийн засвар хийх боломжгүй — \"хасах\" эсвэл \"хүлээж авах\"-ыг сонгоно уу.");
  }
  const amount = Math.abs(difference);
  const meta = { refType: "transfer" as const, refId: transfer.id, actorUserId: actor.id, note: note?.trim() || null };
  await db.transaction(async tx => {
    const marked = await tx.update(stockTransferLines).set({ resolution, resolutionNote: note?.trim() || null }).where(and(eq(stockTransferLines.id, lineId), sql`${stockTransferLines.resolution} IS NULL`));
    if (Number(marked[0].affectedRows ?? 0) !== 1) throw new InventoryError("Энэ мөрийг өөр хүн дөнгөж сая шийдсэн байна.", "CONFLICT");
    if (resolution === "returned_to_source") await applyBranchStockDelta(tx, transfer.fromBranchId, line.variantId!, amount, { ...meta, type: "transfer_return" });
    if (resolution === "found_later") await applyBranchStockDelta(tx, transfer.toBranchId, line.variantId!, amount, { ...meta, type: "transfer_in" });
    if (resolution === "deducted_from_source") await applyBranchStockDelta(tx, transfer.fromBranchId, line.variantId!, -amount, { ...meta, type: "transfer_out" }, { itemLabel: line.productName ?? line.scannedCode });
    const open = await tx.select({ id: stockTransferLines.id }).from(stockTransferLines)
      .where(and(eq(stockTransferLines.transferId, transfer.id), sql`COALESCE(${stockTransferLines.qtyReceived}, 0) <> ${stockTransferLines.qtySent}`, sql`${stockTransferLines.resolution} IS NULL`)).limit(1);
    if (!open.length) await tx.update(stockTransfers).set({ discrepancyStatus: "resolved" }).where(eq(stockTransfers.id, transfer.id));
  });
  return getTransfer(actor, transfer.id);
}

/** A draft just closes. A SENT transfer (goods already left the source)
 *  only by admin, and everything returns to the source shelf. */
export async function cancelTransfer(actor: InventoryActor, id: number) {
  const transfer = await requireTransfer(id);
  if (transfer.status === "draft") {
    if (!isWarehouseOrAdmin(actor)) throw new InventoryError("Шилжүүлгийг агуулах эсвэл админ цуцална.", "FORBIDDEN");
  } else if (transfer.status === "sent") {
    if (actor.role !== "admin") throw new InventoryError("Илгээсэн шилжүүлгийг зөвхөн админ цуцална.", "FORBIDDEN");
  } else {
    throw new InventoryError("Энэ шилжүүлэг аль хэдийн хаагдсан.", "CONFLICT");
  }
  const db = await requireDb();
  const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
  await db.transaction(async tx => {
    const flipped = await tx.update(stockTransfers).set({ status: "cancelled" }).where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, transfer.status)));
    if (Number(flipped[0].affectedRows ?? 0) !== 1) throw new InventoryError("Энэ шилжүүлгийг өөр хүн дөнгөж сая өөрчилсөн байна.", "CONFLICT");
    if (transfer.status === "sent") {
      for (const line of lines) {
        if (line.variantId !== null && line.qtySent > 0) await applyBranchStockDelta(tx, transfer.fromBranchId, line.variantId, line.qtySent, { type: "transfer_return", refType: "transfer", refId: id, actorUserId: actor.id, note: "Шилжүүлэг цуцлагдаж буцсан" });
      }
    }
  });
  return { id };
}

/** Transfers sent more than `hours` ago and still not received. */
export async function getStaleTransfers(hours: number) {
  const db = await requireDb();
  const toBranch = alias(branches, "to_branch");
  const rows = await db.select({ id: stockTransfers.id, code: stockTransfers.code, toBranchName: toBranch.name, sentAt: stockTransfers.sentAt })
    .from(stockTransfers).innerJoin(toBranch, eq(toBranch.id, stockTransfers.toBranchId))
    .where(and(eq(stockTransfers.status, "sent"), sql`${stockTransfers.sentAt} < NOW() - INTERVAL ${sqlInt(hours)} HOUR`));
  return rows.map(row => ({ ...row, hours: row.sentAt ? Math.floor((Date.now() - new Date(row.sentAt).getTime()) / 3_600_000) : hours }));
}

/** Units sent but not yet confirmed, per variant -- "Замд" in the editor. */
export async function getInTransitForVariant(variantId: number) {
  const db = await requireDb();
  const [row] = await db.select({ quantity: sql<number>`COALESCE(SUM(${stockTransferLines.qtySent}), 0)` }).from(stockTransferLines)
    .innerJoin(stockTransfers, eq(stockTransfers.id, stockTransferLines.transferId))
    .where(and(eq(stockTransferLines.variantId, variantId), eq(stockTransfers.status, "sent")));
  return Number(row?.quantity ?? 0);
}
