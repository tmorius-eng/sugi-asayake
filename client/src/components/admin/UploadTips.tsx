import { ImageUp, Sparkles } from "lucide-react";
import { UPLOAD_AUTO_NOTE, UPLOAD_TIPS, type UploadTipKind } from "@shared/upload-tips";
import { useAdminTipsEnabled } from "@/lib/adminTips";

/**
 * Зураг оруулах товчны хажууд: ямар хэлбэр, хэмжээ, формат оруулах, систем
 * юуг өөрөө хийдэг (2026-09-21, Tom).
 *
 * Хэсгийн дээд талын AdminSectionTip-ийн ижил өнгө, ижил унтраалга
 * (дээд мөрийн 💡) — заавар унтраасан хүнд энэ ч гарахгүй. Ганц upload-тай
 * маягтад нээлттэй эхэлнэ (шинэ ажилтан хамгийн түрүүнд харах ёстой);
 * Content & Media шиг олон карттай дэлгэцэд хураалттай (`defaultOpen={false}`)
 * — 15 карт бүр дээр нээлттэй бол зааврын дунд зураг олдохгүй.
 */
export default function UploadTips({ kind, className = "", defaultOpen = true }: { kind: UploadTipKind; className?: string; defaultOpen?: boolean }) {
  const enabled = useAdminTipsEnabled();
  if (!enabled) return null;
  const tip = UPLOAD_TIPS[kind];
  return (
    <details open={defaultOpen} className={`upload-tips rounded-2xl border border-[#3970a7]/20 bg-[var(--a-info-soft)] px-4 py-3 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-[var(--a-info)]">
        <ImageUp size={15} aria-hidden="true" />
        {`${tip.title} оруулах зөвлөмж`}
      </summary>
      <ul className="mt-2.5 grid gap-1.5">
        {tip.points.map(point => (
          <li key={point} className="flex items-start gap-2 text-[11.5px] leading-5 text-[var(--a-text-soft)]">
            <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--a-info)]/50" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 flex items-start gap-2 text-[11px] leading-5 text-[var(--a-muted)]">
        <Sparkles className="mt-0.5 shrink-0" size={13} aria-hidden="true" />
        <span>{UPLOAD_AUTO_NOTE}</span>
      </p>
    </details>
  );
}
