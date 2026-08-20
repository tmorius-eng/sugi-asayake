import { useMemo, useState, type ChangeEvent } from "react";
import { ImageUp, LoaderCircle, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { siteMediaSlots, type SiteMediaSlotKey } from "@shared/site-media";

type MediaRow = { slotKey: string; imageUrl: string; altText: string | null; updatedAt: Date };

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Зургийн тохиргоог хадгалж чадсангүй. Дахин оролдоно уу.";

export default function ContentMediaPanel({ preview = false }: { preview?: boolean }) {
  const utils = trpc.useUtils();
  const mediaQuery = trpc.admin.siteMedia.useQuery(undefined, { enabled: !preview });
  const uploadImage = trpc.admin.uploadSiteMediaImage.useMutation();
  const updateMedia = trpc.admin.updateSiteMedia.useMutation();
  const clearMedia = trpc.admin.clearSiteMedia.useMutation();
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [activeSlot, setActiveSlot] = useState<SiteMediaSlotKey | null>(null);

  const mediaBySlot = useMemo(() => new Map((mediaQuery.data ?? []).map((media: MediaRow) => [media.slotKey, media])), [mediaQuery.data]);
  const refresh = async () => {
    await Promise.all([utils.admin.siteMedia.invalidate(), utils.content.siteMedia.invalidate()]);
  };
  const busy = uploadImage.isPending || updateMedia.isPending || clearMedia.isPending;

  const uploadForSlot = (slotKey: SiteMediaSlotKey) => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview) {
      toast.message("Preview горим", { description: "Зураг байршуулахын тулд хамгаалагдсан /admin хэсэгт нэвтэрнэ үү." });
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      toast.error("JPG, PNG, WEBP форматтай, 8 MB-аас бага зураг сонгоно уу.");
      event.target.value = "";
      return;
    }
    setActiveSlot(slotKey);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const stored = await uploadImage.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: String(reader.result) });
        const existing = mediaBySlot.get(slotKey) as MediaRow | undefined;
        await updateMedia.mutateAsync({ slotKey, imageUrl: stored.url, altText: altDrafts[slotKey] ?? existing?.altText ?? null });
        await refresh();
        toast.success("Зураг нийтлэхэд бэлэн боллоо.");
      } catch (error) {
        toast.error(messageFrom(error));
      } finally {
        setActiveSlot(null);
        event.target.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  const saveAltText = async (slotKey: SiteMediaSlotKey, fallbackUrl: string) => {
    if (preview) return toast.message("Preview горим", { description: "Бодит хадгалалт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    setActiveSlot(slotKey);
    try {
      const existing = mediaBySlot.get(slotKey) as MediaRow | undefined;
      await updateMedia.mutateAsync({ slotKey, imageUrl: existing?.imageUrl ?? fallbackUrl, altText: altDrafts[slotKey] ?? existing?.altText ?? null });
      await refresh();
      toast.success("Зургийн тайлбарыг хадгаллаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setActiveSlot(null);
    }
  };

  const resetSlot = async (slotKey: SiteMediaSlotKey) => {
    if (preview) return toast.message("Preview горим", { description: "Бодит тохиргоо сэргээх нь хамгаалагдсан admin хэсэгт ажиллана." });
    if (!window.confirm("Энэ зургийг SUGI-ийн анхны дизайн руу буцаах уу?")) return;
    setActiveSlot(slotKey);
    try {
      await clearMedia.mutateAsync({ slotKey });
      await refresh();
      toast.success("Анхны брэнд зургийг сэргээлээ.");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setActiveSlot(null);
    }
  };

  return <div>
    <div className="rounded-3xl border border-[#3970a7]/15 bg-[#eef5ff] p-5 text-sm text-[#385878]">
      <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[#3970a7]" size={19} /><p><strong>Таны өөрчлөлт шууд сайт дээр харагдана.</strong> Доорх хэсэг бүрт зураг оруулаад, шаардлагатай бол товч тайлбар нэмнэ үү. “Анхны зураг руу буцаах” нь SUGI-ийн одоогийн дизайны зургийг сэргээнэ.</p></div>
    </div>
    {!preview && mediaQuery.isLoading && <div className="mt-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Зургийн тохиргоог уншиж байна…</div>}
    {!preview && mediaQuery.error && <div className="mt-5 rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{messageFrom(mediaQuery.error)}</div>}
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      {siteMediaSlots.map(slot => {
        const saved = mediaBySlot.get(slot.key) as MediaRow | undefined;
        const imageUrl = saved?.imageUrl ?? slot.fallbackUrl;
        const isActive = activeSlot === slot.key;
        return <article key={slot.key} className="overflow-hidden rounded-3xl border border-black/8 bg-[#fffdf9] shadow-[0_12px_24px_rgba(30,30,30,.05)]">
          <div className="h-44 bg-[#e8eced] bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }} aria-label={saved?.altText || slot.label} role="img"><div className="flex h-full items-end bg-gradient-to-t from-black/55 via-transparent to-transparent p-4"><span className="rounded-full bg-white/92 px-2.5 py-1 text-[9px] font-extrabold tracking-[.12em] text-[#202124]">{saved ? "CUSTOM IMAGE" : "BRAND DEFAULT"}</span></div></div>
          <div className="p-4"><p className="text-[10px] font-extrabold tracking-[.15em] text-[#df1f3d]">{slot.key.toUpperCase()}</p><h3 className="mt-1 font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">{slot.label}</h3><p className="mt-1 min-h-9 text-xs leading-5 text-[#707176]">{slot.description}</p>
            <label className="mt-4 grid gap-1.5 text-[11px] font-bold text-[#4e5055]">Зургийн тайлбар (accessibility)<input value={altDrafts[slot.key] ?? saved?.altText ?? ""} onChange={event => setAltDrafts(current => ({ ...current, [slot.key]: event.target.value }))} placeholder={slot.label} maxLength={240} className="h-10 rounded-xl border border-black/10 bg-white px-3 text-xs font-normal outline-none focus:border-[#3970a7]" /></label>
            <div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#df1f3d] px-3.5 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#bc1732] active:scale-[.97]"><ImageUp size={15} />{isActive && uploadImage.isPending ? "Байршуулж байна…" : "Зураг солих"}<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={uploadForSlot(slot.key)} /></label><button type="button" disabled={busy} onClick={() => saveAltText(slot.key, slot.fallbackUrl)} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-2.5 text-[11px] font-bold text-[#51535a] transition hover:border-[#3970a7] hover:text-[#3970a7] disabled:opacity-50"><Save size={14} />Тайлбар хадгалах</button>{saved && <button type="button" disabled={busy} onClick={() => resetSlot(slot.key)} className="inline-flex items-center gap-1.5 rounded-full px-2 py-2.5 text-[11px] font-bold text-[#69717b] transition hover:text-[#df1f3d] disabled:opacity-50"><RotateCcw size={14} />Буцаах</button>}</div>
          </div>
        </article>;
      })}
    </div>
  </div>;
}
