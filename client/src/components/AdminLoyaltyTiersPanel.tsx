import { useState } from "react";
import { LoaderCircle, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";

type TierRow = {
  id: number;
  name: string;
  discountPercent: number;
  minSpendMnt: number;
  sortOrder: number;
};

type TierDraft = { id: number | null; name: string; discountPercent: string; minSpendMnt: string; sortOrder: string };

const emptyDraft = (): TierDraft => ({ id: null, name: "", discountPercent: "0", minSpendMnt: "0", sortOrder: "0" });
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хадгалж чадсангүй. Дахин оролдоно уу.";

/**
 * /admin -> Гишүүнчлэлийн зэрэглэл (2026-09-12).
 *
 * The cumulative-spend discount ladder, previously a TypeScript constant.
 * Unlike the copy panels this one is gated to `admin` rather than
 * `marketing`, and the warning below is not decoration: these percentages
 * are applied to real orders at checkout (server/db.ts's
 * getApplicableLoyaltyDiscount), and raising one immediately changes what
 * every qualifying customer is charged on their next order.
 *
 * Deleting the last tier is refused server-side, because an empty table
 * falls back to the code constant -- "delete them all" would look like it
 * worked here and then silently restore the original four on the
 * storefront.
 */
export default function AdminLoyaltyTiersPanel({ preview = false }: { preview?: boolean }) {
  const utils = trpc.useUtils();
  const tiersQuery = trpc.admin.loyaltyTiers.useQuery(undefined, { enabled: !preview });
  const saveTier = trpc.admin.saveLoyaltyTier.useMutation();
  const removeTier = trpc.admin.deleteLoyaltyTier.useMutation();
  const [draft, setDraft] = useState<TierDraft | null>(null);

  const tiers = (tiersQuery.data ?? []) as TierRow[];
  const busy = saveTier.isPending || removeTier.isPending;
  const refresh = async () => {
    await Promise.all([
      utils.admin.loyaltyTiers.invalidate(),
      utils.content.loyaltyTiers.invalidate(),
      // The shopper-facing status card embeds the ladder, so it has to be
      // refetched too or the profile page would show a stale table.
      utils.loyalty.myStatus.invalidate(),
    ]);
  };

  const submit = async () => {
    if (preview) return toast.message("Preview горим", { description: "Бодит хадгалалт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    if (!draft) return;
    const discountPercent = Number(draft.discountPercent);
    const minSpendMnt = Number(draft.minSpendMnt);
    const sortOrder = Number(draft.sortOrder);
    if (!draft.name.trim()) return toast.error("Зэрэглэлийн нэрийг бөглөнө үү.");
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) return toast.error("Хөнгөлөлт 0–100 хооронд байх ёстой.");
    if (!Number.isFinite(minSpendMnt) || minSpendMnt < 0) return toast.error("Доод дүнг зөв оруулна уу.");
    if (!Number.isFinite(sortOrder) || sortOrder < 0) return toast.error("Эрэмбийг зөв оруулна уу.");
    try {
      await saveTier.mutateAsync({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        discountPercent,
        minSpendMnt,
        sortOrder,
      });
      await refresh();
      setDraft(null);
      toast.success("Зэрэглэлийг хадгаллаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const remove = async (tier: TierRow) => {
    if (preview) return toast.message("Preview горим", { description: "Бодит устгалт зөвхөн хамгаалагдсан admin хэсэгт ажиллана." });
    if (!window.confirm(`"${tier.name}" зэрэглэлийг устгах уу? Энэ зэрэглэлд байсан харилцагчид доод зэрэглэл рүү шилжинэ.`)) return;
    try {
      await removeTier.mutateAsync({ id: tier.id });
      await refresh();
      toast.success("Зэрэглэлийг устгалаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return <div>
    <div className="rounded-3xl border border-[#f0b52d]/30 bg-[var(--a-warn-soft)] p-5 text-sm text-[var(--a-warn)]">
      <div className="flex gap-3">
        <TriangleAlert className="mt-0.5 shrink-0" size={19} />
        <p>
          <strong>Эдгээр хувь захиалга бүрийн үнэд шууд нөлөөлнө.</strong>{" "}
          Харилцагчийн нийт худалдан авалт (онлайн + салбарт гараар бүртгэсэн) доод дүнд хүрмэгц тухайн зэрэглэлийн хөнгөлөлт дараагийн захиалгад автоматаар бодогдоно. Доод дүнгээр нь өсөх дарааллаар жагсаана.
        </p>
      </div>
    </div>

    {!preview && tiersQuery.isLoading && (
      <div className="mt-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Зэрэглэлүүдийг уншиж байна…</div>
    )}
    {!preview && tiersQuery.error && (
      <div className="mt-5 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(tiersQuery.error)}</div>
    )}

    <div className="mt-5 grid gap-2">
      {tiers.map(tier => (
        <div key={tier.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)] p-4">
          <div className="min-w-0 flex-1">
            <strong className="block text-sm">{tier.name}</strong>
            <span className="mt-0.5 block text-[11px] text-[var(--a-muted)]">
              {tier.minSpendMnt > 0 ? `${formatMnt(tier.minSpendMnt)}-с эхлэн` : "0₮-с эхлэн"}
            </span>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--a-soft)] px-3 py-1 text-xs font-extrabold">
            {tier.discountPercent > 0 ? `−${tier.discountPercent}%` : "Хямдралгүй"}
          </span>
          <button type="button" disabled={busy} onClick={() => setDraft({ id: tier.id, name: tier.name, discountPercent: String(tier.discountPercent), minSpendMnt: String(tier.minSpendMnt), sortOrder: String(tier.sortOrder) })} className="shrink-0 rounded-full border border-[var(--a-border)] px-3 py-2 text-[11px] font-bold transition hover:border-[#3970a7] disabled:opacity-55">
            Засах
          </button>
          <button type="button" disabled={busy || tiers.length <= 1} onClick={() => remove(tier)} title={tiers.length <= 1 ? "Хамгийн багадаа нэг зэрэглэл үлдэх ёстой." : undefined} className="shrink-0 rounded-full p-2 text-[var(--a-faint)] transition hover:text-[#df1f3d] disabled:opacity-40" aria-label={`${tier.name} устгах`}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>

    {!draft ? (
      <button type="button" onClick={() => setDraft(emptyDraft())} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#df1f3d] px-4 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#bc1732]">
        <Plus size={14} />Шинэ зэрэглэл
      </button>
    ) : (
      <div className="mt-4 rounded-3xl border border-[#3970a7]/25 bg-[var(--a-info-soft)] p-5">
        <h3 className="font-[var(--font-display)] text-base font-semibold tracking-[-.03em]">{draft.id ? "Зэрэглэл засах" : "Шинэ зэрэглэл"}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold">Нэр
            <input value={draft.name} onChange={event => setDraft(current => current && { ...current, name: event.target.value })} maxLength={60} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" />
          </label>
          <label className="grid gap-1.5 text-xs font-bold">Хөнгөлөлт (%)
            <input type="number" min={0} max={100} value={draft.discountPercent} onChange={event => setDraft(current => current && { ...current, discountPercent: event.target.value })} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" />
          </label>
          <label className="grid gap-1.5 text-xs font-bold">Доод дүн (₮)
            <input type="number" min={0} value={draft.minSpendMnt} onChange={event => setDraft(current => current && { ...current, minSpendMnt: event.target.value })} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" />
            <span className="text-[11px] font-normal leading-4 text-[var(--a-muted)]">Нийт худалдан авалт энэ дүнд хүрсэн харилцагч энэ зэрэглэлд орно.</span>
          </label>
          <label className="grid gap-1.5 text-xs font-bold">Эрэмбэ
            <input type="number" min={0} value={draft.sortOrder} onChange={event => setDraft(current => current && { ...current, sortOrder: event.target.value })} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" />
            <span className="text-[11px] font-normal leading-4 text-[var(--a-muted)]">Ижил доод дүнтэй зэрэглэлүүдийг ялгахад л хэрэглэгдэнэ.</span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={submit} className="inline-flex items-center gap-1.5 rounded-full bg-[#df1f3d] px-4 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#bc1732] disabled:opacity-55">
            <Save size={14} />{saveTier.isPending ? "Хадгалж байна…" : "Хадгалах"}
          </button>
          <button type="button" disabled={busy} onClick={() => setDraft(null)} className="rounded-full px-3 py-2.5 text-[11px] font-bold text-[var(--a-muted)] transition hover:text-[var(--a-text)] disabled:opacity-55">
            Болих
          </button>
        </div>
      </div>
    )}
  </div>;
}
