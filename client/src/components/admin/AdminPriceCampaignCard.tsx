import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Percent } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatMnt } from "@shared/format";
import { useConfirm } from "@/components/ConfirmDialog";
import { useFieldErrors, FieldError } from "@/hooks/useFieldErrors";

/**
 * Бүх барааны нийтийн хямдрал (2026-09-29, docs/SITEWIDE-SALE-PLAN.md §3).
 *
 * DB-ийн барааны үнэ хэзээ ч өөрчлөгдөхгүй -- эхлэх/дуусах цагт сервер
 * автоматаар асааж/унтраадаг "давхарга". Зөвхөн admin үүсгэж/засаж/зогсоож
 * чадна (server/routers.ts-ийн admin.savePriceCampaign гэх мэт adminProcedure).
 */

const messageFrom = (error: unknown) => (error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.");

type PriceCampaignRow = {
  id: number;
  name: string;
  percentOff: number;
  startsAt: string | Date;
  endsAt: string | Date;
  stoppedAt: string | Date | null;
  createdAt: string | Date;
};

type CampaignForm = { id: number | null; name: string; percentOff: string; startsAt: string; endsAt: string };

const emptyForm = (): CampaignForm => ({ id: null, name: "", percentOff: "", startsAt: "", endsAt: "" });

// <input type="datetime-local"> Улаанбаатарын (клиентийн) орон нутгийн цагаар
// "YYYY-MM-DDTHH:mm" авдаг/өгдөг -- AdminPromotionsPanel.tsx-ийн ижил загвар.
const toLocalInputValue = (value: string | Date | null) => {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function campaignStatus(campaign: PriceCampaignRow, now: number): { label: string; tone: "pos" | "info" | "muted" | "neg" } {
  if (campaign.stoppedAt) return { label: "Зогсоосон", tone: "neg" };
  const starts = new Date(campaign.startsAt).getTime();
  const ends = new Date(campaign.endsAt).getTime();
  if (now < starts) return { label: "Хүлээгдэж буй", tone: "info" };
  if (now >= ends) return { label: "Дууссан", tone: "muted" };
  return { label: "Идэвхтэй", tone: "pos" };
}

export default function AdminPriceCampaignCard() {
  const { confirm } = useConfirm();
  const utils = trpc.useUtils();
  const { fieldProps, errorFor, showErrors, clearError } = useFieldErrors();

  const campaignsQuery = trpc.admin.priceCampaigns.useQuery();
  const [form, setForm] = useState<CampaignForm>(emptyForm());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const percentNumber = Number(form.percentOff);
  const debouncedPercent = useDebouncedNumber(percentNumber, 400);
  const previewEnabled = Number.isInteger(debouncedPercent) && debouncedPercent >= 1 && debouncedPercent <= 90;
  const previewQuery = trpc.admin.previewPriceCampaign.useQuery(
    { percentOff: previewEnabled ? debouncedPercent : 1 },
    { enabled: previewEnabled },
  );

  const savePriceCampaign = trpc.admin.savePriceCampaign.useMutation({
    onSuccess: () => {
      toast.success(form.id ? "Хямдрал шинэчлэгдлээ." : "Хямдрал үүслээ.");
      utils.admin.priceCampaigns.invalidate();
      setForm(emptyForm());
    },
    onError: error => toast.error(messageFrom(error)),
  });
  const stopPriceCampaign = trpc.admin.stopPriceCampaign.useMutation({
    onSuccess: () => { toast.success("Хямдрал зогслоо. Барааны үнэ анхных руугаа буцлаа."); utils.admin.priceCampaigns.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });
  const deletePriceCampaign = trpc.admin.deletePriceCampaign.useMutation({
    onSuccess: () => { toast.success("Хямдрал устгагдлаа."); utils.admin.priceCampaigns.invalidate(); },
    onError: error => toast.error(messageFrom(error)),
  });

  const campaigns = (campaignsQuery.data ?? []) as PriceCampaignRow[];
  const liveCampaign = campaigns.find(campaign => campaignStatus(campaign, now).tone === "pos");
  const upcomingCampaign = !liveCampaign ? campaigns.find(campaign => campaignStatus(campaign, now).tone === "info") : undefined;

  const editCampaign = (campaign: PriceCampaignRow) => {
    if (campaign.stoppedAt) return;
    setForm({
      id: campaign.id,
      name: campaign.name,
      percentOff: String(campaign.percentOff),
      startsAt: toLocalInputValue(campaign.startsAt),
      endsAt: toLocalInputValue(campaign.endsAt),
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 2) errors.pcName = "Нэр дор хаяж 2 тэмдэгт байна.";
    const percent = Number(form.percentOff);
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) errors.pcPercentOff = "Хувь 1–90 хооронд бүхэл тоо байна.";
    if (!form.startsAt) errors.pcStartsAt = "Эхлэх огноог сонгоно уу.";
    if (!form.endsAt) errors.pcEndsAt = "Дуусах огноог сонгоно уу.";
    const startsAt = form.startsAt ? new Date(form.startsAt) : null;
    const endsAt = form.endsAt ? new Date(form.endsAt) : null;
    if (startsAt && endsAt && !(endsAt.getTime() > startsAt.getTime())) errors.pcEndsAt = "Дуусах цаг эхлэх цагаас хойш байх ёстой.";
    if (endsAt && endsAt.getTime() <= Date.now()) errors.pcEndsAt = "Дуусах цаг өнгөрсөн байна.";
    if (showErrors(errors)) return;
    if (!startsAt || !endsAt) return;

    const confirmed = await confirm({
      title: form.id ? "Хямдралын өөрчлөлтийг хадгалах уу?" : "Шинэ нийтийн хямдрал эхлүүлэх үү?",
      body: `"${form.name.trim()}" — бэлгийн картаас бусад бүх бараанд -${percent}% (аль хэдийн хямдралтай бараа хэвээр), ${startsAt.toLocaleString("mn-MN")}-с ${endsAt.toLocaleString("mn-MN")} хүртэл.`,
      danger: percent >= 50,
      confirmLabel: form.id ? "Хадгалах" : "Эхлүүлэх",
    });
    if (!confirmed) return;

    await savePriceCampaign.mutateAsync({
      id: form.id ?? undefined,
      name: form.name.trim(),
      percentOff: percent,
      startsAt,
      endsAt,
    });
  };

  const doStop = async (campaign: PriceCampaignRow) => {
    const confirmed = await confirm({ title: `"${campaign.name}" хямдралыг одоо зогсоох уу?`, body: "Барааны үнэ шууд анхных руугаа буцна.", danger: true, confirmLabel: "Зогсоох" });
    if (!confirmed) return;
    stopPriceCampaign.mutate({ id: campaign.id });
  };

  const doDelete = async (campaign: PriceCampaignRow) => {
    const confirmed = await confirm({ title: `"${campaign.name}" хямдралыг бүрмөсөн устгах уу?`, danger: true });
    if (!confirmed) return;
    deletePriceCampaign.mutate({ id: campaign.id });
  };

  const preview = previewEnabled ? previewQuery.data : undefined;
  const isSaving = savePriceCampaign.isPending;

  return (
    <div className="mb-6 rounded-3xl border border-[var(--a-border)] bg-[var(--a-card)] p-5">
      <div className="flex items-center gap-2">
        <Percent size={16} className="text-[#df1f3d]" />
        <h3 className="font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">Бүх барааны хямдрал</h3>
      </div>
      <p className="mt-1.5 text-xs text-[var(--a-muted)]">
        DB-ийн үнэ өөрчлөгдөхгүй -- эхлэх/дуусах цагт автоматаар асаж унтарна. Бэлгийн карт ба аль хэдийн хямдралтай бараа хамрагдахгүй. Купон, гишүүнчлэлийн хямдрал дээр нь нэмэгдэнэ. Касс, утсаар авсан захиалгад ч хэрэглэгдэнэ.
      </p>

      <div className="mt-3">
        {liveCampaign && (
          <p className="rounded-xl bg-[var(--a-pos-soft)] px-3 py-2 text-xs font-bold text-[var(--a-pos)]">
            {`Идэвхтэй: "${liveCampaign.name}" -${liveCampaign.percentOff}%, ${new Date(liveCampaign.endsAt).toLocaleString("mn-MN")} хүртэл.`}
          </p>
        )}
        {!liveCampaign && upcomingCampaign && (
          <p className="rounded-xl bg-[var(--a-soft)] px-3 py-2 text-xs font-bold text-[var(--a-info)]">
            {`Хүлээгдэж буй: "${upcomingCampaign.name}" -${upcomingCampaign.percentOff}%, ${new Date(upcomingCampaign.startsAt).toLocaleString("mn-MN")}-с эхэлнэ.`}
          </p>
        )}
        {!liveCampaign && !upcomingCampaign && (
          <p className="rounded-xl bg-[var(--a-soft)] px-3 py-2 text-xs font-bold text-[var(--a-muted)]">Одоогоор нийтийн хямдрал алга.</p>
        )}
      </div>

      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">
          Нэр
          <input {...fieldProps("pcName")} value={form.name} onChange={event => { setForm(current => ({ ...current, name: event.target.value })); clearError("pcName"); }} placeholder="Жишээ: Намрын нийтийн хямдрал" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" />
          <FieldError field="pcName" message={errorFor("pcName")} />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">
          Хувь (1–90)
          <input {...fieldProps("pcPercentOff")} type="number" min={1} max={90} step={1} value={form.percentOff} onChange={event => { setForm(current => ({ ...current, percentOff: event.target.value })); clearError("pcPercentOff"); }} placeholder="20" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" />
          <FieldError field="pcPercentOff" message={errorFor("pcPercentOff")} />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">
          Эхлэх огноо-цаг
          <input {...fieldProps("pcStartsAt")} type="datetime-local" value={form.startsAt} onChange={event => { setForm(current => ({ ...current, startsAt: event.target.value })); clearError("pcStartsAt"); }} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" />
          <FieldError field="pcStartsAt" message={errorFor("pcStartsAt")} />
        </label>
        <label className="grid gap-1.5 text-xs font-bold">
          Дуусах огноо-цаг
          <input {...fieldProps("pcEndsAt")} type="datetime-local" value={form.endsAt} onChange={event => { setForm(current => ({ ...current, endsAt: event.target.value })); clearError("pcEndsAt"); }} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" />
          <FieldError field="pcEndsAt" message={errorFor("pcEndsAt")} />
        </label>

        {previewEnabled && (
          <div className="rounded-2xl bg-[var(--a-soft)] p-4 text-xs text-[var(--a-muted)] sm:col-span-2">
            {previewQuery.isFetching && !preview ? (
              <p className="flex items-center gap-2"><LoaderCircle className="animate-spin" size={14} />Тооцож байна…</p>
            ) : preview ? (
              <>
                <p className="font-bold text-[var(--a-text)]">
                  {`${preview.affected} бараа хямдарна · ${preview.alreadyDiscounted} аль хэдийн хямдралтай (хэвээр) · ${preview.giftCards} бэлгийн карт (хамрагдахгүй)${preview.lowestMnt !== null ? ` · хамгийн бага үнэ ${formatMnt(preview.lowestMnt)}` : ""}`}
                </p>
                {preview.examples.length > 0 && (
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {preview.examples.map(example => (
                      <li key={example.id} className="truncate">{`${example.name}: ${formatMnt(example.fromMnt)} → ${formatMnt(example.toMnt)}`}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </div>
        )}

        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">
            {isSaving && <LoaderCircle className="animate-spin" size={15} />}
            {form.id ? "Өөрчлөлт хадгалах" : "Хямдрал эхлүүлэх"}
          </button>
          {form.id && <button type="button" onClick={() => setForm(emptyForm())} className="text-xs font-bold text-[var(--a-muted)]">Цуцлах</button>}
        </div>
      </form>

      {campaigns.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[560px] w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr>
                <th className="border-b border-[var(--a-border)] pb-2">НЭР</th>
                <th className="border-b border-[var(--a-border)] pb-2">ХУВЬ</th>
                <th className="border-b border-[var(--a-border)] pb-2">ХУГАЦАА</th>
                <th className="border-b border-[var(--a-border)] pb-2">ТӨЛӨВ</th>
                <th className="border-b border-[var(--a-border)] pb-2 text-right">ҮЙЛДЭЛ</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(campaign => {
                const status = campaignStatus(campaign, now);
                const toneClass = status.tone === "pos" ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : status.tone === "neg" ? "bg-[var(--a-neg-soft)] text-[#df1f3d]" : "bg-[var(--a-soft)] text-[var(--a-muted)]";
                const editable = !campaign.stoppedAt;
                const notYetStarted = new Date(campaign.startsAt).getTime() > now;
                return (
                  <tr key={campaign.id}>
                    <td className="border-b border-[var(--a-border)] py-3">
                      {editable ? (
                        <button type="button" onClick={() => editCampaign(campaign)} className="text-left font-bold hover:text-[#df1f3d]">{campaign.name}</button>
                      ) : (
                        <span className="font-bold text-[var(--a-muted)]">{campaign.name}</span>
                      )}
                    </td>
                    <td className="border-b border-[var(--a-border)] py-3 font-bold">{`-${campaign.percentOff}%`}</td>
                    <td className="border-b border-[var(--a-border)] py-3 text-[var(--a-muted)]">{new Date(campaign.startsAt).toLocaleString("mn-MN")} → {new Date(campaign.endsAt).toLocaleString("mn-MN")}</td>
                    <td className="border-b border-[var(--a-border)] py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${toneClass}`}>{status.label}</span></td>
                    <td className="border-b border-[var(--a-border)] py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {status.tone === "pos" && <button type="button" onClick={() => doStop(campaign)} className="text-[10px] font-bold text-[#df1f3d]">Одоо зогсоох</button>}
                        {notYetStarted && !campaign.stoppedAt && <button type="button" onClick={() => doDelete(campaign)} className="text-[10px] font-bold text-[var(--a-muted)] hover:text-[#df1f3d]">Устгах</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Тоог `delayMs`-ийн дараа л шинэчилж буцаана (урьдчилан харах query-г бид бичих бүрд асаахгүй). */
function useDebouncedNumber(value: number, delayMs: number): number {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), delayMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value, delayMs]);
  return debounced;
}
