import { useMemo, useState } from "react";
import { LoaderCircle, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { siteTextSlots, type SiteTextSlotKey } from "@shared/site-text";

type TextRow = { slotKey: string; textValue: string; updatedAt: Date };

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Текстийг хадгалж чадсангүй. Дахин оролдоно уу.";

// Same slot order as shared/site-text.ts, grouped under each entry's
// `group` label for a navigable admin UI instead of one flat 70+-item list.
const GROUPS = Array.from(new Set(siteTextSlots.map(slot => slot.group)));

export default function ContentTextPanel({ preview = false }: { preview?: boolean }) {
  const utils = trpc.useUtils();
  const textQuery = trpc.admin.siteText.useQuery(undefined, { enabled: !preview });
  const updateText = trpc.admin.updateSiteText.useMutation();
  const clearText = trpc.admin.clearSiteText.useMutation();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeSlot, setActiveSlot] = useState<SiteTextSlotKey | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(GROUPS[0] ?? null);

  const textBySlot = useMemo(() => new Map((textQuery.data ?? []).map((row: TextRow) => [row.slotKey, row])), [textQuery.data]);
  const refresh = async () => {
    await Promise.all([utils.admin.siteText.invalidate(), utils.content.siteText.invalidate()]);
  };
  const busy = updateText.isPending || clearText.isPending;

  const saveSlot = async (slotKey: SiteTextSlotKey, fallbackValue: string) => {
    if (preview) return toast.message("Preview горим", { description: "Бодит хадгалалт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    const draft = drafts[slotKey];
    const value = (draft ?? textBySlot.get(slotKey)?.textValue ?? fallbackValue).trim();
    if (!value) return toast.error("Хоосон текст хадгалах боломжгүй.");
    setActiveSlot(slotKey);
    try {
      await updateText.mutateAsync({ slotKey, textValue: value });
      await refresh();
      toast.success("Текстийг хадгаллаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setActiveSlot(null);
    }
  };

  const resetSlot = async (slotKey: SiteTextSlotKey) => {
    if (preview) return toast.message("Preview горим", { description: "Бодит тохиргоо сэргээх нь хамгаалагдсан admin хэсэгт ажиллана." });
    if (!window.confirm("Энэ текстийг SUGI-ийн анхны хувилбар руу буцаах уу?")) return;
    setActiveSlot(slotKey);
    try {
      await clearText.mutateAsync({ slotKey });
      setDrafts(current => { const next = { ...current }; delete next[slotKey]; return next; });
      await refresh();
      toast.success("Анхны текстийг сэргээлээ.");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setActiveSlot(null);
    }
  };

  return <div>
    <div className="rounded-3xl border border-[#3970a7]/15 bg-[#eef5ff] p-5 text-sm text-[#385878]">
      <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#3970a7]" size={19} /><p><strong>Таны өөрчлөлт шууд сайт дээр харагдана.</strong> Нүүр хуудасны гарчиг, тайлбар, товч мэдэгдлүүдийг доор ангиллаар нь эмхэтгэсэн. 2 мөртэй гарчигийг Enter товчоор шинэ мөрөнд шилжүүлж бичнэ үү (эхний мөр, дараа нь хоёр дахь мөр). "Анхны текст рүү буцаах" нь SUGI-ийн одоогийн бичсэн эх текстийг сэргээнэ.</p></div>
    </div>
    <div className="mt-4 rounded-2xl border border-black/8 bg-[#fff8ec] p-4 text-xs leading-5 text-[#7a6a45]">
      <strong>Анхаарна уу:</strong> бүтээгдэхүүний ангиллын нэр (жишээ: "Арьс арчилгаа"), салбарын нэр/хаяг/утас, шинэ мэдээний гарчиг зэрэг бусад системд (Бүтээгдэхүүн, Салбар, Шинэ мэдээ) удирддаг өгөгдөл энд байхгүй -- эдгээрийг холбогдох цэснээс засна уу. Hero badge-ийн бүтээгдэхүүний тоо (жишээ: "900+") одоо бодит каталогийн тооноос автоматаар тооцоологддог (2026-09-04-ээс хойш), гэхдээ доорх "Ангилал" болон "Яагаад биднийг сонгох вэ" бүлгийн текст дотор мөн адил тоог дурдсан өгүүлбэрүүд байгаа тул тэдгээрийг өөрчлөхөд гараар тус тусад нь засах шаардлагатай хэвээр.
    </div>
    {!preview && textQuery.isLoading && <div className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Текстийн тохиргоог уншиж байна…</div>}
    {!preview && textQuery.error && <div className="mt-5 rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{messageFrom(textQuery.error)}</div>}

    <div className="mt-6 grid gap-3">
      {GROUPS.map(group => {
        const slots = siteTextSlots.filter(slot => slot.group === group);
        const isOpen = openGroup === group;
        return (
          <div key={group} className="overflow-hidden rounded-3xl border border-black/8 bg-[#fffdf9]">
            <button
              type="button"
              onClick={() => setOpenGroup(current => (current === group ? null : group))}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">{group}</span>
              <span className="text-[10px] font-extrabold tracking-[.12em] text-[#8a8b8f]">{slots.length} ТЕКСТ {isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && (
              <div className="grid gap-4 border-t border-black/6 p-5">
                {slots.map(slot => {
                  const saved = textBySlot.get(slot.key) as TextRow | undefined;
                  const value = drafts[slot.key] ?? saved?.textValue ?? slot.fallbackValue;
                  const isCustom = Boolean(saved);
                  const isActive = activeSlot === slot.key;
                  return (
                    <div key={slot.key} className="rounded-2xl border border-black/8 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-[var(--font-display)] text-sm font-semibold tracking-[-.02em]">{slot.label}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold tracking-[.12em] ${isCustom ? "bg-[#e7f2ec] text-[#2c7650]" : "bg-[#edf0f5] text-[#606a78]"}`}>{isCustom ? "ЗАСВАРЛАСАН" : "АНХНЫ ТЕКСТ"}</span>
                      </div>
                      {slot.description && <p className="mt-1 text-xs leading-5 text-[#707176]">{slot.description}</p>}
                      <textarea
                        value={value}
                        onChange={event => setDrafts(current => ({ ...current, [slot.key]: event.target.value }))}
                        rows={value.includes("\n") ? 3 : 2}
                        maxLength={4000}
                        className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-normal leading-5 outline-none focus:border-[#3970a7]"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => saveSlot(slot.key, slot.fallbackValue)} className="inline-flex items-center gap-1.5 rounded-full bg-[#df1f3d] px-3.5 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#bc1732] active:scale-[.97] disabled:opacity-50">
                          <Save size={14} />{isActive && updateText.isPending ? "Хадгалж байна…" : "Хадгалах"}
                        </button>
                        {isCustom && (
                          <button type="button" disabled={busy} onClick={() => resetSlot(slot.key)} className="inline-flex items-center gap-1.5 rounded-full px-2 py-2.5 text-[11px] font-bold text-[#69717b] transition hover:text-[#df1f3d] disabled:opacity-50">
                            <RotateCcw size={14} />Анхны текст рүү буцаах
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
