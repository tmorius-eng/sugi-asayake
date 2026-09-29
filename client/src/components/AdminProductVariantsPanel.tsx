import { useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import AdminBranchStockEditor from "./AdminBranchStockEditor";

import { useConfirm } from "@/components/ConfirmDialog";
// Product variants -- shoppers pick between these at checkout once a
// product has more than one (see the long comment on productVariants in
// drizzle/schema.ts). The "Үлдэгдэл" field below is now sugar over
// per-branch stock (Phase L, 2026-09-08): it always means "set stock at
// the fulfillment-default branch" -- expand "Салбараар" on a row to edit a
// SPECIFIC branch's shelf via AdminBranchStockEditor instead.
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

type VariantRow = {
  id: number;
  sku: string;
  attributesJson: string | null;
  priceMnt: number;
  compareAtPriceMnt: number | null;
  stockQuantity: number;
  isDefault: boolean;
};

type AttributeRow = { key: string; value: string };
type VariantForm = { id: number | null; sku: string; priceMnt: string; compareAtPriceMnt: string; stockQuantity: string; isDefault: boolean; attributes: AttributeRow[] };

const emptyForm = (): VariantForm => ({ id: null, sku: "", priceMnt: "", compareAtPriceMnt: "", stockQuantity: "", isDefault: false, attributes: [{ key: "", value: "" }] });

function parseAttributes(json: string | null): AttributeRow[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Record<string, string>;
    return Object.entries(parsed).map(([key, value]) => ({ key, value }));
  } catch { return []; }
}

