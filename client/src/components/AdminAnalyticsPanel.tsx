import { useMemo, useState, type FormEvent } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowDown, ArrowUp, Download, FileSpreadsheet, FileText, LoaderCircle, MapPin, Package, Percent, ReceiptText, Share2, ShoppingCart, Smartphone, Truck, Undo2, UsersRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { downloadBase64File } from "@/lib/fileDownload";
import { downloadCsv } from "@/lib/csv";
import { arcPath, polarPoint } from "@/lib/svg-arc";
import type { RouterOutputs } from "@/lib/trpc";
import { genderLabels, skinTypeLabels as customerSkinTypeLabels, hairTypeLabels, skinConcernOptions } from "@shared/catalog-filter";

const preferenceSegmentLabelFor = (field: "gender" | "skinType" | "hairType" | "concern", value: string): string => {
  if (field === "gender") return genderLabels[value as keyof typeof genderLabels] ?? value;
  if (field === "skinType") return customerSkinTypeLabels[value as keyof typeof customerSkinTypeLabels] ?? value;
  if (field === "hairType") return hairTypeLabels[value as keyof typeof hairTypeLabels] ?? value;
  return skinConcernOptions.find(option => option.value === value)?.label ?? value;
};

const formatMnt = (amount: number) => `${new Intl.NumberFormat("mn-MN").format(amount)}₮`;
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Тайлан ачаалж чадсангүй.";
type AnalyticsReport = RouterOutputs["admin"]["analyticsReport"];

const cacUnavailableCaption = (reason: AnalyticsReport["cac"]["unavailableReason"]) => {
  switch (reason) {
    case "all_time_not_supported": return "\"Бүх цаг үе\" сонголтод тодорхой хугацааны цонх байхгүй тул тооцоолох боломжгүй.";
    case "no_spend_entered": return "Энэ хугацаанд зар сурталчилгааны зардал оруулаагүй байна — доор оруулна уу.";
    case "partial_months": return "Зарим сар(ууд)-д зардал оруулаагүй тул бүрэн тооцоолж чадсангүй.";
    case "no_new_customers": return "Энэ хугацаанд шинэ харилцагч алга.";
    default: return "Мэдээлэл дутуу байна.";
  }
};

type RangeKey = "7d" | "30d" | "90d" | "thisMonth" | "all";

function rangeToDates(range: RangeKey): { dateFrom?: Date; dateTo?: Date } {
  const now = new Date();
  if (range === "all") return {};
  if (range === "thisMonth") return { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1) };
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return { dateFrom: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) };
}

const rangeOptions: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 хоног" },
  { key: "30d", label: "30 хоног" },
  { key: "90d", label: "90 хоног" },
  { key: "thisMonth", label: "Энэ сар" },
  { key: "all", label: "Бүх цаг үе" },
];

/** Zero-fills a sparse day-keyed series (see getRevenueTimeseries's own doc
 *  comment: "days with zero orders are simply absent") into a fixed-length
 *  array indexed by day-offset from `from` -- required for a two-series
 *  sparkline overlay, which breaks if each series is merely "existing rows
 *  in order" rather than aligned to the same day-offset axis. */
function buildDaySeries(rows: { date: string; revenueMnt: number; orderCount: number }[], from: Date, days: number, key: "revenueMnt" | "orderCount"): number[] {
  const byDate = new Map(rows.map(row => [row.date, row]));
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(from.getTime() + i * 86_400_000);
    return byDate.get(day.toISOString().slice(0, 10))?.[key] ?? 0;
  });
}

/** Rounds up to a "clean" scale (…, 1000, 2000, 5000, 10000, …) for the AOV
 *  gauge's max -- this app has no external "target AOV" to bind the gauge
 *  to, so the gauge scales to its own recent history instead. */
