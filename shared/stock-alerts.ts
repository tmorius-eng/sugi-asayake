/**
 * When a stock change deserves a phone push (2026-09-11, Phase 5).
 *
 * Only a DOWNWARD crossing alerts: the moment a shelf goes from above its
 * threshold to at-or-below it ("low"), or from something to nothing
 * ("out"). Staying low, or going lower while already low, says nothing new
 * -- and once stock rises back above the threshold the next drop alerts
 * again, with no state to reset. Only locations with a threshold set alert
 * at all: the stores' counts here are not live until Smart POS is synced,
 * so an alert about them would be noise.
 */

export type StockAlertLevel = "low" | "out";

export function classifyStockCrossing(before: number, after: number, threshold: number | null): StockAlertLevel | null {
  if (threshold === null || threshold < 0) return null;
  if (after >= before) return null;
  if (after <= 0 && before > 0) return "out";
  if (after <= threshold && before > threshold) return "low";
  return null;
}

/** Movements that mean goods left the shelf for real (not a recount or an
 *  admin typing a new number -- those are corrections, not events). */
export const ALERTING_MOVEMENT_TYPES: ReadonlySet<string> = new Set(["sale_online", "sale_pos", "transfer_out"]);
