import { useState } from "react";
import { LoaderCircle, Pencil, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// Manually-entered checkout discount codes ("SALE10") -- distinct from the
// automatic routine-bundle and loyalty-tier discounts, which need no code.
// See discountCodes in drizzle/schema.ts; real, server-side re-validated
// redemption happens in server/db.ts's validateDiscountCode/
// createOrderFromActiveCart, never trusting a client-supplied amount.
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";
const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";

type DiscountCodeRow = {
  id: number;
  code: string;
  type: "percent" | "fixed";
  percentValue: number | null;
  fixedAmountMnt: number | null;
  minSubtotalMnt: number;
  maxUses: number | null;
  usesCount: number;
  isActive: boolean;
  expiresAt: string | Date | null;
};

type DiscountCodeForm = {
  id: number | null;
  code: string;
  type: "percent" | "fixed";
  percentValue: string;
  fixedAmountMnt: string;
  minSubtotalMnt: string;
  maxUses: string;
  isActive: boolean;
  expiresAt: string;
};

const emptyForm = (): DiscountCodeForm => ({ id: null, code: "", type: "percent", percentValue: "10", fixedAmountMnt: "", minSubtotalMnt: "0", maxUses: "", isActive: true, expiresAt: "" });

const toLocalInputValue = (value: string | Date | null) => {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function AdminDiscountCodesPanel() {
  const utils = trpc.useUtils();
  const codesQuery = trpc.admin.discountCodes.useQuery();

  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState<DiscountCodeForm>(emptyForm());

  const createCode = trpc.admin.createDiscountCode.useMutation();
  const updateCode = trpc.admin.updateDiscountCode.useMutation();
  const deleteCode = trpc.admin.deleteDiscountCode.useMutation({
    onSuccess: () => { toast.success("Хямдралын код устгагдлаа."); utils.admin.discountCodes.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const isSaving = createCode.isPending || updateCode.isPending;

  const openComposer = (code?: DiscountCodeRow) => {
    setForm(code ? {
      id: code.id,
      code: code.code,
      type: code.type,
      percentValue: code.percentValue ? String(code.percentValue) : "",
      fixedAmountMnt: code.fixedAmountMnt ? String(code.fixedAmountMnt) : "",
      minSubtotalMnt: String(code.minSubtotalMnt),
      maxUses: code.maxUses ? String(code.maxUses) : "",
      isActive: code.isActive,
      expiresAt: toLocalInputValue(code.expiresAt),
    } : emptyForm());
    setComposerOpen(true);
  };
  const closeComposer = () => { setComposerOpen(false); setForm(emptyForm()); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.code.trim()) { toast.error("Код оруулна уу."); return; }
    const payload = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      percentValue: form.type === "percent" ? Number(form.percentValue) || null : null,
      fixedAmountMnt: form.type === "fixed" ? Number(form.fixedAmountMnt) || null : null,
      minSubtotalMnt: Number(form.minSubtotalMnt) || 0,
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      isActive: form.isActive,
      expiresAt: form.expiresAt ? new Date(form.expiresAt) : null,
    };
    try {
      if (form.id) await updateCode.mutateAsync({ id: form.id, ...payload });
      else await createCode.mutateAsync(payload);
      toast.success(form.id ? "Хямдралын код шинэчлэгдлээ." : "Хямдралын код үүслээ.");
      utils.admin.discountCodes.invalidate();
      closeComposer();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const codes = (codesQuery.data ?? []) as DiscountCodeRow[];

  return (
    <div>
      {!composerOpen && <button type="button" onClick={() => openComposer()} className="inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]"><Tag size={15} /> Шинэ хямдралын код үүсгэх</button>}

      {codesQuery.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}

      {!codesQuery.isLoading && !composerOpen && <div className="mt-5 overflow-x-auto">
        <table className="min-w-[760px] w-full border-separate border-spacing-0 text-left">
          <thead><tr className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">
            <th className="border-b border-black/8 pb-2">КОД</th>
            <th className="border-b border-black/8 pb-2">ХЯМДРАЛ</th>
            <th className="border-b border-black/8 pb-2">МИНИМУМ</th>
            <th className="border-b border-black/8 pb-2">АШИГЛАЛТ</th>
            <th className="border-b border-black/8 pb-2">ТӨЛӨВ</th>
            <th className="border-b border-black/8 pb-2" />
          </tr></thead>
          <tbody>
            {codes.map(code => {
              const expired = code.expiresAt ? new Date(code.expiresAt) < new Date() : false;
              const usedUp = code.maxUses !== null && code.usesCount >= code.maxUses;
              return <tr key={code.id} className="text-sm">
                <td className="border-b border-black/6 py-3"><strong className="block font-mono">{code.code}</strong>{code.expiresAt ? <small className="mt-1 block text-[10px] font-bold tracking-[.06em] text-[#85868a]">{expired ? "Дууссан: " : "Хүчинтэй хүртэл: "}{new Date(code.expiresAt).toLocaleString("mn-MN")}</small> : null}</td>
                <td className="border-b border-black/6 py-3 font-bold">{code.type === "percent" ? `-${code.percentValue}%` : `-${formatMnt(code.fixedAmountMnt ?? 0)}`}</td>
                <td className="border-b border-black/6 py-3 text-xs text-[#6f7075]">{code.minSubtotalMnt > 0 ? `${formatMnt(code.minSubtotalMnt)}-с дээш` : "—"}</td>
                <td className="border-b border-black/6 py-3 text-xs text-[#6f7075]">{code.usesCount}{code.maxUses !== null ? ` / ${code.maxUses}` : ""}</td>
                <td className="border-b border-black/6 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${code.isActive && !expired && !usedUp ? "bg-[#e7f2ec] text-[#2c7650]" : "bg-[#f1f1f2] text-[#75767b]"}`}>{!code.isActive ? "Идэвхгүй" : expired ? "Хугацаа дууссан" : usedUp ? "Дууссан" : "Идэвхтэй"}</span></td>
                <td className="border-b border-black/6 py-3 text-right"><div className="flex justify-end gap-1"><button type="button" onClick={() => openComposer(code)} className="rounded-full p-2 text-[#707176] transition hover:bg-[#f8f5ef] hover:text-[#df1f3d]" aria-label={`${code.code} засах`}><Pencil size={15} /></button><button type="button" onClick={() => { if (window.confirm(`"${code.code}" кодыг бүрмөсөн устгах уу?`)) deleteCode.mutate({ id: code.id }); }} className="rounded-full p-2 text-[#707176] transition hover:bg-[#fff0f2] hover:text-[#df1f3d]" aria-label={`${code.code} устгах`}><Trash2 size={15} /></button></div></td>
              </tr>;
            })}
            {codes.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-[#77787d]">Одоогоор хямдралын код алга. Дээрх товчоор эхнийхээ үүсгээрэй.</td></tr>}
          </tbody>
        </table>
      </div>}

      {composerOpen && <form onSubmit={save} className="mt-2 rounded-3xl border border-[#df1f3d]/25 bg-[#fff5f6] p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">DISCOUNT CODE {form.id ? "EDIT" : "CREATION"}</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{form.id ? "Хямдралын код засах" : "Шинэ хямдралын код үүсгэх"}</h3></div>
          <button type="button" onClick={closeComposer} className="text-xs font-bold text-[#707176]">Хаах</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold">Код<input required value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="SALE10" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-mono font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold">Хямдралын төрөл<select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value as "percent" | "fixed" }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]"><option value="percent">Хувь (%)</option><option value="fixed">Тогтмол дүн (₮)</option></select></label>
          {form.type === "percent"
            ? <label className="grid gap-1.5 text-xs font-bold">Хямдрал (%)<input required type="number" min="1" max="100" value={form.percentValue} onChange={event => setForm(current => ({ ...current, percentValue: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
            : <label className="grid gap-1.5 text-xs font-bold">Хямдрал (₮)<input required type="number" min="1" value={form.fixedAmountMnt} onChange={event => setForm(current => ({ ...current, fixedAmountMnt: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>}
          <label className="grid gap-1.5 text-xs font-bold">Хамгийн бага дэд дүн (₮, заавал биш)<input type="number" min="0" value={form.minSubtotalMnt} onChange={event => setForm(current => ({ ...current, minSubtotalMnt: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold">Хамгийн олон удаагийн ашиглалт (заавал биш)<input type="number" min="1" placeholder="Хязгааргүй" value={form.maxUses} onChange={event => setForm(current => ({ ...current, maxUses: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold">Дуусах огноо (заавал биш)<input type="datetime-local" value={form.expiresAt} onChange={event => setForm(current => ({ ...current, expiresAt: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-bold"><input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-[#df1f3d]" />Идэвхтэй</label>
        </div>

        <button type="submit" disabled={isSaving} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isSaving && <LoaderCircle className="animate-spin" size={15} />}{form.id ? "Өөрчлөлт хадгалах" : "Код үүсгэх"}</button>
      </form>}
    </div>
  );
}
