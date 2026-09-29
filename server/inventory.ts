import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, like, ne, sql } from "drizzle-orm";
import { branches, branchStock, products, productVariants, stockCountLines, stockCounts, stockReceiptLines, stockReceipts, users } from "../drizzle/schema";
import { normaliseBarcode } from "../shared/barcode";
import { getDb, type DbOrTx } from "./db";
import { enqueueNotification } from "./notificationOutbox";
import { applyBranchStockDelta, setBranchStockAbsolute } from "./stockLedger";

// Бэлгийн карт (products.kind = 'gift_card') нөөцийг ХЭЗЭЭ Ч тоолохгүй,
// хүлээж авахгүй (2026-09-27) — checkout/POS/гар захиалга аль хэдийн
// nödöц хөндөхгүй (docs/PROJECT-GUIDE.md), гэвч энэ файл өмнө нь
// картуудыг л (seed-ийн 999 ширхэг) "бүрэн тооллого"-ын уншуулаагүй
// жагсаалтад тавьж, тэднийг 0 болгодог байв — карт каталогоос алга
// болно. `resolveCodes`/`getSkuIndex` мөн адил бэлгийн картыг үл тоомсорлоно.
const NOT_GIFT_CARD = ne(products.kind, "gift_card");

/**
 * Receiving goods and counting shelves by barcode scan (2026-09-11, Phase 3
 * of the notifications + warehouse plan). Replaces the handwritten A4 list a
 * store consultant used to photograph into the work group chat.
 *
 * Both documents follow the same life cycle: a DRAFT whose lines are saved
 * continuously while someone scans (absolute quantities, so a retried or
 * duplicated save is harmless), then one guarded transition that touches
 * stock exactly once -- UPDATE ... WHERE status = <expected>, then an
 * affectedRows check, the same race-proofing checkout uses. Every stock
 * change goes through server/stockLedger.ts, so it is on the ledger.
 *
 * Who may do what is decided by the caller (server/inventoryRouter.ts):
 * this module trusts the ids it is given but NEVER a client's idea of which
 * product a barcode is -- every code is resolved again here.
 */

export type InventoryActor = { id: number; role: string; branchId: number | null };

export class InventoryError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" = "BAD_REQUEST") {
    super(message);
    this.name = "InventoryError";
  }
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

/** RC-260911-7Q4K style: short enough to read out over the phone. */
export function generateInventoryCode(prefix: "RC" | "CT" | "TR", now = new Date()): string {
  const y = String(now.getUTCFullYear()).slice(2);
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I
  const bytes = randomBytes(4);
  const suffix = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
  return `${prefix}-${y}${m}${d}-${suffix}`;
}

/**
 * The whole catalogue as barcode -> variant, loaded once by the scan screen
 * so a scan resolves instantly on the client (Aiven is 170-330ms away; one
 * round trip per beep would make a delivery of 200 items miserable). Small:
 * ~937 rows. The server re-resolves every code on save anyway.
 */
export async function getSkuIndex() {
  const db = await requireDb();
  return db.select({
    variantId: productVariants.id,
    sku: productVariants.sku,
    productSku: products.sku,
    productName: products.name,
    brand: products.brand,
    attributesJson: productVariants.attributesJson,
    imageUrl: sql<string | null>`COALESCE(${productVariants.imageUrl}, ${products.imageUrl})`,
  }).from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(NOT_GIFT_CARD).orderBy(asc(productVariants.id));
}

/** Code -> variant id, exactly as the scan screen does it: the variant's own
 *  barcode first, then the product's (which means its default variant). */
export async function resolveCodes(codes: string[]): Promise<Map<string, number>> {
  const db = await requireDb();
  const normalised = Array.from(new Set(codes.map(normaliseBarcode).filter(Boolean)));
  const result = new Map<string, number>();
  if (!normalised.length) return result;
  const variantRows = await db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(inArray(productVariants.sku, normalised), NOT_GIFT_CARD));
  for (const row of variantRows) result.set(row.sku, row.id);
  const missing = normalised.filter(code => !result.has(code));
  if (missing.length) {
    const productRows = await db.select({ sku: products.sku, variantId: productVariants.id, isDefault: productVariants.isDefault })
      .from(products).innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(and(inArray(products.sku, missing), NOT_GIFT_CARD)).orderBy(desc(productVariants.isDefault), asc(productVariants.id));
    for (const row of productRows) if (!result.has(row.sku)) result.set(row.sku, row.variantId);
  }
  return result;
}

/** Active locations the actor may work at, stores and warehouses alike. A
 *  store consultant sees only their own; warehouse and admin see all. */
