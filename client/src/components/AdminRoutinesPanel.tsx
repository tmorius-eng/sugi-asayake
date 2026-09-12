import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, LoaderCircle, ListPlus, Pencil, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GenericListView, type GenericListColumn } from "./admin/GenericListView";
import { formatMnt } from "@shared/format";

// PREMIUM-FEATURES.md TIER 4: admin management for "Routine" bundles — an
// ordered list of products (Алхам 1: Цэвэрлэгч -> Алхам 2: Тонер -> ...)
// with an optional bundle discount that's actually enforced at checkout
// (see server/db.ts getApplicableRoutineDiscount), not just a label here.
const slugify = (value: string) => value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

type StepDraft = { productId: number; productName: string; priceMnt: number; stepLabel: string };
type RoutineForm = { id: number | null; name: string; slug: string; description: string; discountPercent: string; isPublished: boolean };

const emptyForm = (): RoutineForm => ({ id: null, name: "", slug: "", description: "", discountPercent: "0", isPublished: false });

export default function AdminRoutinesPanel() {
  const utils = trpc.useUtils();
  const routinesQuery = trpc.admin.routines.useQuery();
  const productsQuery = trpc.admin.products.useQuery();
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState<RoutineForm>(emptyForm());
  // What's actually live right now for the routine being edited -- tracked
  // separately from form.slug/.isPublished (which the admin can edit
  // before saving), same discipline as AdminWorkspace.tsx's
  // liveProductRef -- the "view live" link must never point at a
  // not-yet-saved candidate slug that would just 404.
  const [liveRoutineRef, setLiveRoutineRef] = useState<{ slug: string; isPublished: boolean } | null>(null);
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
      setLiveRoutineRef({ slug: routine.slug, isPublished: routine.isPublished });
      setSteps([]);
    } else {
      setForm(emptyForm());
      setLiveRoutineRef(null);
      setSteps([]);
    }
    setProductSearch("");
    setComposerOpen(true);
  };
  const closeComposer = () => { setComposerOpen(false); setForm(emptyForm()); setLiveRoutineRef(null); setSteps([]); };

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
  type RoutineRow = (typeof routines)[number];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3";
  const routineColumns: GenericListColumn<RoutineRow>[] = [
    { id: "name", header: "NAME", headerClassName: headerCell, cellClassName: bodyCell, render: routine => <><strong className="block">{routine.name}</strong><small className="mt-1 block text-[10px] font-bold tracking-[.06em] text-[var(--a-faint)]">/routine/{routine.slug}</small></> },
    { id: "steps", header: "АЛХАМ", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: routine => `${routine.stepCount} алхам` },
    { id: "discount", header: "ХЯМДРАЛ", headerClassName: headerCell, cellClassName: `${bodyCell} font-bold`, render: routine => routine.discountPercent > 0 ? `-${routine.discountPercent}%` : "—" },
    { id: "status", header: "ТӨЛӨВ", headerClassName: headerCell, cellClassName: bodyCell, render: routine => <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${routine.isPublished ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-warn-soft)] text-[var(--a-warn)]"}`}>{routine.isPublished ? "Нийтлэгдсэн" : "Ноорог"}</span> },
  ];

  return (
    <div>
      {!composerOpen && <button type="button" onClick={() => openComposer()} className="inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]"><Sparkles size={15} /> Шинэ Routine үүсгэх</button>}

      {routinesQuery.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}

      {!routinesQuery.isLoading && !composerOpen && (
        <div className="mt-5">
          <GenericListView<RoutineRow>
            rows={routines}
            getRowId={routine => routine.id}
            columns={routineColumns}
            tableClassName="min-w-[680px] w-full border-separate border-spacing-0 text-left"
            actionsHeaderClassName={headerCell}
            actionsCellClassName={`${bodyCell} text-right`}
            emptyMessage="Одоогоор Routine алга. Дээрх товчоор эхнийхээ үүсгээрэй."
            rowActions={routine => (
              <div className="flex justify-end gap-1">
                {routine.isPublished && <a href={`/routine/${routine.slug}`} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[var(--a-info)]" aria-label={`${routine.name} — амьд хуудсыг харах`} title="Амьд хуудсыг харах"><ExternalLink size={15} /></a>}
                <button type="button" onClick={() => openComposer(routine)} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[#df1f3d]" aria-label={`${routine.name} засах`} title="Засах"><Pencil size={15} /></button>
                <button type="button" onClick={() => { if (window.confirm(`"${routine.name}" routine-ыг бүрмөсөн устгах уу?`)) deleteRoutine.mutate({ id: routine.id }); }} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label={`${routine.name} устгах`} title="Устгах"><Trash2 size={15} /></button>
              </div>
            )}
          />
        </div>
      )}

      {composerOpen && <form onSubmit={save} className="mt-2 rounded-3xl border border-[#df1f3d]/25 bg-[var(--a-neg-soft)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">ROUTINE {form.id ? "EDIT" : "CREATION"}</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{form.id ? "Routine засах" : "Шинэ Routine үүсгэх"}</h3></div>
          <div className="flex items-center gap-4">{liveRoutineRef?.isPublished && <a href={`/routine/${liveRoutineRef.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--a-info)]"><ExternalLink size={13} />Амьд хуудсыг харах</a>}<button type="button" onClick={closeComposer} className="text-xs font-bold text-[var(--a-muted)]">Хаах</button></div>
        </div>

        {form.id && detailQuery.isLoading ? <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Ачааллаж байна…</p> : <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-bold">Нэр<input required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
            <label className="grid gap-1.5 text-xs font-bold">URL slug<input required value={form.slug} onChange={event => setForm(current => ({ ...current, slug: slugify(event.target.value) }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /><span className="mt-0.5 block text-[11px] font-normal text-[var(--a-faint)]">Бодит хаяг: /routine/{form.slug || "…"}</span></label>
            <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Тайлбар<textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className="min-h-20 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
            <label className="grid gap-1.5 text-xs font-bold">Багцын хямдрал (%)<input type="number" min="0" max="100" value={form.discountPercent} onChange={event => setForm(current => ({ ...current, discountPercent: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
            <label className="flex items-center gap-3 rounded-xl bg-[var(--a-card)] px-3 py-3 text-sm font-bold"><input type="checkbox" checked={form.isPublished} onChange={event => setForm(current => ({ ...current, isPublished: event.target.checked }))} className="size-4 accent-[#df1f3d]" />Нийтлэхэд бэлэн</label>
          </div>

          <div className="mt-6 rounded-2xl bg-[var(--a-card)] p-4">
            <p className="flex items-center gap-2 text-xs font-extrabold tracking-[.08em] text-[var(--a-info)]"><ListPlus size={14} /> АЛХАМУУД (STEPS)</p>
            <div className="mt-3 grid gap-2">
              {steps.map((step, index) => <div key={step.productId} className="flex items-center gap-2 rounded-xl border border-[var(--a-border)] p-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--a-btn-dark)] text-[11px] font-bold text-white">{index + 1}</span>
                <div className="min-w-0 flex-1"><strong className="block truncate text-xs">{step.productName}</strong><span className="text-[10px] text-[var(--a-faint)]">{formatMnt(step.priceMnt)}</span></div>
                <input required value={step.stepLabel} onChange={event => setStepLabel(step.productId, event.target.value)} placeholder="Алхмын нэр (жишээ: Цэвэрлэгч)" className="h-9 w-44 shrink-0 rounded-lg border border-[var(--a-border)] px-2.5 text-xs outline-none focus:border-[#df1f3d]" />
                <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--a-muted)] disabled:opacity-25" aria-label="Дээш зөөх"><ArrowUp size={13} /></button>
                <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--a-muted)] disabled:opacity-25" aria-label="Доош зөөх"><ArrowDown size={13} /></button>
                <button type="button" onClick={() => removeStep(step.productId)} className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--a-muted)] hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label="Хасах"><X size={14} /></button>
              </div>)}
              {steps.length === 0 && <p className="py-3 text-center text-xs text-[var(--a-faint)]">Одоогоор алхам алга. Доороос бүтээгдэхүүн хайж нэмнэ үү.</p>}
            </div>

            <div className="relative mt-3">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--a-border)] bg-[var(--a-soft)] px-3"><Search size={15} className="text-[var(--a-faint)]" /><input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Бүтээгдэхүүн хайж алхам нэмэх (нэр эсвэл SKU)" className="w-full bg-transparent text-xs outline-none" /></label>
              {matchingProducts.length > 0 && <div className="absolute z-10 mt-1 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] shadow-lg">{matchingProducts.map(product => <button type="button" key={product.id} onClick={() => addStep(product)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs transition hover:bg-[var(--a-soft)]"><span className="min-w-0 truncate"><strong className="block truncate">{product.name}</strong><span className="text-[10px] text-[var(--a-faint)]">{product.sku}</span></span><span className="shrink-0 font-bold">{formatMnt(product.priceMnt)}</span></button>)}</div>}
            </div>

            {steps.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--a-soft)] px-4 py-3 text-xs">
              <span className="text-[var(--a-muted)]">Дангаараа авбал: <strong className="text-[var(--a-text)]">{formatMnt(originalTotalMnt)}</strong></span>
              {discountPercentValue > 0 && <span className="font-bold text-[var(--a-pos)]">Багцаар авбал: {formatMnt(bundlePriceMnt)} (-{discountPercentValue}%, хэмнэлт {formatMnt(originalTotalMnt - bundlePriceMnt)})</span>}
            </div>}
          </div>

          <button type="submit" disabled={isSaving} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isSaving && <LoaderCircle className="animate-spin" size={15} />}{form.id ? "Өөрчлөлт хадгалах" : "Routine үүсгэх"}</button>
        </>}
      </form>}
    </div>
  );
}
