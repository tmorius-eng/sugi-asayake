import { useMemo, useState } from "react";
import { LoaderCircle, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { storeSettingSlots, type StoreSettingKey } from "@shared/store-settings";

type SettingRow = { settingKey: string; settingValue: string; updatedAt: Date };

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Тохиргоог хадгалж чадсангүй. Дахин оролдоно уу.";

// Same slot order as shared/store-settings.ts, grouped exactly like
// ContentTextPanel.tsx's homepage-copy groups -- this is that same pattern
// applied to business-rule values (delivery fee, email template prose)
// instead of marketing copy.
const GROUPS = Array.from(new Set(storeSettingSlots.map(slot => slot.group)));

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
    if (!value) return toast.error("Хоосон утга хадгалах боломжгүй.");
    setActiveKey(settingKey);
    try {
      await updateSetting.mutateAsync({ settingKey, settingValue: value });
      await refresh();
      toast.success("Тохиргоог хадгаллаа.");
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
    <div className="rounded-3xl border border-[#3970a7]/15 bg-[#eef5ff] p-5 text-sm text-[#385878]">
      <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#3970a7]" size={19} /><p><strong>Таны өөрчлөлт шинэ захиалга/имэйлд шууд нөлөөлнэ.</strong> Хүргэлтийн үнэ, хямдралын доод дүн, захиалгын статус мессежийн текстийг доор бүлгээр эмхэтгэсэн. "Анхны утга руу буцаах" нь кодонд бичигдсэн анхны утгыг сэргээнэ.</p></div>
    </div>
    {!preview && settingsQuery.isLoading && <div className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Тохиргоог уншиж байна…</div>}
    {!preview && settingsQuery.error && <div className="mt-5 rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{messageFrom(settingsQuery.error)}</div>}

    <div className="mt-6 grid gap-3">
      {GROUPS.map(group => {
        const slots = storeSettingSlots.filter(slot => slot.group === group);
        const isOpen = openGroup === group;
        return (
          <div key={group} className="overflow-hidden rounded-3xl border border-black/8 bg-[#fffdf9]">
            <button
              type="button"
              onClick={() => setOpenGroup(current => (current === group ? null : group))}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">{group}</span>
              <span className="text-[10px] font-extrabold tracking-[.12em] text-[#8a8b8f]">{slots.length} ТОХИРГОО {isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && (
              <div className="grid gap-4 border-t border-black/6 p-5">
                {slots.map(slot => {
                  const saved = settingByKey.get(slot.key) as SettingRow | undefined;
                  const value = drafts[slot.key] ?? saved?.settingValue ?? slot.fallbackValue;
                  const isCustom = Boolean(saved);
                  const isActive = activeKey === slot.key;
                  return (
                    <div key={slot.key} className="rounded-2xl border border-black/8 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-[var(--font-display)] text-sm font-semibold tracking-[-.02em]">{slot.label}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold tracking-[.12em] ${isCustom ? "bg-[#e7f2ec] text-[#2c7650]" : "bg-[#edf0f5] text-[#606a78]"}`}>{isCustom ? "ЗАСВАРЛАСАН" : "АНХНЫ УТГА"}</span>
                      </div>
                      {slot.description && <p className="mt-1 text-xs leading-5 text-[#707176]">{slot.description}</p>}
                      {slot.type === "number" ? (
                        <input
                          type="number"
                          min={0}
                          value={value}
                          onChange={event => setDrafts(current => ({ ...current, [slot.key]: event.target.value }))}
                          className="mt-3 h-11 w-full max-w-xs rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]"
                        />
                      ) : (
                        <textarea
                          value={value}
                          onChange={event => setDrafts(current => ({ ...current, [slot.key]: event.target.value }))}
                          rows={2}
                          maxLength={2_000}
                          className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-normal leading-5 outline-none focus:border-[#3970a7]"
                        />
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => saveSetting(slot.key, slot.fallbackValue)} className="inline-flex items-center gap-1.5 rounded-full bg-[#df1f3d] px-3.5 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#bc1732] active:scale-[.97] disabled:opacity-50">
                          <Save size={14} />{isActive && updateSetting.isPending ? "Хадгалж байна…" : "Хадгалах"}
                        </button>
                        {isCustom && (
                          <button type="button" disabled={busy} onClick={() => resetSetting(slot.key)} className="inline-flex items-center gap-1.5 rounded-full px-2 py-2.5 text-[11px] font-bold text-[#69717b] transition hover:text-[#df1f3d] disabled:opacity-50">
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
