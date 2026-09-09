import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoaderCircle, Lock } from "lucide-react";
import { formatMnt } from "@shared/format";
import { buildDayLabels, buildDaySeries, resolveRange, rangeDayCount, type AdminDateRange } from "@/lib/analyticsRange";
import { trpc } from "@/lib/trpc";
import AdminDateRangePicker from "./AdminDateRangePicker";

/**
 * The reference's "Summary" card: two smooth lines over the selected window,
 * a dot legend, and a hover band with an exact-value tooltip.
 *
 * Both series are real: order count per day and paid revenue per day, from
 * getRevenueTimeseries. They live on separate axes because they're separate
 * units (orders in the single digits, revenue in the millions) -- the left
 * axis is labelled with revenue, the order axis is hidden, and the tooltip
 * always prints both exact figures so the visual scaling can never be read
 * as a claim about relative magnitude.
 */
export default function AdminSummaryChart({ range, canSeeFinancials, onRangeChange }: { range: AdminDateRange; canSeeFinancials: boolean; onRangeChange?: (range: AdminDateRange) => void }) {
  const dates = useMemo(() => resolveRange(range), [range]);
  const input = useMemo(() => ({ dateFrom: dates.dateFrom?.toISOString(), dateTo: dates.dateTo?.toISOString() }), [dates]);
  const reportQuery = trpc.admin.analyticsReport.useQuery(input, { enabled: canSeeFinancials });

  const days = rangeDayCount(range);

  const chartData = useMemo(() => {
    const rows = reportQuery.data?.revenueTimeseries ?? [];
    if (!dates.dateFrom || days === null) {
      // "All time" (or a custom range with no start): no fixed day axis to
      // zero-fill against, so plot exactly the days that have data.
      return rows.map(row => ({ label: row.date.slice(5), orders: row.orderCount, revenue: row.revenueMnt }));
    }
    // Anchor the day axis on the window's LAST day, not its first. A "7
    // хоног" window runs from now-7d to now, which touches eight calendar
    // days; building 7 slots forward from dateFrom dropped today entirely,
    // so today's revenue counted in the KPI above but was missing from the
    // chart beside it.
    const lastDay = dates.dateTo ?? new Date();
    const seriesStart = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() - (days - 1));
    const labels = buildDayLabels(seriesStart, days);
    const orders = buildDaySeries(rows, seriesStart, days, "orderCount");
    const revenue = buildDaySeries(rows, seriesStart, days, "revenueMnt");
    return labels.map((label, index) => ({ label, orders: orders[index], revenue: revenue[index] }));
  }, [reportQuery.data, dates.dateFrom, dates.dateTo, days]);

  // Long windows would collide their x labels -- show roughly a dozen.
  const tickInterval = chartData.length > 14 ? Math.ceil(chartData.length / 12) - 1 : 0;

  return (
    <section className="admin-card admin-card-hover min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-[var(--font-display)] text-[19px] font-semibold tracking-[-.03em] text-[var(--a-text)]">Тойм</h3>
        <div className="flex items-center gap-3">
          <LegendDot color="var(--a-chart-1)" label="Захиалга" />
          <LegendDot color="var(--a-chart-2)" label="Орлого" />
          {onRangeChange && <AdminDateRangePicker value={range} onChange={onRangeChange} />}
        </div>
      </div>

      {!canSeeFinancials ? (
        <p className="mt-8 flex items-center justify-center gap-1.5 py-16 text-sm font-bold text-[var(--a-faint)]"><Lock size={14} aria-hidden="true" />Зөвхөн санхүү/админд</p>
      ) : reportQuery.isLoading ? (
        <p className="mt-8 flex items-center justify-center gap-2 py-16 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</p>
      ) : reportQuery.error ? (
        <p className="mt-8 py-16 text-center text-xs text-[var(--a-neg)]">{reportQuery.error.message}</p>
      ) : (
        <div className="mt-5 h-[268px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--a-chart-grid)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={tickInterval} minTickGap={4} />
              <YAxis yAxisId="revenue" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={52} tickFormatter={compactMnt} />
              <YAxis yAxisId="orders" orientation="right" hide />
              <Tooltip
                cursor={{ stroke: "var(--a-chart-band)", strokeWidth: 46 }}
                content={<SummaryTooltip />}
              />
              <Line yAxisId="orders" type="monotone" dataKey="orders" name="Захиалга" stroke="var(--a-chart-1)" strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} animationDuration={900} />
              <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Орлого" stroke="var(--a-chart-2)" strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} animationDuration={900} animationBegin={140} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--a-text-soft)]">
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

/** ₮ in a chart axis has to be short or it eats the plot area. Mongolian
 *  "сая" (million) / "мянга" (thousand) rather than K/M, matching how prices
 *  are spoken about elsewhere in this admin. */
function compactMnt(value: number): string {
  // Short like the reference's "10K / 7K / 5K" -- the spelled-out Mongolian
  // units ("мянга"/"сая") overflow the axis gutter and get clipped.
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}М`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}мян`;
  return String(value);
}

function SummaryTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey?: string | number; value?: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const orders = payload.find(entry => entry.dataKey === "orders")?.value ?? 0;
  const revenue = payload.find(entry => entry.dataKey === "revenue")?.value ?? 0;
  return (
    <div className="admin-pop rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-2 text-[12px] shadow-[var(--a-shadow-pop)]">
      <p className="font-bold text-[var(--a-text)]">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[var(--a-text-soft)]"><span className="size-2 rounded-full" style={{ background: "var(--a-chart-1)" }} />{orders} захиалга</p>
      <p className="flex items-center gap-1.5 text-[var(--a-text-soft)]"><span className="size-2 rounded-full" style={{ background: "var(--a-chart-2)" }} />{formatMnt(revenue)}</p>
    </div>
  );
}
