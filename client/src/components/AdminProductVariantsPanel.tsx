import { useState } from "react";
import { LoaderCircle, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// Product variants -- PHASE 1 (additive only). See the long comment on
// productVariants in drizzle/schema.ts: nothing in cart/checkout/orders
// reads this table yet, so creating variants here is safe prep work, not
// yet something a shopper can pick between when buying.
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";
const formatMnt = (amount: number) => new Intl.NumberFormat("mn-MN").format(amount) + "₮";

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
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setForm(emptyForm()); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.sku.trim()) { toast.error("SKU/баркод оруулна уу."); return; }
    const attributes: Record<string, string> = {};
    for (const row of form.attributes) { const key = row.key.trim(); if (key) attributes[key] = row.value.trim(); }
    const payload = {
      productId,
      sku: form.sku.trim(),
      attributes: Object.keys(attributes).length > 0 ? attributes : null,
      priceMnt: Number(form.priceMnt) || 0,
      compareAtPriceMnt: form.compareAtPriceMnt ? Number(form.compareAtPriceMnt) : null,
      stockQuantity: Number(form.stockQuantity) || 0,
      isDefault: form.isDefault,
    };
    try {
      if (form.id) await updateVariant.mutateAsync({ id: form.id, ...payload });
      else await createVariant.mutateAsync(payload);
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
        <div><p className="text-[10px] font-extrabold tracking-[.12em] text-[#3970a7]">ХУВИЛБАРУУД (VARIANTS) — PHASE 1</p><p className="mt-1 text-[11px] text-[#77787d]">Одоогоор зөвхөн бэлтгэл: сагс/захиалга үргэлжлүүлж барааны үндсэн үнэ/үлдэгдлээр л ажиллана, шинэ variant худалдан авагчид харагдахгүй.</p></div>
        {!formOpen && <button type="button" onClick={() => openForm()} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-extrabold text-[#57585e] hover:border-[#3970a7] hover:text-[#3970a7]"><Plus size={12} />Variant нэмэх</button>}
      </div>

      {variantsQuery.isLoading && <p className="mt-3 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={14} />Уншиж байна…</p>}

      {!variantsQuery.isLoading && !formOpen && <div className="mt-3 grid gap-2">
        {variants.map(variant => {
          const attrs = parseAttributes(variant.attributesJson);
          return <div key={variant.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-black/8 bg-white p-3">
            {variant.isDefault && <Star size={13} className="shrink-0 text-[#f0b52d]" fill="#f0b52d" />}
            <div className="min-w-0 flex-1"><strong className="block truncate text-xs">{variant.sku}</strong>{attrs.length > 0 && <span className="mt-0.5 block text-[11px] text-[#77787d]">{attrs.map(a => `${a.key}: ${a.value}`).join(", ")}</span>}</div>
            <span className="shrink-0 text-xs font-bold">{formatMnt(variant.priceMnt)}</span>
            <span className="shrink-0 text-[11px] text-[#77787d]">{variant.stockQuantity} ш</span>
            <button type="button" onClick={() => openForm(variant)} className="shrink-0 text-[11px] font-bold text-[#3970a7] hover:underline">Засах</button>
            <button type="button" onClick={() => { if (window.confirm(`"${variant.sku}" variant-ыг устгах уу?`)) deleteVariant.mutate({ id: variant.id }); }} className="shrink-0 rounded-full p-1.5 text-[#707176] hover:bg-[#fff0f2] hover:text-[#df1f3d]" aria-label={`${variant.sku} устгах`}><Trash2 size={13} /></button>
          </div>;
        })}
        {variants.length === 0 && <p className="py-3 text-center text-xs text-[#9a9ba0]">Variant алга.</p>}
      </div>}

      {formOpen && <form onSubmit={save} className="mt-3 rounded-xl border border-[#3970a7]/25 bg-white p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold">SKU/баркод<input required value={form.sku} onChange={event => setForm(current => ({ ...current, sku: event.target.value }))} className="h-10 rounded-lg border border-black/10 px-2.5 text-xs outline-none focus:border-[#3970a7]" /></label>
          <label className="grid gap-1 text-xs font-bold">Үнэ (₮)<input required min="0" type="number" value={form.priceMnt} onChange={event => setForm(current => ({ ...current, priceMnt: event.target.value }))} className="h-10 rounded-lg border border-black/10 px-2.5 text-xs outline-none focus:border-[#3970a7]" /></label>
          <label className="grid gap-1 text-xs font-bold">Хуучин үнэ (сонголтоор)<input min="0" type="number" value={form.compareAtPriceMnt} onChange={event => setForm(current => ({ ...current, compareAtPriceMnt: event.target.value }))} className="h-10 rounded-lg border border-black/10 px-2.5 text-xs outline-none focus:border-[#3970a7]" /></label>
          <label className="grid gap-1 text-xs font-bold">Үлдэгдэл<input required min="0" type="number" value={form.stockQuantity} onChange={event => setForm(current => ({ ...current, stockQuantity: event.target.value }))} className="h-10 rounded-lg border border-black/10 px-2.5 text-xs outline-none focus:border-[#3970a7]" /></label>
        </div>
        <div className="mt-2 grid gap-1.5">
          <p className="text-[10px] font-extrabold tracking-[.06em] text-[#77787d]">ШИНЖ ЧАНАР (жишээ: Хэмжээ / 400мл)</p>
          {form.attributes.map((row, index) => <div key={index} className="flex gap-2">
            <input value={row.key} onChange={event => setForm(current => ({ ...current, attributes: current.attributes.map((a, i) => i === index ? { ...a, key: event.target.value } : a) }))} placeholder="Түлхүүр (жишээ: Хэмжээ)" className="h-9 w-40 shrink-0 rounded-lg border border-black/10 px-2.5 text-xs outline-none focus:border-[#3970a7]" />
            <input value={row.value} onChange={event => setForm(current => ({ ...current, attributes: current.attributes.map((a, i) => i === index ? { ...a, value: event.target.value } : a) }))} placeholder="Утга (жишээ: 400мл)" className="h-9 flex-1 rounded-lg border border-black/10 px-2.5 text-xs outline-none focus:border-[#3970a7]" />
            <button type="button" onClick={() => setForm(current => ({ ...current, attributes: current.attributes.filter((_, i) => i !== index) }))} className="grid size-9 shrink-0 place-items-center rounded-lg text-[#707176] hover:bg-[#fff0f2] hover:text-[#df1f3d]" aria-label="Мөр хасах"><Trash2 size={13} /></button>
          </div>)}
          <button type="button" onClick={() => setForm(current => ({ ...current, attributes: [...current.attributes, { key: "", value: "" }] }))} className="inline-flex w-fit items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-[10px] font-extrabold text-[#57585e] hover:border-[#3970a7] hover:text-[#3970a7]"><Plus size={11} />Мөр нэмэх</button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={form.isDefault} onChange={event => setForm(current => ({ ...current, isDefault: event.target.checked }))} className="size-4 accent-[#3970a7]" />Үндсэн (default) variant болгох</label>
        <div className="mt-3 flex items-center gap-2">
          <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-full bg-[#3970a7] px-4 py-2 text-[10px] font-extrabold text-white disabled:opacity-60">{isSaving && <LoaderCircle className="animate-spin" size={12} />}{form.id ? "Хадгалах" : "Variant үүсгэх"}</button>
          <button type="button" onClick={closeForm} className="text-[10px] font-extrabold text-[#707176]">Цуцлах</button>
        </div>
      </form>}
    </div>
  );
}
