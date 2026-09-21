import { useMemo, useState } from "react";
import { LoaderCircle, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";

import { useConfirm } from "@/components/ConfirmDialog";
/**
 * Admin → Хайлт (2026-09-20, хайлт v3). Tom: "бүгдийг data driven, admin
 * хэсгээс editable болго". Гурван таб:
 *   1. Статистик — юу хайгдаж, юу олдохгүй байгааг (search_queries). 0 үр
 *      дүнтэй мөр бүр "+ синоним" товчтой → 2-р таб руу бэлэн prefill.
 *   2. Синонимын толь — search_synonyms CRUD. Хадгалмагц индекс дахин
 *      баригдах тул "Туршиж үзэх" талбар шинэ үр дүнг шууд харуулна.
 *   3. Брэндийн alias — brand_aliases CRUD; canonical нь бодит брэндээс
 *      сонгогдоно (AdminBrandsPanel-тай ижил зарчим: хоосон руу заахгүй).
 */
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

type Tab = "insights" | "synonyms" | "aliases";
type SynonymDraft = { id: number | null; concept: string; terms: string; isActive: boolean };
const emptySynonym = (): SynonymDraft => ({ id: null, concept: "", terms: "", isActive: true });

const inputClass = "h-10 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm outline-none focus:border-[#df1f3d]";
const buttonClass = "inline-flex h-10 items-center gap-2 rounded-full bg-[var(--a-btn-dark)] px-4 text-xs font-bold text-white transition hover:bg-[#df1f3d] disabled:opacity-60";

export default function AdminSearchPanel() {
  const [tab, setTab] = useState<Tab>("insights");
  const [synonymDraft, setSynonymDraft] = useState<SynonymDraft>(emptySynonym());

  const openSynonymFor = (term: string) => {
    setSynonymDraft({ id: null, concept: "", terms: `${term}, `, isActive: true });
    setTab("synonyms");
  };

  return <section className="mt-7">
    <div className="flex flex-wrap gap-2">
      {([["insights", "Статистик"], ["synonyms", "Синонимын толь"], ["aliases", "Брэндийн alias"]] as Array<[Tab, string]>).map(([key, label]) =>
        <button type="button" key={key} onClick={() => setTab(key)} className={`h-9 rounded-full px-4 text-xs font-bold transition ${tab === key ? "bg-[var(--a-btn-dark)] text-white" : "bg-[var(--a-soft)] text-[var(--a-muted)] hover:text-[var(--a-ink)]"}`}>{label}</button>)}
    </div>
    {tab === "insights" && <InsightsTab onAddSynonym={openSynonymFor} />}
    {tab === "synonyms" && <SynonymsTab draft={synonymDraft} setDraft={setSynonymDraft} />}
    {tab === "aliases" && <AliasesTab />}
  </section>;
}

function InsightsTab({ onAddSynonym }: { onAddSynonym: (term: string) => void }) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const insights = trpc.admin.searchInsights.useQuery({ days });
  const data = insights.data;
  const zeroRate = data && data.totals.searches ? Math.round((data.totals.zeroResult / data.totals.searches) * 100) : 0;
  return <div className="mt-5 grid gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs leading-5 text-[var(--a-muted)]">Худалдан авагчид юу хайж, юу олдохгүй байгаа вэ. Олдохгүй байгаа үгийг "+ синоним"-оор толинд нэмбэл дараагийн хайлтаас л олддог болно.</p>
      <div className="flex gap-1">{([7, 30, 90] as const).map(value => <button type="button" key={value} onClick={() => setDays(value)} className={`h-8 rounded-full px-3 text-[11px] font-bold ${days === value ? "bg-[var(--a-btn-dark)] text-white" : "bg-[var(--a-soft)] text-[var(--a-muted)]"}`}>{value} хоног</button>)}</div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[["Нийт хайлт", data?.totals.searches ?? 0], ["Олдоогүй хайлт", `${data?.totals.zeroResult ?? 0} (${zeroRate}%)`], ["Хайсан зочин", data?.totals.visitors ?? 0]].map(([label, value]) =>
        <div key={String(label)} className="rounded-2xl bg-[var(--a-soft)] p-4"><p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">{label}</p><p className="mt-1 font-[var(--font-display)] text-2xl font-semibold">{insights.isLoading ? "…" : value}</p></div>)}
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl bg-[var(--a-soft)] p-4">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">ОЛДООГҮЙ ХАЙЛТУУД</p>
        {data?.zeroResultQueries.length ? <table className="mt-3 w-full text-xs"><thead><tr className="text-left text-[10px] uppercase tracking-wider text-[var(--a-muted)]"><th className="pb-2">Хайлт</th><th className="pb-2 text-right">Тоо</th><th className="pb-2 text-right">Сүүлд</th><th className="pb-2" /></tr></thead><tbody>
          {data.zeroResultQueries.map(row => <tr key={row.normalised} className="border-t border-[var(--a-border)]"><td className="py-2 font-bold">{row.normalised}</td><td className="py-2 text-right">{row.count}</td><td className="py-2 text-right text-[var(--a-muted)]">{new Date(row.lastSeenAt).toLocaleDateString("mn-MN")}</td><td className="py-2 text-right"><button type="button" onClick={() => onAddSynonym(row.normalised)} className="inline-flex items-center gap-1 rounded-full bg-[var(--a-card)] px-2.5 py-1 text-[11px] font-bold text-[var(--a-info)]"><Plus size={12} />синоним</button></td></tr>)}
        </tbody></table> : <p className="mt-3 text-xs text-[var(--a-muted)]">{insights.isLoading ? "Ачаалж байна…" : "Энэ хугацаанд олдоогүй хайлт байхгүй."}</p>}
      </div>
      <div className="rounded-3xl bg-[var(--a-soft)] p-4">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">ХАМГИЙН ИХ ХАЙГДСАН</p>
        {data?.topQueries.length ? <table className="mt-3 w-full text-xs"><thead><tr className="text-left text-[10px] uppercase tracking-wider text-[var(--a-muted)]"><th className="pb-2">Хайлт</th><th className="pb-2 text-right">Тоо</th><th className="pb-2 text-right">Дундаж үр дүн</th></tr></thead><tbody>
          {data.topQueries.map(row => <tr key={row.normalised} className="border-t border-[var(--a-border)]"><td className="py-2 font-bold">{row.normalised}</td><td className="py-2 text-right">{row.count}</td><td className="py-2 text-right text-[var(--a-muted)]">{Math.round(row.avgResults)}</td></tr>)}
        </tbody></table> : <p className="mt-3 text-xs text-[var(--a-muted)]">{insights.isLoading ? "Ачаалж байна…" : "Хайлтын бүртгэл хараахан алга."}</p>}
      </div>
    </div>
  </div>;
}

function SynonymsTab({ draft, setDraft }: { draft: SynonymDraft; setDraft: (draft: SynonymDraft) => void }) {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const synonyms = trpc.admin.searchSynonyms.useQuery();
  const [filter, setFilter] = useState("");
  const [probe, setProbe] = useState("");
  const probeQuery = trpc.catalog.suggest.useQuery({ query: probe.trim() }, { enabled: probe.trim().length >= 2 });
  const upsert = trpc.admin.upsertSearchSynonym.useMutation({
    onSuccess: () => { toast.success("Синоним хадгалагдлаа — хайлтын индекс дахин баригдана."); utils.admin.searchSynonyms.invalidate(); utils.catalog.suggest.invalidate(); setDraft(emptySynonym()); },
    onError: error => toast.error(messageFrom(error)),
  });
  const remove = trpc.admin.deleteSearchSynonym.useMutation({
    onSuccess: () => { toast.success("Устгагдлаа."); utils.admin.searchSynonyms.invalidate(); utils.catalog.suggest.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (synonyms.data ?? []).filter(row => !needle || row.concept.includes(needle) || row.terms.toLowerCase().includes(needle));
  }, [synonyms.data, filter]);

  return <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
    <div className="rounded-3xl bg-[var(--a-soft)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">ОЙЛГОЛТУУД ({synonyms.data?.length ?? 0})</p>
        <label className="flex h-9 items-center gap-2 rounded-full bg-[var(--a-card)] px-3"><Search size={13} className="text-[var(--a-faint)]" /><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Толиноос хайх" className="w-40 bg-transparent text-xs outline-none" /></label>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--a-muted)]">Мөр бүр нэг ойлголт: тэр ойлголтыг илэрхийлэх бүх үг (монгол бичлэгүүд, галиг, барааны нэрэнд байдаг англи үг). Аль нэг үг таарвал бүх бүлэг хайгдана — "морины тос" гэж бичихэд "horse", "oil" ч хайгдаж BA-YU олдоно.</p>
      <div className="mt-3 grid max-h-[520px] gap-1 overflow-y-auto">
        {rows.map(row => <div key={row.id} className={`flex items-start justify-between gap-3 rounded-2xl bg-[var(--a-card)] px-3 py-2 ${row.isActive ? "" : "opacity-50"}`}>
          <button type="button" onClick={() => setDraft({ id: row.id, concept: row.concept, terms: row.terms, isActive: row.isActive })} className="min-w-0 flex-1 text-left"><strong className="block text-xs">{row.concept}{row.isActive ? "" : " · идэвхгүй"}</strong><span className="block text-[11px] leading-5 text-[var(--a-muted)]">{row.terms}</span></button>
          <button type="button" onClick={async () => { if (await confirm({ title: `"${row.concept}" ойлголтыг устгах уу?`, danger: true })) remove.mutate({ id: row.id }); }} className="text-[var(--a-faint)] hover:text-[#df1f3d]" aria-label="Устгах"><Trash2 size={14} /></button>
        </div>)}
        {!rows.length && <p className="text-xs text-[var(--a-muted)]">{synonyms.isLoading ? "Ачаалж байна…" : "Мөр олдсонгүй."}</p>}
      </div>
    </div>
    <div className="grid gap-5 self-start">
      <form onSubmit={event => { event.preventDefault(); upsert.mutate({ id: draft.id ?? undefined, concept: draft.concept, terms: draft.terms, isActive: draft.isActive }); }} className="rounded-3xl border border-[#df1f3d]/25 bg-[var(--a-neg-soft)] p-4">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">{draft.id ? "ОЙЛГОЛТ ЗАСАХ" : "ШИНЭ ОЙЛГОЛТ"}</p>
        <label className="mt-3 grid gap-1.5 text-xs font-bold">Түлхүүр (хоосон бол эхний үг)<input value={draft.concept} onChange={event => setDraft({ ...draft, concept: event.target.value })} placeholder="жишээ: батга" className={inputClass} /></label>
        <label className="mt-3 grid gap-1.5 text-xs font-bold">Үгс (таслалаар, дор хаяж 2)<textarea value={draft.terms} onChange={event => setDraft({ ...draft, terms: event.target.value })} placeholder="батга, батганы, тууралт, acne, pimple" className="min-h-24 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 text-sm outline-none focus:border-[#df1f3d]" /></label>
        <label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} className="size-4 accent-[#df1f3d]" />Идэвхтэй</label>
        <div className="mt-4 flex gap-2">
          <button type="submit" disabled={upsert.isPending} className={buttonClass}>{upsert.isPending && <LoaderCircle className="animate-spin" size={14} />}Хадгалах</button>
          {draft.id || draft.terms ? <button type="button" onClick={() => setDraft(emptySynonym())} className="text-xs font-bold text-[var(--a-muted)]">Цэвэрлэх</button> : null}
        </div>
      </form>
      <div className="rounded-3xl bg-[var(--a-soft)] p-4">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">ТУРШИЖ ҮЗЭХ</p>
        <input value={probe} onChange={event => setProbe(event.target.value)} placeholder="Худалдан авагч шиг бичээд үзнэ үү" className={`${inputClass} mt-3`} />
        {probe.trim().length >= 2 && <div className="mt-3 grid gap-1 text-xs">
          {probeQuery.isLoading ? <p className="text-[var(--a-muted)]">Хайж байна…</p> : <>
            <p className="text-[var(--a-muted)]">{probeQuery.data?.resultCount ?? 0} бараа{probeQuery.data?.brandMatches.length ? ` · брэнд: ${probeQuery.data.brandMatches.map(match => match.brand).join(", ")}` : ""}{probeQuery.data?.didYouMean ? ` · санал: "${probeQuery.data.didYouMean}"` : ""}</p>
            {(probeQuery.data?.products ?? []).map(product => <div key={product.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--a-card)] px-3 py-1.5"><span className="truncate">{product.nameMn ?? product.name}</span><span className="shrink-0 text-[var(--a-muted)]">{formatMnt(product.priceMnt)}</span></div>)}
          </>}
        </div>}
      </div>
    </div>
  </div>;
}

function AliasesTab() {
  const utils = trpc.useUtils();
  const aliases = trpc.admin.brandAliases.useQuery();
  const realBrands = trpc.admin.distinctRealBrands.useQuery();
  const [canonical, setCanonical] = useState("");
  const [alias, setAlias] = useState("");
  const create = trpc.admin.createBrandAlias.useMutation({
    onSuccess: () => { toast.success("Alias нэмэгдлээ."); utils.admin.brandAliases.invalidate(); setAlias(""); },
    onError: error => toast.error(messageFrom(error)),
  });
  const remove = trpc.admin.deleteBrandAlias.useMutation({
    onSuccess: () => { toast.success("Устгагдлаа."); utils.admin.brandAliases.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ id: number; alias: string }>>();
    for (const row of aliases.data ?? []) map.set(row.canonicalBrand, [...(map.get(row.canonicalBrand) ?? []), { id: row.id, alias: row.alias }]);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [aliases.data]);

  return <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
    <div className="rounded-3xl bg-[var(--a-soft)] p-4">
      <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">БРЭНД → БИЧЛЭГИЙН ХУВИЛБАРУУД</p>
      <p className="mt-2 text-xs leading-5 text-[var(--a-muted)]">Худалдан авагч кириллээр ("кокочи"), товчилж ("OR"), эсвэл POS өөр бичлэгээр ("SSELECT") ирүүлдэг бүх хэлбэр. Бараа хадгалахад брэнд автоматаар үндсэн бичлэг рүү засагдана; хайлтын индекс хувилбар бүрийг таньдаг.</p>
      <div className="mt-3 grid gap-1">
        {grouped.map(([brand, rows]) => <div key={brand} className="rounded-2xl bg-[var(--a-card)] px-3 py-2"><strong className="block text-xs">{brand}</strong><div className="mt-1 flex flex-wrap gap-1.5">{rows.map(row => <span key={row.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--a-soft)] px-2.5 py-1 text-[11px] font-bold">{row.alias}<button type="button" onClick={() => remove.mutate({ id: row.id })} className="text-[var(--a-faint)] hover:text-[#df1f3d]" aria-label={`${row.alias} устгах`}><Trash2 size={11} /></button></span>)}</div></div>)}
        {!grouped.length && <p className="text-xs text-[var(--a-muted)]">{aliases.isLoading ? "Ачаалж байна…" : "Alias алга."}</p>}
      </div>
    </div>
    <form onSubmit={event => { event.preventDefault(); create.mutate({ canonicalBrand: canonical, alias }); }} className="self-start rounded-3xl border border-[#df1f3d]/25 bg-[var(--a-neg-soft)] p-4">
      <p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">ШИНЭ ALIAS</p>
      <label className="mt-3 grid gap-1.5 text-xs font-bold">Үндсэн брэнд<select required value={canonical} onChange={event => setCanonical(event.target.value)} className={inputClass}><option value="" disabled>Сонгох</option>{(realBrands.data ?? []).map(row => row.brand ? <option key={row.brand} value={row.brand}>{row.brand} ({row.count})</option> : null)}</select></label>
      <label className="mt-3 grid gap-1.5 text-xs font-bold">Хувилбар<input required value={alias} onChange={event => setAlias(event.target.value)} placeholder="жишээ: кокочи" className={inputClass} /></label>
      <button type="submit" disabled={create.isPending} className={`${buttonClass} mt-4`}>{create.isPending && <LoaderCircle className="animate-spin" size={14} />}Нэмэх</button>
    </form>
  </div>;
}
