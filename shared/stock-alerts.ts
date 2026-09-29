/**
 * Нөөцийн өөрчлөлт хэзээ утасны push хүртэх вэ (2026-09-11, Phase 5).
 *
 * Зөвхөн ДООШ огтлолт мэдэгдэнэ: тавиур босгоосоо дээрээс босгод-эсвэл-доор ("бага")
 * болох мөч, эсвэл ямар нэгээс юу ч үгүй ("дууссан") болох мөч. Бага хэвээр байх,
 * аль хэдийн бага байхад улам буурах шинэ юу ч хэлэхгүй — нөөц босгоос дээш буцмагц
 * дараагийн бууралт дахин мэдэгдэнэ, reset хийх төлөвгүй. Зөвхөн босго тавьсан байршил
 * мэдэгдэнэ: дэлгүүрүүдийн тоо Smart POS синк хийгдтэл амьд биш тул тэдний тухай
 * мэдэгдэл шуугиан.
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

/**
 * 2026-09-27 (I4): an AUTOMATIC vendor-snapshot count_adjust (Smart Software
 * sync) is not a correction -- it reports real sales that already happened
 * at the store's own POS, outside `sale_pos`. Excluding it from
 * ALERTING_MOVEMENT_TYPES the same way a human re-counting a shelf is
 * excluded meant those real depletions never fired stock.low/out at all.
 * `server/stockLedger.ts`'s `recordStockMovement` checks this flag on top of
 * (not instead of) `ALERTING_MOVEMENT_TYPES`, so a manual count still never
 * alerts -- only `postCount({ automatic: true })` sets it.
 */
export type StockMovementAlertMeta = { forceAlert?: boolean };
