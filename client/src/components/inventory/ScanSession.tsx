import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CircleAlert, Hash, Minus, PackageCheck, PauseCircle, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { normaliseBarcode } from "@shared/barcode";
import { formatVariantAttributes } from "@shared/catalog-filter";
import { sortedLines, totalPieces, type ScanAction, type ScanState } from "@shared/scan-session";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { scanSounds } from "@/lib/scanSounds";

/**
 * The shared barcode scan screen (2026-09-11) -- receiving goods, counting a
 * shelf, and (Phase 4) checking a transfer that arrived. Each scan from the
 * USB scanner adds 1 to that item's line; nothing has to be clicked first.
 *
 * WHY THERE IS ALMOST NO INPUT ON THIS SCREEN: the scanner is a keyboard,
 * and useBarcodeScanner deliberately ignores keystrokes while focus is in a
 * text field (so it never hijacks someone typing). A screen full of
 * quantity boxes would therefore silently stop counting the moment someone
 * clicked one. Quantities are changed with +/- and a prompt instead, the
 * one text box (manual code entry) blurs itself after use, and a banner
 * says so whenever focus is sitting in a field.
 */

export type SkuEntry = { variantId: number; sku: string; productSku: string; productName: string; brand: string | null; attributesJson: string | null; imageUrl: string | null };

export function buildSkuLookup(entries: SkuEntry[] | undefined) {
  const byCode = new Map<string, SkuEntry>();
  const byVariant = new Map<number, SkuEntry>();
  for (const entry of entries ?? []) {
    byVariant.set(entry.variantId, entry);
    byCode.set(normaliseBarcode(entry.sku), entry);
  }
  // Product barcode -> its first (default) variant, only where no variant
  // already owns that code -- same rule as the server's resolveCodes.
  for (const entry of entries ?? []) {
    const code = normaliseBarcode(entry.productSku);
    if (!byCode.has(code)) byCode.set(code, entry);
  }
  return { byCode, byVariant };
}

function isTypingTarget(element: Element | null) {
  if (!(element instanceof HTMLElement)) return false;
  return element.isContentEditable || element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT";
}

