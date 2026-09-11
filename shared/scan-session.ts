import { normaliseBarcode } from "./barcode";

/**
 * The state of one barcode-scanning session (2026-09-11): receiving goods,
 * counting a shelf, or checking a transfer that arrived. Pure, so it is
 * unit-tested without a browser (server/scan-session.test.ts) and so the
 * client can mirror it to localStorage and the server with no surprises.
 *
 * Each scan adds 1 to that code's line. Lines are keyed by the NORMALISED
 * scanned code, not by variant, because an unknown code (a product the
 * catalogue does not have yet) must still be counted -- the person scanning
 * a delivery cannot stop to create products mid-box.
 */

export type ScanLine = {
  code: string;
  /** null = the catalogue does not know this code (yet). */
  variantId: number | null;
  quantity: number;
  /** ms timestamp of the last scan or edit -- newest lines sort first. */
  touchedAt: number;
};

export type ScanState = { lines: ScanLine[]; lastCode: string | null };

export type ScanAction =
  | { type: "scan"; code: string; variantId: number | null; at: number }
  | { type: "set"; code: string; quantity: number; at: number }
  | { type: "remove"; code: string }
  | { type: "load"; lines: ScanLine[] };

export const emptyScanState = (): ScanState => ({ lines: [], lastCode: null });

/** Largest quantity one line accepts -- a guard against a stuck key or a
 *  mistyped "10000" rather than a business rule. */
export const MAX_LINE_QUANTITY = 9999;

export function scanReducer(state: ScanState, action: ScanAction): ScanState {
  switch (action.type) {
    case "scan": {
      const code = normaliseBarcode(action.code);
      if (!code) return state;
      const existing = state.lines.find(line => line.code === code);
      const lines = existing
        ? state.lines.map(line => line.code === code ? { ...line, variantId: line.variantId ?? action.variantId, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity + 1), touchedAt: action.at } : line)
        : [...state.lines, { code, variantId: action.variantId, quantity: 1, touchedAt: action.at }];
      return { lines, lastCode: code };
    }
    case "set": {
      const code = normaliseBarcode(action.code);
      const quantity = Math.max(0, Math.min(MAX_LINE_QUANTITY, Math.floor(action.quantity)));
      if (!Number.isFinite(quantity)) return state;
      if (quantity === 0) return { lines: state.lines.filter(line => line.code !== code), lastCode: state.lastCode === code ? null : state.lastCode };
      return { ...state, lines: state.lines.map(line => line.code === code ? { ...line, quantity, touchedAt: action.at } : line) };
    }
    case "remove":
      return { lines: state.lines.filter(line => line.code !== action.code), lastCode: state.lastCode === action.code ? null : state.lastCode };
    case "load":
      return { lines: action.lines.filter(line => line.quantity > 0), lastCode: null };
  }
}

/** Newest first -- the thing just scanned is always at the top. */
export const sortedLines = (state: ScanState) => [...state.lines].sort((a, b) => b.touchedAt - a.touchedAt);

export const totalPieces = (state: ScanState) => state.lines.reduce((sum, line) => sum + line.quantity, 0);

/** What gets saved: absolute quantities, so re-sending the same save (a
 *  retry, a second tab) can never double-count. */
export const toSaveLines = (state: ScanState) => state.lines.map(line => ({ code: line.code, quantity: line.quantity }));
