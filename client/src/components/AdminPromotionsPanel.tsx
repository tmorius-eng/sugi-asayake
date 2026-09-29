import { useState } from "react";
import { LoaderCircle, Megaphone, Pencil, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GenericListView, type GenericListColumn } from "./admin/GenericListView";
import { PROMO_SHAPE, IMAGE_UPLOAD_ACCEPT, MAX_UPLOAD_BYTES, isUploadableImageType, prepareImageUpload, type UploadImageType } from "@/lib/prepareImageUpload";
import UploadTips from "@/components/admin/UploadTips";

import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminPriceCampaignCard from "./admin/AdminPriceCampaignCard";
// Admin-controlled site-wide marketing popup/banner (new-arrival announcement,
// seasonal sale, store event). Whatever is entered here is exactly what
// shoppers see, in exactly the scheduled window -- no auto-generated urgency
// copy, no fabricated countdowns. See sitePromotions in drizzle/schema.ts and
// client/src/components/SitePromo.tsx for the customer-facing render.
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

type PromotionRow = {
  id: number;
  isActive: boolean;
  displayMode: "popup" | "banner";
  headline: string;
  message: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string | Date | null;
  endsAt: string | Date | null;
};

type PromotionForm = {
  id: number | null;
  isActive: boolean;
  displayMode: "popup" | "banner";
  headline: string;
  message: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string;
  endsAt: string;
};

const emptyForm = (): PromotionForm => ({ id: null, isActive: false, displayMode: "popup", headline: "", message: "", imageUrl: "", ctaLabel: "", ctaUrl: "", startsAt: "", endsAt: "" });

