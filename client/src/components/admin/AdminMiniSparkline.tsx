import { Area, AreaChart, ResponsiveContainer } from "recharts";

// Small inline trend chart for the 2 stat cards that have a real per-day
// series (Orders, Page Views) -- a fresh, purpose-built component for this
// light-card dashboard, not a reuse of AdminAnalyticsPanel.tsx's own
// dark-tile-tuned Sparkline (different chart library usage, same
// underlying Recharts dependency, per Tom's "originals" instruction: the
// design is original, the charting library is shared infrastructure).
export default function AdminMiniSparkline({ values, color }: { values: number[]; color: string }) {
  const data = values.map((value, index) => ({ index, value }));
  return (
    <div className="h-10 w-20 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`admin-spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.75} fill={`url(#admin-spark-${color.replace("#", "")})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
