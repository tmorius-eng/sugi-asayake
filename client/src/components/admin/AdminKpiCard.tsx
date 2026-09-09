import { Lock, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The reference's tinted KPI tile (top row of five).
 *
 * Layout, top to bottom: quiet label, large value, then a footer row with the
 * period-over-period pill on the left and a secondary figure on the right.
 * Tint comes from the --a-kpi-N token set so the row keeps its pastel identity
 * in light mode and becomes five distinguishable deep tints in dark mode.
 *
 * `delta === undefined` renders no pill at all (the metric has no honest
 * comparison to make); `delta === null` renders a neutral dash (a comparison
 * exists in principle but there is no data for it). Neither ever renders a
 * fabricated 0%.
 */
export type KpiTint = 1 | 2 | 3 | 4 | 5;

export default function AdminKpiCard({ tint, label, value, delta, secondary, locked = false, lockLabel = "Зөвхөн санхүү/админд", onClick, title }: {
  tint: KpiTint;
  label: string;
  value: ReactNode;
  delta?: number | null;
  secondary?: string | null;
  locked?: boolean;
  lockLabel?: string;
  onClick?: () => void;
  title?: string;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      title={title}
      className="admin-kpi flex w-full flex-col justify-between p-4 text-left sm:p-[18px]"
      style={{ background: `var(--a-kpi-${tint})`, minHeight: 118 }}
    >
      <p className="line-clamp-2 text-[12.5px] font-medium leading-[1.35] text-[var(--a-text-soft)]">{label}</p>
      {locked ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[var(--a-faint)]"><Lock size={14} aria-hidden="true" />{lockLabel}</p>
      ) : (
        <>
          <p className="admin-metric mt-2 truncate font-[var(--font-display)] text-[22px] font-semibold leading-none tracking-[-.045em] text-[var(--a-text)] 2xl:text-[26px]">{value}</p>
          <div className="mt-3 flex items-center justify-between gap-1.5">
            {delta === undefined ? <span /> : <DeltaPill percent={delta} />}
            {secondary && <span className="min-w-0 truncate text-[11.5px] font-medium text-[var(--a-muted)]">{secondary}</span>}
          </div>
        </>
      )}
    </Wrapper>
  );
}

function DeltaPill({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="inline-flex items-center rounded-full bg-[var(--a-card)]/70 px-2.5 py-1 text-[12px] font-semibold text-[var(--a-muted)]">—</span>;
  }
  const isUp = percent >= 0;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--a-card)]/75 px-2 py-1 text-[11.5px] font-semibold"
      style={{ color: isUp ? "var(--a-pos)" : "var(--a-neg)" }}
    >
      {isUp ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
      {isUp ? "" : "-"}{Math.abs(percent)} %
    </span>
  );
}
