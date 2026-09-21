import { useState } from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

import { useConfirm } from "@/components/ConfirmDialog";
/**
 * Нээлттэй ажлын байрны зар — /admin -> Баримт бичиг (2026-09-14).
 *
 * Тусдаа admin хэсэг болгоогүй шалтгаан: /careers хуудасны БИЧВЭР нь энэ
 * панелийн яг дээр байдаг "careers" баримттай нэг хуудас — зар, бичвэр хоёрыг
 * хоёр өөр цэснээс засварлуулах нь хэрэглэгчийг л төөрүүлнэ. Ижил загварыг
 * Сэтгэгдэл хэсгийн доод хагаст байрлах Асуулт/хариултын панель ашигладаг.
 *
 * Хадгалах бүрд storefront-ийн кэш хаягддаг (server/db.ts) тул /careers дээр
 * шинэ зар шууд гарна.
 */
type Draft = {
  id?: number;
  title: string;
  employmentType: string;
  location: string;
  salaryRange: string;
  description: string;
  applyEmail: string;
  applyUrl: string;
  isPublished: boolean;
  sortOrder: number;
};

const EMPTY: Draft = { title: "", employmentType: "Бүтэн цаг", location: "Улаанбаатар", salaryRange: "", description: "", applyEmail: "", applyUrl: "", isPublished: true, sortOrder: 0 };

const field = "h-10 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm outline-none transition focus:border-[var(--a-info)]";

export default function AdminJobPostingsPanel({ preview = false }: { preview?: boolean }) {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const postingsQuery = trpc.admin.jobPostings.useQuery(undefined, { enabled: !preview });
  const [draft, setDraft] = useState<Draft | null>(null);

  const refresh = async () => {
    await utils.admin.jobPostings.invalidate();
    await utils.content.jobPostings.invalidate();
  };
  const save = trpc.admin.saveJobPosting.useMutation({
    onSuccess: async () => { await refresh(); setDraft(null); toast.success("Ажлын байр хадгалагдлаа."); },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.admin.deleteJobPosting.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Ажлын байр устлаа."); },
    onError: error => toast.error(error.message),
  });

  const submit = () => {
    if (!draft) return;
    if (draft.title.trim().length < 2) { toast.error("Ажлын байрны нэрээ бичнэ үү."); return; }
    save.mutate({
      id: draft.id,
      title: draft.title.trim(),
      employmentType: draft.employmentType.trim(),
      location: draft.location.trim(),
      salaryRange: draft.salaryRange.trim(),
      description: draft.description.trim() || null,
      applyEmail: draft.applyEmail.trim() || null,
      applyUrl: draft.applyUrl.trim() || null,
      isPublished: draft.isPublished,
      sortOrder: draft.sortOrder,
    });
  };

  const postings = postingsQuery.data ?? [];

  return (
    <section className="mt-10 border-t border-[var(--a-border)] pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">Нээлттэй ажлын байр</h2>
          <p className="mt-1 text-xs text-[var(--a-muted)]">/careers хуудсанд харагдана. Зар байхгүй бол тэнд зөвхөн дээрх &ldquo;Ажлын байр&rdquo; бичвэр гарна.</p>
        </div>
        <button type="button" onClick={() => setDraft({ ...EMPTY })} className="inline-flex items-center gap-1.5 rounded-full bg-[#df1f3d] px-4 py-2 text-[12px] font-bold text-white transition hover:bg-[#c81b34]"><Plus size={14} />Ажлын байр нэмэх</button>
      </div>

      {draft && (
        <div className="mt-5 rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Албан тушаал<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="жишээ: Дэлгүүрийн зөвлөх" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-bold">Ажлын төрөл<input value={draft.employmentType} onChange={event => setDraft({ ...draft, employmentType: event.target.value })} placeholder="жишээ: Бүтэн цаг" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-bold">Байршил<input value={draft.location} onChange={event => setDraft({ ...draft, location: event.target.value })} placeholder="жишээ: Улаанбаатар, Орос элчин" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-bold">Цалин (сонголттой)<input value={draft.salaryRange} onChange={event => setDraft({ ...draft, salaryRange: event.target.value })} placeholder="жишээ: 1,500,000₮-с" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-bold">Дараалал<input type="number" min={0} value={draft.sortOrder} onChange={event => setDraft({ ...draft, sortOrder: Number(event.target.value) || 0 })} className={field} /></label>
            <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Тайлбар (сонголттой)<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Үүрэг, шаардлага, ажиллах нөхцөл. Мөр таслалт хэвээр харагдана." className="min-h-28 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 text-sm outline-none transition focus:border-[var(--a-info)]" /></label>
            <label className="grid gap-1.5 text-xs font-bold">Анкет авах имэйл (сонголттой)<input value={draft.applyEmail} onChange={event => setDraft({ ...draft, applyEmail: event.target.value })} placeholder="хоосон бол дэлгүүрийн имэйл" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-bold">Гадаад маягтын холбоос (сонголттой)<input value={draft.applyUrl} onChange={event => setDraft({ ...draft, applyUrl: event.target.value })} placeholder="https://…" className={field} /></label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={draft.isPublished} onChange={event => setDraft({ ...draft, isPublished: event.target.checked })} className="size-4" />Нийтлэх</label>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={submit} disabled={save.isPending} className="inline-flex items-center gap-1.5 rounded-full bg-[#df1f3d] px-5 py-2 text-[12px] font-bold text-white transition hover:bg-[#c81b34] disabled:opacity-50">{save.isPending && <LoaderCircle className="animate-spin" size={13} />}Хадгалах</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-full border border-[var(--a-border)] px-5 py-2 text-[12px] font-bold transition hover:bg-[var(--a-soft)]">Болих</button>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-2">
        {postingsQuery.isLoading && <p className="text-xs text-[var(--a-muted)]">Уншиж байна…</p>}
        {!postingsQuery.isLoading && postings.length === 0 && <p className="text-xs text-[var(--a-muted)]">Одоогоор зар байхгүй.</p>}
        {postings.map(posting => (
          <div key={posting.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{posting.title}</p>
              <p className="mt-0.5 text-[11px] text-[var(--a-muted)]">{[posting.employmentType, posting.salaryRange, posting.location].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${posting.isPublished ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-soft)] text-[var(--a-muted)]"}`}>{posting.isPublished ? "Нийтлэгдсэн" : "Ноорог"}</span>
              <button type="button" onClick={() => setDraft({ id: posting.id, title: posting.title, employmentType: posting.employmentType, location: posting.location, salaryRange: posting.salaryRange, description: posting.description ?? "", applyEmail: posting.applyEmail ?? "", applyUrl: posting.applyUrl ?? "", isPublished: posting.isPublished, sortOrder: posting.sortOrder })} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[#df1f3d]" aria-label={`${posting.title} засах`} title="Засах"><Pencil size={15} /></button>
              <button type="button" disabled={remove.isPending} onClick={async () => { if (await confirm({ title: `"${posting.title}" зарыг устгах уу?`, danger: true })) remove.mutate({ id: posting.id }); }} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label={`${posting.title} устгах`} title="Устгах"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