export default function AdminProductVariantsPanel({ productId }: { productId: number }) {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const variantsQuery = trpc.admin.productVariants.useQuery({ productId });
  const createVariant = trpc.admin.createProductVariant.useMutation();
  const updateVariant = trpc.admin.updateProductVariant.useMutation();
  const deleteVariant = trpc.admin.deleteProductVariant.useMutation({
    onSuccess: () => { toast.success("Variant устгагдлаа."); utils.admin.productVariants.invalidate({ productId }); },
    onError: error => toast.error(messageFrom(error)),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<VariantForm>(emptyForm());
  // 2026-09-27 (D4): what stockQuantity looked like when the form opened, to
  // tell "the admin actually edited this" from "seeded from the aggregate,
  // never touched" -- mirrors AdminWorkspace's product-form
  // openedStockQuantity. variant.stockQuantity here is the fulfilment-branch
  // absolute already (not a cross-branch sum, unlike the product row), but
  // an unchanged field must still not resend the same value and risk racing
  // a per-branch edit made via AdminBranchStockEditor in the meantime.
  const [openedStockQuantity, setOpenedStockQuantity] = useState<string | null>(null);
  const [expandedBranchStockId, setExpandedBranchStockId] = useState<number | null>(null);
  const isSaving = createVariant.isPending || updateVariant.isPending;

  const openForm = (variant?: VariantRow) => {
    setForm(variant ? {
      id: variant.id,
      sku: variant.sku,
      priceMnt: String(variant.priceMnt),
      compareAtPriceMnt: variant.compareAtPriceMnt ? String(variant.compareAtPriceMnt) : "",
      stockQuantity: String(variant.stockQuantity),
      isDefault: variant.isDefault,
      attributes: parseAttributes(variant.attributesJson).length ? parseAttributes(variant.attributesJson) : [{ key: "", value: "" }],
    } : emptyForm());
    setOpenedStockQuantity(variant ? String(variant.stockQuantity) : null);
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setForm(emptyForm()); setOpenedStockQuantity(null); };

  /**
   * ⚠️ 2026-09-16 (E2E-ийн явцад олдсон бодит алдаа): энэ хэсэг нь барааны
   * маягтын ДОТОР render хийгддэг (AdminWorkspace.tsx-ийн бүтээгдэхүүний
   * <form>). Өмнө нь өөрөө ч бас <form> байсан — HTML-д <form> дотор <form>
   * байж БОЛОХГҮЙ бөгөөд хөтөч дотоод маягтын `submit` товчийг ГАДААД маягтад
   * харьяалуулсан тул "Variant үүсгэх" дарахад variant үүсэхийн оронд БАРААНЫ
   * маягт илгээгдэж, editor хаагддаг байв. Өөрөөр хэлбэл admin-аас хоёр дахь
   * variant нэмэх нь ХЭЗЭЭ Ч ажилладаггүй байсан (автомат тестүүд tRPC
   * procedure-ийг шууд дууддаг тул үүнийг хардаггүй).
   *
   * Одоо энэ нь маягт биш <div>, товч нь `type="button"` — гаднах маягт
   * хөндөгдөхгүй.
   */
  const save = async () => {
    if (!form.sku.trim()) { toast.error("SKU/баркод оруулна уу."); return; }
    // 2026-09-27 (D4): this editor is a <div>, not a <form> (see the comment
    // above), so the inputs' `required`/`min="0"` attributes are inert --
    // nothing browser-side ever stopped an empty or negative value reaching
    // `Number(...) || 0`, which itself silently turned "" and NaN into a
    // valid-looking 0.
    if (form.priceMnt.trim() === "") { toast.error("Үнийг бөглөнө үү."); return; }
    const priceMnt = Number(form.priceMnt);
    // 2026-09-27: `< 0` -- сервер (variantWriteSchema) болон барааны маягт
    // (productWriteSchema) хоёулаа 0₮-ийг зөвшөөрдөг (үнэгүй дээж, промо
    // мэт) атал энд `<= 0` тул 0-ийг татгалздаг байв.
    if (!Number.isInteger(priceMnt) || priceMnt < 0) { toast.error("Үнэ бүхэл, сөрөг бус тоо байх ёстой."); return; }
    if (form.stockQuantity.trim() === "") { toast.error("Үлдэгдлийг бөглөнө үү."); return; }
    const stockQuantity = Number(form.stockQuantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) { toast.error("Үлдэгдэл сөрөг бус бүхэл тоо байх ёстой."); return; }
    let compareAtPriceMnt: number | null = null;
    if (form.compareAtPriceMnt.trim() !== "") {
      compareAtPriceMnt = Number(form.compareAtPriceMnt);
      if (!Number.isInteger(compareAtPriceMnt) || compareAtPriceMnt < 0) { toast.error("Хуучин үнэ сөрөг бус бүхэл тоо байх ёстой."); return; }
    }
    const attributes: Record<string, string> = {};
    for (const row of form.attributes) { const key = row.key.trim(); if (key) attributes[key] = row.value.trim(); }
    const payload = {
      productId,
      sku: form.sku.trim(),
      attributes: Object.keys(attributes).length > 0 ? attributes : null,
      priceMnt,
      compareAtPriceMnt,
      stockQuantity,
      isDefault: form.isDefault,
    };
    try {
      if (form.id) {
        // Only resend stockQuantity when it actually changed in this form --
        // otherwise every plain price/SKU edit re-applied the seeded value
        // as the fulfilment branch's ABSOLUTE stock, clobbering whatever
        // AdminBranchStockEditor had set for that branch in the meantime.
        const { stockQuantity: _stock, ...rest } = payload;
        const updatePayload = form.stockQuantity === openedStockQuantity ? rest : payload;
        await updateVariant.mutateAsync({ id: form.id, ...updatePayload });
      } else {
        await createVariant.mutateAsync(payload);
      }
      toast.success(form.id ? "Variant шинэчлэгдлээ." : "Variant үүслээ.");
      utils.admin.productVariants.invalidate({ productId });
      closeForm();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const variants = (variantsQuery.data ?? []) as VariantRow[];

  return (
    <div className="sm:col-span-2 rounded-2xl bg-white/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-[10px] font-extrabold tracking-[.12em] text-[var(--a-info)]">ХУВИЛБАРУУД (VARIANTS)</p><p className="mt-1 text-[11px] text-[var(--a-muted)]">2+ variant-тай бол худалдан авагч бүтээгдэхүүний хуудсан дээр сонголт хийж, тухайн variant-ийн үнэ/үлдэгдлээр захиална.</p></div>
        {!formOpen && <button type="button" onClick={() => openForm()} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-2 text-[10px] font-extrabold text-[var(--a-text-soft)] hover:border-[#3970a7] hover:text-[var(--a-info)]"><Plus size={12} />Variant нэмэх</button>}
      </div>

      {variantsQuery.isLoading && <p className="mt-3 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>}

      {!variantsQuery.isLoading && !formOpen && <div className="mt-3 grid gap-2">
        {variants.map(variant => {
          const attrs = parseAttributes(variant.attributesJson);
          const isExpanded = expandedBranchStockId === variant.id;
          return <div key={variant.id} className="rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-3">
            <div className="flex flex-wrap items-center gap-3">
              {variant.isDefault && <Star size={13} className="shrink-0 text-[#f0b52d]" fill="#f0b52d" />}
              <div className="min-w-0 flex-1"><strong className="block truncate text-xs">{variant.sku}</strong>{attrs.length > 0 && <span className="mt-0.5 block text-[11px] text-[var(--a-muted)]">{attrs.map(a => `${a.key}: ${a.value}`).join(", ")}</span>}</div>
              <span className="shrink-0 text-xs font-bold">{formatMnt(variant.priceMnt)}</span>
              <span className="shrink-0 text-[11px] text-[var(--a-muted)]">{variant.stockQuantity} ш</span>
              <button type="button" onClick={() => setExpandedBranchStockId(isExpanded ? null : variant.id)} className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-[var(--a-text-soft)] hover:text-[var(--a-info)]">
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Салбараар
              </button>
              <button type="button" onClick={() => openForm(variant)} className="shrink-0 text-[11px] font-bold text-[var(--a-info)] hover:underline">Засах</button>
              <button type="button" onClick={async () => { if (await confirm({ title: `"${variant.sku}" variant-ыг устгах уу?`, danger: true })) deleteVariant.mutate({ id: variant.id }); }} className="shrink-0 rounded-full p-1.5 text-[var(--a-muted)] hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label={`${variant.sku} устгах`}><Trash2 size={13} /></button>
            </div>
            {isExpanded && <AdminBranchStockEditor variantId={variant.id} />}
          </div>;
        })}
        {variants.length === 0 && <p className="py-3 text-center text-xs text-[var(--a-faint)]">Variant алга.</p>}
      </div>}

      {/* 2026-09-23: Enter дарахад ГАДААД барааны маягт илгээгдэхгүй.
          2026-09-16-нд үүрлэсэн <form>-ыг арилгасан ч эдгээр талбар нь
          `submit` товчтой барааны <form>-ын ДОТОР л байдаг тул HTML-ийн
          "implicit submission" хэвээр үйлчилж, SKU бичээд Enter дарахад
          variant үүсэхийн оронд БАРААНЫ маягт хадгалагдаж, editor хаагдаж,
          бөглөж эхэлсэн variant алга болдог байв. */}
      {formOpen && <div
        className="mt-3 rounded-xl border border-[#3970a7]/25 bg-[var(--a-card)] p-3"
        onKeyDown={event => {
          if (event.key !== "Enter") return;
          const target = event.target as HTMLElement;
          if (target.tagName !== "INPUT") return;
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold">SKU/баркод<input required value={form.sku} onChange={event => setForm(current => ({ ...current, sku: event.target.value }))} className="h-10 rounded-lg border border-[var(--a-border)] px-2.5 text-xs outline-none focus:border-[#3970a7]" /></label>
          <label className="grid gap-1 text-xs font-bold">Үнэ (₮)<input required min="0" type="number" value={form.priceMnt} onChange={event => setForm(current => ({ ...current, priceMnt: event.target.value }))} className="h-10 rounded-lg border border-[var(--a-border)] px-2.5 text-xs outline-none focus:border-[#3970a7]" /></label>
          <label className="grid gap-1 text-xs font-bold">Хуучин үнэ (сонголтоор)<input min="0" type="number" value={form.compareAtPriceMnt} onChange={event => setForm(current => ({ ...current, compareAtPriceMnt: event.target.value }))} className="h-10 rounded-lg border border-[var(--a-border)] px-2.5 text-xs outline-none focus:border-[#3970a7]" /></label>
          <label className="grid gap-1 text-xs font-bold">Үлдэгдэл (үндсэн салбарт)<input required min="0" type="number" value={form.stockQuantity} onChange={event => setForm(current => ({ ...current, stockQuantity: event.target.value }))} className="h-10 rounded-lg border border-[var(--a-border)] px-2.5 text-xs outline-none focus:border-[#3970a7]" /></label>
        </div>
        <div className="mt-2 grid gap-1.5">
          <p className="text-[10px] font-extrabold tracking-[.06em] text-[var(--a-muted)]">ШИНЖ ЧАНАР (жишээ: Хэмжээ / 400мл)</p>
          {form.attributes.map((row, index) => <div key={index} className="flex gap-2">
            <input value={row.key} onChange={event => setForm(current => ({ ...current, attributes: current.attributes.map((a, i) => i === index ? { ...a, key: event.target.value } : a) }))} placeholder="Түлхүүр (жишээ: Хэмжээ)" className="h-9 w-40 shrink-0 rounded-lg border border-[var(--a-border)] px-2.5 text-xs outline-none focus:border-[#3970a7]" />
            <input value={row.value} onChange={event => setForm(current => ({ ...current, attributes: current.attributes.map((a, i) => i === index ? { ...a, value: event.target.value } : a) }))} placeholder="Утга (жишээ: 400мл)" className="h-9 flex-1 rounded-lg border border-[var(--a-border)] px-2.5 text-xs outline-none focus:border-[#3970a7]" />
            <button type="button" onClick={() => setForm(current => ({ ...current, attributes: current.attributes.filter((_, i) => i !== index) }))} className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--a-muted)] hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label="Мөр хасах"><Trash2 size={13} /></button>
          </div>)}
          <button type="button" onClick={() => setForm(current => ({ ...current, attributes: [...current.attributes, { key: "", value: "" }] }))} className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[10px] font-extrabold text-[var(--a-text-soft)] hover:border-[#3970a7] hover:text-[var(--a-info)]"><Plus size={11} />Мөр нэмэх</button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={form.isDefault} onChange={event => setForm(current => ({ ...current, isDefault: event.target.checked }))} className="size-4 accent-[#3970a7]" />Үндсэн (default) variant болгох</label>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-full bg-[#3970a7] px-4 py-2 text-[10px] font-extrabold text-white disabled:opacity-60">{isSaving && <LoaderCircle className="animate-spin" size={12} />}{form.id ? "Хадгалах" : "Variant үүсгэх"}</button>
          <button type="button" onClick={closeForm} className="text-[10px] font-extrabold text-[var(--a-muted)]">Цуцлах</button>
        </div>
      </div>}
    </div>
  );
}
