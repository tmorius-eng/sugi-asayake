// AdminAnalyticsPanel.tsx-ээс салгав (2026-09-06): шинэ admin самбарын "Network
// Activities" 7/30/90 хоногийн toggle нь огнооны цонх, тэгээр дүүргэсэн өдрийн
// цувааг яг ижил аргаар тооцоолохын тулд — бие даан бичсэн (нарийн зөрж болох)
// хоёр дахь тооцоолуур биш. Цэвэр зөөлт — AdminAnalyticsPanel-ийн зан төлөв
// хэвээр, зөвхөн энд байгааг import хийнэ.
//
// 2026-09-08 (лавлагаанд суурилсан admin редизайн): "10d" ба бодит "custom"
// цонх нэмэгдэв. Tom, шууд: "7 honog 10 honog 30 honog 90 honog gej manaid baidag
// bol ene zurgan deer hussen uduruu songoj boldog" — өмнө нь зөвхөн preset байсан,
// лавлагаа нь бодит огноо сонгуулдаг тул `custom` хоёр yyyy-mm-dd мөр авч, хэрэглэгч
// бүр локал ternary биш нэг функцээр муж шийднэ.
export type RangeKey = "7d" | "10d" | "30d" | "90d" | "thisMonth" | "all" | "custom";

/** A range as the UI holds it. `customFrom`/`customTo` are only read when
 *  key === "custom"; they're kept on the object (rather than in a separate
 *  state) so switching to a preset and back restores what was typed. */
export type AdminDateRange = { key: RangeKey; customFrom?: string; customTo?: string };

const PRESET_DAYS: Partial<Record<RangeKey, number>> = { "7d": 7, "10d": 10, "30d": 30, "90d": 90 };

/** Parses a yyyy-mm-dd form value into a local-midnight Date. `endOfDay`
 *  pushes it to 23:59:59.999 so a single-day custom range ("2026-09-08 to
 *  2026-09-08") covers that whole day rather than an empty instant. */
export function parseDayInput(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function toDayInput(date: Date): string {
  // Local, not toISOString().slice(0,10) -- Ulaanbaatar is UTC+8, so the ISO
  // form of "today 01:00" is yesterday's date, which would silently shift
  // every custom range back a day.
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The one place a range becomes an actual window. A custom range missing
 *  either endpoint falls back to "no bound on that side" rather than
 *  throwing -- half-entered input should narrow the view, not break it. */
export function resolveRange(range: AdminDateRange): { dateFrom?: Date; dateTo?: Date } {
  if (range.key === "all") return {};
  if (range.key === "custom") {
    const dateFrom = parseDayInput(range.customFrom);
    const dateTo = parseDayInput(range.customTo, true);
    // Tolerate a reversed pair instead of returning an empty window.
    if (dateFrom && dateTo && dateFrom > dateTo) return { dateFrom: parseDayInput(range.customTo), dateTo: parseDayInput(range.customFrom, true) };
    return { dateFrom, dateTo };
  }
  const now = new Date();
  if (range.key === "thisMonth") return { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1) };
  const days = PRESET_DAYS[range.key] ?? 7;
  return { dateFrom: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) };
}

/** Number of whole days the window covers, or null when it's unbounded
 *  ("all time", or a custom range with no start) -- charts that need a
 *  fixed-length day axis use this to decide whether they can render at all. */
/** Calendar days between two local dates, inclusive of both ends (the 1st to
 *  the 1st is 1 day, the 1st to the 2nd is 2). */
function calendarDayCount(from: Date, to: Date): number {
  const fromYmd = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const toYmd = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((toYmd - fromYmd) / 86_400_000) + 1;
}

export function rangeDayCount(range: AdminDateRange): number | null {
  if (range.key === "all") return null;
  const preset = PRESET_DAYS[range.key];
  if (preset) return preset;
  const { dateFrom, dateTo } = resolveRange(range);
  if (!dateFrom) return null;
  const end = dateTo ?? new Date();
  // 2026-09-27 (F7b): raw ms/86_400_000 rounds a PARTIAL day away -- viewed
  // "Энэ сар" before noon on (say) the 2nd, dateFrom..now is 1.x days,
  // rounding to 1 and dropping a calendar day (the 1st) from the chart axis
  // below. Count actual calendar dates instead.
  return Math.max(1, calendarDayCount(dateFrom, end));
}

export function rangeToDates(range: RangeKey): { dateFrom?: Date; dateTo?: Date } {
  return resolveRange({ key: range });
}

export const rangeOptions: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 хоног" },
  { key: "10d", label: "10 хоног" },
  { key: "30d", label: "30 хоног" },
  { key: "90d", label: "90 хоног" },
  { key: "thisMonth", label: "Энэ сар" },
  { key: "all", label: "Бүх цаг үе" },
];

export function describeRange(range: AdminDateRange): string {
  if (range.key === "custom") {
    const { dateFrom, dateTo } = resolveRange(range);
    if (!dateFrom && !dateTo) return "Огноо сонгох";
    const from = dateFrom ? toDayInput(dateFrom) : "эхнээс";
    const to = dateTo ? toDayInput(dateTo) : "өнөөдөр";
    return `${from} — ${to}`;
  }
  return rangeOptions.find(option => option.key === range.key)?.label ?? "7 хоног";
}

/** Zero-fills a sparse day-keyed series (see getRevenueTimeseries's own doc
 *  comment: "days with zero orders are simply absent") into a fixed-length
 *  array indexed by day-offset from `from` -- required for a two-series
 *  sparkline overlay, which breaks if each series is merely "existing rows
 *  in order" rather than aligned to the same day-offset axis. Generic over
 *  the row shape (revenue/order rows, visitor-session rows, etc.) so every
 *  admin chart shares one implementation instead of one per data shape. */
export function buildDaySeries<T extends { date: string }>(rows: T[], from: Date, days: number, key: keyof T): number[] {
  const byDate = new Map(rows.map(row => [row.date, row]));
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(from.getTime() + i * 86_400_000);
    const row = byDate.get(toDayInput(day));
    return row ? Number(row[key]) : 0;
  });
}

/** Day labels for a chart's x-axis, matching the reference's "Sep 07" form.
 *  Long windows get every Nth label so ticks never collide. */
export function buildDayLabels(from: Date, days: number): string[] {
  const formatter = new Intl.DateTimeFormat("mn-MN", { month: "short", day: "2-digit" });
  return Array.from({ length: days }, (_, i) => formatter.format(new Date(from.getTime() + i * 86_400_000)));
}
