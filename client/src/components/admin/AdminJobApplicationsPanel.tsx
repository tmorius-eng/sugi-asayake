import { useState } from "react";
import { FileText, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

import { useConfirm } from "@/components/ConfirmDialog";
/**
 * Ирсэн анкетууд — /admin → Баримт бичиг (2026-09-14, зөвхөн admin эрх).
 *
 * /careers-аас ирсэн анкет бүр: хэн, утас, имэйл, аль ажлын байрт, хэзээ,
 * CV файл, төлөв, тэмдэглэл. CV нь олон нийтийн /cdn/ URL биш — товч дарахад
 * сервер нэг цагийн гарын үсэгтэй URL өгч шинэ цонхонд нээнэ.
 *
 * Хувийн мэдээлэл тул marketing/staff биш зөвхөн admin харна; сонголт
 * дууссаны дараа устгах нь careers баримтад амласан амлалт.
 */
type Status = "new" | "reviewed" | "contacted" | "rejected";
const STATUS_LABEL: Record<Status, string> = { new: "Шинэ", reviewed: "Харсан", contacted: "Холбогдсон", rejected: "Татгалзсан" };
const STATUS_STYLE: Record<Status, string> = {
  new: "bg-[var(--a-info-soft,#e6f0fa)] text-[var(--a-info)]",
  reviewed: "bg-[var(--a-soft)] text-[var(--a-muted)]",
  contacted: "bg-[var(--a-pos-soft)] text-[var(--a-pos)]",
  rejected: "bg-[var(--a-neg-soft)] text-[#df1f3d]",
};

const formatWhen = (value: string | Date) => new Date(value).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function AdminJobApplicationsPanel({ preview = false }: { preview?: boolean }) {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const query = trpc.admin.jobApplications.useQuery(undefined, { enabled: !preview });
  const [filter, setFilter] = useState<Status | "all">("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [cvLoadingId, setCvLoadingId] = useState<number | null>(null);

  const update = trpc.admin.updateJobApplication.useMutation({
    onSuccess: async () => { await utils.admin.jobApplications.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.admin.deleteJobApplication.useMutation({
    onSuccess: async () => { await utils.admin.jobApplications.invalidate(); toast.success("Анкет устлаа."); },
    onError: error => toast.error(error.message),
  });

  const openCv = async (id: number) => {
    setCvLoadingId(id);
    try {
      const { url } = await utils.admin.jobApplicationCvUrl.fetch({ id });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CV нээж чадсангүй.");
    } finally {
      setCvLoadingId(null);
    }
  };

  const rows = (query.data ?? []).filter(row => filter === "all" || row.status === filter);
  const newCount = (query.data ?? []).filter(row => row.status === "new").length;

  return (
    <section className="mt-10 border-t border-[var(--a-border)] pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">Ирсэн анкетууд{newCount > 0 && <span className="ml-2 rounded-full bg-[#df1f3d] px-2 py-0.5 align-middle text-[11px] font-bold text-white">{newCount} шинэ</span>}</h2>
          <p className="mt-1 text-xs text-[var(--a-muted)]">/careers-аас илгээсэн анкет, CV. Сонголт дууссаны дараа устгана.</p>
        </div>
        <div className="inline-flex rounded-full border border-[var(--a-border)] bg-[var(--a-card)] p-1">
          {(["all", "new", "reviewed", "contacted", "rejected"] as const).map(key => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${filter === key ? "bg-[var(--a-ink)] text-[var(--a-card)]" : "text-[var(--a-muted)] hover:bg-[var(--a-soft)]"}`}>{key === "all" ? "Бүгд" : STATUS_LABEL[key]}</button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {query.isLoading && <p className="text-xs text-[var(--a-muted)]">Уншиж байна…</p>}
        {!query.isLoading && rows.length === 0 && <p className="text-xs text-[var(--a-muted)]">{filter === "all" ? "Одоогоор анкет ирээгүй байна." : "Энэ төлөвтэй анкет алга."}</p>}
        {rows.map(row => {
          const isOpen = openId === row.id;
          return (
            <div key={row.id} className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => { setOpenId(isOpen ? null : row.id); setNoteDraft(row.adminNote ?? ""); }} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-bold">{row.fullName} <span className="font-normal text-[var(--a-muted)]">— {row.positionTitle}</span></p>
                  <p className="mt-0.5 text-[11px] text-[var(--a-muted)]">{formatWhen(row.createdAt)} · {row.phone}{row.email ? ` · ${row.email}` : ""}{row.cvFileName ? ` · ${row.cvFileName}` : " · CV-гүй"}</p>
                </button>
                <div className="flex items-center gap-2">
                  <select value={row.status} onChange={event => update.mutate({ id: row.id, status: event.target.value as Status })} className={`h-8 rounded-full border-0 px-3 text-[11px] font-bold outline-none ${STATUS_STYLE[row.status]}`} aria-label="Төлөв">
                    {(Object.keys(STATUS_LABEL) as Status[]).map(key => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
                  </select>
                  {row.cvKey && (
                    <button type="button" disabled={cvLoadingId === row.id} onClick={() => openCv(row.id)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[11px] font-bold transition hover:bg-[var(--a-soft)] disabled:opacity-50">{cvLoadingId === row.id ? <LoaderCircle className="animate-spin" size={13} /> : <FileText size={13} />}CV</button>
                  )}
                  <button type="button" disabled={remove.isPending} onClick={async () => { if (await confirm({ title: `${row.fullName} — анкетыг устгах уу? CV файл хамт устгагдана.`, danger: true })) remove.mutate({ id: row.id }); }} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label={`${row.fullName} устгах`} title="Устгах"><Trash2 size={15} /></button>
                </div>
              </div>
              {isOpen && (
                <div className="mt-3 grid gap-3 border-t border-[var(--a-border)] pt-3 text-sm">
                  <div className="grid gap-1 text-xs">
                    <p><span className="text-[var(--a-muted)]">Утас:</span> <a href={`tel:${row.phone.replace(/\D/g, "")}`} className="font-bold text-[var(--a-info)] hover:underline">{row.phone}</a></p>
                    {row.email && <p><span className="text-[var(--a-muted)]">Имэйл:</span> <a href={`mailto:${row.email}`} className="font-bold text-[var(--a-info)] hover:underline">{row.email}</a></p>}
                    {row.cvFileName && <p><span className="text-[var(--a-muted)]">CV:</span> {row.cvFileName}{row.cvSizeBytes ? ` (${Math.ceil(row.cvSizeBytes / 1024)} KB)` : ""}</p>}
                  </div>
                  {row.message ? <p className="whitespace-pre-line rounded-xl bg-[var(--a-soft)] p-3 text-xs leading-5">{row.message}</p> : <p className="text-xs text-[var(--a-muted)]">Захидал бичээгүй.</p>}
                  <label className="grid gap-1.5 text-xs font-bold">Тэмдэглэл (зөвхөн админд)
                    <textarea value={noteDraft} onChange={event => setNoteDraft(event.target.value)} className="min-h-20 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 text-sm font-normal outline-none transition focus:border-[var(--a-info)]" />
                  </label>
                  <div>
                    <button type="button" disabled={update.isPending} onClick={() => update.mutate({ id: row.id, adminNote: noteDraft.trim() || null })} className="rounded-full bg-[var(--a-ink)] px-4 py-2 text-[11px] font-bold text-[var(--a-card)] transition hover:opacity-90 disabled:opacity-50">Тэмдэглэл хадгалах</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
