/**
 * Агуулахын илгээсэн ба дэлгүүрийн ирэхэд сканнердсаныг харьцуулах (2026-09-11,
 * Phase 4). Цэвэр функц, тиймээс дэлгүүрийн preview ба серверийн баталгаажуулалт яг
 * ижил дүрэм ашиглана — сервер дахин тооцоолж client-ийн хувилбарт хэзээ ч итгэхгүй.
 */

export type ReconcileStatus = "matched" | "short" | "over" | "unexpected";

export type ReconcileInput = { code: string; qtySent: number; received: number };

export type ReconcileLine = ReconcileInput & { status: ReconcileStatus; difference: number };

export function reconcileTransfer(lines: ReconcileInput[]) {
  const result: ReconcileLine[] = lines.map(line => {
    const difference = line.received - line.qtySent;
    const status: ReconcileStatus = line.qtySent === 0 ? "unexpected" : difference === 0 ? "matched" : difference < 0 ? "short" : "over";
    return { ...line, difference, status };
  });
  const count = (status: ReconcileStatus) => result.filter(line => line.status === status).length;
  return {
    lines: result,
    matched: count("matched"),
    short: count("short"),
    over: count("over"),
    unexpected: count("unexpected"),
    missingPieces: result.filter(line => line.difference < 0).reduce((sum, line) => sum - line.difference, 0),
    extraPieces: result.filter(line => line.difference > 0).reduce((sum, line) => sum + line.difference, 0),
    hasDiscrepancy: result.some(line => line.status !== "matched"),
  };
}

export const RECONCILE_LABELS: Record<ReconcileStatus, string> = {
  matched: "Таарсан",
  short: "Дутуу",
  over: "Илүү",
  unexpected: "Жагсаалтад байгаагүй",
};

/** What an admin may decide about a line that did not match. */
export const SHORT_RESOLUTIONS = ["write_off", "returned_to_source", "found_later"] as const;
export const OVER_RESOLUTIONS = ["deducted_from_source", "accepted_over"] as const;
export type TransferResolution = (typeof SHORT_RESOLUTIONS)[number] | (typeof OVER_RESOLUTIONS)[number];

export const RESOLUTION_LABELS: Record<TransferResolution, string> = {
  write_off: "Хаягдал / алдагдсан гэж хасах",
  returned_to_source: "Агуулахад буцаж очсон (агуулахад нэмэх)",
  found_later: "Дараа нь олдсон (дэлгүүрт нэмэх)",
  deducted_from_source: "Агуулахаас илүү гарсан (агуулахаас хасах)",
  accepted_over: "Илүүг хүлээж авах (агуулахыг тоолуулна)",
};
