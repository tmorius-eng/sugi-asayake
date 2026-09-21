import { useMemo, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Camera, CheckCircle2, ClipboardList, CloudOff, LoaderCircle, PackagePlus, Plus, Send, TriangleAlert, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useScanDraft } from "@/hooks/useScanDraft";
import ScanSession, { buildSkuLookup } from "./inventory/ScanSession";
import TransfersView from "./inventory/TransfersView";

import { useConfirm } from "@/components/ConfirmDialog";
/**
 * /admin -> Бараа хүлээн авах (2026-09-11, Phase 3).
 *
 * Replaces the handwritten A4 list a store consultant photographed into the
 * work group chat whenever goods arrived: open a receipt, scan every item
 * with the USB scanner (each beep = +1), press "Нөөцөд нэмэх". The stock is
 * added to that branch on the ledger, and the warehouse/admin phones get a
 * push with the summary instead of a blurry photo.
 *
 * Also the stocktake screen (Тооллого): same scanning, but the result
 * CORRECTS the shelf count instead of adding to it. Store consultants can
 * only submit a count; warehouse/admin approve it (Tom, 2026-09-11).
 *
 * The scanning itself is components/inventory/ScanSession.tsx; saving and
 * crash-safety is hooks/useScanDraft.ts.
 */

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";
const statusLabel: Record<string, string> = { draft: "Ноорог", submitted: "Батлуулахаар илгээсэн", posted: "Батлагдсан", cancelled: "Цуцлагдсан" };
const statusStyle: Record<string, string> = {
  draft: "bg-[var(--a-info-soft)] text-[var(--a-info)]",
  submitted: "bg-[var(--a-warn-soft)] text-[var(--a-warn)]",
  posted: "bg-[var(--a-pos-soft)] text-[var(--a-pos)]",
  cancelled: "bg-[var(--a-soft)] text-[var(--a-muted)]",
};

type Mode = "receive" | "count" | "transfer";
type Open = { kind: "receipt" | "count"; id: number } | null;

