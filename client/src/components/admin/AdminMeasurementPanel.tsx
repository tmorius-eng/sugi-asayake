import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, CircleDashed, Facebook, LoaderCircle, Power, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { checkStoreSettingFormat, getStoreSettingSlot, storeSettingStatus, type StoreSettingKey, type StoreSettingStatus } from "@shared/store-settings";

import { useConfirm } from "@/components/ConfirmDialog";
/**
 * /admin -> Хэмжилт (2026-09-15).
 *
 * WHY ITS OWN SCREEN. These two ids used to be rows 5 and 6 of the fifth of
 * six collapsed groups in Дэлгүүрийн тохиргоо, each typed into a two-line
 * <textarea>. Worse, nothing validated them: server/_core/indexHtml.ts tests
 * the id against a regex when it renders, and silently substitutes "" when it
 * fails -- so a typo saved with a green toast and the tag then never loaded,
 * with no way to tell from admin. The format now lives in the slot registry
 * (shared/store-settings.ts), the save mutation rejects a malformed value,
 * and this screen says out loud which of the three states each tag is in.
 *
 * The "Унтраах" button is the other half of that fix: the generic panel
 * refuses to save an empty value, so the only way to switch a tag off was a
 * button labelled "Анхны утга руу буцаах", which reads like an undo.
 */
type SettingRow = { settingKey: string; settingValue: string; updatedAt: Date };

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хадгалж чадсангүй. Дахин оролдоно уу.";

type CardSpec = {
  key: StoreSettingKey;
  eyebrow: string;
  title: string;
  subtitle: string;
  Icon: typeof BarChart3;
  accent: string;
  accentSoft: string;
  help: string;
};

const CARDS: CardSpec[] = [
  {
    key: "analytics-ga4-measurement-id",
    eyebrow: "GOOGLE",
    title: "Google Analytics 4",
    subtitle: "Хэдэн хүн ирсэн, юу үзсэн, хаанаас ирснийг хэмжинэ",
    Icon: BarChart3,
    accent: "var(--a-brand-ga)",
    accentSoft: "var(--a-brand-ga-soft)",
    help: "analytics.google.com → Admin → Data streams → Web хэсгээс авна. Google Tag Manager (GTM-…) энэ сайтад дэмжигдэхгүй.",
  },
  {
    key: "analytics-meta-pixel-id",
    eyebrow: "META",
    title: "Facebook Pixel",
    subtitle: "Facebook/Instagram сурталчилгааны үр дүнг (сагс, худалдан авалт) хэмжинэ",
    Icon: Facebook,
    accent: "var(--a-brand-meta)",
    accentSoft: "var(--a-brand-meta-soft)",
    help: "business.facebook.com → Events Manager → Data sources хэсгээс 15–16 оронтой Pixel ID-г авна.",
  },
];

const STATUS_LABEL: Record<StoreSettingStatus, string> = {
  unset: "Тохируулаагүй",
  active: "Идэвхтэй",
  invalid: "Буруу формат — ачаалагдахгүй",
  dirty: "Хадгалаагүй өөрчлөлт",
};
const STATUS_STYLE: Record<StoreSettingStatus, string> = {
  unset: "bg-[var(--a-soft)] text-[var(--a-muted)]",
  active: "bg-[var(--a-pos-soft)] text-[var(--a-pos)]",
  invalid: "bg-[var(--a-neg-soft)] text-[var(--a-neg)]",
  dirty: "bg-[var(--a-warn-soft)] text-[var(--a-warn)]",
};

