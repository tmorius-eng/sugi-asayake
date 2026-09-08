import { useState } from "react";
import { AlertTriangle, LoaderCircle, Mail, MessageSquareText, Send, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { LOYALTY_TIERS } from "@shared/loyalty";
import { GenericListView } from "./GenericListView";
import AdminCustomerSegmentsPanel, { type SegmentField } from "./AdminCustomerSegmentsPanel";
import AdminBulkActionBar from "../AdminBulkActionBar";

// Admin overhaul (2026-09-08, Phase J): the mass email/SMS campaign tool.
// Two tabs, matching the plan: Segment (Phase I's breakdown, with a
// drill-down drawer that hands its selection to Compose) and Compose
// (recipient source -> channel -> subject/body -> confirm-before-send).
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

type CampaignRecipient = { id: number; name: string | null; phone: string | null; email: string | null };
type RecipientSource = "segment" | "all" | "loyalty";

const recipientColumns = [
  { id: "name", header: "Нэр", render: (row: CampaignRecipient) => row.name ?? "Нэр оруулаагүй" },
  { id: "phone", header: "Утас", render: (row: CampaignRecipient) => row.phone ?? "—" },
  { id: "email", header: "Имэйл", render: (row: CampaignRecipient) => row.email ?? "—" },
];

/** The drill-down drawer behind one of the Segment tab's counts -- lets the
 *  admin either message everyone in the segment or narrow it further with
 *  the list's own row selection before handing recipient ids to Compose. */
function SegmentDrillDownDrawer({ field, value, label, onClose, onUseRecipients }: {
  field: SegmentField; value: string; label: string; onClose: () => void;
  onUseRecipients: (ids: number[], sourceLabel: string) => void;
}) {
  const query = trpc.admin.usersBySegment.useQuery({ field, value });
  const rows: CampaignRecipient[] = query.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white p-6" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">СЕГМЕНТ</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.04em]">{label}</h3></div>
          <button type="button" onClick={onClose} aria-label="Хаах" className="rounded-full p-1.5 text-[#707176] transition hover:bg-[#f8f5ef]"><X size={16} /></button>
        </div>

        {query.isLoading && <p className="mt-6 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</p>}
        {query.error && <p className="mt-6 rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{messageFrom(query.error)}</p>}

        {query.data && (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[#77787d]">{rows.length} харилцагч</p>
              {rows.length > 0 && <button type="button" onClick={() => onUseRecipients(rows.map(row => row.id), label)} className="inline-flex items-center gap-1.5 rounded-full bg-[#17181b] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><Send size={13} />Бүгдэд ({rows.length}) мессеж бэлтгэх</button>}
            </div>
            <GenericListView<CampaignRecipient>
              rows={rows}
              getRowId={row => row.id}
              columns={recipientColumns}
              selectable
              pageSize={20}
              itemLabel="харилцагч"
              bulkActions={({ selectedIds, selectedRows, clearSelection }) => (
                <AdminBulkActionBar count={selectedIds.size} onClear={clearSelection}>
                  <button type="button" onClick={() => onUseRecipients(selectedRows.map(row => row.id), `${label} (сонгосон ${selectedRows.length})`)} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25">Сонгосонд мессеж бэлтгэх</button>
                </AdminBulkActionBar>
              )}
              emptyMessage="Энэ сегментэд харилцагч алга."
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminCampaignsPanel() {
  const [activeTab, setActiveTab] = useState<"segment" | "compose">("segment");
  const [drillDown, setDrillDown] = useState<{ field: SegmentField; value: string; label: string } | null>(null);

  const [recipientSource, setRecipientSource] = useState<RecipientSource | null>(null);
  const [segmentRecipients, setSegmentRecipients] = useState<{ ids: number[]; label: string } | null>(null);
  const [loyaltyTier, setLoyaltyTier] = useState<string>(LOYALTY_TIERS[0]?.name ?? "");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);

  const segmentsQuery = trpc.admin.customerSegments.useQuery();
  const configQuery = trpc.admin.campaignConfig.useQuery();
  const allUsersQuery = trpc.admin.campaignAllUsers.useQuery(undefined, { enabled: recipientSource === "all" });
  const loyaltyUsersQuery = trpc.admin.campaignUsersByLoyaltyTier.useQuery({ tierName: loyaltyTier }, { enabled: recipientSource === "loyalty" && Boolean(loyaltyTier) });

  const sendCampaign = trpc.admin.sendCampaign.useMutation();

  const recipientIds: number[] = recipientSource === "segment" ? segmentRecipients?.ids ?? []
    : recipientSource === "all" ? (allUsersQuery.data ?? []).map((row: RouterOutputs["admin"]["campaignAllUsers"][number]) => row.id)
    : recipientSource === "loyalty" ? (loyaltyUsersQuery.data ?? []).map((row: RouterOutputs["admin"]["campaignUsersByLoyaltyTier"][number]) => row.id)
    : [];
  const recipientLabel = recipientSource === "segment" ? segmentRecipients?.label ?? "" : recipientSource === "all" ? "Бүх идэвхтэй харилцагч" : recipientSource === "loyalty" ? `Гишүүнчлэл: ${loyaltyTier}` : "";
  const isResolvingRecipients = (recipientSource === "all" && allUsersQuery.isLoading) || (recipientSource === "loyalty" && loyaltyUsersQuery.isLoading);

  const smsDisabled = !configQuery.data?.smsCampaignsEnabled;
  const canSend = recipientIds.length > 0 && subject.trim().length > 0 && body.trim().length > 0 && !(channel === "sms" && smsDisabled);

  const resetComposer = () => {
    setRecipientSource(null); setSegmentRecipients(null); setChannel("email"); setSubject(""); setBody(""); setConfirming(false); sendCampaign.reset();
  };

  const onUseRecipients = (ids: number[], sourceLabel: string) => {
    setSegmentRecipients({ ids, label: sourceLabel });
    setRecipientSource("segment");
    sendCampaign.reset();
    setConfirming(false);
    setDrillDown(null);
    setActiveTab("compose");
    toast.success(`${ids.length} харилцагч Кампанит ажил руу шилжлээ.`);
  };

  const onConfirmSend = async () => {
    try {
      const result = await sendCampaign.mutateAsync({ userIds: recipientIds, channel, subject: subject.trim(), body: body.trim(), sourceLabel: recipientLabel || undefined });
      toast.success(`Илгээлээ: ${result.sentCount}/${result.eligibleCount} амжилттай.`);
      setConfirming(false);
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return (
    <div>
      <div className="mb-5 flex gap-2 border-b border-black/8 pb-3">
        <button type="button" onClick={() => setActiveTab("segment")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === "segment" ? "bg-[#17181b] text-white" : "text-[#57585e] hover:bg-[#f8f5ef]"}`}>Сегмент</button>
        <button type="button" onClick={() => setActiveTab("compose")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === "compose" ? "bg-[#17181b] text-white" : "text-[#57585e] hover:bg-[#f8f5ef]"}`}>Мессеж бэлтгэх{recipientIds.length > 0 ? ` (${recipientIds.length})` : ""}</button>
      </div>

      {activeTab === "segment" && (
        <>
          {segmentsQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</p>}
          {segmentsQuery.error && <p className="rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{messageFrom(segmentsQuery.error)}</p>}
          {segmentsQuery.data && <AdminCustomerSegmentsPanel preferenceSegments={segmentsQuery.data.preferenceSegments} onSelectSegment={(field, value, label) => setDrillDown({ field, value, label })} />}
        </>
      )}

      {activeTab === "compose" && (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="grid gap-5">
            <section className="rounded-3xl border border-black/7 p-5">
              <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">1. Хэнд илгээх вэ?</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => setRecipientSource("all")} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold transition ${recipientSource === "all" ? "border-[#df1f3d] bg-[#fff0f2] text-[#a51630]" : "border-black/10 text-[#57585e] hover:border-black/20"}`}>Бүх идэвхтэй харилцагч</button>
                <button type="button" onClick={() => setRecipientSource("loyalty")} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold transition ${recipientSource === "loyalty" ? "border-[#df1f3d] bg-[#fff0f2] text-[#a51630]" : "border-black/10 text-[#57585e] hover:border-black/20"}`}>Гишүүнчлэлийн зэрэглэлээр</button>
                <button type="button" onClick={() => setActiveTab("segment")} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold transition ${recipientSource === "segment" ? "border-[#df1f3d] bg-[#fff0f2] text-[#a51630]" : "border-black/10 text-[#57585e] hover:border-black/20"}`}>Сегмент таб-аас сонгох</button>
              </div>
              {recipientSource === "loyalty" && (
                <label className="mt-3 grid gap-1.5 text-xs font-bold">Зэрэглэл<select value={loyaltyTier} onChange={event => setLoyaltyTier(event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-xs font-normal outline-none focus:border-[#df1f3d]">{LOYALTY_TIERS.map(tier => <option key={tier.name} value={tier.name}>{tier.name}</option>)}</select></label>
              )}
              <p className="mt-3 text-xs text-[#77787d]">{recipientSource === null ? "Дээрээс сонгоно уу." : isResolvingRecipients ? "Тоолж байна…" : <>Хүлээн авагч: <strong className="text-[#17181b]">{recipientLabel}</strong> — {recipientIds.length} харилцагч (илгээхээс өмнө opt-out/имэйл-утасгүй хэрэглэгчийг шүүнэ).</>}</p>
            </section>

            <section className="rounded-3xl border border-black/7 p-5">
              <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">2. Суваг</h3>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setChannel("email")} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold transition ${channel === "email" ? "border-[#df1f3d] bg-[#fff0f2] text-[#a51630]" : "border-black/10 text-[#57585e]"}`}><Mail size={14} />Имэйл</button>
                <button type="button" disabled={smsDisabled} onClick={() => setChannel("sms")} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${channel === "sms" ? "border-[#df1f3d] bg-[#fff0f2] text-[#a51630]" : "border-black/10 text-[#57585e]"}`}><MessageSquareText size={14} />SMS</button>
              </div>
              {smsDisabled && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[#8a6a1f]"><AlertTriangle size={13} className="mt-0.5 shrink-0" />SMS кампанит ажил идэвхжээгүй байна (SMS кредит/route баталгаажаагүй). Тохиргоог админтай холбогдоно уу.</p>}
            </section>

            <section className="rounded-3xl border border-black/7 p-5">
              <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">3. Мессеж</h3>
              <label className="mt-3 grid gap-1.5 text-xs font-bold">Гарчиг<input value={subject} onChange={event => setSubject(event.target.value)} maxLength={200} placeholder="Жишээ: Намрын хямдрал эхэллээ" className="h-10 rounded-lg border border-black/10 bg-white px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>
              <label className="mt-3 grid gap-1.5 text-xs font-bold">Агуулга<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={5000} rows={7} placeholder="Мессежийн бүтэн текст…" className="rounded-lg border border-black/10 bg-white p-3 text-xs font-normal leading-5 outline-none focus:border-[#df1f3d]" /></label>
            </section>

            {!confirming ? (
              <button type="button" disabled={!canSend} onClick={() => setConfirming(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-6 py-3.5 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40"><Send size={15} />Урьдчилан харах</button>
            ) : (
              <div className="rounded-3xl border border-[#df1f3d]/25 bg-[#fff8f8] p-5">
                <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.13em] text-[#a51630]"><ShieldCheck size={13} />ИЛГЭЭХЭЭС ӨМНӨ БАТАЛГААЖУУЛНА УУ</p>
                <p className="mt-2 text-sm">{recipientIds.length} харилцагч руу <strong>{channel === "email" ? "имэйл" : "SMS"}</strong> илгээх гэж байна.</p>
                <p className="mt-1 text-xs text-[#77787d]">Гарчиг: {subject}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setConfirming(false)} disabled={sendCampaign.isPending} className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-bold text-[#57585e] transition hover:border-black/20">Буцах</button>
                  <button type="button" onClick={onConfirmSend} disabled={sendCampaign.isPending} className="inline-flex items-center gap-2 rounded-full bg-[#17181b] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#df1f3d] disabled:opacity-60">{sendCampaign.isPending && <LoaderCircle className="animate-spin" size={14} />}Тийм, {recipientIds.length} хүнд илгээх</button>
                </div>
              </div>
            )}

            {sendCampaign.data && (
              <div className="rounded-3xl border border-black/8 bg-[#f8f5ef] p-5">
                <p className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">ҮР ДҮН</p>
                <p className="mt-2 text-sm">Илгээсэн: <strong>{sendCampaign.data.sentCount}</strong> / Тохирсон: {sendCampaign.data.eligibleCount} / Opt-out-оор алгассан: {sendCampaign.data.skippedOptOutCount} / Амжилтгүй: {sendCampaign.data.failedCount}</p>
                <button type="button" onClick={resetComposer} className="mt-3 text-xs font-bold text-[#df1f3d] underline decoration-dotted underline-offset-2">Шинэ кампанит ажил эхлүүлэх</button>
              </div>
            )}
          </div>

          <aside className="grid gap-4">
            {recipientSource && recipientIds.length > 0 && (
              <section className="min-w-0 rounded-3xl border border-black/7 p-5">
                <h3 className="font-[var(--font-display)] text-sm font-bold tracking-[-.02em]">Хүлээн авагчийн жагсаалт</h3>
                <div className="mt-3">
                  <GenericListView<CampaignRecipient>
                    rows={recipientSource === "segment" ? [] : recipientSource === "all" ? (allUsersQuery.data ?? []) : (loyaltyUsersQuery.data ?? [])}
                    getRowId={row => row.id}
                    columns={recipientColumns}
                    pageSize={8}
                    itemLabel="харилцагч"
                    emptyMessage={recipientSource === "segment" ? "Сегментийн жагсаалт нь Сегмент таб-ийн цонхонд харагдана." : "Хоосон."}
                  />
                </div>
              </section>
            )}
          </aside>
        </div>
      )}

      {drillDown && <SegmentDrillDownDrawer field={drillDown.field} value={drillDown.value} label={drillDown.label} onClose={() => setDrillDown(null)} onUseRecipients={onUseRecipients} />}
    </div>
  );
}
