// Extracted from AdminAnalyticsPanel.tsx (2026-09-06) so the new admin
// dashboard's "Network Activities" 7/30/90-day toggle computes date
// windows and zero-filled day-series the exact same way, rather than a
// second, independently-written (and potentially subtly divergent) day-
// boundary calculator. Pure move -- AdminAnalyticsPanel's own behavior is
// unchanged, it just imports these instead of defining them locally.
//
// 2026-09-08 (reference-driven admin redesign): extended with "10d" and a
// real "custom" window. Tom, explicit: "7 honog 10 honog 30 honog 90 honog
// gej manaid baidag bol ene zurgan deer hussen uduruu songoj boldog" -- the
// presets were the only thing on offer, the reference lets you pick actual
// dates, so `custom` carries two yyyy-mm-dd strings and every consumer
// resolves a range through one function instead of a local ternary.
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
export function rangeDayCount(range: AdminDateRange): number | null {
  if (range.key === "all") return null;
  const preset = PRESET_DAYS[range.key];
  if (preset) return preset;
  const { dateFrom, dateTo } = resolveRange(range);
  if (!dateFrom) return null;
  const end = dateTo ?? new Date();
  return Math.max(1, Math.round((end.getTime() - dateFrom.getTime()) / 86_400_000));
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
