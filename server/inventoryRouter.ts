import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  cancelCount, cancelReceipt, createCount, createReceipt, getCount, getInventoryContext, getReceipt, getSkuIndex, InventoryError,
  listCounts, listReceipts, loadInventoryActor, postCount, postReceipt, saveCountLines, saveReceiptLines, submitCount, updateReceiptDetails,
} from "./inventory";
import { randomBytes } from "node:crypto";
import { cancelTransfer, confirmTransferReceipt, createTransfer, getInTransitForVariant, getTransfer, listTransfers, resolveTransferLine, saveReceivedDraft, saveTransferLines, sendTransfer } from "./transfers";
import { OVER_RESOLUTIONS, SHORT_RESOLUTIONS } from "../shared/transfer-reconcile";
import { logAdminAction } from "./db";
import { storagePut } from "./storage";
import { assertImageSignature, decodeBase64Upload, imageContentTypes, processUploadedImageOrThrow } from "./_core/imageUpload";
import { IMAGE_MAX_DIMENSION } from "./_core/imageProcessing";
import { inventoryProcedure, router } from "./_core/trpc";

/**
 * "Бараа хүлээн авах" -- receiving goods and counting shelves by barcode
 * scan (2026-09-11, Phase 3). Open to admin, warehouse and store staff;
 * branch-level rules (a store consultant only at their own branch, only
 * warehouse/admin post a count) live in server/inventory.ts so they hold no
 * matter which endpoint is called.
 */

const lineSchema = z.object({ code: z.string().trim().min(1).max(80), quantity: z.number().int().min(0).max(9999) });
const linesSchema = z.array(lineSchema).max(3000);
const text = (max: number) => z.string().trim().max(max).nullable().optional();

async function run<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof InventoryError) throw new TRPCError({ code: error.code, message: error.message });
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо." });
  }
}

