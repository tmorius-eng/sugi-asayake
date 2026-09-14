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