// <input type="datetime-local"> wants/gives "YYYY-MM-DDTHH:mm" in local time.
const toLocalInputValue = (value: string | Date | null) => {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function AdminPromotionsPanel() {
  const { confirm } = useConfirm();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const promotionsQuery = trpc.admin.promotions.useQuery();
  const uploadImage = trpc.admin.uploadProductImage.useMutation();

  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState<PromotionForm>(emptyForm());

  const createPromotion = trpc.admin.createPromotion.useMutation();
  const updatePromotion = trpc.admin.updatePromotion.useMutation();
  const deletePromotion = trpc.admin.deletePromotion.useMutation({
    onSuccess: () => { toast.success("Урамшуулал устгагдлаа."); utils.admin.promotions.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const isSaving = createPromotion.isPending || updatePromotion.isPending;

  const openComposer = (promotion?: PromotionRow) => {
    setForm(promotion ? {
      id: promotion.id,
      isActive: promotion.isActive,
      displayMode: promotion.displayMode,
      headline: promotion.headline,
      message: promotion.message ?? "",
      imageUrl: promotion.imageUrl ?? "",
      ctaLabel: promotion.ctaLabel ?? "",
      ctaUrl: promotion.ctaUrl ?? "",
      startsAt: toLocalInputValue(promotion.startsAt),
      endsAt: toLocalInputValue(promotion.endsAt),
    } : emptyForm());
    setComposerOpen(true);
  };
  const closeComposer = () => { setComposerOpen(false); setForm(emptyForm()); };

  const onImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    const prepared = await prepareImageUpload(picked, PROMO_SHAPE);
    const file = prepared.file;
    if (!isUploadableImageType(file.type) || file.size > MAX_UPLOAD_BYTES) {
      toast.error("JPG, PNG, WEBP эсвэл GIF зураг сонгоно уу (8 MB хүртэл).");
      event.target.value = "";
      return;
    }
    if (prepared.note) toast.message("Зургийг илгээхээс өмнө жижгэрүүлэв", { description: prepared.note });
    if (prepared.warning) toast.warning(prepared.warning);
    const inputEl = event.target;
    const reader = new FileReader();
    // 2026-09-27 (F-promo): no reader.onerror at all (a read failure just
    // hung silently), and the input's value was never reset after a
    // successful upload -- re-picking the exact same file did not fire
    // onChange, so a retry after fixing the image elsewhere looked like
    // nothing happened.
    reader.onerror = () => { toast.error("Зургийг уншиж чадсангүй. Дахин оролдоно уу."); inputEl.value = ""; };
    reader.onload = async () => {
      try {
        const stored = await uploadImage.mutateAsync({ fileName: file.name, contentType: file.type as UploadImageType, dataBase64: String(reader.result) });
        setForm(current => ({ ...current, imageUrl: stored.url }));
        toast.success("Зураг хадгалагдлаа.");
      } catch (error) {
        toast.error(messageFrom(error));
      } finally {
        inputEl.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.headline.trim()) { toast.error("Гарчиг оруулна уу."); return; }
    const payload = {
      isActive: form.isActive,
      displayMode: form.displayMode,
      headline: form.headline.trim(),
      message: form.message.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      ctaLabel: form.ctaLabel.trim() || null,
      ctaUrl: form.ctaUrl.trim() || null,
      startsAt: form.startsAt ? new Date(form.startsAt) : null,
      endsAt: form.endsAt ? new Date(form.endsAt) : null,
    };
    try {
      if (form.id) await updatePromotion.mutateAsync({ id: form.id, ...payload });
      else await createPromotion.mutateAsync(payload);
      toast.success(form.id ? "Урамшуулал шинэчлэгдлээ." : "Урамшуулал үүслээ.");
      utils.admin.promotions.invalidate();
      closeComposer();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const toggleActive = async (promotion: PromotionRow) => {
    try {
      await updatePromotion.mutateAsync({ id: promotion.id, isActive: !promotion.isActive });
      utils.admin.promotions.invalidate();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const promotions = (promotionsQuery.data ?? []) as PromotionRow[];
  const headerCell = "border-b border-[var(--a-border)] pb-2";
  const bodyCell = "border-b border-[var(--a-border)] py-3";
  const promotionColumns: GenericListColumn<PromotionRow>[] = [
    { id: "headline", header: "ГАРЧИГ", headerClassName: headerCell, cellClassName: bodyCell, render: promotion => <><strong className="block max-w-[220px] truncate">{promotion.headline}</strong>{promotion.message && <small className="mt-1 block max-w-[220px] truncate text-[11px] text-[var(--a-faint)]">{promotion.message}</small>}</> },
    { id: "type", header: "ТӨРӨЛ", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`, render: promotion => promotion.displayMode === "popup" ? "Попап" : "Хэсэг (banner)" },
    {
      id: "window", header: "ХУГАЦАА", headerClassName: headerCell, cellClassName: `${bodyCell} text-xs text-[var(--a-muted)]`,
      render: promotion => promotion.startsAt || promotion.endsAt
        ? <>{promotion.startsAt ? new Date(promotion.startsAt).toLocaleDateString("mn-MN") : "—"} → {promotion.endsAt ? new Date(promotion.endsAt).toLocaleDateString("mn-MN") : "—"}</>
        : <span className="text-[var(--a-faint)]">Хугацаагүй</span>,
    },
    {
      id: "active", header: "ИДЭВХТЭЙ", headerClassName: headerCell, cellClassName: bodyCell,
      render: promotion => <button type="button" onClick={() => toggleActive(promotion)} className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold transition ${promotion.isActive ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-soft)] text-[var(--a-muted)]"}`}>{promotion.isActive ? "Идэвхтэй" : "Идэвхгүй"}</button>,
    },
  ];

  return (
    <div>
      {user?.role === "admin" && <AdminPriceCampaignCard />}

      {!composerOpen && <button type="button" onClick={() => openComposer()} className="inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]"><Megaphone size={15} /> Шинэ урамшуулал үүсгэх</button>}

      {promotionsQuery.isLoading && <p className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}

      {!promotionsQuery.isLoading && !composerOpen && (
        <div className="mt-5">
          <GenericListView<PromotionRow>
            rows={promotions}
            getRowId={promotion => promotion.id}
            columns={promotionColumns}
            tableClassName="min-w-[720px] w-full border-separate border-spacing-0 text-left"
            actionsHeaderClassName={headerCell}
            actionsCellClassName={`${bodyCell} text-right`}
            emptyMessage="Одоогоор урамшуулал алга. Дээрх товчоор эхнийхээ үүсгээрэй."
            rowActions={promotion => (
              <div className="flex justify-end gap-1">
                <button type="button" onClick={() => openComposer(promotion)} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[#df1f3d]" aria-label={`${promotion.headline} засах`}><Pencil size={15} /></button>
                <button type="button" onClick={async () => { if (await confirm({ title: `"${promotion.headline}" урамшууллыг бүрмөсөн устгах уу?`, danger: true })) deletePromotion.mutate({ id: promotion.id }); }} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label={`${promotion.headline} устгах`}><Trash2 size={15} /></button>
              </div>
            )}
          />
        </div>
      )}

      {composerOpen && <form onSubmit={save} className="mt-2 rounded-3xl border border-[#df1f3d]/25 bg-[var(--a-neg-soft)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">PROMOTION {form.id ? "EDIT" : "CREATION"}</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{form.id ? "Урамшуулал засах" : "Шинэ урамшуулал үүсгэх"}</h3></div>
          <button type="button" onClick={closeComposer} className="text-xs font-bold text-[var(--a-muted)]">Хаах</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Гарчиг<input required value={form.headline} onChange={event => setForm(current => ({ ...current, headline: event.target.value }))} placeholder="Жишээ: Шинэ бүтээгдэхүүн ирлээ!" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Дэлгэрэнгүй мессеж<textarea value={form.message} onChange={event => setForm(current => ({ ...current, message: event.target.value }))} className="min-h-16 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold">Харагдах хэлбэр<select value={form.displayMode} onChange={event => setForm(current => ({ ...current, displayMode: event.target.value as "popup" | "banner" }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]"><option value="popup">Попап (том, зураг+дундаа гарна)</option><option value="banner">Хэсэг (нимгэн, дээд талд байнга харагдана)</option></select></label>
          <label className="flex items-center gap-3 rounded-xl bg-[var(--a-card)] px-3 py-3 text-sm font-bold"><input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-[#df1f3d]" />Одоо идэвхжүүлэх</label>
          <label className="grid gap-1.5 text-xs font-bold">Товчны бичвэр<input value={form.ctaLabel} onChange={event => setForm(current => ({ ...current, ctaLabel: event.target.value }))} placeholder="Жишээ: Дэлгүүр рүү очих" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold">Товчны холбоос<input value={form.ctaUrl} onChange={event => setForm(current => ({ ...current, ctaUrl: event.target.value }))} placeholder="/shop" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold">Эхлэх огноо (заавал биш)<input type="datetime-local" value={form.startsAt} onChange={event => setForm(current => ({ ...current, startsAt: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
          <label className="grid gap-1.5 text-xs font-bold">Дуусах огноо (заавал биш)<input type="datetime-local" value={form.endsAt} onChange={event => setForm(current => ({ ...current, endsAt: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
        </div>

        {form.displayMode === "popup" && <div className="mt-4 rounded-2xl bg-[var(--a-card)] p-4">
          <p className="text-xs font-extrabold tracking-[.08em] text-[var(--a-info)]">ЗУРАГ (заавал биш, попапад л ашиглагдана)</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {form.imageUrl && <img src={form.imageUrl} alt="" className="h-16 w-28 rounded-lg object-cover" />}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--a-border)] px-4 py-2.5 text-xs font-bold text-[var(--a-text)] transition hover:bg-black/5">
              <UploadCloud size={14} />{uploadImage.isPending ? "Байршуулж байна…" : "Зураг сонгох"}
              <input type="file" accept={IMAGE_UPLOAD_ACCEPT} className="hidden" onChange={onImageSelected} disabled={uploadImage.isPending} />
            </label>
            {form.imageUrl && <button type="button" onClick={() => setForm(current => ({ ...current, imageUrl: "" }))} className="text-xs font-bold text-[#df1f3d]">Зураг хасах</button>}
          </div>
          <UploadTips kind="promo" className="mt-3" />
        </div>}

        <button type="submit" disabled={isSaving} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isSaving && <LoaderCircle className="animate-spin" size={15} />}{form.id ? "Өөрчлөлт хадгалах" : "Урамшуулал үүсгэх"}</button>
      </form>}
    </div>
  );
}