function SaveIndicator({ status, dirty }: { status: string; dirty: boolean }) {
  if (status === "error") return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--a-neg)]"><CloudOff size={13} />Хадгалж чадсангүй — энэ төхөөрөмж дээр хадгалагдсан, сүлжээ сэргэхэд дахин илгээнэ</span>;
  if (status === "saving" || dirty) return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--a-muted)]"><LoaderCircle size={12} className="animate-spin" />Хадгалж байна…</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--a-pos)]"><CheckCircle2 size={13} />Хадгалагдсан</span>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ReceiptView({ id, lookup, onBack }: { id: number; lookup: ReturnType<typeof buildSkuLookup>; onBack: () => void }) {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const receiptQuery = trpc.inventory.receipt.useQuery({ id });
  const saveLines = trpc.inventory.saveReceiptLines.useMutation();
  const update = trpc.inventory.updateReceipt.useMutation();
  const post = trpc.inventory.postReceipt.useMutation();
  const cancel = trpc.inventory.cancelReceipt.useMutation();
  const uploadPhoto = trpc.inventory.uploadReceiptPhoto.useMutation();
  const receipt = receiptQuery.data;
  const editable = receipt?.status === "draft";
  const draft = useScanDraft({
    draftKey: receipt ? `receipt:${receipt.id}` : null,
    serverLines: receipt?.lines,
    editable: Boolean(editable),
    save: lines => saveLines.mutateAsync({ id, lines }),
  });
  const [supplier, setSupplier] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState<string | null>(null);

  if (receiptQuery.isLoading || !receipt) return <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>;

  const refresh = () => Promise.all([utils.inventory.receipt.invalidate({ id }), utils.inventory.receipts.invalidate()]);

  const saveDetails = async () => {
    try {
      await update.mutateAsync({ id, supplierName: supplier ?? receipt.supplierName, supplierInvoiceNo: invoiceNo ?? receipt.supplierInvoiceNo });
      setSupplier(null); setInvoiceNo(null);
      await refresh();
      toast.success("Хадгаллаа.");
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    const contentType = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    try {
      await uploadPhoto.mutateAsync({ id, contentType, dataBase64: await fileToBase64(file) });
      await refresh();
      toast.success("Нэхэмжлэхийн зураг хадгалагдлаа.");
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const doPost = async () => {
    const lines = draft.state.lines;
    if (!lines.length) { toast.error("Эхлээд бараа уншуулна уу."); return; }
    const isUnknown = (line: (typeof lines)[number]) => line.variantId === null && !lookup.byCode.get(line.code);
    const unknown = lines.filter(isUnknown).length;
    // Only what will actually be booked -- unknown codes stay out of stock.
    const pieces = lines.filter(line => !isUnknown(line)).reduce((sum, line) => sum + line.quantity, 0);
    const message = `${receipt.branchName}-д ${lines.length - unknown} төрөл, нийт ${pieces} ширхэг бараа нөөцөд нэмэгдэнэ.${unknown ? `\n\n${unknown} бүртгэлгүй код нөөцөд ОРОХГҮЙ (тэмдэглэлд үлдэнэ).` : ""}\n\nҮргэлжлүүлэх үү?`;
    if (!await confirm({ title: message })) return;
    try {
      await draft.flush();
      const result = await post.mutateAsync({ id, skipUnknown: unknown > 0 });
      draft.discardLocal();
      await refresh();
      toast.success(`${result.code} батлагдлаа — ${result.pieces} ширхэг нөөцөд нэмэгдлээ.`);
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const doCancel = async () => {
    if (!await confirm({ title: "Энэ хүлээн авалтыг цуцлах уу? Нөөцөд юу ч нэмэгдэхгүй.", danger: true })) return;
    try { await cancel.mutateAsync({ id }); draft.discardLocal(); await refresh(); onBack(); } catch (error) { toast.error(messageFrom(error)); }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--a-muted)] hover:text-[var(--a-text)]"><ArrowLeft size={14} />Жагсаалт руу</button>
        <div className="flex items-center gap-2">
          {editable && <SaveIndicator status={draft.status} dirty={draft.dirty} />}
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusStyle[receipt.status]}`}>{statusLabel[receipt.status]}</span>
        </div>
      </div>
      <div className="rounded-2xl bg-[var(--a-soft)] p-4">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">ХҮЛЭЭН АВАЛТ {receipt.code}</p>
        <p className="mt-1 text-sm font-bold">{receipt.branchName}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input disabled={!editable} value={supplier ?? receipt.supplierName ?? ""} onChange={event => setSupplier(event.target.value)} placeholder="Нийлүүлэгч (заавал биш)" className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs outline-none focus:border-[var(--a-info)] disabled:opacity-70" />
          <input disabled={!editable} value={invoiceNo ?? receipt.supplierInvoiceNo ?? ""} onChange={event => setInvoiceNo(event.target.value)} placeholder="Нэхэмжлэхийн дугаар (заавал биш)" className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs outline-none focus:border-[var(--a-info)] disabled:opacity-70" />
          {editable && (supplier !== null || invoiceNo !== null) && <button type="button" onClick={saveDetails} className="h-10 rounded-lg bg-[var(--a-btn-dark)] px-4 text-[11px] font-extrabold text-white">Хадгалах</button>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {receipt.invoicePhotoUrl && <a href={receipt.invoicePhotoUrl} target="_blank" rel="noreferrer"><img src={receipt.invoicePhotoUrl} alt="Нэхэмжлэхийн зураг" className="h-16 w-16 rounded-lg object-cover" /></a>}
          {editable && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-2 text-[11px] font-extrabold text-[var(--a-text-soft)] hover:border-[var(--a-info)] hover:text-[var(--a-info)]">
              {uploadPhoto.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Camera size={13} />}{receipt.invoicePhotoUrl ? "Зураг солих" : "Нэхэмжлэхийн зураг (заавал биш)"}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={event => { void onPhoto(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
          )}
        </div>
        {receipt.note && <p className="mt-2 whitespace-pre-line text-[11px] text-[var(--a-muted)]">{receipt.note}</p>}
      </div>

      <ScanSession state={draft.state} dispatch={draft.dispatch} lookup={lookup} editable={Boolean(editable)} />

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={doPost} disabled={post.isPending || !draft.state.lines.length} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white disabled:opacity-50">{post.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <PackagePlus size={16} />}Нөөцөд нэмэх (батлах)</button>
          <button type="button" onClick={doCancel} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[var(--a-muted)] hover:text-[#df1f3d]"><X size={14} />Цуцлах</button>
        </div>
      )}
    </div>
  );
}

function CountView({ id, lookup, canPost, onBack }: { id: number; lookup: ReturnType<typeof buildSkuLookup>; canPost: boolean; onBack: () => void }) {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const countQuery = trpc.inventory.count.useQuery({ id });
  const saveLines = trpc.inventory.saveCountLines.useMutation({ onSuccess: () => utils.inventory.count.invalidate({ id }) });
  const submit = trpc.inventory.submitCount.useMutation();
  const post = trpc.inventory.postCount.useMutation();
  const cancel = trpc.inventory.cancelCount.useMutation();
  const count = countQuery.data;
  const editable = count?.status === "draft";
  const serverLines = useMemo(() => count?.lines.map(line => ({ code: line.code, variantId: line.variantId, quantity: line.countedQty })), [count?.lines]);
  const draft = useScanDraft({
    draftKey: count ? `count:${count.id}` : null,
    serverLines,
    editable: Boolean(editable),
    save: lines => saveLines.mutateAsync({ id, lines }),
  });

  if (countQuery.isLoading || !count) return <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>;

  const refresh = () => Promise.all([utils.inventory.count.invalidate({ id }), utils.inventory.counts.invalidate()]);
  const variances = count.lines.filter(line => line.variance);

  const doSubmit = async () => {
    if (!await confirm({ title: "Тооллогыг агуулах/админд батлуулахаар илгээх үү? Илгээсний дараа засах боломжгүй." })) return;
    try { await draft.flush(); await submit.mutateAsync({ id }); draft.discardLocal(); await refresh(); toast.success("Илгээлээ — батлагдмагц нөөц засагдана."); } catch (error) { toast.error(messageFrom(error)); }
  };
  const doPost = async () => {
    const zeroed = count.scope === "full" ? count.unscanned.length : 0;
    const message = `${count.branchName}-ийн нөөцийг тооллогоор засна: ${variances.length} бараа зөрүүтэй${zeroed ? `, уншуулаагүй ${zeroed} бараа 0 болно` : ""}.${count.isOpening ? "\n\nЭнэ бол ЭХНИЙ ҮЛДЭГДЭЛ тооллого." : ""}\n\nҮргэлжлүүлэх үү?`;
    if (!await confirm({ title: message })) return;
    try {
      await draft.flush();
      const result = await post.mutateAsync({ id });
      draft.discardLocal();
      await refresh();
      toast.success(`${result.code} батлагдлаа — ${result.adjustedLines} бараа засагдлаа (${result.netDelta > 0 ? "+" : ""}${result.netDelta}).`);
    } catch (error) { toast.error(messageFrom(error)); }
  };
  const doCancel = async () => {
    if (!await confirm({ title: "Энэ тооллогыг цуцлах уу? Нөөц өөрчлөгдөхгүй.", danger: true })) return;
    try { await cancel.mutateAsync({ id }); draft.discardLocal(); await refresh(); onBack(); } catch (error) { toast.error(messageFrom(error)); }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--a-muted)] hover:text-[var(--a-text)]"><ArrowLeft size={14} />Жагсаалт руу</button>
        <div className="flex items-center gap-2">
          {editable && <SaveIndicator status={draft.status} dirty={draft.dirty} />}
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusStyle[count.status]}`}>{statusLabel[count.status]}</span>
        </div>
      </div>
      <div className="rounded-2xl bg-[var(--a-soft)] p-4">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">{count.isOpening ? "ЭХНИЙ ҮЛДЭГДЛИЙН ТООЛЛОГО" : "ТООЛЛОГО"} {count.code}</p>
        <p className="mt-1 text-sm font-bold">{count.branchName} · {count.scope === "full" ? "Бүрэн тооллого" : "Хэсэгчилсэн тооллого"}</p>
        <p className="mt-1 text-[11px] leading-4 text-[var(--a-muted)]">{count.scope === "full" ? "Салбарын бүх барааг уншуулна. Уншуулаагүй бараа батлахад 0 болно." : "Зөвхөн уншуулсан бараануудын үлдэгдэл засагдана."} Тоолж байх хооронд зарагдсан бараа тооцоонд зөв орно.</p>
      </div>

      <ScanSession state={draft.state} dispatch={draft.dispatch} lookup={lookup} editable={Boolean(editable)} hint="Тавиур дээрх бараа бүрийг уншуулна — нэг удаа уншуулах = 1 ширхэг." />

      {(variances.length > 0 || (count.scope === "full" && count.unscanned.length > 0)) && (
        <div className="rounded-2xl border border-[var(--a-border)] p-3">
          <p className="text-[10px] font-extrabold tracking-[.08em] text-[var(--a-info)]">ЗӨРҮҮ (СИСТЕМТЭЙ ХАРЬЦУУЛСНААР)</p>
          <div className="mt-2 grid gap-1">
            {variances.map(line => <p key={line.id} className="flex justify-between gap-2 text-[12px]"><span className="truncate">{line.productName ?? line.code}</span><span className={`shrink-0 font-extrabold ${line.variance! > 0 ? "text-[var(--a-pos)]" : "text-[var(--a-neg)]"}`}>систем {line.systemQtyAtFirstScan} → тоолсон {line.countedQty} ({line.variance! > 0 ? "+" : ""}{line.variance})</span></p>)}
            {count.scope === "full" && count.unscanned.slice(0, 50).map(item => <p key={item.variantId} className="flex justify-between gap-2 text-[12px] text-[var(--a-muted)]"><span className="truncate">{item.productName}</span><span className="shrink-0 font-extrabold text-[var(--a-neg)]">уншуулаагүй: {item.systemQty} → 0</span></p>)}
            {count.scope === "full" && count.unscanned.length > 50 && <p className="text-[11px] text-[var(--a-faint)]">… болон уншуулаагүй өөр {count.unscanned.length - 50} бараа</p>}
          </div>
        </div>
      )}

      {(count.status === "draft" || count.status === "submitted") && (
        <div className="flex flex-wrap items-center gap-2">
          {canPost ? (
            <button type="button" onClick={doPost} disabled={post.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white disabled:opacity-50">{post.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Батлах (нөөц засах)</button>
          ) : count.status === "draft" ? (
            <button type="button" onClick={doSubmit} disabled={submit.isPending || !draft.state.lines.length} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white disabled:opacity-50">{submit.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}Батлуулахаар илгээх</button>
          ) : <p className="text-xs font-bold text-[var(--a-warn)]">Агуулах/админ батлахыг хүлээж байна.</p>}
          <button type="button" onClick={doCancel} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[var(--a-muted)] hover:text-[#df1f3d]"><X size={14} />Цуцлах</button>
        </div>
      )}
    </div>
  );
}

export default function AdminReceivingPanel() {
  const contextQuery = trpc.inventory.context.useQuery();
  const skuQuery = trpc.inventory.skuIndex.useQuery(undefined, { staleTime: 5 * 60_000 });
  const lookup = useMemo(() => buildSkuLookup(skuQuery.data), [skuQuery.data]);
  const [mode, setMode] = useState<Mode>("receive");
  const [branchId, setBranchId] = useState<number | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [countScope, setCountScope] = useState<"partial" | "full">("partial");
  const [isOpening, setIsOpening] = useState(false);
  const utils = trpc.useUtils();
  const createReceipt = trpc.inventory.createReceipt.useMutation();
  const createCount = trpc.inventory.createCount.useMutation();

  const context = contextQuery.data;
  const branchOptions = context?.branches ?? [];
  const selectedBranchId = branchId ?? (branchOptions.length === 1 ? branchOptions[0].id : null);
  const receiptsQuery = trpc.inventory.receipts.useQuery(selectedBranchId ? { branchId: selectedBranchId } : undefined, { enabled: Boolean(context) && mode === "receive" });
  const countsQuery = trpc.inventory.counts.useQuery(selectedBranchId ? { branchId: selectedBranchId } : undefined, { enabled: Boolean(context) && mode === "count" });

  if (contextQuery.isLoading || skuQuery.isLoading) return <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>;
  if (contextQuery.error) return <p className="rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(contextQuery.error)}</p>;
  if (!context) return null;
  if (context.role === "staff" && !branchOptions.length) {
    return <div className="flex gap-2.5 rounded-2xl bg-[var(--a-warn-soft)] p-4 text-sm leading-6 text-[var(--a-warn)]"><TriangleAlert size={18} className="mt-1 shrink-0" /><p>Таны данс ямар ч салбарт хамаарахгүй байна. Админ <strong>Хэрэглэгч</strong> хэсгээс таны салбарыг тохируулж өгсний дараа бараа хүлээн авч, тоолж болно.</p></div>;
  }

  if (open?.kind === "receipt") return <ReceiptView id={open.id} lookup={lookup} onBack={() => setOpen(null)} />;
  if (open?.kind === "count") return <CountView id={open.id} lookup={lookup} canPost={context.canPostCounts} onBack={() => setOpen(null)} />;

  const startReceipt = async () => {
    if (!selectedBranchId) { toast.error("Салбараа сонгоно уу."); return; }
    try { const receipt = await createReceipt.mutateAsync({ branchId: selectedBranchId }); await utils.inventory.receipts.invalidate(); setOpen({ kind: "receipt", id: receipt.id }); } catch (error) { toast.error(messageFrom(error)); }
  };
  const startCount = async () => {
    if (!selectedBranchId) { toast.error("Салбараа сонгоно уу."); return; }
    try { const count = await createCount.mutateAsync({ branchId: selectedBranchId, scope: countScope, isOpening }); await utils.inventory.counts.invalidate(); setOpen({ kind: "count", id: count.id }); } catch (error) { toast.error(messageFrom(error)); }
  };

  if (mode === "transfer") {
    return (
      <div className="grid gap-4">
        <div className="inline-flex w-fit rounded-full bg-[var(--a-soft)] p-1" role="tablist">
          <button type="button" role="tab" aria-selected={false} onClick={() => setMode("receive")} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-[var(--a-muted)]"><Truck size={14} />Бараа хүлээн авах</button>
          <button type="button" role="tab" aria-selected={false} onClick={() => setMode("count")} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-[var(--a-muted)]"><ClipboardList size={14} />Тооллого</button>
          <button type="button" role="tab" aria-selected className="inline-flex items-center gap-1.5 rounded-full bg-[var(--a-card)] px-4 py-2 text-xs font-bold text-[var(--a-text)] shadow-sm"><ArrowLeftRight size={14} />Шилжүүлэг</button>
        </div>
        <TransfersView lookup={lookup} role={context.role} branches={branchOptions} myBranchId={context.branchId} />
      </div>
    );
  }

  const rows = mode === "receive" ? (receiptsQuery.data ?? []) : (countsQuery.data ?? []);
  const listLoading = mode === "receive" ? receiptsQuery.isLoading : countsQuery.isLoading;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-[var(--a-soft)] p-1" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "receive"} onClick={() => setMode("receive")} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold ${mode === "receive" ? "bg-[var(--a-card)] text-[var(--a-text)] shadow-sm" : "text-[var(--a-muted)]"}`}><Truck size={14} />Бараа хүлээн авах</button>
          <button type="button" role="tab" aria-selected={mode === "count"} onClick={() => setMode("count")} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold ${mode === "count" ? "bg-[var(--a-card)] text-[var(--a-text)] shadow-sm" : "text-[var(--a-muted)]"}`}><ClipboardList size={14} />Тооллого</button>
          <button type="button" role="tab" aria-selected={false} onClick={() => setMode("transfer")} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-[var(--a-muted)]"><ArrowLeftRight size={14} />Шилжүүлэг</button>
        </div>
        {branchOptions.length > 1 && (
          <select value={selectedBranchId ?? ""} onChange={event => setBranchId(event.target.value ? Number(event.target.value) : null)} className="h-10 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-4 text-xs font-bold outline-none focus:border-[var(--a-info)]" aria-label="Салбар">
            <option value="">Салбар сонгох</option>
            {branchOptions.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.kind === "warehouse" ? " (агуулах)" : ""}</option>)}
          </select>
        )}
        {branchOptions.length === 1 && <span className="rounded-full bg-[var(--a-soft)] px-4 py-2 text-xs font-bold">{branchOptions[0].name}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-[var(--a-border)] p-4">
        {mode === "receive" ? (
          <>
            <p className="min-w-0 flex-1 text-xs leading-5 text-[var(--a-muted)]">Шинэ бараа ирэхэд <strong className="text-[var(--a-text)]">"Шинэ хүлээн авалт"</strong> дараад бараа бүрийг сканнероор уншуулна. Дуусаад "Нөөцөд нэмэх" дарахад агуулах, удирдлагын утсанд мэдэгдэл очно — цаасан жагсаалтын зураг хэрэггүй.</p>
            <button type="button" onClick={startReceipt} disabled={!selectedBranchId || createReceipt.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white disabled:opacity-50">{createReceipt.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}Шинэ хүлээн авалт</button>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-1.5 font-bold"><input type="radio" name="count-scope" checked={countScope === "partial" && !isOpening} onChange={() => { setCountScope("partial"); setIsOpening(false); }} />Хэсэгчилсэн (зөвхөн уншуулсан бараа)</label>
              <label className="inline-flex items-center gap-1.5 font-bold"><input type="radio" name="count-scope" checked={countScope === "full" && !isOpening} onChange={() => { setCountScope("full"); setIsOpening(false); }} />Бүрэн (уншуулаагүй нь 0 болно)</label>
              {context.canPostCounts && <label className="inline-flex items-center gap-1.5 font-bold text-[var(--a-warn)]"><input type="radio" name="count-scope" checked={isOpening} onChange={() => { setCountScope("full"); setIsOpening(true); }} />Эхний үлдэгдэл</label>}
            </div>
            <button type="button" onClick={startCount} disabled={!selectedBranchId || createCount.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white disabled:opacity-50">{createCount.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}Шинэ тооллого</button>
          </>
        )}
      </div>

      {listLoading && <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>}
      {!listLoading && !rows.length && <p className="rounded-2xl bg-[var(--a-soft)] p-6 text-center text-xs text-[var(--a-muted)]">{mode === "receive" ? "Хүлээн авалт хараахан алга." : "Тооллого хараахан алга."}</p>}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--a-border)]">
          {rows.map(row => (
            <button key={row.id} type="button" onClick={() => setOpen({ kind: mode === "receive" ? "receipt" : "count", id: row.id })} className="flex w-full flex-wrap items-center gap-3 border-b border-[var(--a-border)] bg-[var(--a-card)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--a-soft)]">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold">{row.code}{"supplierName" in row && row.supplierName ? ` · ${row.supplierName}` : ""}{"isOpening" in row && row.isOpening ? " · Эхний үлдэгдэл" : ""}</span>
                <span className="block text-[11px] text-[var(--a-muted)]">{row.branchName} · {new Date(row.createdAt).toLocaleString("mn-MN")} · {row.lineCount} төрөл · {row.pieces} ширхэг</span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusStyle[row.status]}`}>{statusLabel[row.status]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
