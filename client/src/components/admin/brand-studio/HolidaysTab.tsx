import { useState, type ChangeEvent } from "react";
import { CalendarClock, Eye, ImageUp, LoaderCircle, Palette, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { mergeLook, type ThemeLook } from "@shared/theme-tokens";
import { prepareImageUpload } from "@/lib/prepareImageUpload";
import { EFFECT_LABELS, HOLIDAY_EFFECTS, HOLIDAY_ORNAMENTS, ORNAMENT_LABELS, type HolidayEffect, type HolidayOrnament } from "@shared/holiday-decor";

/**
 * Брэнд студи → Баярын загвар (2026-10-05). 13 баяр: асаах/унтраах, цонхны хоног, энэ жилийн
 * гараар огноо, мэндчилгээ, постер. Асаасан баяр л автоматаар идэвхжинэ (анхдагч бүгд унтраалттай).
 */
type Overview = RouterOutputs["admin"]["brandStudio"]["overview"];
type HolidayRow = Overview["holidays"][number];

const MONTHS = ["1-р сар", "2-р сар", "3-р сар", "4-р сар", "5-р сар", "6-р сар", "7-р сар", "8-р сар", "9-р сар", "10-р сар", "11-р сар", "12-р сар"];
const messageFrom = (error: unknown) => (error instanceof Error ? error.message : "Хадгалж чадсангүй.");
const dayOfYear = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000;
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const fmt = (key: string) => key.replaceAll("-", ".");
const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export default function HolidaysTab({ overview, baseLook, previewKey, onPreview, onEditColors }: {
  overview: Overview;
  baseLook: ThemeLook;
  previewKey: string | null;
  onPreview: (key: string | null) => void;
  onEditColors: (key: string) => void;
}) {
  const utils = trpc.useUtils();
  const save = trpc.admin.brandStudio.save.useMutation();
  const upload = trpc.admin.uploadSiteMediaImage.useMutation();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const holidays = [...overview.holidays].sort((a, b) => (a.window?.start ?? "9999").localeCompare(b.window?.start ?? "9999"));
  const nextKey = holidays.find(h => h.settings.enabled && h.window && h.window.start > overview.today)?.key ?? null;

  const persist = async (key: string, input: Omit<Parameters<typeof save.mutateAsync>[0], "themeKey">, success: string) => {
    setBusyKey(key);
    try {
      await save.mutateAsync({ themeKey: key, ...input });
      await utils.admin.brandStudio.overview.invalidate();
      toast.success(success);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setBusyKey(null);
    }
  };

  const today = dayOfYear(overview.today);
  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      {/* Жилийн timeline — баяр бүрийн идэвхтэй цонх (сар/өдрөөр, жилийн хилийг хоёр хэсэгт хуваана). */}
      <div className="admin-card overflow-x-auto p-4">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-12 border-b border-[var(--a-border)] pb-2 text-center text-[10px] font-bold text-[var(--a-muted)]">
            {MONTHS.map(month => <span key={month}>{month}</span>)}
          </div>
          <div className="relative mt-2" style={{ height: Math.max(1, holidays.filter(h => h.window).length) * 22 + 8 }}>
            <span className="absolute inset-y-0 w-px bg-[var(--a-info)]" style={{ left: `${(today / 365) * 100}%` }} aria-hidden="true" />
            {holidays.filter(h => h.window).map((holiday, row) => {
              const start = dayOfYear(holiday.window!.start);
              const length = Math.max(1, daysBetween(holiday.window!.start, holiday.window!.end) + 1);
              const color = mergeLook(baseLook, holiday.look).light.primary;
              const segments = start + length > 365 ? [[start, 365 - start], [0, start + length - 365]] : [[start, length]];
              return segments.map(([left, width], index) => (
                <button key={`${holiday.key}-${index}`} type="button" onClick={() => onPreview(holiday.key)} title={`${holiday.name}: ${fmt(holiday.window!.start)} – ${fmt(holiday.window!.end)}`}
                  className={`absolute h-[18px] truncate rounded-full px-2 text-left text-[10px] font-bold text-white ${holiday.settings.enabled ? "" : "opacity-35"} ${previewKey === holiday.key ? "ring-2 ring-[var(--a-text)] ring-offset-1" : ""}`}
                  style={{ top: row * 22, left: `${(left / 365) * 100}%`, width: `max(${(width / 365) * 100}%, 54px)`, background: color }}>
                  {holiday.name.replace(/\s*\(.*\)$/, "")}
                </button>
              ));
            })}
          </div>
          <p className="mt-2 text-[11px] text-[var(--a-muted)]">Цэнхэр зураас = өнөөдөр ({fmt(overview.today)}). Бүдэг мөр = унтраалттай баяр. Мөр дээр дарвал баруун талд урьдчилан харна.</p>
        </div>
      </div>

      <div className="grid gap-3 [&>*]:min-w-0">
        {holidays.map(holiday => (
          <HolidayCard
            key={holiday.key}
            holiday={holiday}
            today={overview.today}
            look={mergeLook(baseLook, holiday.look)}
            isNext={holiday.key === nextKey}
            isPreviewing={previewKey === holiday.key}
            isOpen={openKey === holiday.key}
            busy={busyKey === holiday.key || upload.isPending}
            onToggleOpen={() => setOpenKey(current => (current === holiday.key ? null : holiday.key))}
            onPreview={() => onPreview(previewKey === holiday.key ? null : holiday.key)}
            onEditColors={() => onEditColors(holiday.key)}
            onSave={(input, message) => persist(holiday.key, input, message)}
            onUpload={async file => {
              const prepared = await prepareImageUpload(file, undefined);
              if (!(UPLOAD_TYPES as readonly string[]).includes(prepared.file.type) || prepared.file.size > 8 * 1024 * 1024) {
                toast.error("JPG, PNG эсвэл WEBP зураг сонгоно уу (8 MB хүртэл).");
                return null;
              }
              const dataBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(prepared.file);
              });
              try {
                const stored = await upload.mutateAsync({ fileName: prepared.file.name, contentType: prepared.file.type as (typeof UPLOAD_TYPES)[number], dataBase64 });
                return stored.url;
              } catch (error) {
                toast.error(messageFrom(error));
                return null;
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function HolidayCard({ holiday, today, look, isNext, isPreviewing, isOpen, busy, onToggleOpen, onPreview, onEditColors, onSave, onUpload }: {
  holiday: HolidayRow;
  today: string;
  look: ThemeLook;
  isNext: boolean;
  isPreviewing: boolean;
  isOpen: boolean;
  busy: boolean;
  onToggleOpen: () => void;
  onPreview: () => void;
  onEditColors: () => void;
  onSave: (input: { greeting?: string | null; posterUrl?: string | null; showPoster?: boolean; effect?: HolidayEffect; ornament?: HolidayOrnament; holiday?: { enabled?: boolean; startOffsetDays?: number; endOffsetDays?: number; overrideStart?: string | null; overrideEnd?: string | null } }, message: string) => Promise<void>;
  onUpload: (file: File) => Promise<string | null>;
}) {
  const poster = holiday.showPoster ? holiday.posterUrl ?? holiday.defaultPoster : null;
  const daysAway = holiday.window && holiday.window.start > today ? daysBetween(today, holiday.window.start) : null;
  const activeNow = holiday.window && holiday.window.start <= today && holiday.window.end >= today;
  const [form, setForm] = useState(() => ({
    before: String(-(holiday.settings.startOffsetDays ?? holiday.defaultOffsets.start)),
    after: String(holiday.settings.endOffsetDays ?? holiday.defaultOffsets.end),
    overrideStart: holiday.settings.overrideStart ?? "",
    overrideEnd: holiday.settings.overrideEnd ?? "",
    greeting: holiday.greeting ?? "",
    greetingDefault: holiday.greeting === null,
  }));

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const url = await onUpload(file);
    if (url) await onSave({ posterUrl: url, showPoster: true }, "Постер солигдлоо.");
  };

  return (
    <article className={`admin-card overflow-hidden p-3 ${isPreviewing ? "ring-2 ring-[var(--a-info)]" : ""}`}>
      <div className="flex gap-3">
        <div className="relative size-[92px] shrink-0 overflow-hidden rounded-xl bg-[var(--a-soft)]">
          {poster
            ? <img src={poster.replace(/\.webp$/, "-600w.webp")} onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = poster; }} alt={`${holiday.name} — постер`} loading="lazy" className="size-full object-cover" />
            : <div className="grid size-full place-items-center p-2 text-center text-[10px] font-bold leading-tight text-[var(--a-muted)]">Hero солигдохгүй</div>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <h4 className="line-clamp-2 min-w-0 flex-1 text-sm font-bold leading-snug" title={holiday.name}>{holiday.name}</h4>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] font-bold text-[var(--a-text-soft)]">
              <input type="checkbox" className="peer sr-only" checked={holiday.settings.enabled} disabled={busy}
                onChange={event => onSave({ holiday: { enabled: event.target.checked } }, event.target.checked ? `${holiday.name} асаалттай — хугацаандаа автоматаар идэвхжинэ.` : `${holiday.name} унтраалттай.`)} />
              <span className="relative h-5 w-9 rounded-full bg-[var(--a-border-strong)] transition peer-checked:bg-[var(--a-pos)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--a-info)] after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" aria-hidden="true" />
              <span className="sr-only">{holiday.name}: </span>{holiday.settings.enabled ? "Асаалттай" : "Унтраалттай"}
            </label>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--a-muted)]">
            <span className="inline-flex items-center gap-1"><CalendarClock size={12} />{holiday.window ? `${fmt(holiday.window.start)} – ${fmt(holiday.window.end)}` : "Огноо тодорхойгүй — гараар оруулна"}</span>
            {holiday.official && <span className="rounded-full bg-[var(--a-info-soft)] px-2 py-0.5 font-bold text-[var(--a-info)]">Албан ёсны</span>}
            {(isNext || activeNow) && <span className={`rounded-full px-2 py-0.5 font-extrabold text-white ${activeNow ? "bg-[var(--a-pos)]" : "bg-[var(--a-info)]"}`}>{activeNow ? "Одоо цонх дотор" : `Удахгүй: ${daysAway} хоног`}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex gap-1" aria-hidden="true">
              {[look.light.primary, look.light.accent, look.light["promo-bar-bg"], look.light["ck-gold"]].map((color, index) => (
                <span key={index} className="size-3.5 rounded-full border border-black/10" style={{ background: color }} />
              ))}
            </span>
            <button type="button" onClick={onToggleOpen} aria-expanded={isOpen} className="inline-flex items-center gap-1 rounded-full border border-[var(--a-border)] px-2.5 py-1 text-[10px] font-extrabold transition hover:bg-[var(--a-soft)]"><Settings2 size={12} />Тохируулах</button>
            <button type="button" onClick={onEditColors} className="inline-flex items-center gap-1 rounded-full border border-[var(--a-border)] px-2.5 py-1 text-[10px] font-extrabold transition hover:bg-[var(--a-soft)]"><Palette size={12} />Өнгө</button>
            <button type="button" onClick={onPreview} aria-pressed={isPreviewing} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold transition ${isPreviewing ? "bg-[var(--a-info)] text-white" : "border border-[var(--a-border)] hover:bg-[var(--a-soft)]"}`}><Eye size={12} />Урьдчилан харах</button>
          </div>
          {holiday.lunar && !holiday.window && <p className="text-[10px] font-bold text-[var(--a-warn)]">Сарны тоолол — энэ жилийн огноог "Тохируулах"-аас оруулна уу</p>}
        </div>
      </div>
      <div>
        {isOpen && (
          <div className="mt-2 grid gap-3 rounded-2xl bg-[var(--a-soft)] p-3 text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 font-bold">Хэд хоногийн өмнө асах
                <input type="number" min={0} max={60} value={form.before} onChange={event => setForm(current => ({ ...current, before: event.target.value }))} className="h-9 min-w-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 font-mono" />
              </label>
              <label className="grid gap-1 font-bold">Хэд хоногийн дараа унтрах
                <input type="number" min={0} max={14} value={form.after} onChange={event => setForm(current => ({ ...current, after: event.target.value }))} className="h-9 min-w-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 font-mono" />
              </label>
              <label className="grid gap-1 font-bold">Гараар: эхлэх
                <input type="date" value={form.overrideStart} onChange={event => setForm(current => ({ ...current, overrideStart: event.target.value }))} className="h-9 min-w-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-2" />
              </label>
              <label className="grid gap-1 font-bold">Гараар: дуусах
                <input type="date" value={form.overrideEnd} onChange={event => setForm(current => ({ ...current, overrideEnd: event.target.value }))} className="h-9 min-w-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-2" />
              </label>
            </div>
            <p className="text-[var(--a-muted)]">Гараар оруулсан огноо байвал дүрмийг (хоногийн тоог) үл тооно. Сарны тооллын баярын ирэх жилүүдийн огноог энд оруулна.</p>
            <label className="grid gap-1 font-bold">Мэндчилгээ (нүүрний дээд хэсэгт)
              <input value={form.greetingDefault ? "" : form.greeting} placeholder={holiday.defaultGreeting} maxLength={200}
                onChange={event => setForm(current => ({ ...current, greeting: event.target.value, greetingDefault: false }))}
                className="h-9 min-w-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setForm(current => ({ ...current, greeting: "", greetingDefault: true }))} className="font-extrabold text-[var(--a-info)]">Анхдагч мэндчилгээ</button>
              <button type="button" onClick={() => setForm(current => ({ ...current, greeting: "", greetingDefault: false }))} className="font-extrabold text-[var(--a-muted)]">Мэндчилгээгүй</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-1.5 font-extrabold ${busy ? "opacity-50" : ""}`}>
                <ImageUp size={13} />Постер солих
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={onFile} />
              </label>
              {holiday.posterUrl && <button type="button" disabled={busy} onClick={() => onSave({ posterUrl: null }, "Анхдагч постер руу буцлаа.")} className="font-extrabold text-[var(--a-info)]">Анхдагч постер</button>}
              <label className="inline-flex items-center gap-1.5 font-bold">
                <input type="checkbox" checked={holiday.showPoster} disabled={busy} onChange={event => onSave({ showPoster: event.target.checked }, event.target.checked ? "Баярын үед hero-ийн эхний зураг постероор солигдоно." : "Hero-ийн зураг солигдохгүй.")} />
                Hero-ийн эхний зургийг солих
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 font-bold">Хөдөлгөөнт чимэглэл (нүүрэнд 15 с)
                <select value={holiday.effect} disabled={busy} onChange={event => onSave({ effect: event.target.value as HolidayEffect }, `Чимэглэл: ${EFFECT_LABELS[event.target.value as HolidayEffect]}.`)}
                  className="h-9 min-w-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-2">
                  {HOLIDAY_EFFECTS.map(effect => <option key={effect} value={effect}>{EFFECT_LABELS[effect]}</option>)}
                </select>
              </label>
              <label className="grid gap-1 font-bold">Хээ
                <select value={holiday.ornament} disabled={busy} onChange={event => onSave({ ornament: event.target.value as HolidayOrnament }, `Хээ: ${ORNAMENT_LABELS[event.target.value as HolidayOrnament]}.`)}
                  className="h-9 min-w-0 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-2">
                  {HOLIDAY_ORNAMENTS.map(ornament => <option key={ornament} value={ornament}>{ORNAMENT_LABELS[ornament]}</option>)}
                </select>
              </label>
            </div>
            <p className="text-[var(--a-muted)]">Хөдөлгөөн багасгах тохиргоотой зочинд чимэглэл гарахгүй. Дэнлүү, хас хээ зориуд байхгүй (монгол соёлд харш/буруу ойлгогдох).</p>
            <div className="flex justify-end">
              <button type="button" disabled={busy}
                onClick={() => {
                  const before = Number(form.before);
                  const after = Number(form.after);
                  if (!Number.isInteger(before) || before < 0 || before > 60 || !Number.isInteger(after) || after < 0 || after > 14) { toast.error("Хоногийн тоо: өмнө 0–60, дараа 0–14."); return; }
                  if ((form.overrideStart && !form.overrideEnd) || (!form.overrideStart && form.overrideEnd)) { toast.error("Гараар огноо оруулбал эхлэх ба дуусах хоёуланг."); return; }
                  void onSave({
                    holiday: { startOffsetDays: -before, endOffsetDays: after, overrideStart: form.overrideStart || null, overrideEnd: form.overrideEnd || null },
                    greeting: form.greetingDefault ? null : form.greeting.trim(),
                  }, `${holiday.name}: тохиргоо хадгалагдлаа.`);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--a-pos)] px-4 py-2 font-extrabold text-[var(--a-invert-text)] disabled:opacity-40">
                {busy && <LoaderCircle className="animate-spin" size={13} />}Хадгалах
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
