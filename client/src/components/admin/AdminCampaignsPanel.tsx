import { useEffect, useState } from "react";
import { AlertTriangle, Bell, LoaderCircle, Mail, MessageSquareText, Send, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/lib/trpc";
// 2026-09-12: the ladder is admin-editable, so the segment dropdown lists
// the live tiers; the constant stays as the in-flight fallback, matching
// what the server falls back to.
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
      <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-[var(--a-card)] p-6" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">СЕГМЕНТ</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.04em]">{label}</h3></div>
          <button type="button" onClick={onClose} aria-label="Хаах" className="rounded-full p-1.5 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)]"><X size={16} /></button>
        </div>

        {query.isLoading && <p className="mt-6 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</p>}
        {query.error && <p className="mt-6 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(query.error)}</p>}

        {query.data && (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--a-muted)]">{rows.length} харилцагч</p>
              {rows.length > 0 && <button type="button" onClick={() => onUseRecipients(rows.map(row => row.id), label)} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--a-btn-dark)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><Send size={13} />Бүгдэд ({rows.length}) мессеж бэлтгэх</button>}
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
  const loyaltyTiersQuery = trpc.content.loyaltyTiers.useQuery();
  const availableTiers = loyaltyTiersQuery.data ?? LOYALTY_TIERS;
  const [loyaltyTier, setLoyaltyTier] = useState<string>(LOYALTY_TIERS[0]?.name ?? "");
  // Tiers are renameable now, so the initial value (seeded from the code
  // constant before the live list arrives) can name a tier that no longer
  // exists. Left alone, the <select> would display the first option while
  // the state still held the stale name -- and the campaign would be sent
  // to a segment matching nobody.
  useEffect(() => {
    if (!availableTiers.length) return;
    if (availableTiers.some(tier => tier.name === loyaltyTier)) return;
    setLoyaltyTier(availableTiers[0].name);
  }, [availableTiers, loyaltyTier]);
  const [channel, setChannel] = useState<"email" | "sms" | "push">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  // Зөвхөн push: мэдэгдэл дээр дарахад нээгдэх дотоод зам (2026-09-16).
  const [url, setUrl] = useState("");
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
  const pushDisabled = !configQuery.data?.pushCampaignsEnabled;
  // Илгээхийн ӨМНӨ бодит хүрэх тоо. Push-д ялангуяа чухал: имэйл/утас бараг
  // бүх мөрөнд байдаг бол мэдэгдэл асаасан хүн эхэндээ цөөхөн байна — үүнгүйгээр
  // "500 хүнд илгээлээ" гэж харагдаад хэн ч хүлээж авахгүй байж болно.
  // 2026-09-23: query (GET) биш mutation (POST) — 2 000 id нь URL-д ~16 KB
  // болж Node/Cloudflare-ийн хязгаарыг давдаг тул хамгийн том илгээлт дээр
  // энэ тоо чимээгүй алга болдог байв. Хүлээн авагч/суваг өөрчлөгдөх бүрт
  // өөрөө дахин асууна.
  const reachMutation = trpc.admin.campaignReach.useMutation();
  const { mutate: fetchReach, reset: resetReach } = reachMutation;
  const recipientIdsKey = recipientIds.join(",");
  useEffect(() => {
    if (!recipientIdsKey) { resetReach(); return; }
    const ids = recipientIdsKey.split(",").map(Number);
    if (ids.length > 2_000) { resetReach(); return; }
    fetchReach({ userIds: ids, channel });
  }, [recipientIdsKey, channel, fetchReach, resetReach]);
  const reach = reachMutation.data;
  const urlInvalid = channel === "push" && url.trim().length > 0 && !/^\/(?![/\\])[^\s]*$/.test(url.trim());
  const canSend = recipientIds.length > 0 && subject.trim().length > 0 && body.trim().length > 0
    && !(channel === "sms" && smsDisabled) && !(channel === "push" && pushDisabled) && !urlInvalid;

  const resetComposer = () => {
    setRecipientSource(null); setSegmentRecipients(null); setChannel("email"); setSubject(""); setBody(""); setUrl(""); setConfirming(false); sendCampaign.reset();
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
      const result = await sendCampaign.mutateAsync({ userIds: recipientIds, channel, subject: subject.trim(), body: body.trim(), url: channel === "push" && url.trim() ? url.trim() : undefined, sourceLabel: recipientLabel || undefined });
      toast.success(`Илгээлээ: ${result.sentCount}/${result.eligibleCount} амжилттай.`);
      setConfirming(false);
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return (
    <div>
      <div className="mb-5 flex gap-2 border-b border-[var(--a-border)] pb-3">
        <button type="button" onClick={() => setActiveTab("segment")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === "segment" ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-text-soft)] hover:bg-[var(--a-soft)]"}`}>Сегмент</button>
        <button type="button" onClick={() => setActiveTab("compose")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === "compose" ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-text-soft)] hover:bg-[var(--a-soft)]"}`}>Мессеж бэлтгэх{recipientIds.length > 0 ? ` (${recipientIds.length})` : ""}</button>
      </div>

      {activeTab === "segment" && (
        <>
          {segmentsQuery.isLoading && <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</p>}
          {segmentsQuery.error && <p className="rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(segmentsQuery.error)}</p>}
          {segmentsQuery.data && <AdminCustomerSegmentsPanel preferenceSegments={segmentsQuery.data.preferenceSegments} onSelectSegment={(field, value, label) => setDrillDown({ field, value, label })} />}
        </>
      )}

      {activeTab === "compose" && (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="grid gap-5">
            <section className="rounded-3xl border border-[var(--a-border)] p-5">
              <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">1. Хэнд илгээх вэ?</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => setRecipientSource("all")} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold transition ${recipientSource === "all" ? "border-[#df1f3d] bg-[var(--a-neg-soft)] text-[var(--a-neg)]" : "border-[var(--a-border)] text-[var(--a-text-soft)] hover:border-black/20"}`}>Бүх идэвхтэй харилцагч</button>
                <button type="button" onClick={() => setRecipientSource("loyalty")} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold transition ${recipientSource === "loyalty" ? "border-[#df1f3d] bg-[var(--a-neg-soft)] text-[var(--a-neg)]" : "border-[var(--a-border)] text-[var(--a-text-soft)] hover:border-black/20"}`}>Гишүүнчлэлийн зэрэглэлээр</button>
                <button type="button" onClick={() => setActiveTab("segment")} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold transition ${recipientSource === "segment" ? "border-[#df1f3d] bg-[var(--a-neg-soft)] text-[var(--a-neg)]" : "border-[var(--a-border)] text-[var(--a-text-soft)] hover:border-black/20"}`}>Сегмент таб-аас сонгох</button>
              </div>
              {recipientSource === "loyalty" && (
                <label className="mt-3 grid gap-1.5 text-xs font-bold">Зэрэглэл<select value={loyaltyTier} onChange={event => setLoyaltyTier(event.target.value)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]">{availableTiers.map(tier => <option key={tier.name} value={tier.name}>{tier.name}</option>)}</select></label>
              )}
              <p className="mt-3 text-xs text-[var(--a-muted)]">{recipientSource === null ? "Дээрээс сонгоно уу." : isResolvingRecipients ? "Тоолж байна…" : <>Хүлээн авагч: <strong className="text-[var(--a-text)]">{recipientLabel}</strong> — {recipientIds.length} харилцагч (илгээхээс өмнө opt-out/имэйл-утасгүй хэрэглэгчийг шүүнэ).</>}</p>
            </section>

            <section className="rounded-3xl border border-[var(--a-border)] p-5">
              <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">2. Суваг</h3>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setChannel("email")} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold transition ${channel === "email" ? "border-[#df1f3d] bg-[var(--a-neg-soft)] text-[var(--a-neg)]" : "border-[var(--a-border)] text-[var(--a-text-soft)]"}`}><Mail size={14} />Имэйл</button>
                <button type="button" disabled={smsDisabled} onClick={() => setChannel("sms")} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${channel === "sms" ? "border-[#df1f3d] bg-[var(--a-neg-soft)] text-[var(--a-neg)]" : "border-[var(--a-border)] text-[var(--a-text-soft)]"}`}><MessageSquareText size={14} />SMS</button>
                {/* Push (2026-09-16): утас/компьютерийн дэлгэц дээр шууд
                    гарна, SMS-ээс ялгаатай нь ТӨЛБӨРГҮЙ. Зөвхөн мэдэгдлээ
                    асаасан хүн хүлээж авна (доорх хүрэх тоог үзнэ үү). */}
                <button type="button" disabled={pushDisabled} onClick={() => setChannel("push")} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${channel === "push" ? "border-[#df1f3d] bg-[var(--a-neg-soft)] text-[var(--a-neg)]" : "border-[var(--a-border)] text-[var(--a-text-soft)]"}`}><Bell size={14} />Мэдэгдэл</button>
              </div>
              {smsDisabled && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[var(--a-warn)]"><AlertTriangle size={13} className="mt-0.5 shrink-0" />SMS кампанит ажил идэвхжээгүй байна (SMS кредит/route баталгаажаагүй). Тохиргоог админтай холбогдоно уу.</p>}
              {pushDisabled && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[var(--a-warn)]"><AlertTriangle size={13} className="mt-0.5 shrink-0" />Мэдэгдэл тохируулагдаагүй байна (VAPID түлхүүр).</p>}
              {/* Хүрэх тоо: сонгосон бүх хүнд биш, зөвхөн энэ сувгаар
                  бодитоор хүрэх хүнд очно. Push-д энэ зөрүү маш том байж
                  болно, тиймээс илгээхийн ӨМНӨ ил харуулна. */}
              {recipientIds.length > 0 && reach && (
                <p className={`mt-3 text-[11px] font-bold ${reach.reachable === 0 ? "text-[var(--a-neg)]" : "text-[var(--a-muted)]"}`}>
                  {reach.reachable === 0
                    ? `Сонгосон ${reach.selected} хүний ХЭН НЬ Ч энэ сувгаар хүлээж авахгүй — илгээх нь утгагүй.`
                    : `Сонгосон ${reach.selected} хүнээс ${reach.reachable} нь энэ сувгаар хүлээж авна.`}
                  {channel === "push" && " Мэдэгдлээ асааж, зар хүлээн авахыг зөвшөөрсөн хүн."}
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-[var(--a-border)] p-5">
              <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">3. Мессеж</h3>
              <label className="mt-3 grid gap-1.5 text-xs font-bold">Гарчиг<input value={subject} onChange={event => setSubject(event.target.value)} maxLength={200} placeholder="Жишээ: Намрын хямдрал эхэллээ" className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" /></label>
              <label className="mt-3 grid gap-1.5 text-xs font-bold">Агуулга<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={5000} rows={7} placeholder="Мессежийн бүтэн текст…" className="rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] p-3 text-xs font-normal leading-5 outline-none focus:border-[#df1f3d]" /></label>
              {channel === "push" && (
                <>
                  <label className="mt-3 grid gap-1.5 text-xs font-bold">Дарахад нээгдэх хуудас (сонголттой)
                    <input value={url} onChange={event => setUrl(event.target.value)} maxLength={300} placeholder="/shop?category=Арьс арчилгаа" className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-xs font-normal outline-none focus:border-[#df1f3d]" />
                  </label>
                  {/* Гадаад холбоос хориотой: мэдэгдлийг фишингийн тээвэр
                      болгож болохгүй (сервер талд мөн шалгагдана). */}
                  {urlInvalid
                    ? <p className="mt-1.5 text-[11px] font-bold text-[var(--a-neg)]">Зөвхөн энэ сайтын дотоод зам — "/"-ээр эхэлнэ (жишээ: /shop).</p>
                    : <p className="mt-1.5 text-[11px] text-[var(--a-muted)]">Хоосон орхивол захиалгын хуудас нээгдэнэ. Зөвхөн дотоод зам (жишээ: /shop, /journal).</p>}
                  <p className="mt-3 text-[11px] text-[var(--a-muted)]">Мэдэгдэл нь утас/компьютерийн дэлгэц дээр шууд гарна (дэлгэц унтарсан ч). Гарчиг богино байх тусмаа сайн — утсан дээр ~50 тэмдэгт харагдана.</p>
                </>
              )}
            </section>

            {!confirming ? (
              <button type="button" disabled={!canSend} onClick={() => setConfirming(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-6 py-3.5 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40"><Send size={15} />Урьдчилан харах</button>
            ) : (
              <div className="rounded-3xl border border-[#df1f3d]/25 bg-[var(--a-neg-soft)] p-5">
                <p className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[.13em] text-[var(--a-neg)]"><ShieldCheck size={13} />ИЛГЭЭХЭЭС ӨМНӨ БАТАЛГААЖУУЛНА УУ</p>
                <p className="mt-2 text-sm">{recipientIds.length} харилцагч руу <strong>{channel === "email" ? "имэйл" : channel === "sms" ? "SMS" : "мэдэгдэл"}</strong> илгээх гэж байна.</p>
                <p className="mt-1 text-xs text-[var(--a-muted)]">Гарчиг: {subject}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setConfirming(false)} disabled={sendCampaign.isPending} className="rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-4 py-2.5 text-xs font-bold text-[var(--a-text-soft)] transition hover:border-black/20">Буцах</button>
                  <button type="button" onClick={onConfirmSend} disabled={sendCampaign.isPending} className="inline-flex items-center gap-2 rounded-full bg-[var(--a-btn-dark)] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#df1f3d] disabled:opacity-60">{sendCampaign.isPending && <LoaderCircle className="animate-spin" size={14} />}Тийм, {recipientIds.length} хүнд илгээх</button>
                </div>
              </div>
            )}

            {sendCampaign.data && (
              <div className="rounded-3xl border border-[var(--a-border)] bg-[var(--a-soft)] p-5">
                <p className="text-[10px] font-extrabold tracking-[.13em] text-[var(--a-faint)]">ҮР ДҮН</p>
                <p className="mt-2 text-sm">Илгээсэн: <strong>{sendCampaign.data.sentCount}</strong> / Тохирсон: {sendCampaign.data.eligibleCount} / Opt-out-оор алгассан: {sendCampaign.data.skippedOptOutCount} / Амжилтгүй: {sendCampaign.data.failedCount}</p>
                <button type="button" onClick={resetComposer} className="mt-3 text-xs font-bold text-[#df1f3d] underline decoration-dotted underline-offset-2">Шинэ кампанит ажил эхлүүлэх</button>
              </div>
            )}
          </div>

          <aside className="grid gap-4">
            {recipientSource && recipientIds.length > 0 && (
              <section className="min-w-0 rounded-3xl border border-[var(--a-border)] p-5">
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
