import { useId } from "react";
import { sweepPath } from "@/lib/svg-arc";

// R=88 unchanged; center spacing tightened from 140px to 166px so the two
// loops overlap by only 10px (176 - 166) instead of the old 36px -- a
// near-pinch crossing, not a lens-shaped double-stroke blob. See the
// approved plan's Finding E (approved plan).
const CX_LEFT = 177;
const CX_RIGHT = 303;
const CY = 120;
const R = 88;
const STROKE = 18;
const TRACK_COLOR = "#e4dfd4";

/**
 * The Quick Stats infinity/figure-eight graph: two loops that cross near
 * the center (not two unrelated donut charts), per
 * docs/REFERENCE-DRIVEN-PREMIUM-REDESIGN-MASTER-PROMPT.md section 16.6.
 * Purely presentational -- the caller (QuickStatsSection, for both the
 * authenticated and the labeled-example guest view) computes the two
 * ratios and owns all loyalty-domain meaning; this component just draws
 * two gradient arcs.
 *
 * Colors: deliberately NOT the brand's bright var(--primary)/var(--accent)
 * here -- the master prompt is explicit ("copper/rose graph: muted
 * terracotta, not bright red"; "right loop: charcoal gray or muted gold").
 * --graph-copper/--graph-copper-light and --graph-charcoal/--graph-gold-muted
 * (client/src/index.css) are new tokens used only by this graph.
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
  // Unique per-instance gradient ids -- this component can render twice on
  // the same page (e.g. a future guest+authenticated preview), and SVG
  // <linearGradient> ids are global to the document.
  const uid = useId();
  const leftGradientId = `ig-left-${uid}`;
  const rightGradientId = `ig-right-${uid}`;

  return (
    <div className="ig-wrap">
      <svg className="ig-svg" viewBox="0 0 480 240" aria-hidden="true">
        <defs>
          <linearGradient id={leftGradientId} x1="0%" y1="100%" x2="60%" y2="0%">
            <stop offset="0%" stopColor="var(--graph-copper)" />
            <stop offset="100%" stopColor="var(--graph-copper-light)" />
          </linearGradient>
          <linearGradient id={rightGradientId} x1="40%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--graph-gold-muted)" />
            <stop offset="100%" stopColor="var(--graph-charcoal)" />
          </linearGradient>
        </defs>
        <path d={sweepPath(CX_LEFT, CY, R, 90, 360)} fill="none" stroke={TRACK_COLOR} strokeWidth={STROKE} />
        <path d={sweepPath(CX_RIGHT, CY, R, 90, 360)} fill="none" stroke={TRACK_COLOR} strokeWidth={STROKE} />
        <path d={sweepPath(CX_LEFT, CY, R, 90, lr * 360)} fill="none" stroke={`url(#${leftGradientId})`} strokeWidth={STROKE} strokeLinecap="round" />
        <path d={sweepPath(CX_RIGHT, CY, R, 90, rr * 360)} fill="none" stroke={`url(#${rightGradientId})`} strokeWidth={STROKE} strokeLinecap="round" />
        <circle cx={(CX_LEFT + CX_RIGHT) / 2} cy={CY} r="4" fill="var(--graph-gold-muted)" />
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