export async function getInventoryContext(actor: InventoryActor) {
  const db = await requireDb();
  const all = await db.select({ id: branches.id, name: branches.name, kind: branches.kind, isFulfillmentDefault: branches.isFulfillmentDefault })
    .from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.sortOrder), asc(branches.id));
  const allowed = actor.role === "staff" ? all.filter(branch => branch.id === actor.branchId) : all;
  return { role: actor.role, branchId: actor.branchId, branches: allowed, canPostCounts: actor.role === "admin" || actor.role === "warehouse" };
}

export function assertCanOperateOnBranch(actor: InventoryActor, branchId: number) {
  if (actor.role === "admin" || actor.role === "warehouse") return;
  if (actor.role === "staff") {
    if (actor.branchId === null) throw new InventoryError("Таны данс ямар ч салбарт хамаарахгүй байна. Админаас салбараа тохируулж өгөхийг хүснэ үү.", "FORBIDDEN");
    if (actor.branchId === branchId) return;
    throw new InventoryError("Та зөвхөн өөрийн салбарын барааг хүлээн авч, тоолж болно.", "FORBIDDEN");
  }
  throw new InventoryError("Энэ үйлдлийг хийх эрхгүй.", "FORBIDDEN");
}

async function branchName(branchId: number) {
  const db = await requireDb();
  const [row] = await db.select({ name: branches.name, isActive: branches.isActive }).from(branches).where(eq(branches.id, branchId)).limit(1);
  if (!row || !row.isActive) throw new InventoryError("Идэвхтэй салбар сонгоно уу.");
  return row.name;
}

type SaveLine = { code: string; quantity: number };

