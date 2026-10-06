import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, LoaderCircle, RotateCcw, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { mergeLook, normalizeHex, PRODUCT_ASPECTS, RADIUS_PRESETS, DARK_TOKEN_KEYS, type ProductAspect, type RadiusPreset, type ThemeLook } from "@shared/theme-tokens";
import { checkLookContrast, fixForeground } from "@shared/color/contrast";
import { HOLIDAY_PALETTES } from "@shared/holiday-palettes";
import { BRAND_FONTS, fontFaceCss, fontStack, type FontKey } from "@shared/fonts";
import { useConfirm } from "@/components/ConfirmDialog";
import PreviewFrame from "./PreviewFrame";
import HolidaysTab from "./HolidaysTab";
import HistoryTab from "./HistoryTab";
import LogoPaletteCard from "./LogoPaletteCard";
import LayoutTab from "./LayoutTab";
import OwnerChangeTab from "./OwnerChangeTab";
import type { AdminSection } from "../../AdminWorkspace";
import type { HomeSectionEntry } from "@shared/home-sections";
import type { RouterOutputs } from "@/lib/trpc";
import { ASPECT_LABELS, CODE_BASE, DARK_LABELS, diffLook, LIGHT_GROUPS, RADIUS_LABELS } from "./tokenMeta";

/**
 * /admin → Брэнд студи (2026-10-05, A1). Сайтын өнгө, хэлбэр, 13 баярын загварыг бодит сайтын
 * амьд урьдчилан харалттайгаар засна. Хадгалах үед серверт AA (4.5:1) дахин шалгагдана
 * (server/brandStudioRouter.ts), хувилбар үлдэнэ (Түүх таб).
 */
type Tab = "colors" | "layout" | "holidays" | "history" | "owner";
const TABS: Array<[Tab, string]> = [["colors", "Өнгө ба хэлбэр"], ["layout", "Нүүрний бүтэц"], ["holidays", "Баярын загвар"], ["history", "Түүх"], ["owner", "Эзэн солих"]];
const messageFrom = (error: unknown) => (error instanceof Error ? error.message : "Хадгалж чадсангүй.");

