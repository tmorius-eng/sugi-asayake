import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  cancelCount, cancelReceipt, createCount, createReceipt, getCount, getInventoryContext, getReceipt, getSkuIndex, InventoryError,
  listCounts, listReceipts, loadInventoryActor, postCount, postReceipt, saveCountLines, saveReceiptLines, submitCount, updateReceiptDetails,
} from "./inventory";
import { randomBytes } from "node:crypto";
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
  updateReceipt: inventoryProcedure.input(z.object({ id: z.number().int().positive(), supplierName: text(160), supplierInvoiceNo: text(80), note: text(500), invoicePhotoUrl: z.string().trim().max(500).nullable().optional() })).mutation(async ({ ctx, input }) => run(async () => {
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
    await getReceipt(actor, input.id); // existence + branch permission
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
});
