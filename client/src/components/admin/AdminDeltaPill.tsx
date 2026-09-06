import { TrendingDown, TrendingUp } from "lucide-react";

// A fresh, light-theme %-change pill for the new dashboard stat cards --
// deliberately NOT AdminAnalyticsPanel.tsx's DeltaBadge (that one is tuned
// for its dark-band tiles, brighter greens/reds that would look washed out
// on a white card). `percent: null` renders a neutral dash, never a
// fabricated "0%" -- the honest state for "no comparison data available".
export default function AdminDeltaPill({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="inline-flex items-center rounded-full bg-[#f1ede6] px-2 py-0.5 text-[11px] font-bold text-[#8a8b8f]">—</span>;
  }
  const isUp = percent >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${isUp ? "bg-[#e7f2ec] text-[#2c7650]" : "bg-[#fff0f2] text-[#a51630]"}`}>
      {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {isUp ? "+" : ""}{percent}%
    </span>
  );
}
