import { useMemo, useState } from "react";
import { LoaderCircle, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { PANEL_OWNED_GROUPS, checkStoreSettingFormat, storeSettingSlots, type StoreSettingKey } from "@shared/store-settings";

type SettingRow = { settingKey: string; settingValue: string; updatedAt: Date };

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Тохиргоог хадгалж чадсангүй. Дахин оролдоно уу.";

// Same slot order as shared/store-settings.ts, grouped exactly like
// ContentTextPanel.tsx's homepage-copy groups -- this is that same pattern
// applied to business-rule values (delivery fee, email template prose)
// instead of marketing copy.
const GROUPS = Array.from(new Set(storeSettingSlots.map(slot => slot.group))).filter(group => !PANEL_OWNED_GROUPS.includes(group));

export default function AdminStoreSettingsPanel({ preview = false }: { preview?: boolean }) {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.admin.storeSettings.useQuery(undefined, { enabled: !preview });
  const updateSetting = trpc.admin.updateStoreSetting.useMutation();
  const clearSetting = trpc.admin.clearStoreSetting.useMutation();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeKey, setActiveKey] = useState<StoreSettingKey | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(GROUPS[0] ?? null);

  const settingByKey = useMemo(() => new Map((settingsQuery.data ?? []).map((row: SettingRow) => [row.settingKey, row])), [settingsQuery.data]);
  const refresh = async () => {
    await Promise.all([utils.admin.storeSettings.invalidate(), utils.content.storeSettings.invalidate()]);
  };
  const busy = updateSetting.isPending || clearSetting.isPending;

  const saveSetting = async (settingKey: StoreSettingKey, fallbackValue: string) => {
    if (preview) return toast.message("Preview горим", { description: "Бодит хадгалалт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    const draft = drafts[settingKey];
    const value = (draft ?? settingByKey.get(settingKey)?.settingValue ?? fallbackValue).trim();
    if (!value && !settingByKey.has(settingKey)) return toast.error("Хоосон утга хадгалах боломжгүй.");
    const problem = value ? checkStoreSettingFormat(settingKey, value) : null;
    if (problem) return toast.error(problem);
    setActiveKey(settingKey);
    try {
      if (value) await updateSetting.mutateAsync({ settingKey, settingValue: value });
      else await clearSetting.mutateAsync({ settingKey });
      if (!value) setDrafts(current => { const next = { ...current }; delete next[settingKey]; return next; });
      await refresh();
      toast.success(value ? "Тохиргоог хадгаллаа." : "Анхны утгыг сэргээлээ.");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setActiveKey(null);
    }
  };

  const resetSetting = async (settingKey: StoreSettingKey) => {
    if (preview) return toast.message("Preview горим", { description: "Бодит тохиргоо сэргээх нь хамгаалагдсан admin хэсэгт ажиллана." });
    if (!window.confirm("Энэ тохиргоог анхны утга руу буцаах уу?")) return;
    setActiveKey(settingKey);
    try {
      await clearSetting.mutateAsync({ settingKey });
      setDrafts(current => { const next = { ...current }; delete next[settingKey]; return next; });
      await refresh();
      toast.success("Анхны утгыг сэргээлээ.");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setActiveKey(null);
    }
  };

  return <div>
    <div className="rounded-3xl border border-[#3970a7]/15 bg-[var(--a-info-soft)] p-5 text-sm text-[var(--a-info)]">
      <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[var(--a-info)]" size={19} /><p><strong>Таны өөрчлөлт шинэ захиалга/имэйлд шууд нөлөөлнэ.</strong> Хүргэлтийн үнэ, хямдралын доод дүн, захиалгын статус мессежийн текстийг доор бүлгээр эмхэтгэсэн. "Анхны утга руу буцаах" нь кодонд бичигдсэн анхны утгыг сэргээнэ.</p></div>
    </div>
    {!preview && settingsQuery.isLoading && <div className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Тохиргоог уншиж байна…</div>}
    {!preview && settingsQuery.error && <div className="mt-5 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(settingsQuery.error)}</div>}

    <div className="mt-6 grid gap-3">
      {GROUPS.map(group => {
        const slots = storeSettingSlots.filter(slot => slot.group === group);
        const isOpen = openGroup === group;
        return (
          <div key={group} className="overflow-hidden rounded-3xl border border-[var(--a-border)] bg-[var(--a-card)]">
            <button
              type="button"
              onClick={() => setOpenGroup(current => (current === group ? null : group))}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">{group}</span>
              <span className="text-[10px] font-extrabold tracking-[.12em] text-[var(--a-faint)]">{slots.length} ТОХИРГОО {isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && (
              <div className="grid gap-4 border-t border-[var(--a-border)] p-5">
                {slots.map(slot => {
                  const saved = settingByKey.get(slot.key) as SettingRow | undefined;
                  const value = drafts[slot.key] ?? saved?.settingValue ?? slot.fallbackValue;
                  const isCustom = Boolean(saved);
                  const isActive = activeKey === slot.key;
                  return (
                    <div key={slot.key} className="rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-[var(--font-display)] text-sm font-semibold tracking-[-.02em]">{slot.label}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold tracking-[.12em] ${isCustom ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-info-soft)] text-[var(--a-muted)]"}`}>{isCustom ? "ЗАСВАРЛАСАН" : "АНХНЫ УТГА"}</span>
                      </div>
                      {slot.description && <p className="mt-1 text-xs leading-5 text-[var(--a-muted)]">{slot.description}</p>}
                      {/* An email template's declared tokens. Shown as
                          copyable chips because the server rejects the save
                          outright if one is mistyped -- better to read the
                          exact spelling here than to discover it from an
                          error toast. */}
                      {"tokens" in slot && slot.tokens.length > 0 && (
                        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--a-muted)]">
                          <span>Ашиглаж болох орлуулга:</span>
                          {slot.tokens.map(token => (
                            <code key={token} className="rounded-md bg-[var(--a-soft)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--a-text-soft)]">{token}</code>
                          ))}
                        </p>
                      )}
                      {slot.type === "number" || ("inputType" in slot && slot.inputType === "line") ? (
                        <input
                          type={slot.type === "number" ? "number" : "text"}
                          min={slot.type === "number" ? 0 : undefined}
                          aria-label={slot.label}
                          value={value}
                          placeholder={"placeholder" in slot ? slot.placeholder : undefined}
                          autoComplete="off"
                          spellCheck={false}
                          onChange={event => setDrafts(current => ({ ...current, [slot.key]: event.target.value }))}
                          className={`mt-3 h-11 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7] ${slot.type === "number" ? "max-w-xs" : "max-w-xl"}`}
                        />
                      ) : (
                        <textarea
                          aria-label={slot.label}
                          value={value}
                          onChange={event => setDrafts(current => ({ ...current, [slot.key]: event.target.value }))}
                          rows={2}
                          maxLength={2_000}
                          className="mt-3 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-2 text-xs font-normal leading-5 outline-none focus:border-[#3970a7]"
                        />
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => saveSetting(slot.key, slot.fallbackValue)} className="inline-flex items-center gap-1.5 rounded-full bg-[#df1f3d] px-3.5 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#bc1732] active:scale-[.97] disabled:opacity-50">
                          <Save size={14} />{isActive && updateSetting.isPending ? "Хадгалж байна…" : "Хадгалах"}
                        </button>
                        {isCustom && (
                          <button type="button" disabled={busy} onClick={() => resetSetting(slot.key)} className="inline-flex items-center gap-1.5 rounded-full px-2 py-2.5 text-[11px] font-bold text-[var(--a-muted)] transition hover:text-[#df1f3d] disabled:opacity-50">
                            <RotateCcw size={14} />Анхны утга руу буцаах
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>;
}