function roundUpToNiceNumber(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/**
 * PREMIUM-FEATURES.md-ийн CRM/analytics хүсэлт (2026-08-26): борлуулалт,
 * дүүргээр захиалга, харилцагчийн нас/мэргэжлийн бүрдүүлэлт, ашиг/маржин,
 * сагс орхилт, нөөц, суваг, эх сурвалж/төхөөрөмж — бүгд server/analytics.ts-
 * ийн getAnalyticsReport-оос ирдэг бодит өгөгдөл. Дээд KPI хэсэг (Geckoboard
 * маягийн харанхуй самбар, 2026-08-27 шинэчлэлт) period-over-period
 * харьцуулалт/sparkline/gauge ашигладаг ч эдгээр бүгд ЖИНХЭНЭ, тооцоолсон
 * тоо — хэзээ ч "target"/санамсаргүй тоо зохиомол оруулаагүй (жишээ нь AOV
 * gauge-ийн дээд хэмжээ өөрийн сүүлийн үеийн өгөгдлөөс тооцогддог, гадны
 * зорилтот тоо байхгүй). Насны/мэргэжлийн хэсэг зөвхөн профайлдаа сайн
 * дураараа мэдээлэл өгсөн харилцагчаар хязгаарлагдана тул "N/M харилцагч
 * мэдээлэл өгсөн" гэдгийг үргэлж тодорхой харуулна. Дүүргийн задаргаа бол
 * ЗАХИАЛГЫН (хэн худалдаж авсан бэ) өгөгдөл, вэбсайт ЗОЧЛОЛТЫН өгөгдөл биш.
 */
export default function AdminAnalyticsPanel() {
  const [range, setRange] = useState<RangeKey>("30d");
  const dates = useMemo(() => rangeToDates(range), [range]);
  const input = useMemo(() => ({ dateFrom: dates.dateFrom?.toISOString(), dateTo: dates.dateTo?.toISOString() }), [dates]);

  // Both purely derived from `dates` (not from query data) so they can be
  // computed before the loading/error early-returns below without breaking
  // the rules of hooks.
  const periodDays = useMemo(() => {
    if (!dates.dateFrom) return 30;
    const to = dates.dateTo ?? new Date();
    return Math.max(1, Math.min(90, Math.round((to.getTime() - dates.dateFrom.getTime()) / 86_400_000)));
  }, [dates]);
  const previousPeriodFrom = useMemo(() => {
    if (!dates.dateFrom) return null;
    const to = dates.dateTo ?? new Date();
    const durationMs = to.getTime() - dates.dateFrom.getTime();
    const previousTo = new Date(dates.dateFrom.getTime() - 1);
    return new Date(previousTo.getTime() - durationMs);
  }, [dates]);

  const reportQuery = trpc.admin.analyticsReport.useQuery(input);
  const exportReport = trpc.admin.analyticsExport.useMutation({
    onSuccess: result => { downloadBase64File(result.filename, result.dataBase64, result.mimeType); toast.success("Тайлан татагдлаа."); },
    onError: error => toast.error(messageFrom(error)),
  });

  if (reportQuery.isLoading) {
    return <div className="flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Аналитикийг ачаалж байна…</div>;
  }
  if (reportQuery.error) {
    return <div className="rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{messageFrom(reportQuery.error)}</div>;
  }
  const report = reportQuery.data;
  if (!report) return null;

  const exportCsvTables = () => {
    downloadCsv(`sugi-analytics-products-${new Date().toISOString().slice(0, 10)}.csv`, ["Бараа", "Зарагдсан тоо", "Орлого (MNT)"], report.topProducts.map(row => [row.productName, row.soldQuantity, row.revenueMnt]));
  };

  const currentRevenueSeries = dates.dateFrom
    ? buildDaySeries(report.revenueTimeseries, dates.dateFrom, periodDays, "revenueMnt")
    : report.revenueTimeseries.slice(-periodDays).map(row => row.revenueMnt);
  const currentOrderSeries = dates.dateFrom
    ? buildDaySeries(report.revenueTimeseries, dates.dateFrom, periodDays, "orderCount")
    : report.revenueTimeseries.slice(-periodDays).map(row => row.orderCount);
  const previousRevenueSeries = dates.dateFrom && previousPeriodFrom ? buildDaySeries(report.periodComparison.previousRevenueTimeseries, previousPeriodFrom, periodDays, "revenueMnt") : null;
  const previousOrderSeries = dates.dateFrom && previousPeriodFrom ? buildDaySeries(report.periodComparison.previousRevenueTimeseries, previousPeriodFrom, periodDays, "orderCount") : null;
  const previousAov = report.periodComparison.available ? report.periodComparison.previous!.aovMnt : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1.5 rounded-2xl bg-[#f8f5ef] p-1.5">
          {rangeOptions.map(option => (
            <button key={option.key} type="button" onClick={() => setRange(option.key)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${range === option.key ? "bg-[#17181b] text-white" : "text-[#57585e] hover:bg-white"}`}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={exportReport.isPending} onClick={() => exportReport.mutate({ ...input, format: "xlsx" })}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-bold text-[#57585e] transition hover:-translate-y-0.5 hover:border-[#2c7650] hover:text-[#2c7650] disabled:opacity-50">
            <FileSpreadsheet size={15} />Excel татах
          </button>
          <button type="button" disabled={exportReport.isPending} onClick={() => exportReport.mutate({ ...input, format: "pdf" })}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-xs font-bold text-[#57585e] transition hover:-translate-y-0.5 hover:border-[#df1f3d] hover:text-[#df1f3d] disabled:opacity-50">
            {exportReport.isPending ? <LoaderCircle className="animate-spin" size={15} /> : <FileText size={15} />}PDF татах
          </button>
        </div>
      </div>

      {/* Geckoboard-style KPI "command center" -- a scoped dark band (this
          component's own hardcoded dark palette, not a global dark-mode
          toggle; see the file-level comment above). Everything below this
          band stays on the site's normal light theme. */}
      <section className="rounded-3xl bg-[#17181b] p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DarkSparkTile icon={Wallet} label="Нийт борлуулалт" value={formatMnt(report.overview.revenueMnt)}
            deltaPercent={report.periodComparison.deltaPercent.revenueMnt} currentSeries={currentRevenueSeries} previousSeries={previousRevenueSeries} accent="#df1f3d" />
          <DarkSparkTile icon={ReceiptText} label="Захиалгын тоо" value={String(report.overview.orderCount)}
            deltaPercent={report.periodComparison.deltaPercent.orderCount} currentSeries={currentOrderSeries} previousSeries={previousOrderSeries} accent="#3970a7" />
          <NetProfitTile netProfitMnt={report.pnl.netProfitMnt} marginPercent={report.profit.marginPercent} deltaPercent={report.periodComparison.deltaPercent.profitMnt}
            itemsWithCostCount={report.profit.itemsWithCostCount} totalItemsSold={report.profit.totalItemsSold} />
          <div className="min-w-0 rounded-2xl bg-[#1f2126] p-5">
            <p className="text-[10px] font-extrabold uppercase tracking-[.13em] text-white/45">Дундаж захиалгын дүн</p>
            <AovGauge current={report.overview.aovMnt} previous={previousAov} accent="#f0b52d" />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <PnlCard pnl={report.pnl} />
          <RankedDollarCard title="Дүүргээр борлуулалт" icon={MapPin}
            rows={report.districtBreakdown.districts.map(row => ({ label: row.districtLabel, revenueMnt: row.revenueMnt }))}
            emptyLabel="Дүүргийн мэдээлэлтэй захиалга алга." />
          <RankedDollarCard title="Эх сурвалжаар борлуулалт" icon={Share2}
            rows={report.traffic.sources.map(row => ({ label: row.source, revenueMnt: row.revenueMnt }))}
            emptyLabel="Эх сурвалжийн мэдээлэл алга." />
          <ChannelBarsCard title="Хүргэлт, төлбөрийн суваг" icon={Truck}
            groups={[
              { label: "Хүргэлтийн хэлбэр", rows: report.ordersByChannel.byDeliveryMethod },
              { label: "Төлбөрийн хэлбэр", rows: report.ordersByChannel.byPaymentMethod },
            ]} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DarkStatTile icon={Activity} label="Хөрвүүлэлтийн хувь" value={report.conversion.sessionsCount > 0 ? `${report.conversion.conversionRatePercent}%` : "—"}
            caption={report.conversion.sessionsCount > 0
              ? `${report.conversion.convertedSessionsCount} / ${report.conversion.sessionsCount} сесс`
              : report.conversion.trackingStartedAt ? `${report.conversion.trackingStartedAt.slice(0, 10)}-с хойш хэмжигдэж эхэлсэн` : "Хараахан хэмжиж эхлээгүй."}
            accent="#3970a7" />
          <DarkStatTile icon={UsersRound} label="Шинэ / Давтан харилцагч" value={range === "all" ? "—" : `${report.overview.newCustomerCount} / ${report.overview.returningCustomerCount}`} accent="#f0b52d" />
          <DarkStatTile icon={ShoppingCart} label="Сагс орхилтын хувь" value={`${report.cartAbandonment.abandonmentRatePercent}%`}
            caption={`${report.cartAbandonment.abandonedCount} орхигдсон / ${report.cartAbandonment.cartsWithItems} бараатай сагс`} accent="#df1f3d" />
          <DarkStatTile icon={Package} label="Нөөцийн үнэ цэн" value={formatMnt(report.inventory.stockValueMnt)}
            caption={`${report.inventory.outOfStockCount} дууссан, ${report.inventory.lowStockCount} бага үлдэгдэлтэй / ${report.inventory.publishedProductCount} бараа`} accent="#3970a7" />
          <DarkStatTile icon={Undo2} label="Буцаалтын хувь" value={report.returnRate.completedOrReturnedOrderCount > 0 ? `${report.returnRate.returnRatePercent}%` : "—"}
            caption={report.returnRate.completedOrReturnedOrderCount > 0 ? `${report.returnRate.returnedOrderCount} буцаагдсан / ${report.returnRate.completedOrReturnedOrderCount} дууссан захиалга` : "Одоогоор дууссан захиалга алга."} accent="#f0b52d" />
        </div>

        <div className="mt-4">
          <CacCard cac={report.cac} />
        </div>
      </section>

      <section className="rounded-3xl border border-black/7 p-5">
        <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Өдөр тутмын орлого</h3>
        {report.revenueTimeseries.length === 0 ? (
          <p className="mt-4 text-sm text-[#77787d]">Сонгосон хугацаанд төлөгдсөн захиалга алга.</p>
        ) : (
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report.revenueTimeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,24,27,.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={value => String(value).slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={value => `${Math.round(Number(value) / 1000)}k`} width={44} />
                <Tooltip formatter={(value: number) => formatMnt(value)} labelFormatter={label => `Огноо: ${label}`} contentStyle={{ borderRadius: 12, border: "1px solid rgba(23,24,27,.1)", fontSize: 12 }} />
                <Line type="monotone" dataKey="revenueMnt" name="Орлого" stroke="#df1f3d" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Их зарагдсан бараа</h3>
            <button type="button" onClick={exportCsvTables} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-[#3970a7]"><Download size={13} />CSV</button>
          </div>
          <RankedTable rows={report.topProducts.map(row => ({ label: row.productName, quantity: row.soldQuantity, revenueMnt: row.revenueMnt }))} emptyLabel="Төлөгдсөн захиалга алга." />
        </section>
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Ангиллаар</h3>
          <RankedTable rows={report.topCategories.map(row => ({ label: row.categoryName, quantity: row.soldQuantity, revenueMnt: row.revenueMnt }))} emptyLabel="Төлөгдсөн захиалга алга." />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Насны бүлэг</h3>
          <p className="mt-1 text-xs text-[#8a8b8f]">{report.demographics.ageProvidedCount} / {report.demographics.totalCustomerCount} харилцагч профайл дээрээ нас мэдээлсэн (заавал биш) — доорх зөвхөн тэдгээрийг тусгасан.</p>
          {report.demographics.ageBuckets.length === 0 ? (
            <p className="mt-4 text-sm text-[#77787d]">Одоогоор нас мэдээлсэн харилцагч алга.</p>
          ) : (
            <div className="mt-4 h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.demographics.ageBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,24,27,.08)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid rgba(23,24,27,.1)", fontSize: 12 }} />
                  <Bar dataKey="count" name="Харилцагч" fill="#f0b52d" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Мэргэжил (эхний 10)</h3>
          <p className="mt-1 text-xs text-[#8a8b8f]">{report.demographics.occupationProvidedCount} / {report.demographics.totalCustomerCount} харилцагч мэдээлсэн.</p>
          {report.demographics.topOccupations.length === 0 ? (
            <p className="mt-4 text-sm text-[#77787d]">Одоогоор мэргэжил мэдээлсэн харилцагч алга.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {report.demographics.topOccupations.map(row => (
                <li key={row.occupation} className="flex items-center justify-between border-b border-black/6 pb-2 text-sm">
                  <span>{row.occupation}</span><strong className="text-[#17181b]">{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Preference Profile v2 (2026-09-01): the one section genuinely
          unique to this build (nothing off-the-shelf gives you this) --
          reuses the same "N of M told us" ranked-list pattern as the age/
          occupation grid above, since the customers-by-preference-segment
          data has the exact same honesty requirement. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Тохиргооны сегмент</h3>
          <p className="mt-1 text-xs text-[#8a8b8f]">Профайл дээрээ гоо сайхны/гэрийн тохиргоо бөглөсөн харилцагчид.</p>
          {report.preferenceSegments.totalCustomerCount === 0 ? (
            <p className="mt-4 text-sm text-[#77787d]">Одоогоор бүртгэлтэй харилцагч алга.</p>
          ) : (
            <div className="mt-4 grid gap-4">
              {([
                { title: "Хүйс", field: "gender" as const, provided: report.preferenceSegments.genderProvidedCount, rows: report.preferenceSegments.genderBreakdown },
                { title: "Арьсны төрөл", field: "skinType" as const, provided: report.preferenceSegments.skinTypeProvidedCount, rows: report.preferenceSegments.skinTypeBreakdown },
                { title: "Санаа зовдог асуудал (эхний 10)", field: "concern" as const, provided: report.preferenceSegments.topSkinConcerns.reduce((sum, row) => sum + row.count, 0), rows: report.preferenceSegments.topSkinConcerns },
                { title: "Үсний төрөл", field: "hairType" as const, provided: report.preferenceSegments.hairTypeProvidedCount, rows: report.preferenceSegments.hairTypeBreakdown },
              ]).map(group => group.rows.length > 0 && (
                <div key={group.title}>
                  <p className="text-[11px] font-bold text-[#55565b]">{group.title} <span className="font-normal text-[#8a8b8f]">({group.provided} / {report.preferenceSegments.totalCustomerCount})</span></p>
                  <ul className="mt-1.5 grid gap-1">
                    {group.rows.map(row => (
                      <li key={row.value} className="flex items-center justify-between border-b border-black/6 py-1 text-sm">
                        <span>{preferenceSegmentLabelFor(group.field, row.value)}</span><strong className="text-[#17181b]">{row.count}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {report.preferenceSegments.districtBreakdown.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-[#55565b]">Дүүрэг <span className="font-normal text-[#8a8b8f]">({report.preferenceSegments.districtProvidedCount} / {report.preferenceSegments.totalCustomerCount})</span></p>
                  <ul className="mt-1.5 grid gap-1">
                    {report.preferenceSegments.districtBreakdown.map(row => (
                      <li key={row.district} className="flex items-center justify-between border-b border-black/6 py-1 text-sm">
                        <span>{row.label}</span><strong className="text-[#17181b]">{row.count}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.preferenceSegments.hasYoungChildrenCount > 0 && (
                <p className="text-sm">Бага насны хүүхэдтэй: <strong>{report.preferenceSegments.hasYoungChildrenCount}</strong></p>
              )}
            </div>
          )}
        </section>
        <section className="min-w-0 rounded-3xl border border-black/7 p-5">
          <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Санал болгох системийн хамрах хүрээ</h3>
          <p className="mt-1 text-xs text-[#8a8b8f]">Нийтлэгдсэн барааны хэдэн хувь нь "Танд санал болгож байна" системд ашиглагдах шошготой вэ.</p>
          <div className="mt-4 flex items-baseline gap-2">
            <strong className="font-[var(--font-display)] text-4xl tracking-[-.04em]">{report.recommendationCoverage.taggedPercent}%</strong>
            <span className="text-xs text-[#8a8b8f]">{report.recommendationCoverage.taggedProductCount} / {report.recommendationCoverage.totalPublishedProductCount} бараа</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/6"><div className="h-full rounded-full bg-[#f0b52d]" style={{ width: `${report.recommendationCoverage.taggedPercent}%` }} /></div>
          {report.recommendationCoverage.byCategory.length > 0 && (
            <ul className="mt-4 grid gap-1.5">
              {report.recommendationCoverage.byCategory.map(row => (
                <li key={row.categoryName} className="flex items-center justify-between border-b border-black/6 py-1 text-sm">
                  <span>{row.categoryName}</span><strong className="text-[#17181b]">{row.tagged} / {row.total}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-black/7 p-5">
          <h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Гишүүнчлэлийн түвшин</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {report.loyaltyTiers.map(tier => (
              <div key={tier.tierName} className="rounded-2xl bg-[#f8f5ef] p-4 text-center">
                <p className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.05em]">{tier.customerCount}</p>
                <p className="mt-1 text-[10px] font-extrabold tracking-[.12em] text-[#8a8b8f]">{tier.tierName.toUpperCase()}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-3xl border border-black/7 p-5">
          <div className="flex items-center gap-2"><Smartphone size={16} className="text-[#3970a7]" /><h3 className="font-[var(--font-display)] text-lg font-semibold tracking-[-.04em]">Төхөөрөмж</h3></div>
          <p className="mt-1 text-xs text-[#8a8b8f]">Захиалга хийсэн үеийн төхөөрөмж — шинээр бичигдэж эхэлсэн систем тул зөвхөн шинэ захиалгуудад л мэдээлэлтэй.</p>
          {report.traffic.deviceTypes.length === 0 ? (
            <p className="mt-4 text-sm text-[#77787d]">Мэдээлэл алга.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {report.traffic.deviceTypes.map(row => (
                <li key={row.device} className="flex items-center justify-between border-b border-black/6 pb-2 text-sm">
                  <span>{row.device}</span><strong className="text-[#17181b]">{row.orderCount}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function DeltaBadge({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  const isUp = percent >= 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  // Brighter than the site's brand green/red (#2c7650/#df1f3d) on purpose --
  // those hues are tuned for the light theme; this dark-only badge needs
  // more luminance to stay legible, always paired with the icon+sign (never
  // color alone -- validated via the dataviz skill's contrast check).
  const color = isUp ? "#4ade80" : "#f87171";
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-bold" style={{ color }}>
      <Icon size={12} />{isUp ? "+" : ""}{percent}%
    </span>
  );
}

function Sparkline({ current, previous, accent }: { current: number[]; previous: number[] | null; accent: string }) {
  const data = current.map((value, i) => ({ i, current: value, previous: previous?.[i] }));
  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="i" hide />
          <YAxis hide domain={[0, (max: number) => (max > 0 ? max * 1.15 : 1)]} />
          {previous ? <Area type="monotone" dataKey="previous" stroke="rgba(255,255,255,.35)" fill="none" strokeWidth={1.5} dot={false} isAnimationActive={false} /> : null}
          <Area type="monotone" dataKey="current" stroke={accent} fill={accent} fillOpacity={0.18} strokeWidth={2} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Semicircle "speedometer" gauge -- hand-rolled SVG (see arcPath's comment
 *  above for why, not recharts). Max is derived from this tile's own recent
 *  history (never an external, fabricated "target AOV"). */
function AovGauge({ current, previous, accent }: { current: number; previous: number | null; accent: string }) {
  const max = roundUpToNiceNumber(Math.max(current, previous ?? current, 1) * 1.25);
  const ratio = Math.max(0, Math.min(1, current / max));
  const valueAngle = 180 - ratio * 180;
  const cx = 100, cy = 90, r = 74;
  const needleTip = polarPoint(cx, cy, r - 22, valueAngle);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 100" className="w-full max-w-[200px]">
        <path d={arcPath(cx, cy, r, 180, 0)} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={14} strokeLinecap="round" />
        <path d={arcPath(cx, cy, r, 180, valueAngle)} fill="none" stroke={accent} strokeWidth={14} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#fff" strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={6} fill="#fff" />
        <text x={cx - r} y={cy + 14} fontSize="9" fill="rgba(255,255,255,.45)" textAnchor="middle">₮0</text>
        <text x={cx + r} y={cy + 14} fontSize="9" fill="rgba(255,255,255,.45)" textAnchor="middle">{formatMnt(max)}</text>
      </svg>
      <p className="-mt-1 font-[var(--font-display)] text-xl font-semibold text-white">{formatMnt(current)}</p>
    </div>
  );
}

function NetProfitTile({ netProfitMnt, marginPercent, deltaPercent, itemsWithCostCount, totalItemsSold }: { netProfitMnt: number; marginPercent: number; deltaPercent: number | null; itemsWithCostCount: number; totalItemsSold: number }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#1f2126] p-5">
      <div className="flex items-center justify-between">
        <span className="grid size-8 place-items-center rounded-xl" style={{ backgroundColor: "#2c765026", color: "#2c7650" }}><Percent size={15} /></span>
        <DeltaBadge percent={deltaPercent} />
      </div>
      <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[.13em] text-white/45">Цэвэр ашиг</p>
      {itemsWithCostCount > 0 ? (
        <>
          <p className="mt-1 font-[var(--font-display)] text-2xl font-semibold text-white">{formatMnt(netProfitMnt)}</p>
          <p className="mt-1.5 font-[var(--font-display)] text-lg font-semibold text-white/90">{marginPercent}% <span className="text-[11px] font-normal text-white/40">ашгийн хувь</span></p>
          <p className="mt-1 text-[11px] text-white/35">{itemsWithCostCount}/{totalItemsSold} ширхэгт cost мэдээлэлтэй (доод тал нь)</p>
        </>
      ) : (
        <>
          <p className="mt-1 font-[var(--font-display)] text-lg font-semibold text-white">Cost үнэ ороогүй</p>
          <p className="mt-1 text-[11px] text-white/35">Барааны cost үнийг admin панелаас оруулмагц энд гарна.</p>
        </>
      )}
    </div>
  );
}

function DarkStatTile({ icon: Icon, label, value, caption, accent }: { icon: typeof Wallet; label: string; value: string; caption?: string; accent: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#1f2126] p-5">
      <span className="grid size-8 place-items-center rounded-xl" style={{ backgroundColor: `${accent}26`, color: accent }}><Icon size={15} /></span>
      <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[.13em] text-white/45">{label}</p>
      <p className="mt-1 font-[var(--font-display)] text-xl font-semibold text-white">{value}</p>
      {caption ? <p className="mt-1 text-[11px] leading-snug text-white/40">{caption}</p> : null}
    </div>
  );
}

function DarkSparkTile({ icon: Icon, label, value, deltaPercent, currentSeries, previousSeries, accent }: {
  icon: typeof Wallet; label: string; value: string; deltaPercent: number | null;
  currentSeries: number[]; previousSeries: number[] | null; accent: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#1f2126] p-5">
      <div className="flex items-center justify-between">
        <span className="grid size-8 place-items-center rounded-xl" style={{ backgroundColor: `${accent}26`, color: accent }}><Icon size={15} /></span>
        <DeltaBadge percent={deltaPercent} />
      </div>
      <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[.13em] text-white/45">{label}</p>
      <p className="mt-1 font-[var(--font-display)] text-2xl font-semibold text-white">{value}</p>
      <div className="mt-2"><Sparkline current={currentSeries} previous={previousSeries} accent={accent} /></div>
    </div>
  );
}

function PnlRow({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="min-w-0 flex items-center justify-between gap-2 text-white/70">
      <span className="min-w-0 truncate">{label}{note ? <span className="ml-1 text-[10px] text-white/35">({note})</span> : null}</span>
      <span className="shrink-0">{value < 0 ? `−${formatMnt(Math.abs(value))}` : formatMnt(value)}</span>
    </div>
  );
}

/** Real fields only -- no invented line items like the Geckoboard
 *  reference's "Referer cut"/"Paypal transactions" (this business has no
 *  equivalent). deliveryFeesCollectedMnt/discountsGivenMnt are
 *  informational rows already netted into netRevenueMnt -- the only real
 *  subtraction is netRevenueMnt - costOfGoodsMnt (see getPnlOverview). */
function PnlCard({ pnl }: { pnl: AnalyticsReport["pnl"] }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#1f2126] p-5">
      <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-white/45">P&L тойм</p>
      <div className="mt-3 grid gap-2 text-sm">
        <PnlRow label="Захиалгын дүн" value={pnl.subtotalMnt} />
        <PnlRow label="Хүргэлтийн орлого" value={pnl.deliveryFeesCollectedMnt} note="нийт дүнд шингэсэн" />
        <PnlRow label="Хямдрал" value={-pnl.discountsGivenMnt} note="нийт дүнд шингэсэн" />
        <PnlRow label="Барааны өртөг" value={-pnl.costOfGoodsMnt} note={`${pnl.itemsWithCostCount}/${pnl.totalItemsSold} ш мэдээлэлтэй`} />
        <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2 text-sm font-bold text-white">
          <span>Цэвэр ашиг</span><span>{formatMnt(pnl.netProfitMnt)}</span>
        </div>
      </div>
    </div>
  );
}

function RankedDollarCard({ title, icon: Icon, rows, emptyLabel }: { title: string; icon: typeof MapPin; rows: { label: string; revenueMnt: number }[]; emptyLabel: string }) {
  const top = [...rows].sort((a, b) => b.revenueMnt - a.revenueMnt).slice(0, 5);
  return (
    <div className="min-w-0 rounded-2xl bg-[#1f2126] p-5">
      <div className="flex items-center gap-1.5 text-white/45"><Icon size={13} /><p className="text-[10px] font-extrabold uppercase tracking-[.14em]">{title}</p></div>
      {top.length === 0 ? (
        <p className="mt-3 text-sm text-white/35">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 grid gap-2 text-sm">
          {top.map(row => (
            <li key={row.label} className="min-w-0 flex items-center justify-between gap-2 text-white/75">
              <span className="min-w-0 truncate">{row.label}</span><strong className="shrink-0 text-white">{formatMnt(row.revenueMnt)}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChannelBarList({ rows }: { rows: { label: string; orderCount: number }[] }) {
  if (!rows.length) return <p className="mt-2 text-sm text-white/35">Мэдээлэл алга.</p>;
  const max = Math.max(1, ...rows.map(row => row.orderCount));
  return (
    <ul className="mt-1.5 grid gap-2">
      {rows.map(row => (
        <li key={row.label} className="min-w-0 text-xs">
          <div className="min-w-0 flex items-center justify-between gap-2 text-white/70"><span className="min-w-0 truncate">{row.label}</span><strong className="shrink-0 text-white">{row.orderCount}</strong></div>
          <div className="mt-1 h-1.5 rounded-full bg-[#2a2c32]"><div className="h-full rounded-full bg-[#3970a7]" style={{ width: `${(row.orderCount / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function ChannelBarsCard({ title, icon: Icon, groups }: { title: string; icon: typeof Truck; groups: { label: string; rows: { label: string; orderCount: number }[] }[] }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#1f2126] p-5">
      <div className="flex items-center gap-1.5 text-white/45"><Icon size={13} /><p className="text-[10px] font-extrabold uppercase tracking-[.14em]">{title}</p></div>
      {groups.map(group => (
        <div key={group.label} className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-[.1em] text-white/35">{group.label}</p>
          <ChannelBarList rows={group.rows} />
        </div>
      ))}
    </div>
  );
}

/** Tier F: CAC's one real input (marketing spend has no other source in
 *  this app) lives right next to the figure it drives, rather than a
 *  separate settings page -- see the schema comment on marketingSpend. */
function CacCard({ cac }: { cac: AnalyticsReport["cac"] }) {
  const utils = trpc.useUtils();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [spend, setSpend] = useState("");
  const updateSpend = trpc.admin.updateMarketingSpend.useMutation({
    onSuccess: () => { toast.success("Зар сурталчилгааны зардал хадгалагдлаа."); utils.admin.analyticsReport.invalidate(); setSpend(""); },
    onError: error => toast.error(messageFrom(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const spendMnt = Number(spend);
    if (!month || !/^\d{4}-\d{2}$/.test(month) || Number.isNaN(spendMnt) || spendMnt < 0) { toast.error("Сар, зардлын дүнг зөв оруулна уу."); return; }
    updateSpend.mutate({ monthKey: month, spendMnt });
  };

  return (
    <div className="min-w-0 rounded-2xl bg-[#1f2126] p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-[.13em] text-white/45">CAC (Нэг харилцагч татах зардал)</p>
        <p className="mt-1 font-[var(--font-display)] text-2xl font-semibold text-white">{cac.cacMnt !== null ? formatMnt(cac.cacMnt) : "Тодорхойгүй"}</p>
        <p className="mt-1 max-w-md text-[11px] leading-snug text-white/40">
          {cac.cacMnt !== null ? `${formatMnt(cac.totalSpendMnt)} зар зардал / ${cac.newCustomerCount} шинэ харилцагч` : cacUnavailableCaption(cac.unavailableReason)}
        </p>
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 sm:mt-0 sm:shrink-0">
        <label className="grid gap-1 text-[10px] font-bold text-white/50">Сар
          <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-9 rounded-lg border border-white/15 bg-[#17181b] px-2 text-xs text-white outline-none focus:border-[#df1f3d]" />
        </label>
        <label className="grid gap-1 text-[10px] font-bold text-white/50">Зардал (₮)
          <input type="number" min="0" value={spend} onChange={event => setSpend(event.target.value)} placeholder="0" className="h-9 w-28 rounded-lg border border-white/15 bg-[#17181b] px-2 text-xs text-white outline-none focus:border-[#df1f3d]" />
        </label>
        <button type="submit" disabled={updateSpend.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#df1f3d] px-3 text-xs font-bold text-white disabled:opacity-50">
          {updateSpend.isPending ? <LoaderCircle className="animate-spin" size={13} /> : "Хадгалах"}
        </button>
      </form>
    </div>
  );
}

function RankedTable({ rows, emptyLabel }: { rows: { label: string; quantity: number; revenueMnt: number }[]; emptyLabel: string }) {
  if (!rows.length) return <p className="mt-4 text-sm text-[#77787d]">{emptyLabel}</p>;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[380px] border-separate border-spacing-0 text-left">
        <thead>
          <tr className="text-[10px] font-extrabold tracking-[.12em] text-[#8a8b8f]">
            <th className="border-b border-black/8 pb-2">НЭР</th>
            <th className="border-b border-black/8 pb-2 text-right">ТОО</th>
            <th className="border-b border-black/8 pb-2 text-right">ОРЛОГО</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="text-sm">
              <td className="max-w-[220px] truncate border-b border-black/6 py-2.5" title={row.label}>{row.label}</td>
              <td className="border-b border-black/6 py-2.5 text-right font-bold">{row.quantity}</td>
              <td className="border-b border-black/6 py-2.5 text-right text-[#77787d]">{formatMnt(row.revenueMnt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
