import { useState, type ChangeEvent } from "react";
import { ArrowDown, ArrowUp, ImageUp, LoaderCircle, Pencil, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GenericListView } from "./admin/GenericListView";
import { IMAGE_UPLOAD_ACCEPT, MAX_UPLOAD_BYTES, isUploadableImageType, prepareImageUpload, type UploadImageType } from "@/lib/prepareImageUpload";
import UploadTips from "@/components/admin/UploadTips";

import { useConfirm } from "@/components/ConfirmDialog";
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
  logoUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

type BrandForm = { id: number | null; brandName: string; tagline: string; photoUrl: string; logoUrl: string; isActive: boolean };
const emptyForm = (): BrandForm => ({ id: null, brandName: "", tagline: "", photoUrl: "", logoUrl: "", isActive: true });

export default function AdminBrandsPanel() {
  const { confirm } = useConfirm();
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
  // One in-flight field name rather than two booleans: the two uploaders are
  // identical apart from which form field they write, and a single value
  // makes "only the button you clicked shows a spinner" fall out for free.
  const [uploadingField, setUploadingField] = useState<"photoUrl" | "logoUrl" | null>(null);
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
    setForm(brand ? { id: brand.id, brandName: brand.brandName, tagline: brand.tagline ?? "", photoUrl: brand.photoUrl ?? "", logoUrl: brand.logoUrl ?? "", isActive: brand.isActive } : emptyForm());
    setComposerOpen(true);
  };
  const closeComposer = () => { setComposerOpen(false); setForm(emptyForm()); };

  // 2026-09-23: байрлалаар нь ДАХИН ДУГААРЛАНА, зүгээр сольдоггүй. Хоёр мөр
  // ижил `sortOrder`-той байвал (устгалтын дараах шинэ мөр `brands.length`-ийг
  // авдаг тул бодитоор тохиолддог) хуучин солилт нь ижил хоёр тоог буцааж
  // бичдэг — товч дарагдана, юу ч хөдлөхгүй, ямар ч мессеж гарахгүй.
  const move = (brand: BrandRow, direction: -1 | 1) => {
    const index = brands.findIndex(row => row.id === brand.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= brands.length) return;
    const reordered = [...brands];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    reordered.forEach((row, position) => {
      if (row.sortOrder !== position) reorderBrand.mutate({ id: row.id, sortOrder: position });
    });
  };

  const onImageFileSelected = (field: "photoUrl" | "logoUrl") => async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    const prepared = await prepareImageUpload(picked, undefined);
    const file = prepared.file;
    if (!isUploadableImageType(file.type) || file.size > MAX_UPLOAD_BYTES) {
      toast.error("JPG, PNG, WEBP эсвэл GIF зураг сонгоно уу (8 MB хүртэл).");
      event.target.value = "";
      return;
    }
    if (prepared.note) toast.message("Зургийг илгээхээс өмнө жижгэрүүлэв", { description: prepared.note });
    if (prepared.warning) toast.warning(prepared.warning);
    setUploadingField(field);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const stored = await uploadImage.mutateAsync({ fileName: file.name, contentType: file.type as UploadImageType, dataBase64: String(reader.result) });
        setForm(current => ({ ...current, [field]: stored.url }));
        toast.success(field === "logoUrl" ? "Лого байршуулагдлаа." : "Зураг байршуулагдлаа.");
      } catch (error) {
        toast.error(messageFrom(error));
      } finally {
        setUploadingField(null);
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
      logoUrl: form.logoUrl.trim() || null,
      isActive: form.isActive,
    };
    try {
      if (form.id) await updateBrand.mutateAsync({ id: form.id, ...payload });
      // Шинэ мөр нь хамгийн том дугаарын дараа (2026-09-23) — `brands.length`
      // нь дундаас нэг устгасны дараа одоо байгаа мөртэй давхцдаг.
      else await createBrand.mutateAsync({ ...payload, sortOrder: brands.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1 });
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
      {!composerOpen && availableRealBrands.length === 0 && !realBrandsQuery.isLoading && <p className="mt-2 text-[11px] text-[var(--a-faint)]">Бүх бодит брэнд аль хэдийн нэмэгдсэн байна.</p>}

      {brandsQuery.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}

      {!brandsQuery.isLoading && !composerOpen && (
        <div className="mt-5">
          <GenericListView
            rows={brands}
            getRowId={brand => brand.id}
            cardListClassName="grid gap-2"
            emptyMessage={<p className="rounded-2xl bg-[var(--a-soft)] px-4 py-8 text-center text-xs text-[var(--a-muted)]">Одоогоор Топ брэнд алга. Дээрх товчоор эхнийхээ нэмээрэй.</p>}
            renderRow={brand => {
              const index = brands.findIndex(row => row.id === brand.id);
              return (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 sm:flex-nowrap">
                  <img src={brand.photoUrl ?? "/product-placeholder.svg"} alt="" className="size-14 shrink-0 rounded-xl bg-[var(--a-soft)] object-cover" />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{brand.brandName}</strong>
                    {brand.logoUrl
                      ? <span className="mt-0.5 block truncate text-xs text-[var(--a-muted)]">Логотой</span>
                      : <span className="mt-0.5 block truncate text-xs text-[#df1f3d]">Лого дутуу — каруселийн доод зурвас хоосон харагдана</span>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${brand.isActive ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-soft)] text-[var(--a-muted)]"}`}>{brand.isActive ? "Идэвхтэй" : "Идэвхгүй"}</span>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" disabled={index === 0} onClick={() => move(brand, -1)} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-30" aria-label="Дээш зөөх"><ArrowUp size={15} /></button>
                    <button type="button" disabled={index === brands.length - 1} onClick={() => move(brand, 1)} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-30" aria-label="Доош зөөх"><ArrowDown size={15} /></button>
                    <button type="button" onClick={() => openComposer(brand)} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[#df1f3d]" aria-label={`${brand.brandName} засах`}><Pencil size={15} /></button>
                    <button type="button" onClick={async () => { if (await confirm({ title: `"${brand.brandName}"-г Топ брэндийн жагсаалтаас устгах уу?`, danger: true })) deleteBrand.mutate({ id: brand.id }); }} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label={`${brand.brandName} устгах`}><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            }}
          />
        </div>
      )}

      {composerOpen && <form onSubmit={save} className="mt-2 rounded-3xl border border-[#df1f3d]/25 bg-[var(--a-neg-soft)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">FEATURED BRAND {form.id ? "EDIT" : "CREATION"}</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{form.id ? "Топ брэнд засах" : "Шинэ топ брэнд нэмэх"}</h3></div>
          <button type="button" onClick={closeComposer} className="text-xs font-bold text-[var(--a-muted)]">Хаах</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">
            Брэнд (каталогийн бодит брэндээс сонгоно)
            {form.id
              ? <input disabled value={form.brandName} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-soft)] px-3 text-sm font-normal text-[var(--a-muted)] outline-none" />
              : <select required value={form.brandName} onChange={event => setForm(current => ({ ...current, brandName: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]">
                  <option value="">— сонгох —</option>
                  {availableRealBrands.map(row => <option key={row.brand} value={row.brand!}>{row.brand} ({row.count} бараа)</option>)}
                </select>}
          </label>
          <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Тайлбар үг (заавал биш)<input value={form.tagline} onChange={event => setForm(current => ({ ...current, tagline: event.target.value }))} placeholder="Жишээ: Японы тансаг арчилгаа" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <div className="grid gap-1.5 text-xs font-bold sm:col-span-2">
            <span>Дөрвөлжин зураг (заавал биш — хоосон бол энэ брэндийн хамгийн сүүлд нэмэгдсэн бодит бүтээгдэхүүний зургийг автоматаар ашиглана)</span>
            <div className="flex items-center gap-3">
              <img src={form.photoUrl || "/product-placeholder.svg"} alt="" className="size-14 shrink-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-soft)] object-cover" />
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-4 text-xs font-bold text-[var(--a-text-soft)] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">
                {uploadingField === "photoUrl" ? <LoaderCircle className="animate-spin" size={15} /> : <ImageUp size={15} />}
                {uploadingField === "photoUrl" ? "Байршуулж байна…" : "Зураг байршуулах"}
                <input type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={onImageFileSelected("photoUrl")} disabled={uploadingField !== null} className="hidden" />
              </label>
              {form.photoUrl && <button type="button" onClick={() => setForm(current => ({ ...current, photoUrl: "" }))} className="text-xs font-bold text-[var(--a-faint)] transition hover:text-[#df1f3d]">Арилгах</button>}
            </div>
            <UploadTips kind="brandPhoto" />
            <input value={form.photoUrl} onChange={event => setForm(current => ({ ...current, photoUrl: event.target.value }))} placeholder="эсвэл зургийн холбоос шууд бичих" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" />
          </div>

          {/* 2026-09-10: the Featured Brands carousel shows this in its own
              band under the square photo, `object-fit: contain` on the page
              background -- so a transparent PNG reads best. There is
              deliberately NO text fallback: Tom chose logo-images-only, so an
              un-uploaded logo leaves the band empty rather than substituting
              a wordmark the brand never approved. */}
          <div className="grid gap-1.5 text-xs font-bold sm:col-span-2">
            <span>Брэндийн лого (нүүр хуудасны каруселийн доод зурваст харагдана — тунгалаг дэвсгэртэй PNG тохиромжтой)</span>
            <div className="flex items-center gap-3">
              <img src={form.logoUrl || "/product-placeholder.svg"} alt="" className="size-14 shrink-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-soft)] object-contain p-1.5" />
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-4 text-xs font-bold text-[var(--a-text-soft)] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">
                {uploadingField === "logoUrl" ? <LoaderCircle className="animate-spin" size={15} /> : <ImageUp size={15} />}
                {uploadingField === "logoUrl" ? "Байршуулж байна…" : "Лого байршуулах"}
                <input type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={onImageFileSelected("logoUrl")} disabled={uploadingField !== null} className="hidden" />
              </label>
              {form.logoUrl && <button type="button" onClick={() => setForm(current => ({ ...current, logoUrl: "" }))} className="text-xs font-bold text-[var(--a-faint)] transition hover:text-[#df1f3d]">Арилгах</button>}
            </div>
            <UploadTips kind="logo" />
            <input value={form.logoUrl} onChange={event => setForm(current => ({ ...current, logoUrl: event.target.value }))} placeholder="эсвэл логоны холбоос шууд бичих" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" />
            {!form.logoUrl && <span className="text-[11px] font-normal text-[var(--a-faint)]">Лого байхгүй үед доод зурвас хоосон харагдана.</span>}
          </div>
          <label className="flex items-center gap-3 rounded-xl bg-[var(--a-card)] px-3 py-3 text-sm font-bold"><input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-[#df1f3d]" />Идэвхтэй (нүүр хуудсанд харагдана)</label>
        </div>

        <button type="submit" disabled={isSaving} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isSaving && <LoaderCircle className="animate-spin" size={15} />}{form.id ? "Өөрчлөлт хадгалах" : "Брэнд нэмэх"}</button>
      </form>}
    </div>
  );
}
