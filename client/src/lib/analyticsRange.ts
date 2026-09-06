// Extracted from AdminAnalyticsPanel.tsx (2026-09-06) so the new admin
// dashboard's "Network Activities" 7/30/90-day toggle computes date
// windows and zero-filled day-series the exact same way, rather than a
// second, independently-written (and potentially subtly divergent) day-
// boundary calculator. Pure move -- AdminAnalyticsPanel's own behavior is
// unchanged, it just imports these instead of defining them locally.
export type RangeKey = "7d" | "30d" | "90d" | "thisMonth" | "all";

export function rangeToDates(range: RangeKey): { dateFrom?: Date; dateTo?: Date } {
  const now = new Date();
  if (range === "all") return {};
  if (range === "thisMonth") return { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1) };
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return { dateFrom: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) };
}

export const rangeOptions: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 хоног" },
  { key: "30d", label: "30 хоног" },
  { key: "90d", label: "90 хоног" },
  { key: "thisMonth", label: "Энэ сар" },
  { key: "all", label: "Бүх цаг үе" },
];

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
    const row = byDate.get(day.toISOString().slice(0, 10));
    return row ? Number(row[key]) : 0;
  });
}