export default function ScanSession({ state, dispatch, lookup, editable, hint }: {
  state: ScanState;
  dispatch: (action: ScanAction) => void;
  lookup: ReturnType<typeof buildSkuLookup>;
  editable: boolean;
  hint?: string;
}) {
  const [flash, setFlash] = useState<"ok" | "unknown" | null>(null);
  const [scannerPaused, setScannerPaused] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const manualRef = useRef<HTMLInputElement>(null);

  const handleCode = useCallback((raw: string) => {
    if (!editable) return;
    const code = normaliseBarcode(raw);
    if (!code) return;
    const entry = lookup.byCode.get(code);
    dispatch({ type: "scan", code, variantId: entry?.variantId ?? null, at: Date.now() });
    if (entry) scanSounds.ok(); else scanSounds.unknown();
    setFlash(entry ? "ok" : "unknown");
  }, [dispatch, editable, lookup]);

  useBarcodeScanner(handleCode, editable);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 450);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // "Scanner paused" banner: the listener stands down while a field has focus.
  useEffect(() => {
    const update = () => setScannerPaused(isTypingTarget(document.activeElement));
    // focusout fires before the next element receives focus; look after it settles.
    const afterBlur = () => window.setTimeout(update, 0);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", afterBlur);
    update();
    return () => { document.removeEventListener("focusin", update); document.removeEventListener("focusout", afterBlur); };
  }, []);

  const submitManual = (event: FormEvent) => {
    event.preventDefault();
    handleCode(manualCode);
    setManualCode("");
    manualRef.current?.blur();
  };

  const setQuantity = (code: string, current: number) => {
    const answer = window.prompt("Тоо ширхэг", String(current));
    if (answer === null) return;
    const quantity = Number(answer.trim());
    if (!Number.isFinite(quantity) || quantity < 0) return;
    dispatch({ type: "set", code, quantity, at: Date.now() });
  };

  const lines = useMemo(() => sortedLines(state), [state]);
  const last = state.lastCode ? state.lines.find(line => line.code === state.lastCode) ?? null : null;
  const lastEntry = last?.variantId ? lookup.byVariant.get(last.variantId) : last ? lookup.byCode.get(last.code) : undefined;
  const unknownCount = state.lines.filter(line => line.variantId === null && !lookup.byCode.get(line.code)).length;

  return (
    <div className="grid gap-3">
      {editable && (
        scannerPaused ? (
          <p className="flex items-center gap-2 rounded-2xl bg-[var(--a-warn-soft)] px-4 py-3 text-xs font-bold text-[var(--a-warn)]"><PauseCircle size={16} className="shrink-0" />Сканнер түр зогссон — бичих талбараас гараад (хоосон газар дарж) дахин уншуулна уу.</p>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl bg-[var(--a-info-soft)] px-4 py-3 text-xs font-bold text-[var(--a-info)]"><ScanBarcode size={16} className="shrink-0" />{hint ?? "Сканнероор уншуулахад бараа бүр автоматаар +1 тоологдоно."}</p>
        )
      )}

      <div className={`flex min-h-[112px] items-center gap-4 rounded-3xl border-2 p-4 transition-colors duration-300 ${flash === "ok" ? "border-[var(--a-pos)] bg-[var(--a-pos-soft)]" : flash === "unknown" ? "border-[var(--a-neg)] bg-[var(--a-neg-soft)]" : "border-[var(--a-border)] bg-[var(--a-card)]"}`} aria-live="polite">
        {last ? (
          <>
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white">
              {lastEntry?.imageUrl ? <img src={lastEntry.imageUrl} alt="" className="size-full object-contain" /> : lastEntry ? <PackageCheck size={28} className="text-[#8a8f98]" /> : <CircleAlert size={28} className="text-[#df1f3d]" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">СҮҮЛД УНШУУЛСАН</p>
              <p className="mt-1 truncate text-base font-bold">{lastEntry ? lastEntry.productName : "Каталогт бүртгэлгүй код"}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--a-muted)]">{last.code}{lastEntry?.brand ? ` · ${lastEntry.brand}` : ""}{lastEntry && formatVariantAttributes(lastEntry.attributesJson) ? ` · ${formatVariantAttributes(lastEntry.attributesJson)}` : ""}</p>
            </div>
            <p className="shrink-0 text-right"><span className="block font-[var(--font-display)] text-4xl font-semibold leading-none">{last.quantity}</span><span className="text-[11px] text-[var(--a-muted)]">ширхэг</span></p>
          </>
        ) : (
          <p className="w-full text-center text-sm text-[var(--a-muted)]">{editable ? (state.lines.length ? "Дараагийн барааг уншуулна уу." : "Эхний барааг уншуулна уу.") : state.lines.length ? "Уншуулсан бараанууд доор жагсаагдсан." : "Уншуулсан бараа алга."}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold">{lines.length} төрөл · {totalPieces(state)} ширхэг{unknownCount > 0 && <span className="ml-2 rounded-full bg-[var(--a-neg-soft)] px-2 py-0.5 text-[10px] text-[var(--a-neg)]">{unknownCount} бүртгэлгүй код</span>}</p>
        {editable && (
          <form onSubmit={submitManual} className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor="manual-code">Баркод гараар оруулах</label>
            <input id="manual-code" ref={manualRef} value={manualCode} onChange={event => setManualCode(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="Баркод гараар" className="h-9 w-40 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2.5 text-xs outline-none focus:border-[var(--a-info)]" />
            <button type="submit" className="h-9 rounded-lg bg-[var(--a-btn-dark)] px-3 text-[11px] font-extrabold text-white">Нэмэх</button>
          </form>
        )}
      </div>

      {lines.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--a-border)]">
          {lines.map(line => {
            const entry = line.variantId ? lookup.byVariant.get(line.variantId) : lookup.byCode.get(line.code);
            return (
              <div key={line.code} className={`flex items-center gap-3 border-b border-[var(--a-border)] px-3 py-2.5 last:border-b-0 ${line.code === state.lastCode ? "bg-[var(--a-soft)]" : "bg-[var(--a-card)]"} ${!entry ? "border-l-4 border-l-[#df1f3d]" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{entry ? entry.productName : "Бүртгэлгүй код"}</p>
                  <p className="truncate text-[11px] text-[var(--a-muted)]">{line.code}{entry && formatVariantAttributes(entry.attributesJson) ? ` · ${formatVariantAttributes(entry.attributesJson)}` : ""}</p>
                </div>
                {editable ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => dispatch({ type: "set", code: line.code, quantity: line.quantity - 1, at: Date.now() })} className="grid size-8 place-items-center rounded-full bg-[var(--a-soft)] hover:bg-[var(--a-soft-hover)]" aria-label={`${line.code} нэгээр хасах`}><Minus size={13} /></button>
                    <button type="button" onClick={() => setQuantity(line.code, line.quantity)} className="min-w-10 rounded-lg px-1.5 py-1 text-center text-sm font-extrabold hover:bg-[var(--a-soft)]" title="Тоо оруулах">{line.quantity}</button>
                    <button type="button" onClick={() => dispatch({ type: "scan", code: line.code, variantId: line.variantId, at: Date.now() })} className="grid size-8 place-items-center rounded-full bg-[var(--a-soft)] hover:bg-[var(--a-soft-hover)]" aria-label={`${line.code} нэгээр нэмэх`}><Plus size={13} /></button>
                    <button type="button" onClick={() => { if (window.confirm(`${entry?.productName ?? line.code} мөрийг хасах уу?`)) dispatch({ type: "remove", code: line.code }); }} className="ml-1 grid size-8 place-items-center rounded-full text-[var(--a-muted)] hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label={`${line.code} мөрийг хасах`}><Trash2 size={13} /></button>
                  </div>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-sm font-extrabold"><Hash size={12} className="text-[var(--a-faint)]" />{line.quantity}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