export default function AdminMeasurementPanel({ preview = false }: { preview?: boolean }) {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const settingsQuery = trpc.admin.storeSettings.useQuery(undefined, { enabled: !preview });
  const updateSetting = trpc.admin.updateStoreSetting.useMutation();
  const clearSetting = trpc.admin.clearStoreSetting.useMutation();
  const [drafts, setDrafts] = useState<Partial<Record<StoreSettingKey, string>>>({});
  const [busy, setBusy] = useState(false);

  const savedByKey = useMemo(
    () => new Map((settingsQuery.data ?? []).map((row: SettingRow) => [row.settingKey, row.settingValue])),
    [settingsQuery.data],
  );

  const refresh = () => Promise.all([utils.admin.storeSettings.invalidate(), utils.content.storeSettings.invalidate()]);

  const valueOf = (key: StoreSettingKey) => drafts[key] ?? savedByKey.get(key) ?? "";
  const isDirty = (key: StoreSettingKey) => drafts[key] !== undefined && drafts[key]!.trim() !== (savedByKey.get(key) ?? "").trim();
  const dirtyKeys = CARDS.map(card => card.key).filter(isDirty);

  /**
   * One save for both cards. A key that was emptied routes to clearStoreSetting
   * rather than an error toast -- clearing IS how a tag is switched off, and
   * the mutation refuses an empty settingValue by design.
   */
  const save = async () => {
    if (preview) return toast.message("Preview горим", { description: "Бодит хадгалалт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    if (!dirtyKeys.length) return toast.message("Өөрчлөх утга оруулаагүй байна.");
    for (const key of dirtyKeys) {
      const problem = checkStoreSettingFormat(key, valueOf(key));
      if (problem) return toast.error(problem);
    }
    setBusy(true);
    try {
      for (const key of dirtyKeys) {
        const value = valueOf(key).trim();
        if (value) await updateSetting.mutateAsync({ settingKey: key, settingValue: value });
        else if (savedByKey.has(key)) await clearSetting.mutateAsync({ settingKey: key });
      }
      setDrafts({});
      await refresh();
      toast.success("Хадгаллаа. Хуудсанд 1 минутын дотор хүрнэ.");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const switchOff = async (key: StoreSettingKey) => {
    if (preview) return toast.message("Preview горим", { description: "Бодит өөрчлөлт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    if (!await confirm({ title: "Энэ тоолуурыг унтраах уу? Сайт дээр хэмжилт цуглуулахаа болино.", danger: true })) return;
    setBusy(true);
    try {
      await clearSetting.mutateAsync({ settingKey: key });
      setDrafts(current => { const next = { ...current }; delete next[key]; return next; });
      await refresh();
      toast.success("Унтраалаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      {!preview && settingsQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>}
      {!preview && settingsQuery.error && <p className="rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(settingsQuery.error)}</p>}

      <div className="admin-card p-5">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">TRACKING ТОХИРГОО</p>
        <h3 className="mt-1 font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">Google Analytics болон Facebook Pixel</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--a-muted)]">Дэлгүүрийнхээ хандалт, идэвхийг хэмжих хоёр тоолуур. Аль нэгийг нь хоосон орхивол тэр тоолуур огт ачаалагдахгүй.</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          {CARDS.map(card => {
            const slot = getStoreSettingSlot(card.key);
            const saved = savedByKey.get(card.key);
            const status = storeSettingStatus(card.key, saved, drafts[card.key]);
            const problem = checkStoreSettingFormat(card.key, valueOf(card.key));
            return (
              <div key={card.key} className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-soft)] p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: card.accentSoft, color: card.accent }}>
                    <card.Icon size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold tracking-[.14em]" style={{ color: card.accent }}>{card.eyebrow}</p>
                    <h4 className="font-bold leading-tight">{card.title}</h4>
                    <p className="mt-0.5 text-[11px] leading-4 text-[var(--a-muted)]">{card.subtitle}</p>
                  </div>
                </div>

                <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${STATUS_STYLE[status]}`}>
                  {status === "active" ? <CheckCircle2 size={12} /> : status === "invalid" ? <TriangleAlert size={12} /> : <CircleDashed size={12} />}
                  {STATUS_LABEL[status]}
                </span>

                <input
                  value={valueOf(card.key)}
                  onChange={event => setDrafts(current => ({ ...current, [card.key]: event.target.value }))}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={slot.label}
                  placeholder={"placeholder" in slot ? slot.placeholder : ""}
                  className={`mt-3 h-11 w-full rounded-xl border bg-[var(--a-card)] px-3 font-mono text-sm outline-none ${problem ? "border-[var(--a-neg)]" : "border-[var(--a-border)] focus:border-[#3970a7]"}`}
                />
                {problem
                  ? <p className="mt-1.5 text-[11px] leading-4 text-[var(--a-neg)]">{problem}</p>
                  : <p className="mt-1.5 text-[11px] leading-4 text-[var(--a-muted)]">{card.help}</p>}

                {saved !== undefined && (
                  <button type="button" disabled={busy} onClick={() => switchOff(card.key)} className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[10px] font-extrabold text-[var(--a-muted)] transition hover:text-[#df1f3d] disabled:opacity-50">
                    <Power size={12} />Унтраах
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {dirtyKeys.length > 0 && (
            <button type="button" onClick={() => setDrafts({})} className="text-[11px] font-extrabold text-[var(--a-muted)]">Цуцлах</button>
          )}
          <button type="button" onClick={save} disabled={busy || !dirtyKeys.length} className="inline-flex items-center gap-2 rounded-full bg-[var(--a-pos)] px-5 py-2.5 text-[11px] font-extrabold text-[var(--a-invert-text)] transition disabled:opacity-40">
            {busy && <LoaderCircle className="animate-spin" size={13} />}Хадгалах
          </button>
        </div>
      </div>

      <div className="admin-card p-5">
        <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">САНАХ ЗҮЙЛС</p>
        <ul className="mt-2 grid gap-1.5 text-xs leading-5 text-[var(--a-muted)]">
          <li>• Зочин күкийн зөвшөөрөл өгсний дараа л тоолуур ачаалагдана — Google нь «Тоолуур», Pixel нь «Маркетинг» ангилалд харьяалагдана.</li>
          <li>• Хадгалсны дараа өөрчлөлт хуудсанд 1 минутын дотор хүрнэ (хуудасны түр санах ой).</li>
          <li>• Буруу форматтай ID хадгалагдахгүй — тоолуур «ажиллахгүй байна» гэсэн шалтгаангүй байдалд хэзээ ч орохгүй.</li>
        </ul>
      </div>
    </div>
  );
}