export const inventoryRouter = router({
  context: inventoryProcedure.query(async ({ ctx }) => getInventoryContext(await loadInventoryActor(ctx.user))),
  skuIndex: inventoryProcedure.query(() => getSkuIndex()),

  receipts: inventoryProcedure.input(z.object({ branchId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => listReceipts(await loadInventoryActor(ctx.user), { branchId: input?.branchId })),
  receipt: inventoryProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => run(async () => getReceipt(await loadInventoryActor(ctx.user), input.id))),
  createReceipt: inventoryProcedure.input(z.object({ branchId: z.number().int().positive(), supplierName: text(160), supplierInvoiceNo: text(80), note: text(500) })).mutation(async ({ ctx, input }) => run(async () => {
    const receipt = await createReceipt(await loadInventoryActor(ctx.user), input);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.receipt_created", entityType: "stock_receipt", entityId: receipt.id, metadata: { code: receipt.code, branchId: receipt.branchId } });
    return receipt;
  })),
  updateReceipt: inventoryProcedure.input(z.object({ id: z.number().int().positive(), supplierName: text(160), supplierInvoiceNo: text(80), note: text(500) })).mutation(async ({ ctx, input }) => run(async () => {
    const { id, ...fields } = input;
    return updateReceiptDetails(await loadInventoryActor(ctx.user), id, fields);
  })),
  saveReceiptLines: inventoryProcedure.input(z.object({ id: z.number().int().positive(), lines: linesSchema })).mutation(async ({ ctx, input }) => run(async () => saveReceiptLines(await loadInventoryActor(ctx.user), input.id, input.lines))),
  postReceipt: inventoryProcedure.input(z.object({ id: z.number().int().positive(), skipUnknown: z.boolean().optional() })).mutation(async ({ ctx, input }) => run(async () => {
    const result = await postReceipt(await loadInventoryActor(ctx.user), input.id, { skipUnknown: input.skipUnknown });
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.receipt_posted", entityType: "stock_receipt", entityId: input.id, metadata: { code: result.code, pieces: result.pieces, skippedUnknown: result.skippedUnknown } });
    return result;
  })),
  // A phone photo of the supplier's paper invoice, kept with the receipt --
  // the one thing the old group-chat photo did that scanning does not.
  // Stored under an unguessable key; the bucket is public-read, so
  // "unlisted", not private.
  uploadReceiptPhoto: inventoryProcedure.input(z.object({ id: z.number().int().positive(), contentType: z.enum(imageContentTypes), dataBase64: z.string().min(16).max(14_000_000) })).mutation(async ({ ctx, input }) => run(async () => {
    const actor = await loadInventoryActor(ctx.user);
    const receipt = await getReceipt(actor, input.id); // existence + branch permission
    // 2026-09-27: draft шалгалт upload-оос ӨМНӨ — өмнө нь батлагдсан/цуцлагдсан
    // баримтад зураг R2-д бичигдээд дараа нь татгалзаж, өнчин объект үлддэг байв.
    if (receipt.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Зөвхөн ноорог баримтад зураг хавсаргана." });
    const buffer = decodeBase64Upload(input.dataBase64);
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Зураг 10 МБ-аас бага байх ёстой." });
    assertImageSignature(buffer, input.contentType);
    const processed = await processUploadedImageOrThrow(buffer, input.contentType, IMAGE_MAX_DIMENSION.siteMedia);
    const extension = input.contentType === "image/jpeg" ? "jpg" : input.contentType === "image/png" ? "png" : "webp";
    const stored = await storagePut(`inventory/receipts/${input.id}/${randomBytes(12).toString("hex")}.${extension}`, processed, input.contentType);
    return updateReceiptDetails(actor, input.id, { invoicePhotoUrl: stored.url });
  })),
  cancelReceipt: inventoryProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => run(async () => {
    const result = await cancelReceipt(await loadInventoryActor(ctx.user), input.id);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.receipt_cancelled", entityType: "stock_receipt", entityId: input.id });
    return result;
  })),

  counts: inventoryProcedure.input(z.object({ branchId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => listCounts(await loadInventoryActor(ctx.user), { branchId: input?.branchId })),
  count: inventoryProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => run(async () => getCount(await loadInventoryActor(ctx.user), input.id))),
  createCount: inventoryProcedure.input(z.object({ branchId: z.number().int().positive(), scope: z.enum(["partial", "full"]), isOpening: z.boolean().optional(), note: text(500) })).mutation(async ({ ctx, input }) => run(async () => {
    const count = await createCount(await loadInventoryActor(ctx.user), input);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.count_created", entityType: "stock_count", entityId: count.id, metadata: { code: count.code, branchId: count.branchId, scope: count.scope, isOpening: count.isOpening } });
    return count;
  })),
  saveCountLines: inventoryProcedure.input(z.object({ id: z.number().int().positive(), lines: linesSchema })).mutation(async ({ ctx, input }) => run(async () => saveCountLines(await loadInventoryActor(ctx.user), input.id, input.lines))),
  submitCount: inventoryProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => run(async () => {
    const result = await submitCount(await loadInventoryActor(ctx.user), input.id);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.count_submitted", entityType: "stock_count", entityId: input.id, metadata: { code: result.code } });
    return result;
  })),
  postCount: inventoryProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => run(async () => {
    const result = await postCount(await loadInventoryActor(ctx.user), input.id);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.count_posted", entityType: "stock_count", entityId: input.id, metadata: { code: result.code, adjustedLines: result.adjustedLines, netDelta: result.netDelta } });
    return result;
  })),
  cancelCount: inventoryProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => run(async () => {
    const result = await cancelCount(await loadInventoryActor(ctx.user), input.id);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.count_cancelled", entityType: "stock_count", entityId: input.id });
    return result;
  })),

  // --- Transfers (Phase 4, server/transfers.ts) ---------------------------
  transfers: inventoryProcedure.input(z.object({ branchId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => listTransfers(await loadInventoryActor(ctx.user), { branchId: input?.branchId })),
  // Every active location, for the warehouse's "to" picker (a store
  // consultant's own context only lists their branch).
  transferBranches: inventoryProcedure.query(async ({ ctx }) => {
    const actor = await loadInventoryActor(ctx.user);
    if (actor.role !== "admin" && actor.role !== "warehouse") return [];
    return (await getInventoryContext({ ...actor, role: "admin" })).branches;
  }),
  transfer: inventoryProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => run(async () => getTransfer(await loadInventoryActor(ctx.user), input.id))),
  createTransfer: inventoryProcedure.input(z.object({ fromBranchId: z.number().int().positive(), toBranchId: z.number().int().positive(), note: text(500) })).mutation(async ({ ctx, input }) => run(async () => {
    const transfer = await createTransfer(await loadInventoryActor(ctx.user), input);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.transfer_created", entityType: "stock_transfer", entityId: transfer.id, metadata: { code: transfer.code, fromBranchId: input.fromBranchId, toBranchId: input.toBranchId } });
    return transfer;
  })),
  saveTransferLines: inventoryProcedure.input(z.object({ id: z.number().int().positive(), lines: linesSchema })).mutation(async ({ ctx, input }) => run(async () => saveTransferLines(await loadInventoryActor(ctx.user), input.id, input.lines))),
  sendTransfer: inventoryProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => run(async () => {
    const result = await sendTransfer(await loadInventoryActor(ctx.user), input.id);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.transfer_sent", entityType: "stock_transfer", entityId: input.id, metadata: { code: result.code } });
    return result;
  })),
  saveTransferReceived: inventoryProcedure.input(z.object({ id: z.number().int().positive(), lines: linesSchema })).mutation(async ({ ctx, input }) => run(async () => saveReceivedDraft(await loadInventoryActor(ctx.user), input.id, input.lines))),
  confirmTransfer: inventoryProcedure.input(z.object({ id: z.number().int().positive(), note: z.string().trim().max(300).optional() })).mutation(async ({ ctx, input }) => run(async () => {
    const result = await confirmTransferReceipt(await loadInventoryActor(ctx.user), input.id, input.note);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.transfer_received", entityType: "stock_transfer", entityId: input.id, metadata: { code: result.code, discrepancy: result.discrepancyStatus } });
    return result;
  })),
  resolveTransferLine: inventoryProcedure.input(z.object({ lineId: z.number().int().positive(), resolution: z.enum([...SHORT_RESOLUTIONS, ...OVER_RESOLUTIONS]), note: z.string().trim().max(300).optional() })).mutation(async ({ ctx, input }) => run(async () => {
    const result = await resolveTransferLine(await loadInventoryActor(ctx.user), input.lineId, input.resolution, input.note);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.transfer_line_resolved", entityType: "stock_transfer", entityId: result.id, metadata: { lineId: input.lineId, resolution: input.resolution } });
    return result;
  })),
  cancelTransfer: inventoryProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => run(async () => {
    const result = await cancelTransfer(await loadInventoryActor(ctx.user), input.id);
    await logAdminAction({ actorUserId: ctx.user.id, action: "inventory.transfer_cancelled", entityType: "stock_transfer", entityId: input.id });
    return result;
  })),
  // "Замд" -- sent but not yet confirmed, for the per-branch stock editor.
  // 2026-09-23: warehouse/admin эрхээр л. `getTransfer`/`listTransfers` нь
  // сохор тооллогын үед ажилтнаас `qtySent`-ийг зориуд нуудаг атлаа энэ цэг
  // variant тус бүрийн илгээсэн тоог хэн ч (variant id нь `skuIndex`-д
  // байдаг) гаргаж авахыг зөвшөөрдөг байв — нуулт нь тойрогдоно.
  inTransit: inventoryProcedure.input(z.object({ variantId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const actor = await loadInventoryActor(ctx.user);
    if (actor.role !== "admin" && actor.role !== "warehouse") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Замд байгаа тоог зөвхөн агуулах/админ хардаг." });
    }
    return getInTransitForVariant(input.variantId);
  }),
});
