import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, EyeOff, LoaderCircle, Plus, Send, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useScanDraft } from "@/hooks/useScanDraft";
import { reconcileTransfer, RECONCILE_LABELS, OVER_RESOLUTIONS, RESOLUTION_LABELS, SHORT_RESOLUTIONS, type TransferResolution } from "@shared/transfer-reconcile";
import ScanSession, { buildSkuLookup } from "./ScanSession";

/**
 * Warehouse -> store transfers (2026-09-11, Phase 4), inside "Бараа хүлээн
 * авах". The warehouse scans what goes in the box and sends it (the goods
 * leave the warehouse shelf there and then). The store scans what arrived
 * WITHOUT seeing what was sent, then compares and confirms; any difference
 * goes to admin, who decides each mismatched line.
 */

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";
const statusLabel: Record<string, string> = { draft: "Бэлтгэж байна", sent: "Замд", received: "Хүлээн авсан", cancelled: "Цуцлагдсан" };
const statusStyle: Record<string, string> = {
  draft: "bg-[var(--a-info-soft)] text-[var(--a-info)]",
  sent: "bg-[var(--a-warn-soft)] text-[var(--a-warn)]",
  received: "bg-[var(--a-pos-soft)] text-[var(--a-pos)]",
  cancelled: "bg-[var(--a-soft)] text-[var(--a-muted)]",
};
const reconcileStyle: Record<string, string> = {
  matched: "text-[var(--a-pos)]",
  short: "text-[var(--a-neg)]",
  over: "text-[var(--a-warn)]",
  unexpected: "text-[var(--a-warn)]",
};

type Lookup = ReturnType<typeof buildSkuLookup>;

function SaveBadge({ status, dirty }: { status: string; dirty: boolean }) {
  if (status === "error") return <span className="text-[11px] font-bold text-[var(--a-neg)]">Хадгалж чадсангүй — дахин оролдоно</span>;
  if (status === "saving" || dirty) return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--a-muted)]"><LoaderCircle size={12} className="animate-spin" />Хадгалж байна…</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--a-pos)]"><CheckCircle2 size={13} />Хадгалагдсан</span>;
}

