import { useState, type ChangeEvent } from "react";
import { ArrowDown, ArrowUp, ImageUp, LoaderCircle, MapPin, Pencil, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { GenericListView } from "./admin/GenericListView";

// "Controls everything" admin overhaul (2026-09-08, Phase J): replaces
// client/src/components/home/locations-data.ts's pure hardcoded array with
// a real, admin-managed table -- same composer-form/GenericListView shape
// as AdminBrandsPanel.tsx (this codebase's own established CRUD-list
// precedent). Fixes a real, previously-undiscovered bug as a direct side
// effect: branch 04 existed in that hardcoded array but wasn't in
// checkout's separate, stale 3-branch enum, so it was never actually
// selectable for pickup -- adding/editing a branch here now reaches
// checkout, the storefront locator, and the footer with no deploy.
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";
const slugify = (value: string) => value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

type BranchRow = {
  id: number;
  name: string;
  slug: string;
  address: string;
  phone: string | null;
  mapUrl: string | null;
  photoUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  isFulfillmentDefault: boolean;
  kind: "store" | "warehouse";
  countsTowardOnlineStock: boolean;
  lowStockThreshold: number | null;
};

type BranchForm = { id: number | null; name: string; slug: string; address: string; phone: string; mapUrl: string; photoUrl: string; isActive: boolean; isFulfillmentDefault: boolean; kind: "store" | "warehouse"; countsTowardOnlineStock: boolean; lowStockThreshold: string };
const emptyForm = (): BranchForm => ({ id: null, name: "", slug: "", address: "", phone: "", mapUrl: "", photoUrl: "", isActive: true, isFulfillmentDefault: false, kind: "store", countsTowardOnlineStock: true, lowStockThreshold: "" });

export default function AdminBranchesPanel() {
  const utils = trpc.useUtils();
  // 2026-09-11: the stock-related fields (online fulfilment branch, kind,
  // counts-as-online-stock, low-stock level) are admin-only on the server;
  // marketing still edits addresses, phones and photos.
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const branchesQuery = trpc.admin.branches.useQuery();

  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState<BranchForm>(emptyForm());

  const createBranch = trpc.admin.createBranch.useMutation();
  const updateBranch = trpc.admin.updateBranch.useMutation();
  // Same uploadSiteMediaImage + FileReader pattern as AdminBrandsPanel's
  // photo field -- functionally identical work, no branch-specific upload
  // endpoint needed.
  const uploadImage = trpc.admin.uploadSiteMediaImage.useMutation();
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const deleteBranch = trpc.admin.deleteBranch.useMutation({
    onSuccess: () => { toast.success("Салбар устгагдлаа."); utils.admin.branches.invalidate(); utils.content.branches.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const reorderBranch = trpc.admin.updateBranch.useMutation({
    onSuccess: () => { utils.admin.branches.invalidate(); utils.content.branches.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const isSaving = createBranch.isPending || updateBranch.isPending;

  const branches = ((branchesQuery.data ?? []) as BranchRow[]).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const openComposer = (branch?: BranchRow) => {
    setForm(branch ? { id: branch.id, name: branch.name, slug: branch.slug, address: branch.address, phone: branch.phone ?? "", mapUrl: branch.mapUrl ?? "", photoUrl: branch.photoUrl ?? "", isActive: branch.isActive, isFulfillmentDefault: branch.isFulfillmentDefault, kind: branch.kind, countsTowardOnlineStock: branch.countsTowardOnlineStock, lowStockThreshold: branch.lowStockThreshold === null ? "" : String(branch.lowStockThreshold) } : emptyForm());
    setComposerOpen(true);
  };
  const closeComposer = () => { setComposerOpen(false); setForm(emptyForm()); };

  const move = (branch: BranchRow, direction: -1 | 1) => {
    const index = branches.findIndex(row => row.id === branch.id);
    const swapWith = branches[index + direction];
    if (!swapWith) return;
    reorderBranch.mutate({ id: branch.id, sortOrder: swapWith.sortOrder });
    reorderBranch.mutate({ id: swapWith.id, sortOrder: branch.sortOrder });
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
    if (!form.name.trim() || !form.slug.trim() || !form.address.trim()) { toast.error("Нэр, slug, хаягаа бөглөнө үү."); return; }
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      address: form.address.trim(),
      phone: form.phone.trim() || null,
      mapUrl: form.mapUrl.trim() || null,
      photoUrl: form.photoUrl.trim() || null,
      isActive: form.isActive,
    };
    // Stock fields only when an admin actually changed them -- sending them
    // unchanged would still trip the server's admin-only check for marketing.
    const original = form.id ? branches.find(row => row.id === form.id) : undefined;
    const threshold = form.lowStockThreshold.trim() === "" ? null : Math.max(0, Math.floor(Number(form.lowStockThreshold)));
    const stockFields: { isFulfillmentDefault?: boolean; kind?: "store" | "warehouse"; countsTowardOnlineStock?: boolean; lowStockThreshold?: number | null } = {};
    if (isAdmin) {
      if (!original || original.isFulfillmentDefault !== form.isFulfillmentDefault) stockFields.isFulfillmentDefault = form.isFulfillmentDefault;
      if (!original || original.kind !== form.kind) stockFields.kind = form.kind;
      if (!original || original.countsTowardOnlineStock !== form.countsTowardOnlineStock) stockFields.countsTowardOnlineStock = form.countsTowardOnlineStock;
      if (!original || original.lowStockThreshold !== threshold) stockFields.lowStockThreshold = threshold;
    }
    try {
      if (form.id) await updateBranch.mutateAsync({ id: form.id, ...payload, ...stockFields });
      else await createBranch.mutateAsync({ ...payload, ...stockFields, sortOrder: branches.length });
      toast.success(form.id ? "Салбар шинэчлэгдлээ." : "Салбар нэмэгдлээ.");
      utils.admin.branches.invalidate();
      utils.content.branches.invalidate();
      closeComposer();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return (
    <div>
      {!composerOpen && <button type="button" onClick={() => openComposer()} className="inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]"><MapPin size={15} /> Шинэ салбар нэмэх</button>}

      {branchesQuery.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}

      {!branchesQuery.isLoading && !composerOpen && (
        <div className="mt-5">
          <GenericListView
            rows={branches}
            getRowId={branch => branch.id}
            cardListClassName="grid gap-2"
            emptyMessage={<p className="rounded-2xl bg-[var(--a-soft)] px-4 py-8 text-center text-xs text-[var(--a-muted)]">Одоогоор салбар алга. Дээрх товчоор эхнийхээ нэмээрэй.</p>}
            renderRow={branch => {
              const index = branches.findIndex(row => row.id === branch.id);
              return (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 sm:flex-nowrap">
                  <img src={branch.photoUrl ?? "/product-placeholder.svg"} alt="" className="size-14 shrink-0 rounded-xl bg-[var(--a-soft)] object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <strong className="block truncate text-sm">{branch.name}</strong>
                      {branch.isFulfillmentDefault && <Star size={13} className="shrink-0 fill-[#f0b52d] text-[#f0b52d]" aria-label="Хүргэлтийн үндсэн салбар" />}
                      {branch.kind === "warehouse" && <span className="shrink-0 rounded-full bg-[var(--a-info-soft)] px-2 py-0.5 text-[9px] font-extrabold text-[var(--a-info)]">АГУУЛАХ</span>}
                      {!branch.countsTowardOnlineStock && <span className="shrink-0 rounded-full bg-[var(--a-soft)] px-2 py-0.5 text-[9px] font-extrabold text-[var(--a-muted)]">онлайн нөөцөд ороогүй</span>}
                    </div>
                    <span className="mt-0.5 block truncate text-xs text-[var(--a-muted)]">{branch.address}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${branch.isActive ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-soft)] text-[var(--a-muted)]"}`}>{branch.isActive ? "Идэвхтэй" : "Идэвхгүй"}</span>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" disabled={index === 0} onClick={() => move(branch, -1)} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-30" aria-label="Дээш зөөх"><ArrowUp size={15} /></button>
                    <button type="button" disabled={index === branches.length - 1} onClick={() => move(branch, 1)} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-30" aria-label="Доош зөөх"><ArrowDown size={15} /></button>
                    <button type="button" onClick={() => openComposer(branch)} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[#df1f3d]" aria-label={`${branch.name} засах`}><Pencil size={15} /></button>
                    <button type="button" onClick={() => { if (window.confirm(`"${branch.name}"-г устгах уу?`)) deleteBranch.mutate({ id: branch.id }); }} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label={`${branch.name} устгах`}><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            }}
          />
        </div>
      )}

      {composerOpen && <form onSubmit={save} className="mt-2 rounded-3xl border border-[#df1f3d]/25 bg-[var(--a-neg-soft)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">BRANCH {form.id ? "EDIT" : "CREATION"}</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{form.id ? "Салбар засах" : "Шинэ салбар нэмэх"}</h3></div>
          <button type="button" onClick={closeComposer} className="text-xs font-bold text-[var(--a-muted)]">Хаах</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold">Нэр<input required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold">Дотоод slug<input required value={form.slug} onChange={event => setForm(current => ({ ...current, slug: slugify(event.target.value) }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Хаяг<textarea required value={form.address} onChange={event => setForm(current => ({ ...current, address: event.target.value }))} className="min-h-20 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold">Утас (заавал биш)<input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} placeholder="9450-9911" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold">Google Maps холбоос (заавал биш)<input value={form.mapUrl} onChange={event => setForm(current => ({ ...current, mapUrl: event.target.value }))} placeholder="https://www.google.com/maps/..." className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <div className="grid gap-1.5 text-xs font-bold sm:col-span-2">
            <span>Зураг (заавал биш)</span>
            <div className="flex items-center gap-3">
              <img src={form.photoUrl || "/product-placeholder.svg"} alt="" className="size-14 shrink-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-soft)] object-cover" />
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-4 text-xs font-bold text-[var(--a-text-soft)] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">
                {isUploadingPhoto ? <LoaderCircle className="animate-spin" size={15} /> : <ImageUp size={15} />}
                {isUploadingPhoto ? "Байршуулж байна…" : "Зураг байршуулах"}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoFileSelected} disabled={isUploadingPhoto} className="hidden" />
              </label>
              {form.photoUrl && <button type="button" onClick={() => setForm(current => ({ ...current, photoUrl: "" }))} className="text-xs font-bold text-[var(--a-faint)] transition hover:text-[#df1f3d]">Арилгах</button>}
            </div>
          </div>
          <label className="flex items-center gap-3 rounded-xl bg-[var(--a-card)] px-3 py-3 text-sm font-bold"><input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-[#df1f3d]" />Идэвхтэй (сайт дээр харагдана)</label>
          <fieldset disabled={!isAdmin} className="grid gap-3 rounded-2xl border border-[var(--a-border)] p-3 sm:col-span-2 sm:grid-cols-2 disabled:opacity-60">
            <legend className="px-1 text-[10px] font-extrabold tracking-[.1em] text-[var(--a-info)]">НӨӨЦ {!isAdmin && "· зөвхөн админ өөрчилнө"}</legend>
            <label className="grid gap-1.5 text-xs font-bold">Төрөл<select value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as "store" | "warehouse" }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]"><option value="store">Дэлгүүр (сайт дээр харагдана, очиж авах боломжтой)</option><option value="warehouse">Агуулах (сайт дээр харагдахгүй)</option></select></label>
            <label className="grid gap-1.5 text-xs font-bold">Нөөц бага гэж анхааруулах босго (заавал биш)<input type="number" min="0" value={form.lowStockThreshold} onChange={event => setForm(current => ({ ...current, lowStockThreshold: event.target.value }))} placeholder="Жишээ: 5" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
            <label className="flex items-start gap-3 rounded-xl bg-[var(--a-card)] px-3 py-3 text-sm font-bold"><input type="checkbox" checked={form.isFulfillmentDefault} onChange={event => setForm(current => ({ ...current, isFulfillmentDefault: event.target.checked, countsTowardOnlineStock: event.target.checked ? true : current.countsTowardOnlineStock }))} className="mt-0.5 size-4 accent-[#df1f3d]" /><span>Онлайн захиалгын үндсэн салбар<span className="block text-[11px] font-normal text-[var(--a-muted)]">УБ хүргэлтийн бараа эндээс гарна. Зөвхөн 1 байна.</span></span></label>
            <label className="flex items-start gap-3 rounded-xl bg-[var(--a-card)] px-3 py-3 text-sm font-bold"><input type="checkbox" checked={form.countsTowardOnlineStock} disabled={form.isFulfillmentDefault} onChange={event => setForm(current => ({ ...current, countsTowardOnlineStock: event.target.checked }))} className="mt-0.5 size-4 accent-[#df1f3d]" /><span>Онлайн нөөцөд тооцох<span className="block text-[11px] font-normal text-[var(--a-muted)]">Унтраавал энэ салбарын үлдэгдэл сайт дээрх тоонд орохгүй (дэлгүүрүүд Smart POS-оор зардаг тул).</span></span></label>
          </fieldset>
        </div>

        <button type="submit" disabled={isSaving} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isSaving && <LoaderCircle className="animate-spin" size={15} />}{form.id ? "Өөрчлөлт хадгалах" : "Салбар нэмэх"}</button>
      </form>}
    </div>
  );
}
