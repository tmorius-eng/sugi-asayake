import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, LoaderCircle, Lock, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { DEFAULT_HOME_LAYOUT, HOME_SECTIONS, isFreeBlockKey, type FreeBlockProps, type HomeSectionEntry } from "@shared/home-sections";

/**
 * Брэнд студи → Нүүрний бүтэц (A3, 2026-10-05). Hero тогтмол эхэнд (hero shell-ийн дүрэм), бусад
 * хэсгийг дээш/доош, нуух, хувилбар. Сум товчоор (гар болон дэлгэц уншигчид ч ажиллана) — DnD
 * сан нэмээгүй. Ноорог нь баруун талын preview-д шууд харагдана.
 */
const VARIANT_LABELS: Record<string, string> = { default: "Үндсэн", "image-left": "Зураг зүүн талд", "image-right": "Зураг баруун талд", "text-only": "Зөвхөн текст", rail: "Гүйдэг мөр", grid: "Сүлжээ (бүгд нэг дор)" };
const EMPTY_FREE: FreeBlockProps = { heading: "", text: "", ctaLabel: "", ctaHref: "" };

export default function LayoutTab({ saved, draft, onDraft }: {
  saved: HomeSectionEntry[];
  draft: HomeSectionEntry[];
  onDraft: (layout: HomeSectionEntry[] | null) => void;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState<string | null>(null);
  const save = trpc.admin.brandStudio.saveHomeLayout.useMutation({
    onSuccess: async () => { await utils.admin.brandStudio.homeLayout.invalidate(); onDraft(null); toast.success("Нүүрний бүтэц хадгалагдлаа. Сайтад 1 минутын дотор хүрнэ."); },
    onError: error => toast.error(error.message),
  });
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = draft.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onDraft(next);
  };
  const patch = (index: number, change: Partial<HomeSectionEntry>) => onDraft(draft.map((entry, i) => (i === index ? { ...entry, ...change } : entry)));

  return (
    <div className="admin-card flex flex-col gap-3 p-5">
      <div>
        <h3 className="font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">Нүүр хуудасны хэсгүүд</h3>
        <p className="mt-1 text-xs text-[var(--a-muted)]">Дарааллыг сумаар сольж, хэрэггүй хэсгийг нууна. Өөрчлөлт баруун талд шууд харагдана.</p>
      </div>
      <ol className="grid gap-2" aria-live="polite">
        <li className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--a-border-strong)] px-3 py-2.5 text-xs text-[var(--a-muted)]">
          <Lock size={14} className="shrink-0" />
          <span className="min-w-0"><span className="font-bold text-[var(--a-text)]">Нүүр зураг (hero)</span> — үргэлж эхэнд, хуудас хурдан нээгдэхийн тулд</span>
        </li>
        {draft.map((entry, index) => {
          const def = HOME_SECTIONS.find(section => section.key === entry.key)!;
          return (
            <li key={entry.key} className={`flex flex-wrap items-center gap-2 rounded-xl border border-[var(--a-border)] px-3 py-2 ${entry.visible ? "" : "opacity-60"}`}>
              <span className="grid size-7 place-items-center rounded-lg bg-[var(--a-soft)] font-mono text-[11px] font-bold">{index + 1}</span>
              <span className="min-w-0 flex-1 text-xs font-bold">{def.label}</span>
              {def.variants.length > 1 && (
                <select value={entry.variant} onChange={event => patch(index, { variant: event.target.value })} aria-label={`${def.label} — хувилбар`}
                  className="h-8 min-w-0 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-[11px] font-bold">
                  {def.variants.map(variant => <option key={variant} value={variant}>{VARIANT_LABELS[variant] ?? variant}</option>)}
                </select>
              )}
              {isFreeBlockKey(entry.key) && (
                <button type="button" onClick={() => setEditing(current => (current === entry.key ? null : entry.key))} aria-expanded={editing === entry.key} aria-label={`${def.label} — засах`}
                  className="grid size-8 place-items-center rounded-full border border-[var(--a-border)] transition hover:bg-[var(--a-soft)]"><PencilLine size={14} /></button>
              )}
              <button type="button" onClick={() => patch(index, { visible: !entry.visible })} aria-pressed={!entry.visible} aria-label={`${def.label} — ${entry.visible ? "нуух" : "харуулах"}`}
                className="grid size-8 place-items-center rounded-full border border-[var(--a-border)] transition hover:bg-[var(--a-soft)]">
                {entry.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`${def.label} — дээш`} className="grid size-8 place-items-center rounded-full border border-[var(--a-border)] transition hover:bg-[var(--a-soft)] disabled:opacity-30"><ArrowUp size={14} /></button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === draft.length - 1} aria-label={`${def.label} — доош`} className="grid size-8 place-items-center rounded-full border border-[var(--a-border)] transition hover:bg-[var(--a-soft)] disabled:opacity-30"><ArrowDown size={14} /></button>
              {isFreeBlockKey(entry.key) && editing === entry.key && (
                <div className="grid w-full gap-2 rounded-xl bg-[var(--a-soft)] p-3 text-[11px]">
                  {([["heading", "Гарчиг (заавал — хоосон бол харагдахгүй)", 120], ["ctaLabel", "Товчны нэр", 40], ["ctaHref", "Товчны холбоос (/shop, /about, #stores…)", 200]] as const).map(([field, label, max]) => (
                    <label key={field} className="grid gap-1 font-bold">{label}
                      <input value={(entry.props ?? EMPTY_FREE)[field]} maxLength={max} onChange={event => patch(index, { props: { ...(entry.props ?? EMPTY_FREE), [field]: event.target.value } })}
                        className="h-9 min-w-0 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 font-normal" />
                    </label>
                  ))}
                  <label className="grid gap-1 font-bold">Текст
                    <textarea value={(entry.props ?? EMPTY_FREE).text} maxLength={600} rows={3} onChange={event => patch(index, { props: { ...(entry.props ?? EMPTY_FREE), text: event.target.value } })}
                      className="min-w-0 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] p-2 font-normal" />
                  </label>
                  <p className="text-[var(--a-muted)]">Зураг: Content & Media → "Нүүр — чөлөөт зурвас {entry.key.slice(-1)}-ийн зураг". Харуулахын тулд нүдний товчийг асаана.</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--a-border)] pt-3">
        <button type="button" onClick={() => onDraft(DEFAULT_HOME_LAYOUT)} className="mr-auto text-[11px] font-extrabold text-[var(--a-muted)]">Анхны дараалал</button>
        {dirty && <button type="button" onClick={() => onDraft(null)} className="text-[11px] font-extrabold text-[var(--a-muted)]">Цуцлах</button>}
        <button type="button" onClick={() => save.mutate({ sections: draft })} disabled={!dirty || save.isPending}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--a-pos)] px-5 py-2.5 text-[11px] font-extrabold text-[var(--a-invert-text)] transition disabled:opacity-40">
          {save.isPending && <LoaderCircle className="animate-spin" size={13} />}Хадгалах
        </button>
      </div>
    </div>
  );
}
