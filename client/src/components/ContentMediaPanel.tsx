import { useMemo, useState, type ChangeEvent } from "react";
import { ImageUp, LoaderCircle, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { logoSlotKeys, siteMediaSlots, type SiteMediaSlotKey } from "@shared/site-media";
import { HERO_SHAPE, IMAGE_UPLOAD_ACCEPT, MAX_UPLOAD_BYTES, isUploadableImageType, prepareImageUpload, type UploadImageType } from "@/lib/prepareImageUpload";
import UploadTips from "@/components/admin/UploadTips";

import { useConfirm } from "@/components/ConfirmDialog";
type MediaRow = { slotKey: string; imageUrl: string; altText: string | null; updatedAt: Date };

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Зургийн тохиргоог хадгалж чадсангүй. Дахин оролдоно уу.";

export default function ContentMediaPanel({ preview = false }: { preview?: boolean }) {
  const { confirm } = useConfirm();
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
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (preview) {
      toast.message("Preview горим", { description: "Зураг байршуулахын тулд хамгаалагдсан /admin хэсэгт нэвтэрнэ үү." });
      return;
    }
    const prepared = await prepareImageUpload(picked, slotKey.startsWith("home-hero") ? HERO_SHAPE : undefined);
    const file = prepared.file;
    if (!isUploadableImageType(file.type) || file.size > MAX_UPLOAD_BYTES) {
      toast.error("JPG, PNG, WEBP эсвэл GIF зураг сонгоно уу (8 MB хүртэл).");
      event.target.value = "";
      return;
    }
    if (prepared.note) toast.message("Зургийг илгээхээс өмнө жижгэрүүлэв", { description: prepared.note });
    if (prepared.warning) toast.warning(prepared.warning);
    setActiveSlot(slotKey);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const stored = await uploadImage.mutateAsync({ fileName: file.name, contentType: file.type as UploadImageType, dataBase64: String(reader.result) });
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
    // 2026-09-23: `onerror` — уншилт уначихвал `activeSlot` тэр чигээрээ
    // үлдэж, карт мөнхөд "Байршуулж байна…" гэж харагддаг байв.
    reader.onerror = () => {
      toast.error("Файлыг уншиж чадсангүй. Өөр файл сонгоно уу.");
      setActiveSlot(null);
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  // 2026-09-12: hero slides 4-6 ship with no brand default at all
  // (fallbackUrl: null) -- they exist so an admin can grow the homepage's
  // opening row to six photographs, and stay invisible on the storefront
  // until one is uploaded. So a slot can legitimately have no image, and
  // there is then no row to attach alt text to.
  const saveAltText = async (slotKey: SiteMediaSlotKey, fallbackUrl: string | null) => {
    if (preview) return toast.message("Preview горим", { description: "Бодит хадгалалт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    const existingRow = mediaBySlot.get(slotKey) as MediaRow | undefined;
    const targetUrl = existingRow?.imageUrl ?? fallbackUrl;
    if (!targetUrl) return toast.message("Энэ слотод зураг алга", { description: "Эхлээд \"Зураг солих\" дарж зураг оруулна уу." });
    setActiveSlot(slotKey);
    try {
      const existing = mediaBySlot.get(slotKey) as MediaRow | undefined;
      await updateMedia.mutateAsync({ slotKey, imageUrl: existing?.imageUrl ?? targetUrl, altText: altDrafts[slotKey] ?? existing?.altText ?? null });
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
    if (!await confirm({ title: "Энэ зургийг анхны дизайн руу буцаах уу?" })) return;
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
    <div className="rounded-3xl border border-[#3970a7]/15 bg-[var(--a-info-soft)] p-5 text-sm text-[var(--a-info)]">
      <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[var(--a-info)]" size={19} /><p><strong>Таны өөрчлөлт шууд сайт дээр харагдана.</strong> Доорх хэсэг бүрт зураг оруулаад, шаардлагатай бол товч тайлбар нэмнэ үү. “Анхны зураг руу буцаах” нь кодонд суулгасан анхдагч зургийг сэргээнэ.</p></div>
    </div>
    {!preview && mediaQuery.isLoading && <div className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Зургийн тохиргоог уншиж байна…</div>}
    {!preview && mediaQuery.error && <div className="mt-5 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(mediaQuery.error)}</div>}
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      {siteMediaSlots.map(slot => {
        const saved = mediaBySlot.get(slot.key) as MediaRow | undefined;
        const imageUrl = saved?.imageUrl ?? slot.fallbackUrl;
        const isActive = activeSlot === slot.key;
        // Лого бол гэрэл зураг биш: тайрахгүй бүтнээр нь, цагаан тавцан дээр
        // (бараан бэх + ил тод дэвсгэр нь харанхуй картан дээр алга болдог).
        const isLogo = logoSlotKeys.has(slot.key);
        return <article key={slot.key} className="overflow-hidden rounded-3xl border border-[var(--a-border)] bg-[var(--a-card)] shadow-[0_12px_24px_rgba(30,30,30,.05)]">
          <div className={`h-44 bg-center ${isLogo ? "bg-white bg-contain bg-no-repeat p-7" : "bg-[var(--a-soft)] bg-cover"}`} style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined} aria-label={saved?.altText || slot.label} role="img"><div className={`flex h-full p-4 ${isLogo ? "items-start" : "items-end"}${imageUrl && !isLogo ? " bg-gradient-to-t from-black/55 via-transparent to-transparent" : ""}`}><span className="rounded-full bg-white/92 px-2.5 py-1 text-[9px] font-extrabold tracking-[.12em] text-[var(--a-text)]">{saved ? "CUSTOM IMAGE" : imageUrl ? "BRAND DEFAULT" : "ЗУРАГ ОРУУЛААГҮЙ"}</span></div></div>
          <div className="p-4"><p className="text-[10px] font-extrabold tracking-[.15em] text-[#df1f3d]">{slot.key.toUpperCase()}</p><h3 className="mt-1 font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">{slot.label}</h3><p className="mt-1 min-h-9 text-xs leading-5 text-[var(--a-muted)]">{slot.description}</p>
            <label className="mt-4 grid gap-1.5 text-[11px] font-bold text-[var(--a-text-soft)]">Зургийн тайлбар (accessibility)<input value={altDrafts[slot.key] ?? saved?.altText ?? ""} onChange={event => setAltDrafts(current => ({ ...current, [slot.key]: event.target.value }))} placeholder={slot.label} maxLength={240} className="h-10 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#3970a7]" /></label>
            {/* 2026-09-27 (F-media): saving alt text on a BRAND DEFAULT slot
                (no `saved` row yet) used to write the fallback's own URL in
                as if it were a chosen image -- the slot silently became
                "CUSTOM IMAGE" and stopped following the code default, purely
                from typing a description. Alt text on a default slot needs
                its own server-side field (out of scope here); until then,
                only let this button run once the slot already has a real
                uploaded image. */}
            <div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#df1f3d] px-3.5 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#bc1732] active:scale-[.97]"><ImageUp size={15} />{isActive && uploadImage.isPending ? "Байршуулж байна…" : "Зураг солих"}<input type="file" className="sr-only" accept={IMAGE_UPLOAD_ACCEPT} disabled={busy} onChange={uploadForSlot(slot.key)} /></label><button type="button" disabled={busy || !saved} title={!saved ? "Эхлээд өөрийн зураг оруулна уу — брэндийн үндсэн зурагт тайлбар хадгалах боломжгүй." : undefined} onClick={() => saveAltText(slot.key, slot.fallbackUrl)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-2.5 text-[11px] font-bold text-[var(--a-text-soft)] transition hover:border-[#3970a7] hover:text-[var(--a-info)] disabled:opacity-50"><Save size={14} />Тайлбар хадгалах</button>{saved && <button type="button" disabled={busy} onClick={() => resetSlot(slot.key)} className="inline-flex items-center gap-1.5 rounded-full px-2 py-2.5 text-[11px] font-bold text-[var(--a-muted)] transition hover:text-[#df1f3d] disabled:opacity-50"><RotateCcw size={14} />Буцаах</button>}</div>
            {!saved && imageUrl && <p className="mt-1.5 text-[10px] leading-4 text-[var(--a-faint)]">Энэ бол брэндийн үндсэн зураг — тайлбар хадгалахын тулд эхлээд өөрийн зураг оруулна уу.</p>}
            <UploadTips kind={logoSlotKeys.has(slot.key) ? "logo" : slot.key.startsWith("home-hero") ? "hero" : "general"} defaultOpen={false} className="mt-3" />
          </div>
        </article>;
      })}
    </div>
  </div>;
}