export default function BrandStudioPanel({ preview, isAdmin = false, onNavigate }: { preview?: boolean; isAdmin?: boolean; onNavigate?: (section: AdminSection) => void }) {
  const utils = trpc.useUtils();
  const { confirm } = useConfirm();
  const overviewQuery = trpc.admin.brandStudio.overview.useQuery(undefined, { enabled: !preview });
  const save = trpc.admin.brandStudio.save.useMutation();
  // "base" = бүх өдрийн (глобал) бүтэц; баярын түлхүүр = тэр баярын өөрийн бүтэц (migration 0107).
  const [layoutTarget, setLayoutTarget] = useState("base");
  const layoutQuery = trpc.admin.brandStudio.homeLayout.useQuery({ themeKey: layoutTarget }, { enabled: !preview });
  const [layoutDraft, setLayoutDraft] = useState<HomeSectionEntry[] | null>(null);
  const [tab, setTab] = useState<Tab>("colors");
  const [target, setTarget] = useState("base");
  const [drafts, setDrafts] = useState<Record<string, ThemeLook>>({});
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [logoPalette, setLogoPalette] = useState<RouterOutputs["admin"]["brandStudio"]["derivePalette"] | null>(null);

  // Фонтын жишээ admin-д ч харагдахын тулд бүх фонтын @font-face (зөвхөн ашиглагдсан нь татагдана).
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "admin-brand-fonts";
    style.textContent = BRAND_FONTS.map(font => fontFaceCss(font.key)).join("");
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const overview = overviewQuery.data;
  const savedBase = overview?.base.look ?? CODE_BASE;
  const holidayRow = (key: string) => overview?.holidays.find(h => h.key === key);
  const baseFor = (key: string): ThemeLook => (key === "base" ? CODE_BASE : savedBase);
  const savedLook = (key: string): ThemeLook => (key === "base" ? savedBase : mergeLook(savedBase, holidayRow(key)?.look));
  const draft = drafts[target] ?? savedLook(target);
  const dirty = JSON.stringify(diffLook(savedLook(target), draft)) !== "{}";
  const contrast = useMemo(() => checkLookContrast(draft), [draft]);
  const failing = contrast.filter(result => !result.ok);

  const setToken = (scope: "light" | "dark", key: string, value: string) => {
    const hex = normalizeHex(value);
    if (!hex) return;
    setDrafts(current => {
      const base = current[target] ?? savedLook(target);
      return { ...current, [target]: { ...base, [scope]: { ...base[scope], [key]: hex } } as ThemeLook };
    });
  };
  const setShape = (patch: Partial<Pick<ThemeLook, "radius" | "productAspect" | "fontBody" | "fontDisplay">>) =>
    setDrafts(current => ({ ...current, [target]: { ...(current[target] ?? savedLook(target)), ...patch } }));

  const fixAll = () => {
    let next = draft;
    for (let pass = 0; pass < 3; pass++) {
      for (const result of checkLookContrast(next).filter(r => !r.ok)) {
        const scope = result.mode === "dark" && (DARK_TOKEN_KEYS as readonly string[]).includes(result.fg) ? "dark" : "light";
        const read = (key: string) => (result.mode === "dark" ? (next.dark as Record<string, string>)[key] : undefined) ?? (next.light as Record<string, string>)[key];
        const fixed = fixForeground(read(result.fg), read(result.bg));
        next = { ...next, [scope]: { ...next[scope], [result.fg]: fixed } } as ThemeLook;
      }
    }
    setDrafts(current => ({ ...current, [target]: next }));
    toast.success("Унших боломжгүй өнгийг AA (4.5:1) хүртэл засав. Шалгаад хадгална уу.");
  };

  const onSave = async () => {
    if (preview) return toast.message("Preview горим", { description: "Бодит хадгалалт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    if (failing.length) return toast.error("Унших боломжгүй өнгө байна — эхлээд \"Бүгдийг засах\".");
    try {
      await save.mutateAsync({ themeKey: target, look: diffLook(baseFor(target), draft) });
      await utils.admin.brandStudio.overview.invalidate();
      setDrafts(current => { const next = { ...current }; delete next[target]; return next; });
      toast.success("Хадгаллаа. Сайтад 1 минутын дотор хүрнэ.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const resetToBase = async () => {
    if (!await confirm({ title: target === "base" ? "Бүх өнгийг анхны утга руу буцаах уу? Хадгалахаас өмнө урьдчилан харна." : "Энэ баярын өнгийг үндсэн загвартай ижил болгох уу?" })) return;
    setDrafts(current => ({ ...current, [target]: baseFor(target) }));
  };

  const targetName = target === "base" ? "Үндсэн загвар" : holidayRow(target)?.name ?? target;
  // Нүүрний бүтцийн табд баярын бүтэц засахад preview нь тэр баярын өнгө/skin-тэй харагдана.
  const stagedKey = tab === "layout" && layoutTarget !== "base" ? layoutTarget : previewKey;
  const previewLook = tab === "colors" ? draft : stagedKey ? drafts[stagedKey] ?? savedLook(stagedKey) : savedBase;
  const previewHoliday = tab === "colors" ? (target === "base" ? null : holidayRow(target)) : stagedKey ? holidayRow(stagedKey) : null;
  // Баярын урьдчилан харалтад тэр баярын постер/мэндчилгээ; бусад үед хуудасны өөрийнх (null = байхгүй болгох).
  const previewGreeting = previewHoliday ? (previewHoliday.greeting ?? previewHoliday.defaultGreeting) || null : tab === "colors" && target === "base" ? null : undefined;
  const previewPoster = previewHoliday ? (previewHoliday.showPoster ? previewHoliday.posterUrl ?? previewHoliday.defaultPoster : null) : tab !== "history" ? null : undefined;

  if (preview) return <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд Брэнд студи харагдахгүй.</div>;
  if (overviewQuery.isLoading) return <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>;
  if (overviewQuery.error || !overview) return <p className="rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(overviewQuery.error)}</p>;

  const activeLabel = overview.active.reason === "holiday" ? holidayRow(overview.active.key)?.name ?? overview.active.key : "Үндсэн загвар";
  const themesForHistory = [{ key: "base", name: "Үндсэн загвар" }, ...overview.holidays.map(h => ({ key: h.key, name: h.name }))];

  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--a-pos-soft)] px-3 py-1.5 text-[11px] font-extrabold text-[var(--a-pos)]"><span className="size-1.5 rounded-full bg-[var(--a-pos)]" />Одоо идэвхтэй: {activeLabel}</span>
        {overview.active.next && <span className="text-[11px] text-[var(--a-muted)]">Дараагийн баяр: {holidayRow(overview.active.next.key)?.name} ({overview.active.next.start.replaceAll("-", ".")}-нд асна)</span>}
        <div className="ml-auto inline-flex rounded-full bg-[var(--a-soft)] p-1" role="tablist" aria-label="Брэнд студи">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-extrabold transition ${tab === key ? "bg-[var(--a-card)] text-[var(--a-text)] shadow-sm" : "text-[var(--a-muted)]"}`}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "owner"
        ? <OwnerChangeTab isAdmin={isAdmin} onNavigate={onNavigate} onColors={() => { setTarget("base"); setTab("colors"); }} />
        : tab === "history"
        ? <HistoryTab themes={themesForHistory} />
        : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] [&>*]:min-w-0">
            {tab === "layout"
              ? layoutQuery.data
                ? <LayoutTab saved={layoutQuery.data.sections} draft={layoutDraft ?? layoutQuery.data.sections} onDraft={setLayoutDraft}
                    themeKey={layoutTarget} onThemeKey={key => { setLayoutTarget(key); setLayoutDraft(null); }} holidays={overview.holidays.map(h => ({ key: h.key, name: h.name }))} custom={layoutQuery.data.custom} preset={layoutQuery.data.preset} />
                : <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>
              : tab === "holidays"
              ? <HolidaysTab overview={overview} baseLook={savedBase} previewKey={previewKey} onPreview={setPreviewKey} onEditColors={key => { setTarget(key); setTab("colors"); }} />
              : (
                <div className="admin-card flex flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[11px] font-bold text-[var(--a-muted)]" htmlFor="brand-target">Засах загвар</label>
                    <select id="brand-target" value={target} onChange={event => setTarget(event.target.value)} className="h-9 min-w-0 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-bold">
                      <option value="base">Үндсэн загвар</option>
                      {overview.holidays.map(h => <option key={h.key} value={h.key}>{h.name}</option>)}
                    </select>
                    {target !== "base" && HOLIDAY_PALETTES[target] && (
                      <button type="button" onClick={() => setDrafts(current => ({ ...current, [target]: mergeLook(savedBase, { light: HOLIDAY_PALETTES[target].palette }) }))}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--a-accent-violet-soft)] px-3 py-1.5 text-[11px] font-extrabold text-[var(--a-accent-violet)]">
                        <Sparkles size={13} />Санал болгох өнгө: {HOLIDAY_PALETTES[target].mood}
                      </button>
                    )}
                  </div>

                  {failing.length > 0
                    ? (
                      <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-[var(--a-warn-soft)] p-3 text-[11px] text-[var(--a-warn)]">
                        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-extrabold">Унших боломжгүй {failing.length} хослол — хадгалагдахгүй</p>
                          <ul className="mt-1 grid gap-0.5">{failing.slice(0, 5).map(f => <li key={`${f.mode}-${f.fg}-${f.bg}`}>{f.label}: {f.ratio}:1 (4.5 хэрэгтэй)</li>)}</ul>
                        </div>
                        <button type="button" onClick={fixAll} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--a-warn)] px-3 py-1.5 font-extrabold text-white"><Wand2 size={13} />Бүгдийг засах</button>
                      </div>
                    )
                    : <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--a-pos)]"><CheckCircle2 size={14} />Бүх текст уншигдахуйц (WCAG AA, {contrast.length} хослол шалгав)</p>}

                  {target === "base" && (
                    <LogoPaletteCard result={logoPalette} onResult={setLogoPalette}
                      onApply={(light, name) => { setDrafts(current => ({ ...current, base: mergeLook(current.base ?? savedLook("base"), { light }) })); toast.message(`"${name}" палитрыг туршиж байна`, { description: "Баруун талд харагдана. Таалагдвал Хадгалах." }); }} />
                  )}

                  {LIGHT_GROUPS.filter(group => !group.collapsed || showAdvanced).map(group => (
                    <section key={group.title}>
                      <h4 className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">{group.title.toUpperCase()} <span className="font-semibold normal-case tracking-normal">· {group.hint}</span></h4>
                      <div className="mt-2 grid gap-1.5 2xl:grid-cols-2">
                        {group.tokens.map(([key, label]) => (
                          <TokenRow key={key} label={label} value={draft.light[key]} baseValue={baseFor(target).light[key]}
                            badge={contrast.find(r => r.mode === "light" && r.fg === key)}
                            onChange={value => setToken("light", key, value)} />
                        ))}
                      </div>
                    </section>
                  ))}
                  <button type="button" onClick={() => setShowAdvanced(value => !value)} className="inline-flex items-center gap-1 self-start text-[11px] font-extrabold text-[var(--a-info)]">
                    <ChevronDown size={13} className={showAdvanced ? "rotate-180" : ""} />{showAdvanced ? "Нарийн тохиргоог нуух" : "Нарийн тохиргоо"}
                  </button>
                  <section>
                    <h4 className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">ХАРАНХУЙ ГОРИМ <span className="font-semibold normal-case tracking-normal">· зочин сар товчоор сольдог</span></h4>
                    <div className="mt-2 grid gap-1.5 2xl:grid-cols-2">
                      {DARK_TOKEN_KEYS.map(key => (
                        <TokenRow key={key} label={DARK_LABELS[key]} value={draft.dark[key]} baseValue={baseFor(target).dark[key]}
                          badge={contrast.find(r => r.mode === "dark" && r.fg === key)}
                          onChange={value => { setToken("dark", key, value); setMode("dark"); }} />
                      ))}
                    </div>
                  </section>
                  <section className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <h4 className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">БУЛАНГИЙН МУРУЙЛТ</h4>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(Object.keys(RADIUS_PRESETS) as RadiusPreset[]).map(key => (
                          <button key={key} type="button" aria-pressed={draft.radius === key} onClick={() => setShape({ radius: key })}
                            className={`h-9 min-w-11 border px-2 text-[11px] font-bold transition ${draft.radius === key ? "border-[var(--a-info)] bg-[var(--a-info-soft)] text-[var(--a-info)]" : "border-[var(--a-border)]"}`}
                            style={{ borderRadius: RADIUS_PRESETS[key] }}>{RADIUS_LABELS[key]}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">БАРААНЫ ЗУРГИЙН ХАРЬЦАА</h4>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {PRODUCT_ASPECTS.map((aspect: ProductAspect) => (
                          <button key={aspect} type="button" aria-pressed={draft.productAspect === aspect} onClick={() => setShape({ productAspect: aspect })}
                            className={`h-9 rounded-xl border px-3 text-[11px] font-bold transition ${draft.productAspect === aspect ? "border-[var(--a-info)] bg-[var(--a-info-soft)] text-[var(--a-info)]" : "border-[var(--a-border)]"}`}>{ASPECT_LABELS[aspect]}</button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">ФОНТ <span className="font-semibold normal-case tracking-normal">· бүгд монгол Ө, Ү үсэгтэй (OFL)</span></h4>
                    <div className="mt-2 grid gap-3 2xl:grid-cols-2">
                      {(["fontDisplay", "fontBody"] as const).map(field => (
                        <label key={field} className="grid gap-1.5 text-[11px] font-bold">{field === "fontDisplay" ? "Гарчиг" : "Үндсэн текст"}
                          <select value={draft[field]} onChange={event => setShape({ [field]: event.target.value as FontKey })} aria-label={field === "fontDisplay" ? "Гарчгийн фонт" : "Үндсэн текстийн фонт"}
                            className="h-9 min-w-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-bold">
                            {BRAND_FONTS.map(font => <option key={font.key} value={font.key}>{font.family} — {font.note}</option>)}
                          </select>
                          <span className="min-w-0 truncate rounded-xl bg-[var(--a-soft)] px-3 py-2 text-[17px] text-[var(--a-text)]" style={{ fontFamily: fontStack(draft[field]), fontWeight: field === "fontDisplay" ? 700 : 400 }}>
                            Өглөөний арчилгаа — Аа Өө Үү Ёё 25,000₮
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-3 border-t border-[var(--a-border)] bg-[var(--a-card)] px-5 py-3">
                    <p className="text-[11px] text-[var(--a-muted)]">{targetName}{dirty ? " — хадгалаагүй өөрчлөлттэй" : ""}</p>
                    <button type="button" onClick={resetToBase} className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[var(--a-muted)]"><RotateCcw size={13} />Анхны өнгө</button>
                    {dirty && <button type="button" onClick={() => setDrafts(current => { const next = { ...current }; delete next[target]; return next; })} className="text-[11px] font-extrabold text-[var(--a-muted)]">Цуцлах</button>}
                    <button type="button" onClick={onSave} disabled={save.isPending || !dirty || failing.length > 0}
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--a-pos)] px-5 py-2.5 text-[11px] font-extrabold text-[var(--a-invert-text)] transition disabled:opacity-40">
                      {save.isPending && <LoaderCircle className="animate-spin" size={13} />}Хадгалах
                    </button>
                  </div>
                </div>
              )}
            <div className="xl:sticky xl:top-4 xl:self-start">
              <PreviewFrame look={previewLook} mode={mode} onModeChange={setMode} greeting={previewGreeting} posterUrl={previewPoster} layout={tab === "layout" ? layoutDraft ?? layoutQuery.data?.sections : undefined}
                effect={previewHoliday ? previewHoliday.effect : "none"} ornament={previewHoliday ? previewHoliday.ornament : "none"}
                skin={previewHoliday ? (previewHoliday.hasSkin && previewHoliday.skin ? previewHoliday.key : null) : (tab === "colors" && target === "base") || tab === "layout" ? null : undefined} />
            </div>
          </div>
        )}
    </div>
  );
}

function TokenRow({ label, value, baseValue, badge, onChange }: {
  label: string;
  value: string;
  baseValue: string;
  badge?: { ratio: number; ok: boolean };
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--a-border)] px-2 py-1.5">
      <input type="color" value={value} onChange={event => { setText(null); onChange(event.target.value); }} aria-label={label}
        className="size-7 shrink-0 cursor-pointer rounded-full border border-black/10 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch-wrapper]:p-0" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{label}</span>
      <input value={text ?? value.toUpperCase()} onChange={event => { setText(event.target.value); if (normalizeHex(event.target.value)) onChange(event.target.value); }} onBlur={() => setText(null)}
        aria-label={`${label} — hex`} spellCheck={false} className="w-[74px] min-w-0 rounded-lg bg-[var(--a-soft)] px-1.5 py-1 font-mono text-[11px] outline-none" />
      {badge && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${badge.ok ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-warn-soft)] text-[var(--a-warn)]"}`}>{badge.ok ? "AA " : ""}{badge.ratio}:1</span>}
      {value !== baseValue && <button type="button" onClick={() => { setText(null); onChange(baseValue); }} aria-label={`${label} — анхны утга`} title="Анхны утга" className="shrink-0 text-[var(--a-muted)] hover:text-[var(--a-text)]"><RotateCcw size={12} /></button>}
    </div>
  );
}
