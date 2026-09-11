import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { emptyScanState, scanReducer, toSaveLines, type ScanAction, type ScanLine } from "@shared/scan-session";

/**
 * Keeps a scan session (receiving / counting) safe while someone scans a
 * whole delivery (2026-09-11):
 *  - every change is mirrored to localStorage at once, so closing the tab,
 *    a crash or a dead Wi-Fi never loses 200 scans;
 *  - and saved to the server ~700ms after the last change, as ABSOLUTE line
 *    quantities (a retried save can never double-count).
 * When the page opens and localStorage holds changes the server never got,
 * those win and are re-sent -- they are newer by definition.
 */

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

type StoredDraft = { lines: ScanLine[]; at: number };

const storageKey = (key: string) => `sugi-scan-draft:${key}`;

function readStored(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    return Array.isArray(parsed?.lines) ? parsed : null;
  } catch {
    return null;
  }
}
function writeStored(key: string, draft: StoredDraft | null) {
  try {
    if (draft) window.localStorage.setItem(storageKey(key), JSON.stringify(draft));
    else window.localStorage.removeItem(storageKey(key));
  } catch {
    // Private mode / quota: the server save still runs.
  }
}

export function useScanDraft(options: {
  /** e.g. "receipt:12" -- null while no document is open. */
  draftKey: string | null;
  /** Lines as the server last saved them. */
  serverLines: { code: string; variantId: number | null; quantity: number }[] | undefined;
  editable: boolean;
  save: (lines: { code: string; quantity: number }[]) => Promise<unknown>;
}) {
  const { draftKey, serverLines, editable, save } = options;
  const [state, dispatchRaw] = useReducer(scanReducer, undefined, emptyScanState);
  const [status, setStatus] = useState<DraftSaveStatus>("idle");
  const [dirty, setDirty] = useState(false);
  const loadedKey = useRef<string | null>(null);
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);

  // Load once per document: unsaved local changes beat the server copy.
  useEffect(() => {
    if (!draftKey || !serverLines || loadedKey.current === draftKey) return;
    loadedKey.current = draftKey;
    const stored = editable ? readStored(draftKey) : null;
    const base = Date.now() - 1_000_000;
    const lines: ScanLine[] = stored?.lines ?? serverLines.map((line, index) => ({ code: line.code, variantId: line.variantId, quantity: line.quantity, touchedAt: base - index }));
    dispatchRaw({ type: "load", lines });
    setDirty(Boolean(stored));
    setStatus(stored ? "idle" : "saved");
  }, [draftKey, serverLines, editable]);

  useEffect(() => { if (!draftKey) loadedKey.current = null; }, [draftKey]);

  const dispatch = useCallback((action: ScanAction) => {
    if (!editable) return;
    dispatchRaw(action);
    setDirty(true);
  }, [editable]);

  // Mirror + debounced save.
  useEffect(() => {
    if (!draftKey || !dirty || !editable) return;
    writeStored(draftKey, { lines: state.lines, at: Date.now() });
    const timer = window.setTimeout(async () => {
      setStatus("saving");
      try {
        await saveRef.current(toSaveLines(state));
        setDirty(false);
        setStatus("saved");
        writeStored(draftKey, null);
      } catch {
        setStatus("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state, dirty, draftKey, editable]);

  /** Saves right now (before posting) and resolves when the server has it. */
  const flush = useCallback(async () => {
    if (!draftKey || !dirty) return;
    setStatus("saving");
    await saveRef.current(toSaveLines(state));
    setDirty(false);
    setStatus("saved");
    writeStored(draftKey, null);
  }, [draftKey, dirty, state]);

  const discardLocal = useCallback(() => { if (draftKey) writeStored(draftKey, null); }, [draftKey]);

  return { state, dispatch, status, dirty, flush, discardLocal };
}
