import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LoaderCircle, ListPlus, Pencil, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// PREMIUM-FEATURES.md TIER 4: admin management for "Routine" bundles — an
// ordered list of products (Алхам 1: Цэвэрлэгч -> Алхам 2: Тонер -> ...)
// with an optional bundle discount that's actually enforced at checkout
// (see server/db.ts getApplicableRoutineDiscount), not just a label here.
const slugify = (value: string) => value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

type StepDraft = { productId: number; productName: string; priceMnt: number; stepLabel: string };
type RoutineForm = { id: number | null; name: string; slug: string; description: string; discountPercent: string; isPublished: boolean };

const emptyForm = (): RoutineForm => ({ id: null, name: "", slug: "", description: "", discountPercent: "0", isPublished: false });

export default function AdminRoutinesPanel() {
  const utils = trpc.useUtils();
  const routinesQuery = trpc.admin.routines.useQuery();
  const productsQuery = trpc.admin.products.useQuery();
  const products = productsQuery.data ?? [];

  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState<RoutineForm>(emptyForm());
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const detailQuery = trpc.admin.routineDetail.useQuery({ id: form.id ?? 0 }, { enabled: composerOpen && form.id !== null });
  useEffect(() => {
    if (detailQuery.data) setSteps(detailQuery.data.steps.map(step => ({ productId: step.productId, productName: step.name, priceMnt: step.priceMnt, stepLabel: step.stepLabel })));
  }, [detailQuery.data]);

  const createRoutine = trpc.admin.createRoutine.useMutation();
  const updateRoutine = trpc.admin.updateRoutine.useMutation();
  const deleteRoutine = trpc.admin.deleteRoutine.useMutation({
    onSuccess: () => { toast.success("Routine устгагдлаа."); utils.admin.routines.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const setStepsMutation = trpc.admin.setRoutineSteps.useMutation();
  const isSaving = createRoutine.isPending || updateRoutine.isPending || setStepsMutation.isPending;

  const openComposer = (routine?: { id: number; name: string; slug: string; description: string | null; discountPercent: number; isPublished: boolean }) => {
    if (routine) {
      setForm({ id: routine.id, name: routine.name, slug: routine.slug, description: routine.description ?? "", discountPercent: String(routine.discountPercent), isPublished: routine.isPublished });
      setSteps([]);
    } else {
      setForm(emptyForm());
      setSteps([]);
    }
    setProductSearch("");
    setComposerOpen(true);
  };
  const closeComposer = () => { setComposerOpen(false); setForm(emptyForm()); setSteps([]); };

  const matchingProducts = useMemo(() => {
    const needle = productSearch.trim().toLocaleLowerCase();
    if (!needle) return [];
    const addedIds = new Set(steps.map(step => step.productId));
    return products.filter(product => !addedIds.has(product.id) && (product.name.toLocaleLowerCase().includes(needle) || product.sku.toLocaleLowerCase().includes(needle))).slice(0, 8);
  }, [products, productSearch, steps]);

  const addStep = (product: { id: number; name: string; priceMnt: number }) => {
    setSteps(current => [...current, { productId: product.id, productName: product.name, priceMnt: product.priceMnt, stepLabel: "" }]);
    setProductSearch("");
  };
  const removeStep = (productId: number) => setSteps(current => current.filter(step => step.productId !== productId));
  const moveStep = (index: number, direction: -1 | 1) => setSteps(current => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const setStepLabel = (productId: number, stepLabel: string) => setSteps(current => current.map(step => step.productId === productId ? { ...step, stepLabel } : step));

  const originalTotalMnt = steps.reduce((sum, step) => sum + step.priceMnt, 0);
  const discountPercentValue = Number(form.discountPercent) || 0;
  const bundlePriceMnt = Math.round(originalTotalMnt * (100 - discountPercentValue) / 100);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (steps.length === 0) { toast.error("Хамгийн багадаа нэг алхам нэмнэ үү."); return; }
    if (steps.some(step => !step.stepLabel.trim())) { toast.error("Алхам бүрт нэр (жишээ нь \"Цэвэрлэгч\") оруулна уу."); return; }

    const payload = { name: form.name.trim(), slug: form.slug.trim(), description: form.description.trim() || null, discountPercent: discountPercentValue, isPublished: form.isPublished };
    try {
      let routineId = form.id;
      if (routineId) {
        await updateRoutine.mutateAsync({ id: routineId, ...payload });
      } else {
        const created = await createRoutine.mutateAsync(payload);
        routineId = created.id;
      }
      await setStepsMutation.mutateAsync({ routineId, steps: steps.map(step => ({ productId: step.productId, stepLabel: step.stepLabel.trim() })) });
      toast.success(form.id ? "Routine шинэчлэгдлээ." : "Routine үүслээ.");
      utils.admin.routines.invalidate();
      closeComposer();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const routines = routinesQuery.data ?? [];

  return (
    <div>
      {!composerOpen && <button type="button" onClick={() => openComposer()} className="inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]"><Sparkles size={15} /> Шинэ Routine үүсгэх</button>}

      {routinesQuery.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}

      {!routinesQuery.isLoading && !composerOpen && <div className="mt-5 overflow-x-auto">
        <table className="min-w-[680px] w-full border-separate border-spacing-0 text-left">
          <thead><tr className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">
            <th className="border-b border-black/8 pb-2">NAME</th>
            <th className="border-b border-black/8 pb-2">АЛХАМ</th>
            <th className="border-b border-black/8 pb-2">ХЯМДРАЛ</th>
            <th className="border-b border-black/8 pb-2">ТӨЛӨВ</th>
            <th className="border-b border-black/8 pb-2" />
          </tr></thead>
          <tbody>
            {routines.map(routine => <tr key={routine.id} className="text-sm">
              <td className="border-b border-black/6 py-3"><strong className="block">{routine.name}</strong><small className="mt-1 block text-[10px] font-bold tracking-[.06em] text-[#85868a]">/routine/{routine.slug}</small></td>
              <td className="border-b border-black/6 py-3 text-xs text-[#6f7075]">{routine.stepCount} алхам</td>
              <td className="border-b border-black/6 py-3 font-bold">{routine.discountPercent > 0 ? `-${routine.discountPercent}%` : "—"}</td>
              <td className="border-b border-black/6 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${routine.isPublished ? "bg-[#e7f2ec] text-[#2c7650]" : "bg-[#fff0d2] text-[#9b6417]"}`}>{routine.isPublished ? "Нийтлэгдсэн" : "Ноорог"}</span></td>
              <td className="border-b border-black/6 py-3 text-right"><div className="flex justify-end gap-1"><button type="button" onClick={() => openComposer(routine)} className="rounded-full p-2 text-[#707176] transition hover:bg-[#f8f5ef] hover:text-[#df1f3d]" aria-label={`${routine.name} засах`}><Pencil size={15} /></button><button type="button" onClick={() => { if (window.confirm(`"${routine.name}" routine-ыг бүрмөсөн устгах уу?`)) deleteRoutine.mutate({ id: routine.id }); }} className="rounded-full p-2 text-[#707176] transition hover:bg-[#fff0f2] hover:text-[#df1f3d]" aria-label={`${routine.name} устгах`}><Trash2 size={15} /></button></div></td>
            </tr>)}
            {routines.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-sm text-[#77787d]">Одоогоор Routine алга. Дээрх товчоор эхнийхээ үүсгээрэй.</td></tr>}
          </tbody>
        </table>
      </div>}

      {composerOpen && <form onSubmit={save} className="mt-2 rounded-3xl border border-[#df1f3d]/25 bg-[#fff5f6] p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">ROUTINE {form.id ? "EDIT" : "CREATION"}</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{form.id ? "Routine засах" : "Шинэ Routine үүсгэх"}</h3></div>
          <button type="button" onClick={closeComposer} className="text-xs font-bold text-[#707176]">Хаах</button>
        </div>

        {form.id && detailQuery.isLoading ? <p className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Ачааллаж байна…</p> : <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-bold">Нэр<input required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
            <label className="grid gap-1.5 text-xs font-bold">URL slug<input required value={form.slug} onChange={event => setForm(current => ({ ...current, slug: slugify(event.target.value) }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
            <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Тайлбар<textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className="min-h-20 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
            <label className="grid gap-1.5 text-xs font-bold">Багцын хямдрал (%)<input type="number" min="0" max="100" value={form.discountPercent} onChange={event => setForm(current => ({ ...current, discountPercent: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
            <label className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-bold"><input type="checkbox" checked={form.isPublished} onChange={event => setForm(current => ({ ...current, isPublished: event.target.checked }))} className="size-4 accent-[#df1f3d]" />Нийтлэхэд бэлэн</label>
          </div>

          <div className="mt-6 rounded-2xl bg-white p-4">
            <p className="flex items-center gap-2 text-xs font-extrabold tracking-[.08em] text-[#3970a7]"><ListPlus size={14} /> АЛХАМУУД (STEPS)</p>
            <div className="mt-3 grid gap-2">
              {steps.map((step, index) => <div key={step.productId} className="flex items-center gap-2 rounded-xl border border-black/8 p-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#17181b] text-[11px] font-bold text-white">{index + 1}</span>
                <div className="min-w-0 flex-1"><strong className="block truncate text-xs">{step.productName}</strong><span className="text-[10px] text-[#9a9ba0]">{formatMnt(step.priceMnt)}</span></div>
                <input required value={step.stepLabel} onChange={event => setStepLabel(step.productId, event.target.value)} placeholder="Алхмын нэр (жишээ: Цэвэрлэгч)" className="h-9 w-44 shrink-0 rounded-lg border border-black/10 px-2.5 text-xs outline-none focus:border-[#df1f3d]" />
                <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="grid size-7 shrink-0 place-items-center rounded-full text-[#707176] disabled:opacity-25" aria-label="Дээш зөөх"><ArrowUp size={13} /></button>
                <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="grid size-7 shrink-0 place-items-center rounded-full text-[#707176] disabled:opacity-25" aria-label="Доош зөөх"><ArrowDown size={13} /></button>
                <button type="button" onClick={() => removeStep(step.productId)} className="grid size-7 shrink-0 place-items-center rounded-full text-[#707176] hover:bg-[#fff0f2] hover:text-[#df1f3d]" aria-label="Хасах"><X size={14} /></button>
              </div>)}
              {steps.length === 0 && <p className="py-3 text-center text-xs text-[#9a9ba0]">Одоогоор алхам алга. Доороос бүтээгдэхүүн хайж нэмнэ үү.</p>}
            </div>

            <div className="relative mt-3">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-black/10 bg-[#f8f5ef] px-3"><Search size={15} className="text-[#85868a]" /><input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Бүтээгдэхүүн хайж алхам нэмэх (нэр эсвэл SKU)" className="w-full bg-transparent text-xs outline-none" /></label>
              {matchingProducts.length > 0 && <div className="absolute z-10 mt-1 w-full rounded-xl border border-black/10 bg-white shadow-lg">{matchingProducts.map(product => <button type="button" key={product.id} onClick={() => addStep(product)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs transition hover:bg-[#f8f5ef]"><span className="min-w-0 truncate"><strong className="block truncate">{product.name}</strong><span className="text-[10px] text-[#9a9ba0]">{product.sku}</span></span><span className="shrink-0 font-bold">{formatMnt(product.priceMnt)}</span></button>)}</div>}
            </div>

            {steps.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8f5ef] px-4 py-3 text-xs">
              <span className="text-[#77787d]">Дангаараа авбал: <strong className="text-[#17181b]">{formatMnt(originalTotalMnt)}</strong></span>
              {discountPercentValue > 0 && <span className="font-bold text-[#2c7650]">Багцаар авбал: {formatMnt(bundlePriceMnt)} (-{discountPercentValue}%, хэмнэлт {formatMnt(originalTotalMnt - bundlePriceMnt)})</span>}
            </div>}
          </div>

          <button type="submit" disabled={isSaving} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isSaving && <LoaderCircle className="animate-spin" size={15} />}{form.id ? "Өөрчлөлт хадгалах" : "Routine үүсгэх"}</button>
        </>}
      </form>}
    </div>
  );
}