function cleanLines(lines: SaveLine[]): SaveLine[] {
  const byCode = new Map<string, number>();
  for (const line of lines) {
    const code = normaliseBarcode(line.code);
    if (!code || code.length > 80) continue;
    const quantity = Math.floor(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    byCode.set(code, Math.min(9999, quantity));
  }
  return Array.from(byCode, ([code, quantity]) => ({ code, quantity }));
}

// ---------------------------------------------------------------------------
// Receipts (goods arriving from a supplier)
// ---------------------------------------------------------------------------

export async function listReceipts(actor: InventoryActor, options: { branchId?: number; limit?: number } = {}) {
  const db = await requireDb();
  const branchFilter = actor.role === "staff" ? (actor.branchId ?? -1) : options.branchId;
  const rows = await db.select({
    id: stockReceipts.id, code: stockReceipts.code, branchId: stockReceipts.branchId, branchName: branches.name,
    supplierName: stockReceipts.supplierName, status: stockReceipts.status, createdAt: stockReceipts.createdAt, postedAt: stockReceipts.postedAt,
    lineCount: sql<number>`(SELECT COUNT(*) FROM stock_receipt_lines l WHERE l.receiptId = ${stockReceipts.id})`,
    pieces: sql<number>`(SELECT COALESCE(SUM(l.quantity), 0) FROM stock_receipt_lines l WHERE l.receiptId = ${stockReceipts.id})`,
  }).from(stockReceipts).innerJoin(branches, eq(branches.id, stockReceipts.branchId))
    .where(branchFilter !== undefined ? eq(stockReceipts.branchId, branchFilter) : undefined)
    .orderBy(desc(stockReceipts.id)).limit(options.limit ?? 30);
  return rows.map(row => ({ ...row, lineCount: Number(row.lineCount), pieces: Number(row.pieces) }));
}

export async function getReceipt(actor: InventoryActor, id: number) {
  const db = await requireDb();
  const [receipt] = await db.select({
    id: stockReceipts.id, code: stockReceipts.code, branchId: stockReceipts.branchId, branchName: branches.name,
    supplierName: stockReceipts.supplierName, supplierInvoiceNo: stockReceipts.supplierInvoiceNo, invoicePhotoUrl: stockReceipts.invoicePhotoUrl,
    status: stockReceipts.status, note: stockReceipts.note, createdAt: stockReceipts.createdAt, postedAt: stockReceipts.postedAt, updatedAt: stockReceipts.updatedAt,
  }).from(stockReceipts).innerJoin(branches, eq(branches.id, stockReceipts.branchId)).where(eq(stockReceipts.id, id)).limit(1);
  if (!receipt) throw new InventoryError("Хүлээн авалт олдсонгүй.", "NOT_FOUND");
  assertCanOperateOnBranch(actor, receipt.branchId);
  const lines = await db.select({
    id: stockReceiptLines.id, code: stockReceiptLines.scannedCode, variantId: stockReceiptLines.variantId, quantity: stockReceiptLines.quantity,
    productName: products.name, sku: productVariants.sku,
  }).from(stockReceiptLines)
    .leftJoin(productVariants, eq(productVariants.id, stockReceiptLines.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(eq(stockReceiptLines.receiptId, id)).orderBy(desc(stockReceiptLines.id));
  return { ...receipt, lines };
}

export async function createReceipt(actor: InventoryActor, input: { branchId: number; supplierName?: string | null; supplierInvoiceNo?: string | null; note?: string | null }) {
  assertCanOperateOnBranch(actor, input.branchId);
  await branchName(input.branchId);
  const db = await requireDb();
  for (let attempt = 1; ; attempt++) {
    try {
      const inserted = await db.insert(stockReceipts).values({
        code: generateInventoryCode("RC"), branchId: input.branchId,
        supplierName: input.supplierName?.trim() || null, supplierInvoiceNo: input.supplierInvoiceNo?.trim() || null, note: input.note?.trim() || null,
        createdByUserId: actor.id,
      });
      return getReceipt(actor, Number(inserted[0].insertId));
    } catch (error) {
      if (attempt < 3 && String((error as { code?: string })?.code ?? error).includes("ER_DUP_ENTRY")) continue;
      throw error;
    }
  }
}

async function requireDraftReceipt(actor: InventoryActor, id: number) {
  const db = await requireDb();
  const [receipt] = await db.select().from(stockReceipts).where(eq(stockReceipts.id, id)).limit(1);
  if (!receipt) throw new InventoryError("Хүлээн авалт олдсонгүй.", "NOT_FOUND");
  assertCanOperateOnBranch(actor, receipt.branchId);
  if (receipt.status !== "draft") throw new InventoryError("Энэ хүлээн авалт аль хэдийн хаагдсан.", "CONFLICT");
  return receipt;
}

export async function updateReceiptDetails(actor: InventoryActor, id: number, input: { supplierName?: string | null; supplierInvoiceNo?: string | null; note?: string | null; invoicePhotoUrl?: string | null }) {
  await requireDraftReceipt(actor, id);
  const db = await requireDb();
  const patch: Record<string, unknown> = {};
  if (input.supplierName !== undefined) patch.supplierName = input.supplierName?.trim() || null;
  if (input.supplierInvoiceNo !== undefined) patch.supplierInvoiceNo = input.supplierInvoiceNo?.trim() || null;
  if (input.note !== undefined) patch.note = input.note?.trim() || null;
  if (input.invoicePhotoUrl !== undefined) patch.invoicePhotoUrl = input.invoicePhotoUrl;
  if (Object.keys(patch).length) await db.update(stockReceipts).set(patch).where(eq(stockReceipts.id, id));
  return getReceipt(actor, id);
}

/** Replaces the draft's lines with exactly these (absolute quantities). */
export async function saveReceiptLines(actor: InventoryActor, id: number, lines: SaveLine[]) {
  await requireDraftReceipt(actor, id);
  const clean = cleanLines(lines);
  const resolved = await resolveCodes(clean.map(line => line.code));
  const db = await requireDb();
  await db.transaction(async tx => {
    // Re-check inside the transaction: a save racing a post must not add
    // lines to a receipt that has just been booked into stock.
    const [current] = await tx.select({ status: stockReceipts.status }).from(stockReceipts).where(eq(stockReceipts.id, id)).for("update").limit(1);
    if (current?.status !== "draft") throw new InventoryError("Энэ хүлээн авалт аль хэдийн хаагдсан.", "CONFLICT");
    await tx.delete(stockReceiptLines).where(eq(stockReceiptLines.receiptId, id));
    if (clean.length) await tx.insert(stockReceiptLines).values(clean.map(line => ({ receiptId: id, scannedCode: line.code, variantId: resolved.get(line.code) ?? null, quantity: line.quantity })));
    await tx.update(stockReceipts).set({ updatedAt: new Date() }).where(eq(stockReceipts.id, id));
  });
  return { saved: clean.length, unknownCodes: clean.filter(line => !resolved.has(line.code)).map(line => line.code) };
}

/**
 * Books a draft receipt into stock: every line is added to the receipt's
 * branch as a 'receipt' movement, in one transaction, exactly once.
 * Unknown codes block posting unless `skipUnknown` -- then they are left out
 * and listed in the note, so nothing scanned is silently forgotten.
 */
export async function postReceipt(actor: InventoryActor, id: number, options: { skipUnknown?: boolean } = {}) {
  const receipt = await requireDraftReceipt(actor, id);
  const db = await requireDb();
  const lines = await db.select().from(stockReceiptLines).where(eq(stockReceiptLines.receiptId, id));
  if (!lines.length) throw new InventoryError("Нэг ч бараа уншуулаагүй байна.");
  // Resolve again at post time: a product created after scanning (from the
  // unknown-code list) now counts.
  const resolved = await resolveCodes(lines.map(line => line.scannedCode));
  const unknown = lines.filter(line => !resolved.has(line.scannedCode));
  if (unknown.length && !options.skipUnknown) {
    throw new InventoryError(`${unknown.length} баркод каталогт бүртгэлгүй байна (${unknown.slice(0, 3).map(line => line.scannedCode).join(", ")}${unknown.length > 3 ? "…" : ""}). Барааг үүсгэх эсвэл "бүртгэлгүйг алгасах"-ыг сонгоно уу.`);
  }
  const known = lines.filter(line => resolved.has(line.scannedCode));
  if (!known.length) throw new InventoryError("Нөөцөд нэмэх бүртгэлтэй бараа алга.");
  const name = await branchName(receipt.branchId);
  let pieces = 0;
  await db.transaction(async tx => {
    const flipped = await tx.update(stockReceipts)
      .set({ status: "posted", postedByUserId: actor.id, postedAt: new Date(), ...(unknown.length ? { note: `${receipt.note ? `${receipt.note}\n` : ""}Бүртгэлгүй, нөөцөд ороогүй: ${unknown.map(line => `${line.scannedCode}×${line.quantity}`).join(", ")}`.slice(0, 500) } : {}) })
      .where(and(eq(stockReceipts.id, id), eq(stockReceipts.status, "draft")));
    if (Number(flipped[0].affectedRows ?? 0) !== 1) throw new InventoryError("Энэ хүлээн авалтыг өөр хүн дөнгөж сая баталсан байна.", "CONFLICT");
    // 2026-09-23: мөрүүдийг транзакцын ДОТОР дахин шалгана — дээрх уншилт
    // транзакцаас гадна байсан тул `saveReceiptLines` (өөрөө транзакц) мөрийн
    // багцыг хооронд нь сольж, нөөцөд ХУУЧИН тоо бичигдэх боломжтой байв.
    const committedReceiptLines = await tx.select().from(stockReceiptLines).where(eq(stockReceiptLines.receiptId, id));
    if (committedReceiptLines.length !== lines.length || committedReceiptLines.some(line => {
      const before = lines.find(candidate => candidate.id === line.id);
      return !before || before.quantity !== line.quantity || before.scannedCode !== line.scannedCode;
    })) {
      throw new InventoryError("Хүлээн авалтын мөрүүд дөнгөж сая өөрчлөгдсөн байна. Дахин шалгаад батлана уу.", "CONFLICT");
    }
    for (const line of known) {
      const variantId = resolved.get(line.scannedCode)!;
      await tx.update(stockReceiptLines).set({ variantId }).where(eq(stockReceiptLines.id, line.id));
      await applyBranchStockDelta(tx, receipt.branchId, variantId, line.quantity, { type: "receipt", refType: "receipt", refId: id, actorUserId: actor.id, note: receipt.supplierName ? `Нийлүүлэгч: ${receipt.supplierName}` : null });
      pieces += line.quantity;
    }
    await enqueueNotification(tx, "receipt.posted", { code: receipt.code, branchName: name, supplierName: receipt.supplierName, lineCount: known.length, pieces, unknownCount: unknown.length }, { dedupeKey: `receipt:${id}` });
  });
  return { ...(await getReceipt(actor, id)), pieces, skippedUnknown: unknown.length };
}

export async function cancelReceipt(actor: InventoryActor, id: number) {
  await requireDraftReceipt(actor, id);
  const db = await requireDb();
  const flipped = await db.update(stockReceipts).set({ status: "cancelled" }).where(and(eq(stockReceipts.id, id), eq(stockReceipts.status, "draft")));
  if (Number(flipped[0].affectedRows ?? 0) !== 1) throw new InventoryError("Энэ хүлээн авалт аль хэдийн хаагдсан.", "CONFLICT");
  return { id };
}

// ---------------------------------------------------------------------------
// Counts (stocktakes, including the opening count)
// ---------------------------------------------------------------------------

export async function listCounts(actor: InventoryActor, options: { branchId?: number; limit?: number } = {}) {
  const db = await requireDb();
  const branchFilter = actor.role === "staff" ? (actor.branchId ?? -1) : options.branchId;
  const rows = await db.select({
    id: stockCounts.id, code: stockCounts.code, branchId: stockCounts.branchId, branchName: branches.name,
    isOpening: stockCounts.isOpening, scope: stockCounts.scope, status: stockCounts.status, createdAt: stockCounts.createdAt, postedAt: stockCounts.postedAt,
    lineCount: sql<number>`(SELECT COUNT(*) FROM stock_count_lines l WHERE l.countId = ${stockCounts.id})`,
    pieces: sql<number>`(SELECT COALESCE(SUM(l.countedQty), 0) FROM stock_count_lines l WHERE l.countId = ${stockCounts.id})`,
  }).from(stockCounts).innerJoin(branches, eq(branches.id, stockCounts.branchId))
    .where(branchFilter !== undefined ? eq(stockCounts.branchId, branchFilter) : undefined)
    .orderBy(desc(stockCounts.id)).limit(options.limit ?? 30);
  return rows.map(row => ({ ...row, lineCount: Number(row.lineCount), pieces: Number(row.pieces) }));
}

export async function createCount(actor: InventoryActor, input: { branchId: number; scope: "partial" | "full"; isOpening?: boolean; note?: string | null }) {
  assertCanOperateOnBranch(actor, input.branchId);
  await branchName(input.branchId);
  // An opening count sets a location's real starting balance -- it must be
  // a full count (anything not scanned really is not there) and only
  // warehouse/admin may start one.
  if (input.isOpening && actor.role === "staff") throw new InventoryError("Эхний үлдэгдлийн тооллогыг зөвхөн агуулах эсвэл админ эхлүүлнэ.", "FORBIDDEN");
  const db = await requireDb();
  for (let attempt = 1; ; attempt++) {
    try {
      const inserted = await db.insert(stockCounts).values({
        code: generateInventoryCode("CT"), branchId: input.branchId, isOpening: Boolean(input.isOpening),
        scope: input.isOpening ? "full" : input.scope, note: input.note?.trim() || null, createdByUserId: actor.id,
      });
      return getCount(actor, Number(inserted[0].insertId));
    } catch (error) {
      if (attempt < 3 && String((error as { code?: string })?.code ?? error).includes("ER_DUP_ENTRY")) continue;
      throw error;
    }
  }
}

async function requireOpenCount(actor: InventoryActor, id: number, allowed: ("draft" | "submitted")[]) {
  const db = await requireDb();
  const [count] = await db.select().from(stockCounts).where(eq(stockCounts.id, id)).limit(1);
  if (!count) throw new InventoryError("Тооллого олдсонгүй.", "NOT_FOUND");
  assertCanOperateOnBranch(actor, count.branchId);
  if (!allowed.includes(count.status as "draft" | "submitted")) throw new InventoryError(count.status === "submitted" ? "Тооллогыг илгээсэн тул засах боломжгүй." : "Энэ тооллого аль хэдийн хаагдсан.", "CONFLICT");
  return count;
}

// 2026-09-27: `db` (tx or pool) нь дуудагчаас ирнэ -- өмнө нь энэ функц үргэлж
// шинэ pool холболт (`requireDb()`) ашигладаг байсан тул `saveCountLines`-ийн
// транзакцын ДОТОР дуудагдсан ч тэр транзакцын харагдац/түгжээнд ороогүй.
async function shelfCounts(db: DbOrTx, branchId: number, variantIds: number[]) {
  if (!variantIds.length) return new Map<number, number>();
  const rows = await db.select({ variantId: branchStock.variantId, quantity: branchStock.stockQuantity }).from(branchStock).where(and(eq(branchStock.branchId, branchId), inArray(branchStock.variantId, variantIds)));
  return new Map(rows.map(row => [row.variantId, row.quantity]));
}

/**
 * Per line: what was counted, what the system thought when the line was
 * first scanned, and the resulting adjustment. For a FULL count, every item
 * with stock at the location that nobody scanned is listed as counted 0.
 */
export async function getCount(actor: InventoryActor, id: number, executor?: DbOrTx) {
  // 2026-09-27: `executor` -- postCount транзакцын дотроос дахин дуудагдан,
  // "уншуулаагүй" бүрэн тооллогын жагсаалт flip-ийн дараа тэр ижил
  // транзакцын дотор дахин уншигдана (доорх postCount-ийн тайлбарыг үзнэ үү).
  const db = executor ?? (await requireDb());
  const [count] = await db.select({
    id: stockCounts.id, code: stockCounts.code, branchId: stockCounts.branchId, branchName: branches.name, isOpening: stockCounts.isOpening,
    scope: stockCounts.scope, status: stockCounts.status, note: stockCounts.note, createdAt: stockCounts.createdAt, submittedAt: stockCounts.submittedAt,
    postedAt: stockCounts.postedAt, updatedAt: stockCounts.updatedAt,
  }).from(stockCounts).innerJoin(branches, eq(branches.id, stockCounts.branchId)).where(eq(stockCounts.id, id)).limit(1);
  if (!count) throw new InventoryError("Тооллого олдсонгүй.", "NOT_FOUND");
  assertCanOperateOnBranch(actor, count.branchId);
  const lines = await db.select({
    id: stockCountLines.id, code: stockCountLines.scannedCode, variantId: stockCountLines.variantId, countedQty: stockCountLines.countedQty,
    systemQtyAtFirstScan: stockCountLines.systemQtyAtFirstScan, postedDelta: stockCountLines.postedDelta, productName: products.name,
  }).from(stockCountLines)
    .leftJoin(productVariants, eq(productVariants.id, stockCountLines.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(eq(stockCountLines.countId, id)).orderBy(desc(stockCountLines.id));
  let unscanned: { variantId: number; sku: string; productName: string; systemQty: number }[] = [];
  if (count.scope === "full" && count.status !== "posted" && count.status !== "cancelled") {
    const scannedIds = lines.map(line => line.variantId).filter((value): value is number => value !== null);
    unscanned = (await db.select({ variantId: branchStock.variantId, sku: productVariants.sku, productName: products.name, systemQty: branchStock.stockQuantity })
      .from(branchStock).innerJoin(productVariants, eq(productVariants.id, branchStock.variantId)).innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(branchStock.branchId, count.branchId), sql`${branchStock.stockQuantity} <> 0`, NOT_GIFT_CARD, scannedIds.length ? sql`${branchStock.variantId} NOT IN (${sql.join(scannedIds.map(value => sql`${value}`), sql`, `)})` : undefined))
      .orderBy(asc(products.name)).limit(2000));
  }
  return {
    ...count,
    lines: lines.map(line => ({ ...line, variance: line.variantId !== null && line.systemQtyAtFirstScan !== null ? line.countedQty - line.systemQtyAtFirstScan : null })),
    unscanned,
  };
}

/** Replaces the draft's lines. The system count is snapshotted the first
 *  time each code appears and never overwritten after -- see the file's
 *  migration comment on why sales during a count must not be erased. */
export async function saveCountLines(actor: InventoryActor, id: number, lines: SaveLine[]) {
  const count = await requireOpenCount(actor, id, ["draft"]);
  const clean = cleanLines(lines);
  const resolved = await resolveCodes(clean.map(line => line.code));
  const db = await requireDb();
  await db.transaction(async tx => {
    const [current] = await tx.select({ status: stockCounts.status }).from(stockCounts).where(eq(stockCounts.id, id)).for("update").limit(1);
    if (current?.status !== "draft") throw new InventoryError("Тооллогыг илгээсэн тул засах боломжгүй.", "CONFLICT");
    const existing = await tx.select({ code: stockCountLines.scannedCode, systemQtyAtFirstScan: stockCountLines.systemQtyAtFirstScan }).from(stockCountLines).where(eq(stockCountLines.countId, id));
    const snapshot = new Map(existing.map(row => [row.code, row.systemQtyAtFirstScan]));
    const newVariantIds = clean.filter(line => !snapshot.has(line.code) && resolved.has(line.code)).map(line => resolved.get(line.code)!);
    const shelves = await shelfCounts(tx, count.branchId, newVariantIds);
    await tx.delete(stockCountLines).where(eq(stockCountLines.countId, id));
    if (clean.length) {
      await tx.insert(stockCountLines).values(clean.map(line => {
        const variantId = resolved.get(line.code) ?? null;
        const firstScan = snapshot.has(line.code) ? snapshot.get(line.code)! : (variantId !== null ? (shelves.get(variantId) ?? 0) : null);
        return { countId: id, scannedCode: line.code, variantId, countedQty: line.quantity, systemQtyAtFirstScan: firstScan };
      }));
    }
    await tx.update(stockCounts).set({ updatedAt: new Date() }).where(eq(stockCounts.id, id));
  });
  return { saved: clean.length, unknownCodes: clean.filter(line => !resolved.has(line.code)).map(line => line.code) };
}

/** A store consultant hands the count over for approval (Tom, 2026-09-11:
 *  staff never adjust stock themselves -- warehouse/admin post it). */
export async function submitCount(actor: InventoryActor, id: number) {
  const count = await requireOpenCount(actor, id, ["draft"]);
  const db = await requireDb();
  const flipped = await db.update(stockCounts).set({ status: "submitted", submittedAt: new Date() }).where(and(eq(stockCounts.id, id), eq(stockCounts.status, "draft")));
  if (Number(flipped[0].affectedRows ?? 0) !== 1) throw new InventoryError("Тооллогыг өөр хүн дөнгөж сая өөрчилсөн байна.", "CONFLICT");
  const detail = await getCount(actor, id);
  await enqueueNotification(db, "count.submitted", { code: count.code, branchName: detail.branchName, lineCount: detail.lines.length, varianceLines: detail.lines.filter(line => line.variance).length }, { dedupeKey: `count:${id}` });
  return detail;
}

/**
 * Applies a count to stock (warehouse/admin only -- enforced here as well as
 * in the router). Each counted line moves the shelf by (counted - system
 * count at first scan); a full count also zeroes unscanned items. Recorded
 * as 'opening' for an opening count, else 'count_adjust'.
 */
/**
 * Stands in for a person when the vendor sync posts its own snapshot
 * (2026-09-15). Never written to the database: `automatic` makes postCount
 * store NULL for both postedByUserId and the ledger's actorUserId, so an
 * automated adjustment is never attributed to whoever happened to be logged
 * in. It exists only to satisfy the branch guard, which admins pass for any
 * branch.
 */
export const SYSTEM_INVENTORY_ACTOR: InventoryActor = { id: 0, role: "admin", branchId: null };

export async function postCount(actor: InventoryActor, id: number, options: { automatic?: boolean } = {}) {
  if (!options.automatic && actor.role !== "admin" && actor.role !== "warehouse") throw new InventoryError("Тооллогыг зөвхөн агуулах эсвэл админ батална.", "FORBIDDEN");
  const actorUserId = options.automatic ? null : actor.id;
  const count = await requireOpenCount(actor, id, ["draft", "submitted"]);
  const db = await requireDb();
  const type = count.isOpening ? "opening" as const : "count_adjust" as const;
  let adjustedLines = 0;
  let netDelta = 0;
  let skippedUnknown = 0;
  await db.transaction(async tx => {
    const flipped = await tx.update(stockCounts).set({ status: "posted", postedByUserId: actorUserId, postedAt: new Date() })
      .where(and(eq(stockCounts.id, id), inArray(stockCounts.status, ["draft", "submitted"])));
    if (Number(flipped[0].affectedRows ?? 0) !== 1) throw new InventoryError("Тооллогыг өөр хүн дөнгөж сая баталсан байна.", "CONFLICT");
    // 2026-09-27: мөрүүд БОЛОН бүрэн тооллогын "уншуулаагүй" жагсаалт статус
    // flip-ийн ДАРАА, ЯГ ЭНЭ транзакцын дотор дахин уншигдана (I19/I20 --
    // өмнө нь `getCount` энэ tx-ээс өмнө, тусдаа pool холболтоор дуудагддаг
    // байсан тул flip хүртэлх зайд өөр хэрэглэгчийн худалдан авалт
    // `branch_stock`-ыг өөрчилсөн ч "уншуулаагүй" жагсаалт хуучин утгаараа
    // үлддэг байв). Энэ нь 2026-09-23-ний гараар бичсэн
    // committedCountLines-ийн дахин шалгалтыг илүү цэвэр орлуулав.
    const detail = await getCount(actor, id, tx);
    // I11: шинэ бүтээгдэхүүн үүсгэсний дараа л танигдсан баркодыг postReceipt-
    // ийн адил энд ДАХИН уусгана -- өмнө нь variantId=null мөрийг чимээгүй
    // алгасдаг байсан тул тэр тоо тооллогод хэзээ ч ороогүй.
    const stillUnknown = detail.lines.filter(line => line.variantId === null);
    const resolvedNow = stillUnknown.length ? await resolveCodes(stillUnknown.map(line => line.code)) : new Map<string, number>();
    for (const line of detail.lines) {
      let variantId = line.variantId;
      if (variantId === null) {
        variantId = resolvedNow.get(line.code) ?? null;
        if (variantId === null) { skippedUnknown++; continue; }
        await tx.update(stockCountLines).set({ variantId }).where(eq(stockCountLines.id, line.id));
      }
      const [shelf] = await tx.select({ quantity: branchStock.stockQuantity }).from(branchStock).where(and(eq(branchStock.branchId, count.branchId), eq(branchStock.variantId, variantId))).for("update").limit(1);
      const current = Number(shelf?.quantity ?? 0);
      const firstScan = line.systemQtyAtFirstScan ?? current;
      const target = Math.max(0, current + (line.countedQty - firstScan));
      // I4: `forceAlert` зөвхөн `automatic` замд -- гар тооллого хэвээрээ
      // low/out мэдэгдэл шидэхгүй (энэ засвар/оноох, бодит борлуулалт биш).
      const { before, after } = await setBranchStockAbsolute(tx, count.branchId, variantId, target, { type, refType: "count", refId: id, actorUserId, note: `Тооллого ${count.code}${options.automatic ? " (автомат)" : ""}`, forceAlert: options.automatic });
      await tx.update(stockCountLines).set({ postedDelta: after - before }).where(eq(stockCountLines.id, line.id));
      if (after !== before) { adjustedLines++; netDelta += after - before; }
    }
    for (const item of detail.unscanned) {
      const { before, after } = await setBranchStockAbsolute(tx, count.branchId, item.variantId, 0, { type, refType: "count", refId: id, actorUserId, note: `Тооллого ${count.code}: уншуулаагүй`, forceAlert: options.automatic });
      if (after !== before) { adjustedLines++; netDelta += after - before; }
    }
    if (!options.automatic) await enqueueNotification(tx, "count.posted", { code: count.code, branchName: detail.branchName, adjustedLines, netDelta, isOpening: count.isOpening }, { dedupeKey: `count:${id}` });
  });
  return { ...(await getCount(actor, id)), adjustedLines, netDelta, skippedUnknown };
}

/**
 * A stocktake nobody scanned: the vendor's own stock figures for one
 * location, waiting for warehouse/admin approval exactly like a counted one
 * (2026-09-12, Smart Software sync). Written here rather than through
 * saveCountLines because a snapshot line may legitimately be ZERO ("the
 * vendor says this shelf is empty"), which the scan path drops on purpose.
 *
 * Scope stays 'partial': the vendor's feed can be filtered to e-commerce
 * products by a setting on their side, so items missing from it must never
 * be zeroed here. Any older unapproved snapshot for the branch is cancelled
 * first, so the queue holds one current proposal per location, not a pile.
 */
export const SNAPSHOT_COUNT_NOTE_PREFIX = "Smart POS-ын үлдэгдлээс";

export async function createSnapshotCount(input: { branchId: number; sourceLabel: string; silent?: boolean; lines: { variantId: number; sku: string; countedQty: number; systemQty: number }[] }) {
  const db = await requireDb();
  const name = await branchName(input.branchId);
  const code = generateInventoryCode("CT");
  const note = `${SNAPSHOT_COUNT_NOTE_PREFIX} (${input.sourceLabel})`;
  const varianceLines = input.lines.filter(line => line.countedQty !== line.systemQty).length;
  let countId = 0;
  await db.transaction(async tx => {
    // I5: whether an unapproved snapshot ALREADY existed for this branch
    // before it gets cancelled below -- if so, warehouse/admin already got
    // a "please approve" push for this same ongoing situation. Without
    // this check, `vendor-stock-auto-apply=0` (manual mode) replaced the
    // count every 15 minutes with a freshly generated `countId`, and since
    // the dedupeKey below is keyed by that id, every replacement got its
    // OWN dedupeKey and pushed again -- effectively every 15 minutes,
    // indefinitely, for as long as the vendor's figure kept differing.
    const [existingUnapproved] = await tx.select({ id: stockCounts.id }).from(stockCounts)
      .where(and(eq(stockCounts.branchId, input.branchId), inArray(stockCounts.status, ["draft", "submitted"]), like(stockCounts.note, `${SNAPSHOT_COUNT_NOTE_PREFIX}%`))).limit(1);
    await tx.update(stockCounts).set({ status: "cancelled" })
      .where(and(eq(stockCounts.branchId, input.branchId), inArray(stockCounts.status, ["draft", "submitted"]), like(stockCounts.note, `${SNAPSHOT_COUNT_NOTE_PREFIX}%`)));
    const inserted = await tx.insert(stockCounts).values({ code, branchId: input.branchId, scope: "partial", status: "submitted", note, submittedAt: new Date() });
    countId = Number(inserted[0].insertId);
    if (input.lines.length) {
      await tx.insert(stockCountLines).values(input.lines.map(line => ({ countId, scannedCode: line.sku, variantId: line.variantId, countedQty: line.countedQty, systemQtyAtFirstScan: line.systemQty })));
    }
    // `silent` is the vendor sync posting its own snapshot moments later:
    // every 15 minutes, a "please approve" push for something nobody has to
    // approve is noise that trains people to ignore the channel. The alerts
    // that matter (stock.low / stock.out) still come from the ledger write.
    if (!input.silent && !existingUnapproved) await enqueueNotification(tx, "count.submitted", { code, branchName: name, lineCount: input.lines.length, varianceLines }, { dedupeKey: `count:${countId}` });
  });
  return { id: countId, code, branchName: name, lineCount: input.lines.length, varianceLines };
}

export async function cancelCount(actor: InventoryActor, id: number) {
  const count = await requireOpenCount(actor, id, ["draft", "submitted"]);
  // 2026-09-27: staff аль хэдийн ИЛГЭЭСЭН тооллогыг чимээгүй цуцлах боломжтой
  // байв -- илгээх нь "агуулах/админ батлаач" гэсэн шаардлага, харин цуцлах
  // нь тэр шаардлагыг тойрч, батлуулах шатанд хүрэхээс өмнө устгах зам болж
  // байсан. Драфтаа (өөрийн эхлүүлсэн, хараахан хэнд ч харагдаагүй) цуцлах
  // хэвээрээ зөвшөөрөгдөнө.
  if (count.status === "submitted" && actor.role === "staff") {
    throw new InventoryError("Илгээсэн тооллогыг зөвхөн агуулах эсвэл админ цуцална.", "FORBIDDEN");
  }
  const db = await requireDb();
  await db.update(stockCounts).set({ status: "cancelled" }).where(and(eq(stockCounts.id, id), inArray(stockCounts.status, ["draft", "submitted"])));
  return { id };
}

/** Loads the actor's branch assignment (context.user may predate it). */
export async function loadInventoryActor(user: { id: number; role: string }): Promise<InventoryActor> {
  const db = await requireDb();
  const [row] = await db.select({ branchId: users.branchId }).from(users).where(eq(users.id, user.id)).limit(1);
  return { id: user.id, role: user.role, branchId: row?.branchId ?? null };
}
