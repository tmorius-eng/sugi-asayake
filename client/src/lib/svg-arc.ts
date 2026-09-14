/**
 * Хуваалцсан SVG туйлын координат/нум замын математик. Анх AdminAnalyticsPanel.tsx-
 * ийн хагас дугуй "спидометр" AOV gauge-д гараар бичигдсэн (recharts-ийн
 * RadialBarChart биш — зүүний тэнхлэг/эргэлтийг пикселээр яг удирдах нь
 * ResponsiveContainer доторх recharts-ийн cx/cy-г урвуулан гаргахаас хавьгүй
 * найдвартай). Хоёр дахь хэрэглэгч (нүүрний редизайны InfinityGraph,
 * client/src/components/home/InfinityGraph.tsx) өөр дүрст (нэг хагас дугуйн оронд
 * давхацсан хоёр дугуй) яг ижил математик шаардсан үед энд салгав — нэг хэрэглэгч
 * салгах шаардлага үүсгэхгүй байсан.
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
