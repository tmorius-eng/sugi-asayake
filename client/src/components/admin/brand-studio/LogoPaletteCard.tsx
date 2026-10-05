import { LoaderCircle, Pipette } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/lib/trpc";

/**
 * Брэнд студи → "Логоноос палитр" (A2, 2026-10-05). Сайтын логоноос гол өнгийг гаргаж 3 палитр санал
 * болгоно; дарахад зөвхөн НООРОГ (draft) өөрчлөгдөж, баруун талын preview-д харагдана — хадгалах нь
 * админы шийдвэр. Палитр бүр AA-д засагдсан (shared/color/palette.ts).
 */
type Result = RouterOutputs["admin"]["brandStudio"]["derivePalette"];

export default function LogoPaletteCard({ result, onResult, onApply }: {
  result: Result | null;
  onResult: (result: Result) => void;
  onApply: (light: Result["palettes"][number]["light"], name: string) => void;
}) {
  const derive = trpc.admin.brandStudio.derivePalette.useMutation({
    onSuccess: data => {
      onResult(data);
      if (!data.brand) toast.message("Логон дээр тод өнгө олдсонгүй", { description: "Хар-цагаан лого байна — өнгөө гараар сонгоно уу." });
    },
    onError: error => toast.error(error.message),
  });

  return (
    <section className="rounded-2xl border border-dashed border-[var(--a-border-strong)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pipette size={15} className="text-[var(--a-accent-violet)]" />
        <h4 className="text-xs font-extrabold">Логоноос палитр</h4>
        <p className="text-[11px] text-[var(--a-muted)]">Лого солигдсон бол өнгийг нь автоматаар гаргана.</p>
        <button type="button" onClick={() => derive.mutate()} disabled={derive.isPending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--a-accent-violet)] px-3 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-50">
          {derive.isPending && <LoaderCircle className="animate-spin" size={13} />}Логоноос өнгө гаргах
        </button>
      </div>
      {result && (
        <div className="mt-3 grid gap-3">
          <div className="flex items-center gap-3">
            <img src={result.logoUrl} alt="Сайтын лого" className="h-8 max-w-[140px] object-contain" />
            <span className="flex gap-1" aria-label="Логоны гол өнгө">
              {result.swatches.map(swatch => <span key={swatch.hex} title={`${swatch.hex} · ${Math.round(swatch.weight * 100)}%`} className="size-5 rounded-md border border-black/10" style={{ background: swatch.hex }} />)}
            </span>
          </div>
          {result.palettes.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {result.palettes.map(palette => (
                <button key={palette.key} type="button" onClick={() => onApply(palette.light, palette.name)}
                  className="group overflow-hidden rounded-xl border border-[var(--a-border)] text-left transition hover:border-[var(--a-info)]">
                  <span className="block h-2" style={{ background: palette.light["promo-bar-bg"] }} />
                  <span className="flex items-center gap-2 p-2" style={{ background: palette.light.background }}>
                    <span className="h-6 flex-1 rounded-md" style={{ background: palette.light.card }} />
                    <span className="rounded-full px-2 py-1 text-[10px] font-extrabold" style={{ background: palette.light.primary, color: palette.light["primary-foreground"] }}>Сагс</span>
                  </span>
                  <span className="block px-2 py-1.5 text-[11px] font-extrabold group-hover:text-[var(--a-info)]">{palette.name} — туршиж үзэх</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
