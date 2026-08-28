import { sweepPath } from "@/lib/svg-arc";

const CX_LEFT = 170;
const CX_RIGHT = 310;
const CY = 120;
const R = 88;
const STROKE = 18;
const TRACK_COLOR = "#e4dfd4";

/**
 * The Quick Stats infinity/figure-eight graph: two overlapping circles
 * (not two unrelated donut charts -- they share a crossing point at the
 * center, per docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md
 * section 16.6). Purely presentational -- QuickStatsSection computes the
 * two ratios and owns all loyalty-domain meaning (which loop is spend
 * progress vs. discount%); this component just draws two arcs.
 *
 * Decorative only (aria-hidden): the caller must render the same values as
 * real text elsewhere (QuickStatsSection does, both as the .ig-value
 * overlays below and as a redundant sr-only summary), so a screen reader
 * never depends on this SVG.
 */
export default function InfinityGraph({
  leftRatio,
  leftValue,
  leftLabel,
  rightRatio,
  rightValue,
  rightLabel,
}: {
  leftRatio: number;
  leftValue: string;
  leftLabel: string;
  rightRatio: number;
  rightValue: string;
  rightLabel: string;
}) {
  const lr = Math.max(0, Math.min(1, leftRatio));
  const rr = Math.max(0, Math.min(1, rightRatio));

  return (
    <div className="ig-wrap">
      <svg className="ig-svg" viewBox="0 0 480 240" aria-hidden="true">
        <path d={sweepPath(CX_LEFT, CY, R, 90, 360)} fill="none" stroke={TRACK_COLOR} strokeWidth={STROKE} />
        <path d={sweepPath(CX_RIGHT, CY, R, 90, 360)} fill="none" stroke={TRACK_COLOR} strokeWidth={STROKE} />
        <path d={sweepPath(CX_LEFT, CY, R, 90, lr * 360)} fill="none" stroke="var(--primary)" strokeWidth={STROKE} strokeLinecap="round" />
        <path d={sweepPath(CX_RIGHT, CY, R, 90, rr * 360)} fill="none" stroke="var(--accent)" strokeWidth={STROKE} strokeLinecap="round" />
        <circle cx={(CX_LEFT + CX_RIGHT) / 2} cy={CY} r="4" fill="var(--accent)" />
      </svg>
      <div className="ig-value ig-value-left">
        <strong>{leftValue}</strong>
        <span>{leftLabel}</span>
      </div>
      <div className="ig-value ig-value-right">
        <strong>{rightValue}</strong>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
