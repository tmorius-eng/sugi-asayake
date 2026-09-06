import { Lock, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import AdminDeltaPill from "./AdminDeltaPill";

// Generic stat card for the new Gentelella-style dashboard -- a fresh,
// purpose-built component (not a reuse of AdminAnalyticsPanel.tsx's dark
// DarkStatTile/DarkSparkTile, per Tom's "originals" instruction). Every
// call site must explicitly say `value: "locked"` for a redacted metric --
// there is no way to accidentally fall through to rendering undefined/NaN
// for a staff session.
//
// "Зөвхөн админд" copy/Lock-icon treatment matches the wording already
// established in AdminDashboardHome.tsx's old KpiCard, so the redaction
// reads consistently across the whole admin panel even though this card's
// visual layout is new.
export type AdminStatCardProps = {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | "locked";
  /** undefined = no delta pill shown at all (e.g. Total Users, which has no
   *  real period-over-period comparison data); null = pill shown as "—". */
  deltaPercent?: number | null;
  caption?: string;
  sparkline?: ReactNode;
  /** Bar color is a literal Tailwind class from the call site (e.g.
   *  "bg-[#2c7650]"), not a runtime-computed value -- Tailwind's build-time
   *  scanner only picks up class names that appear literally in source. */
  progressBar?: { percent: number; barClassName: string; caption: string };
};

export default function AdminStatCard({ icon: Icon, iconBg, iconColor, label, value, deltaPercent, caption, sparkline, progressBar }: AdminStatCardProps) {
  const isLocked = value === "locked";
  return (
    <div className="flex flex-col justify-between rounded-xl border border-black/7 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="grid size-9 place-items-center rounded-xl" style={{ backgroundColor: iconBg, color: iconColor }}><Icon size={17} aria-hidden="true" /></span>
          <p className="mt-3 text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]">{label.toUpperCase()}</p>
          {isLocked ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#a9a49a]"><Lock size={13} aria-hidden="true" />Зөвхөн админд</p>
          ) : (
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.05em]">{value}</span>
              {deltaPercent !== undefined && <AdminDeltaPill percent={deltaPercent} />}
            </div>
          )}
          {caption && !isLocked && <p className="mt-1 text-[11px] text-[#8a8b8f]">{caption}</p>}
        </div>
        {sparkline && !isLocked && sparkline}
      </div>
      {progressBar && !isLocked && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f1ede6]" role="progressbar" aria-valuenow={progressBar.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full ${progressBar.barClassName}`} style={{ width: `${Math.min(100, Math.max(0, progressBar.percent))}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-[#8a8b8f]">{progressBar.caption}</p>
        </div>
      )}
    </div>
  );
}
