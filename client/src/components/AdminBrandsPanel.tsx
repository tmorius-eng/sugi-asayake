import { useState, type ChangeEvent } from "react";
import { ArrowDown, ArrowUp, ImageUp, LoaderCircle, Pencil, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GenericListView } from "./admin/GenericListView";

// NEWVISION.md §5 "Топ брэндүүд" -- Tom's explicit correction to the
// original plan, which had omitted a Brands admin section entirely. Same
// staffProcedure weight, same composer-form shape, as
// AdminDiscountCodesPanel.tsx.
//
// brandName is deliberately a <select> built from getDistinctRealBrands
// (real products.brand values + how many published products carry them),
// never a free-text field -- a featured-brand tile can never point at zero
// real products this way. photoUrl is optional: getFeaturedBrands already
// falls back to the brand's most recently added real product photo when
// this is left blank, so most brands need no photo management here at all.
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

type BrandRow = {
  id: number;
  brandName: string;
  tagline: string | null;
  photoUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

type BrandForm = { id: number | null; brandName: string; tagline: string; photoUrl: string; isActive: boolean };
const emptyForm = (): BrandForm => ({ id: null, brandName: "", tagline: "", photoUrl: "", isActive: true });

export default function AdminBrandsPanel() {
  const utils = trpc.useUtils();
  const brandsQuery = trpc.admin.featuredBrands.useQuery();
  const realBrandsQuery = trpc.admin.distinctRealBrands.useQuery();

  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState<BrandForm>(emptyForm());

  const createBrand = trpc.admin.createFeaturedBrand.useMutation();
  const updateBrand = trpc.admin.updateFeaturedBrand.useMutation();
  // Tom, 2026-09-05 ("add upload img section"): this form only ever had a
  // raw text input for photoUrl (placeholder literally showed the old
  // "/manus-storage/..." shape as an example -- confusing, since an admin
  // has no R2 key to type in by hand). Reuses the exact same
  // uploadSiteMediaImage endpoint + FileReader pattern ContentMediaPanel.tsx
  // already uses for the homepage's other image slots -- same size/type
  // validation, same WebP-variant pipeline -- rather than inventing a
  // brand-specific upload endpoint for what is functionally identical work.
  const uploadImage = trpc.admin.uploadSiteMediaImage.useMutation();
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const deleteBrand = trpc.admin.deleteFeaturedBrand.useMutation({
    onSuccess: () => { toast.success("Брэнд устгагдлаа."); utils.admin.featuredBrands.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const reorderBrand = trpc.admin.updateFeaturedBrand.useMutation({
    onSuccess: () => utils.admin.featuredBrands.invalidate(),
    onError: error => toast.error(messageFrom(error)),
  });
  const isSaving = createBrand.isPending || updateBrand.isPending;

  const brands = ((brandsQuery.data ?? []) as BrandRow[]).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const realBrands = realBrandsQuery.data ?? [];
  // A brand already featured shouldn't also show up as a fresh option --
  // the admin edits the existing tile instead of accidentally creating a
  // second one for the same brand.
  const featuredNames = new Set(brands.map(brand => brand.brandName));
  const availableRealBrands = realBrands.filter(row => row.brand && !featuredNames.has(row.brand));

  const openComposer = (brand?: BrandRow) => {
    setForm(brand ? { id: brand.id, brandName: brand.brandName, tagline: brand.tagline ?? "", photoUrl: brand.photoUrl ?? "", isActive: brand.isActive } : emptyForm());
    setComposerOpen(true);
  };
  const closeComposer = () => { setComposerOpen(false); setForm(emptyForm()); };

  const move = (brand: BrandRow, direction: -1 | 1) => {
    const index = brands.findIndex(row => row.id === brand.id);
    const swapWith = brands[index + direction];
    if (!swapWith) return;
    reorderBrand.mutate({ id: brand.id, sortOrder: swapWith.sortOrder });
    reorderBrand.mutate({ id: swapWith.id, sortOrder: brand.sortOrder });
  };

  const onPhotoFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      toast.error("JPG, PNG, WEBP форматтай, 8 MB-аас бага зураг сонгоно уу.");
      event.target.value = "";
      return;
    }
    setIsUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const stored = await uploadImage.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: String(reader.result) });
        setForm(current => ({ ...current, photoUrl: stored.url }));
        toast.success("Зураг байршуулагдлаа.");
      } catch (error) {
        toast.error(messageFrom(error));
      } finally {
        setIsUploadingPhoto(false);
        event.target.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.brandName.trim()) { toast.error("Брэнд сонгоно уу."); return; }
    const payload = {
      brandName: form.brandName.trim(),
      tagline: form.tagline.trim() || null,
      photoUrl: form.photoUrl.trim() || null,
      isActive: form.isActive,
    };
    try {
      if (form.id) await updateBrand.mutateAsync({ id: form.id, ...payload });
      else await createBrand.mutateAsync({ ...payload, sortOrder: brands.length });
      toast.success(form.id ? "Брэнд шинэчлэгдлээ." : "Брэнд нэмэгдлээ.");
      utils.admin.featuredBrands.invalidate();
      closeComposer();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return (
    <div>
      {!composerOpen && <button type="button" onClick={() => openComposer()} disabled={availableRealBrands.length === 0} className="inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50"><Tags size={15} /> Топ брэнд нэмэх</button>}
      {!composerOpen && availableRealBrands.length === 0 && !realBrandsQuery.isLoading && <p className="mt-2 text-[11px] text-[#8b8c90]">Бүх бодит брэнд аль хэдийн нэмэгдсэн байна.</p>}

      {brandsQuery.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}

      {!brandsQuery.isLoading && !composerOpen && (
        <div className="mt-5">
          <GenericListView
            rows={brands}
            getRowId={brand => brand.id}
            cardListClassName="grid gap-2"
            emptyMessage={<p className="rounded-2xl bg-[#f8f5ef] px-4 py-8 text-center text-xs text-[#77787d]">Одоогоор Топ брэнд алга. Дээрх товчоор эхнийхээ нэмээрэй.</p>}
            renderRow={brand => {
              const index = brands.findIndex(row => row.id === brand.id);
              return (
                <div className="flex items-center gap-3 rounded-2xl border border-black/8 bg-white p-3">
                  <img src={brand.photoUrl ?? "/product-placeholder.svg"} alt="" className="size-14 shrink-0 rounded-xl bg-[#f8f5ef] object-cover" />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{brand.brandName}</strong>
                    {brand.tagline ? <span className="mt-0.5 block truncate text-xs text-[#77787d]">{brand.tagline}</span> : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${brand.isActive ? "bg-[#e7f2ec] text-[#2c7650]" : "bg-[#f1f1f2] text-[#75767b]"}`}>{brand.isActive ? "Идэвхтэй" : "Идэвхгүй"}</span>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" disabled={index === 0} onClick={() => move(brand, -1)} className="rounded-full p-2 text-[#707176] transition hover:bg-[#f8f5ef] hover:text-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-30" aria-label="Дээш зөөх"><ArrowUp size={15} /></button>
                    <button type="button" disabled={index === brands.length - 1} onClick={() => move(brand, 1)} className="rounded-full p-2 text-[#707176] transition hover:bg-[#f8f5ef] hover:text-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-30" aria-label="Доош зөөх"><ArrowDown size={15} /></button>
                    <button type="button" onClick={() => openComposer(brand)} className="rounded-full p-2 text-[#707176] transition hover:bg-[#f8f5ef] hover:text-[#df1f3d]" aria-label={`${brand.brandName} засах`}><Pencil size={15} /></button>
                    <button type="button" onClick={() => { if (window.confirm(`"${brand.brandName}"-г Топ брэндийн жагсаалтаас устгах уу?`)) deleteBrand.mutate({ id: brand.id }); }} className="rounded-full p-2 text-[#707176] transition hover:bg-[#fff0f2] hover:text-[#df1f3d]" aria-label={`${brand.brandName} устгах`}><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            }}
          />
        </div>
      )}

      {composerOpen && <form onSubmit={save} className="mt-2 rounded-3xl border border-[#df1f3d]/25 bg-[#fff5f6] p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">FEATURED BRAND {form.id ? "EDIT" : "CREATION"}</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{form.id ? "Топ брэнд засах" : "Шинэ топ брэнд нэмэх"}</h3></div>
          <button type="button" onClick={closeComposer} className="text-xs font-bold text-[#707176]">Хаах</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">
            Брэнд (каталогийн бодит брэндээс сонгоно)
            {form.id
              ? <input disabled value={form.brandName} className="h-11 rounded-xl border border-black/10 bg-[#f1f1f2] px-3 text-sm font-normal text-[#77787d] outline-none" />
              : <select required value={form.brandName} onChange={event => setForm(current => ({ ...current, brandName: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]">
                  <option value="">— сонгох —</option>
                  {availableRealBrands.map(row => <option key={row.brand} value={row.brand!}>{row.brand} ({row.count} бараа)</option>)}
                </select>}
          </label>
          <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Тайлбар үг (заавал биш)<input value={form.tagline} onChange={event => setForm(current => ({ ...current, tagline: event.target.value }))} placeholder="Жишээ: Японы тансаг арчилгаа" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <div className="grid gap-1.5 text-xs font-bold sm:col-span-2">
            <span>Зураг (заавал биш — хоосон бол энэ брэндийн хамгийн сүүлд нэмэгдсэн бодит бүтээгдэхүүний зургийг автоматаар ашиглана)</span>
            <div className="flex items-center gap-3">
              <img src={form.photoUrl || "/product-placeholder.svg"} alt="" className="size-14 shrink-0 rounded-xl border border-black/10 bg-[#f8f5ef] object-cover" />
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-xs font-bold text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">
                {isUploadingPhoto ? <LoaderCircle className="animate-spin" size={15} /> : <ImageUp size={15} />}
                {isUploadingPhoto ? "Байршуулж байна…" : "Зураг байршуулах"}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoFileSelected} disabled={isUploadingPhoto} className="hidden" />
              </label>
              {form.photoUrl && <button type="button" onClick={() => setForm(current => ({ ...current, photoUrl: "" }))} className="text-xs font-bold text-[#8b8c90] transition hover:text-[#df1f3d]">Арилгах</button>}
            </div>
            <input value={form.photoUrl} onChange={event => setForm(current => ({ ...current, photoUrl: event.target.value }))} placeholder="эсвэл зургийн холбоос шууд бичих" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" />
          </div>
          <label className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-bold"><input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-[#df1f3d]" />Идэвхтэй (нүүр хуудсанд харагдана)</label>
        </div>

        <button type="submit" disabled={isSaving} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isSaving && <LoaderCircle className="animate-spin" size={15} />}{form.id ? "Өөрчлөлт хадгалах" : "Брэнд нэмэх"}</button>
      </form>}
    </div>
  );
}
