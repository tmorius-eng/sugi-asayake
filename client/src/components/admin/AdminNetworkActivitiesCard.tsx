import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoaderCircle, Lock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { buildDaySeries, rangeOptions, rangeToDates, type RangeKey } from "@/lib/analyticsRange";
import AdminDeltaPill from "./AdminDeltaPill";

const DAY_LABELS = ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];

// Fresh "Network Activities" card matching the reference screenshot -- real
// visitor-session data (server/analytics.ts's getVisitorSessionTimeseries,
// added 2026-09-06), never a fabricated trend line. The solid area is the
// current period; the dashed line is the TRUE previous period of equal
// length (periodComparison.previousVisitorSessionTimeseries), never a
// smoothed/synthetic comparison. Admin-only, same tier as the rest of
// AdminAnalyticsPanel.tsx's analyticsReport-backed data -- staff sees the
// locked-card treatment instead of a network 403.
const networkRangeOptions = rangeOptions.filter(option => option.key === "7d" || option.key === "30d" || option.key === "90d");

const previewSeries = [420, 380, 512, 498, 561, 402, 389];
const previewPreviousSeries = [360, 340, 470, 440, 500, 370, 350];

export default function AdminNetworkActivitiesCard({ preview = false, isFullAdmin }: { preview?: boolean; isFullAdmin: boolean }) {
  const [range, setRange] = useState<RangeKey>("7d");
  const dates = useMemo(() => rangeToDates(range), [range]);
  const input = useMemo(() => ({ dateFrom: dates.dateFrom?.toISOString(), dateTo: dates.dateTo?.toISOString() }), [dates]);
  const periodDays = range === "7d" ? 7 : range === "30d" ? 30 : 90;

  const reportQuery = trpc.admin.analyticsReport.useQuery(input, { enabled: !preview && isFullAdmin });

  if (!isFullAdmin) {
    return (
      <div className="rounded-xl border border-black/7 bg-card p-5 shadow-sm">
        <p className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">NETWORK ACTIVITIES</p>
        <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[#a9a49a]"><Lock size={13} aria-hidden="true" />Зөвхөн админд</p>
      </div>
    );
  }

  if (preview) {
    return renderCard({
      chartData: DAY_LABELS.map((day, index) => ({ day, current: previewSeries[index], previous: previewPreviousSeries[index] })),
      headline: previewSeries.reduce((sum, v) => sum + v, 0),
      deltaPercent: 7,
      range,
      setRange,
    });
  }

  if (reportQuery.isLoading) return <div className="flex items-center gap-2 rounded-xl border border-black/7 bg-card p-5 text-xs text-[#77787d] shadow-sm"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</div>;
  if (reportQuery.error) return <div className="rounded-xl border border-black/7 bg-card p-5 text-xs text-[#a51630] shadow-sm">{reportQuery.error.message}</div>;
  const report = reportQuery.data;
  if (!report || !dates.dateFrom) return null;

  const previousFrom = new Date(dates.dateFrom.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const currentSeries = buildDaySeries(report.visitorSessionTimeseries, dates.dateFrom, periodDays, "sessionCount");
  const previousSeries = buildDaySeries(report.periodComparison.previousVisitorSessionTimeseries, previousFrom, periodDays, "sessionCount");
  const chartData = currentSeries.map((value, index) => ({
    day: periodDays <= 7 ? DAY_LABELS[index] : `${index + 1}`,
    current: value,
    previous: previousSeries[index],
  }));

  return renderCard({
    chartData,
    headline: report.periodComparison.current.sessionsCount,
    deltaPercent: report.periodComparison.deltaPercent.sessionsCount,
    range,
    setRange,
  });
}

function renderCard({ chartData, headline, deltaPercent, range, setRange }: {
  chartData: { day: string; current: number; previous: number }[];
  headline: number;
  deltaPercent: number | null;
  range: RangeKey;
  setRange: (range: RangeKey) => void;
}) {
  return (
    <div className="rounded-xl border border-black/7 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">NETWORK ACTIVITIES</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.05em]">{headline.toLocaleString("mn-MN")}</span>
            <AdminDeltaPill percent={deltaPercent} />
          </div>
          <p className="mt-1 text-[11px] text-[#8a8b8f]">Нийт сессийн тоо (энэ хугацаанд)</p>
        </div>
        <div className="flex gap-1 rounded-full bg-[#f1ede6] p-1">
          {networkRangeOptions.map(option => (
            <button key={option.key} type="button" onClick={() => setRange(option.key)} className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${range === option.key ? "bg-[#17181b] text-white" : "text-[#57585e]"}`}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="admin-network-activities-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2c9678" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#2c9678" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ede8de" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8a8b8f" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#8a8b8f" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #ded9d0", fontSize: 12 }} />
            <Area type="monotone" dataKey="current" name="Одоогийн" stroke="#2c9678" strokeWidth={2.25} fill="url(#admin-network-activities-fill)" isAnimationActive={false} />
            <Line type="monotone" dataKey="previous" name="Өмнөх үе" stroke="#3970a7" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