function TransferDetail({ id, lookup, role, myBranchId, onBack }: { id: number; lookup: Lookup; role: string; myBranchId: number | null; onBack: () => void }) {
  const utils = trpc.useUtils();
  const transferQuery = trpc.inventory.transfer.useQuery({ id });
  const savePick = trpc.inventory.saveTransferLines.useMutation();
  const saveReceived = trpc.inventory.saveTransferReceived.useMutation();
  const send = trpc.inventory.sendTransfer.useMutation();
  const confirm = trpc.inventory.confirmTransfer.useMutation();
  const cancel = trpc.inventory.cancelTransfer.useMutation();
  const resolve = trpc.inventory.resolveTransferLine.useMutation();
  const [showCompare, setShowCompare] = useState(false);
  const [receiveNote, setReceiveNote] = useState("");
  const transfer = transferQuery.data;
  const isWarehouse = role === "admin" || role === "warehouse";
  const picking = transfer?.status === "draft" && isWarehouse;
  const receiving = transfer?.status === "sent" && (role === "admin" || myBranchId === transfer.toBranchId);

  // Which quantity the list shows: the pick list while packing; the store's
  // own count while receiving; what was SENT for anyone else watching a
  // transfer in transit (the warehouse that sent it); what ARRIVED once it
  // has been received.
  const serverLines = useMemo(() => {
    if (!transfer) return undefined;
    const current = transfer;
    const pick = (quantity: (line: (typeof current.lines)[number]) => number | null | undefined) =>
      current.lines.map(line => ({ code: line.code, variantId: line.variantId, quantity: quantity(line) ?? 0 })).filter(line => line.quantity > 0);
    if (picking) return pick(line => line.qtySent);
    if (receiving) return pick(line => line.receivedDraftQty);
    if (current.status === "received") return pick(line => line.qtyReceived);
    return pick(line => line.qtySent);
  }, [transfer, picking, receiving]);

  const draft = useScanDraft({
    draftKey: transfer ? `transfer:${transfer.id}:${picking ? "pick" : "receive"}` : null,
    serverLines,
    editable: Boolean(picking || receiving),
    save: lines => picking ? savePick.mutateAsync({ id, lines }) : saveReceived.mutateAsync({ id, lines }),
  });

  if (transferQuery.isLoading || !transfer) return <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>;
  const refresh = () => Promise.all([utils.inventory.transfer.invalidate({ id }), utils.inventory.transfers.invalidate()]);

  // Live comparison for the store's preview; the server recomputes it on confirm.
  const liveCompare = !transfer.blind && transfer.status === "sent"
    ? reconcileTransfer(transfer.lines.filter(line => line.qtySent !== null).map(line => ({ code: line.code, qtySent: line.qtySent ?? 0, received: draft.state.lines.find(scanned => scanned.code === line.code)?.quantity ?? 0 }))
      .concat(draft.state.lines.filter(scanned => !transfer.lines.some(line => line.code === scanned.code)).map(scanned => ({ code: scanned.code, qtySent: 0, received: scanned.quantity }))))
    : null;

  const doSend = async () => {
    const pieces = draft.state.lines.reduce((sum, line) => sum + line.quantity, 0);
    if (!window.confirm(`${transfer.fromBranchName} → ${transfer.toBranchName}: ${draft.state.lines.length} төрөл, ${pieces} ширхэг илгээнэ. Бараа ${transfer.fromBranchName}-с одоо хасагдана.\n\nИлгээх үү?`)) return;
    try { await draft.flush(); await send.mutateAsync({ id }); draft.discardLocal(); await refresh(); toast.success("Илгээлээ — дэлгүүрт мэдэгдэл очлоо."); } catch (error) { toast.error(messageFrom(error)); }
  };
  const doConfirm = async () => {
    if (!window.confirm("Ирсэн барааг баталгаажуулах уу? Уншуулсан тоогоор дэлгүүрийн нөөцөд нэмэгдэж, зөрүү байвал админд мэдэгдэнэ.")) return;
    try { await draft.flush(); await confirm.mutateAsync({ id, note: receiveNote.trim() || undefined }); draft.discardLocal(); await refresh(); toast.success("Хүлээн авлаа."); } catch (error) { toast.error(messageFrom(error)); }
  };
  const doCancel = async () => {
    if (!window.confirm(transfer.status === "sent" ? "Илгээсэн шилжүүлгийг цуцлах уу? Бүх бараа илгээсэн салбарт буцаж нэмэгдэнэ." : "Энэ шилжүүлгийг цуцлах уу?")) return;
    try { await cancel.mutateAsync({ id }); draft.discardLocal(); await refresh(); onBack(); } catch (error) { toast.error(messageFrom(error)); }
  };
  const doResolve = async (lineId: number, resolution: TransferResolution) => {
    const note = window.prompt(`${RESOLUTION_LABELS[resolution]}\n\nТайлбар (заавал биш):`);
    if (note === null) return;
    try { await resolve.mutateAsync({ lineId, resolution, note: note.trim() || undefined }); await refresh(); toast.success("Шийдвэр бүртгэгдлээ."); } catch (error) { toast.error(messageFrom(error)); }
  };

  const received = transfer.status === "received" ? transfer.reconciliation : null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--a-muted)] hover:text-[var(--a-text)]"><ArrowLeft size={14} />Жагсаалт руу</button>
        <div className="flex items-center gap-2">
          {(picking || receiving) && <SaveBadge status={draft.status} dirty={draft.dirty} />}
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusStyle[transfer.status]}`}>{statusLabel[transfer.status]}</span>
          {transfer.discrepancyStatus === "open" && <span className="rounded-full bg-[var(--a-neg-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-neg)]">Зөрүүтэй</span>}
        </div>
      </div>
      <div className="rounded-2xl bg-[var(--a-soft)] p-4">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">ШИЛЖҮҮЛЭГ {transfer.code}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold">{transfer.fromBranchName}<ArrowRight size={14} className="text-[var(--a-muted)]" />{transfer.toBranchName}</p>
        {transfer.note && <p className="mt-2 whitespace-pre-line text-[11px] text-[var(--a-muted)]">{transfer.note}</p>}
      </div>

      {transfer.blind && (
        <p className="flex items-start gap-2 rounded-2xl bg-[var(--a-info-soft)] px-4 py-3 text-xs leading-5 text-[var(--a-info)]"><EyeOff size={16} className="mt-0.5 shrink-0" />Ирсэн бараа бүрийг уншуулна уу. Хэдэн ширхэг илгээснийг зориуд харуулахгүй — бодит ирсэн тоог тоолохын тулд. Дуусаад "Хүлээн авах" дарахад илгээсэнтэй тулгана.</p>
      )}

      {(picking || receiving || transfer.status !== "draft") && (
        <ScanSession state={draft.state} dispatch={draft.dispatch} lookup={lookup} editable={Boolean(picking || receiving)} hint={picking ? "Хайрцагт хийж буй бараа бүрийг уншуулна — нэг уншуулалт = 1 ширхэг." : "Ирсэн бараа бүрийг уншуулна — нэг уншуулалт = 1 ширхэг."} />
      )}

      {liveCompare && showCompare && (
        <div className="rounded-2xl border border-[var(--a-border)] p-3">
          <p className="text-[10px] font-extrabold tracking-[.08em] text-[var(--a-info)]">ИЛГЭЭСЭНТЭЙ ТУЛГАСАН</p>
          <div className="mt-2 grid gap-1">
            {liveCompare.lines.map(line => {
              const row = transfer.lines.find(candidate => candidate.code === line.code);
              const entry = row?.variantId ? lookup.byVariant.get(row.variantId) : lookup.byCode.get(line.code);
              return <p key={line.code} className="flex justify-between gap-2 text-[12px]"><span className="truncate">{row?.productName ?? entry?.productName ?? line.code}</span><span className={`shrink-0 font-extrabold ${reconcileStyle[line.status]}`}>{RECONCILE_LABELS[line.status]}: илгээсэн {line.qtySent} / ирсэн {line.received}</span></p>;
            })}
          </div>
        </div>
      )}

      {received && received.hasDiscrepancy && (
        <div className="rounded-2xl border border-[var(--a-neg)]/40 bg-[var(--a-neg-soft)] p-3">
          <p className="text-[10px] font-extrabold tracking-[.08em] text-[var(--a-neg)]">ЗӨРҮҮ · {received.missingPieces} дутуу, {received.extraPieces} илүү</p>
          <div className="mt-2 grid gap-2">
            {transfer.lines.filter(line => (line.qtyReceived ?? 0) !== (line.qtySent ?? 0)).map(line => {
              const difference = (line.qtyReceived ?? 0) - (line.qtySent ?? 0);
              const options = difference < 0 ? SHORT_RESOLUTIONS : OVER_RESOLUTIONS;
              return (
                <div key={line.id} className="rounded-xl bg-[var(--a-card)] p-2.5 text-[12px]">
                  <p className="flex justify-between gap-2"><span className="truncate font-bold">{line.productName ?? line.code}</span><span className={`shrink-0 font-extrabold ${difference < 0 ? "text-[var(--a-neg)]" : "text-[var(--a-warn)]"}`}>илгээсэн {line.qtySent} / ирсэн {line.qtyReceived ?? 0} ({difference > 0 ? "+" : ""}{difference})</span></p>
                  {line.resolution ? (
                    <p className="mt-1 text-[11px] text-[var(--a-pos)]">✓ {RESOLUTION_LABELS[line.resolution as TransferResolution]}{line.resolutionNote ? ` · ${line.resolutionNote}` : ""}</p>
                  ) : role === "admin" ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">{options.map(option => <button key={option} type="button" disabled={resolve.isPending} onClick={() => doResolve(line.id, option)} className="rounded-full border border-[var(--a-border)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-text-soft)] hover:border-[var(--a-info)] hover:text-[var(--a-info)]">{RESOLUTION_LABELS[option]}</button>)}</div>
                  ) : <p className="mt-1 text-[11px] text-[var(--a-muted)]">Админ шийдэхийг хүлээж байна.</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {picking && <button type="button" onClick={doSend} disabled={send.isPending || !draft.state.lines.length} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white disabled:opacity-50">{send.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}Илгээх</button>}
        {receiving && (
          <>
            {!transfer.blind && <button type="button" onClick={() => setShowCompare(current => !current)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--a-border)] px-4 text-xs font-bold">{showCompare ? "Тулгалтыг нуух" : "Илгээсэнтэй тулгах"}</button>}
            <input value={receiveNote} onChange={event => setReceiveNote(event.target.value)} maxLength={300} placeholder="Тэмдэглэл (заавал биш): гэмтэлтэй хайрцаг гэх мэт" className="h-11 min-w-0 flex-1 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-4 text-xs outline-none focus:border-[var(--a-info)]" />
            <button type="button" onClick={doConfirm} disabled={confirm.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#df1f3d] px-5 text-sm font-bold text-white disabled:opacity-50">{confirm.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Хүлээн авах</button>
          </>
        )}
        {((transfer.status === "draft" && isWarehouse) || (transfer.status === "sent" && role === "admin")) && <button type="button" onClick={doCancel} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[var(--a-muted)] hover:text-[#df1f3d]"><X size={14} />Цуцлах</button>}
      </div>
    </div>
  );
}

export default function TransfersView({ lookup, role, branches, myBranchId }: {
  lookup: Lookup;
  role: string;
  branches: { id: number; name: string; kind: string }[];
  myBranchId: number | null;
}) {
  const utils = trpc.useUtils();
  const listQuery = trpc.inventory.transfers.useQuery();
  const allBranchesQuery = trpc.inventory.transferBranches.useQuery(undefined, { enabled: role === "admin" || role === "warehouse" });
  const create = trpc.inventory.createTransfer.useMutation();
  const [openId, setOpenId] = useState<number | null>(null);
  const isWarehouse = role === "admin" || role === "warehouse";
  const choices = allBranchesQuery.data ?? branches;
  const defaultFrom = choices.find(branch => branch.kind === "warehouse")?.id ?? null;
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);

  if (openId) return <TransferDetail id={openId} lookup={lookup} role={role} myBranchId={myBranchId} onBack={() => setOpenId(null)} />;

  const start = async () => {
    const from = fromId ?? defaultFrom;
    if (!from || !toId) { toast.error("Илгээх, хүлээн авах салбараа сонгоно уу."); return; }
    try { const transfer = await create.mutateAsync({ fromBranchId: from, toBranchId: toId }); await utils.inventory.transfers.invalidate(); setOpenId(transfer.id); } catch (error) { toast.error(messageFrom(error)); }
  };

  const rows = listQuery.data ?? [];
  const incoming = rows.filter(row => row.status === "sent" && (role === "admin" || row.toBranchId === myBranchId));

  return (
    <div className="grid gap-4">
      {isWarehouse && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed border-[var(--a-border)] p-4">
          <label className="grid gap-1 text-[11px] font-bold">Хаанаас<select value={fromId ?? defaultFrom ?? ""} onChange={event => setFromId(event.target.value ? Number(event.target.value) : null)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs outline-none"><option value="">Сонгох</option>{choices.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.kind === "warehouse" ? " (агуулах)" : ""}</option>)}</select></label>
          <ArrowRight size={16} className="mb-3 text-[var(--a-muted)]" />
          <label className="grid gap-1 text-[11px] font-bold">Хаашаа<select value={toId ?? ""} onChange={event => setToId(event.target.value ? Number(event.target.value) : null)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs outline-none"><option value="">Сонгох</option>{choices.filter(branch => branch.id !== (fromId ?? defaultFrom)).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <button type="button" onClick={start} disabled={create.isPending} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#df1f3d] px-5 text-xs font-bold text-white disabled:opacity-50">{create.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}Шинэ шилжүүлэг</button>
        </div>
      )}

      {incoming.length > 0 && (
        <div className="rounded-2xl bg-[var(--a-warn-soft)] p-4">
          <p className="flex items-center gap-2 text-xs font-extrabold text-[var(--a-warn)]"><Truck size={15} />Замд яваа, хүлээн авах шилжүүлэг: {incoming.length}</p>
          <div className="mt-2 grid gap-1.5">{incoming.map(row => <button key={row.id} type="button" onClick={() => setOpenId(row.id)} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--a-card)] px-3 py-2 text-left text-[12px] font-bold hover:bg-[var(--a-soft)]"><span>{row.code} · {row.fromBranchName} → {row.toBranchName}</span><span className="text-[var(--a-info)]">Хүлээн авах →</span></button>)}</div>
        </div>
      )}

      {listQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>}
      {!listQuery.isLoading && !rows.length && <p className="rounded-2xl bg-[var(--a-soft)] p-6 text-center text-xs text-[var(--a-muted)]">Шилжүүлэг хараахан алга.</p>}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--a-border)]">
          {rows.map(row => (
            <button key={row.id} type="button" onClick={() => setOpenId(row.id)} className="flex w-full flex-wrap items-center gap-3 border-b border-[var(--a-border)] bg-[var(--a-card)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--a-soft)]">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold">{row.code} · {row.fromBranchName} → {row.toBranchName}</span>
                <span className="block text-[11px] text-[var(--a-muted)]">{new Date(row.createdAt).toLocaleString("mn-MN")}{isWarehouse || row.status !== "sent" ? ` · ${row.lineCount} төрөл · ${row.pieces} ширхэг` : ""}</span>
              </span>
              {row.discrepancyStatus === "open" && <span className="shrink-0 rounded-full bg-[var(--a-neg-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-neg)]">Зөрүүтэй</span>}
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusStyle[row.status]}`}>{statusLabel[row.status]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
