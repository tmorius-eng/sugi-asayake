/**
 * Shared SVG polar-coordinate/arc-path math. Originally hand-rolled once
 * inside AdminAnalyticsPanel.tsx for its semicircle "speedometer" AOV gauge
 * (rather than routed through recharts' RadialBarChart -- exact pixel
 * control over the needle's pivot/rotation is far more reliable than
 * reverse-engineering recharts' internal cx/cy from inside a
 * ResponsiveContainer that resizes). Extracted here once a second consumer
 * (the home redesign's InfinityGraph, see
 * client/src/components/home/InfinityGraph.tsx) needed the exact same
 * math for a different shape (two overlapping circles instead of one
 * semicircle) -- a single consumer wouldn't have justified extracting this.
 */

export function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

/** SVG arc path from startAngle to endAngle (degrees, 0=right/3-o'clock,
 *  90=top, 180=left/9-o'clock, going counter-clockwise as angle increases). */
export function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarPoint(cx, cy, r, startAngle);
  const end = polarPoint(cx, cy, r, endAngle);
  const largeArc = startAngle - endAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** A clockwise sweep of `sweepDeg` degrees (0-360, clamped) starting at
 *  `startAngle`, expressed as one or two arcPath segments. arcPath alone
 *  can represent any sweep short of a full circle, but a full 360deg sweep
 *  is degenerate for a single arc (start and end points coincide, so
 *  nothing would render) -- used by InfinityGraph
 *  (client/src/components/home/InfinityGraph.tsx) for a loop that can
 *  legitimately reach 100%, which AdminAnalyticsPanel's semicircle gauge
 *  (always <=180deg) never needed. */
export function sweepPath(cx: number, cy: number, r: number, startAngle: number, sweepDeg: number): string {
  const clamped = Math.max(0, Math.min(360, sweepDeg));
  if (clamped <= 0) return "";
  if (clamped >= 360) {
    const mid = startAngle - 180;
    const end = startAngle - 360;
    return `${arcPath(cx, cy, r, startAngle, mid)} ${arcPath(cx, cy, r, mid, end)}`;
  }
  return arcPath(cx, cy, r, startAngle, startAngle - clamped);
}
