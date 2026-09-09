import { TrendingDown, TrendingUp } from "lucide-react";

// A fresh, light-theme %-change pill for the new dashboard stat cards --
// deliberately NOT AdminAnalyticsPanel.tsx's DeltaBadge (that one is tuned
// for its dark-band tiles, brighter greens/reds that would look washed out
// on a white card). `percent: null` renders a neutral dash, never a
// fabricated "0%" -- the honest state for "no comparison data available".
export default function AdminDeltaPill({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="inline-flex items-center rounded-full bg-[var(--a-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--a-faint)]">—</span>;
  }
  const isUp = percent >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${isUp ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-neg-soft)] text-[var(--a-neg)]"}`}>
      {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {isUp ? "+" : ""}{percent}%
    </span>
  );
}
