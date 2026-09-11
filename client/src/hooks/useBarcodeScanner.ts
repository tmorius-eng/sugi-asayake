import { useEffect, useRef } from "react";
import { createScanBuffer, SCANNER_IDLE_FLUSH_MS } from "@shared/barcode";

/**
 * Listens for a USB barcode scanner anywhere on the page (2026-09-11).
 *
 * The shop's QY-2100 -- like essentially every wired retail scanner -- is a
 * "keyboard wedge": the operating system presents it as a second USB
 * keyboard, and pulling the trigger types the barcode's digits followed by
 * Enter into whatever currently has focus. There is no device API to ask
 * "was that a scanner?", and WebHID would require the shop to pair the gun
 * per browser, so speed is the discriminator -- see SCANNER_MAX_KEY_GAP_MS
 * in @shared/barcode for the numbers and createScanBuffer for the state
 * machine (unit-tested in server/barcode.test.ts).
 *
 * TWO DELIBERATE RESTRAINTS, both about not stealing a real person's keys:
 *
 *  1. When focus is inside a text field we do nothing at all and let the
 *     characters land there normally. Hijacking a scan mid-form would both
 *     navigate away from half-filled work and leave stray digits behind.
 *     Nothing is lost by standing down: `catalog.search` matches SKUs too,
 *     so scanning into the site's search box finds the same product.
 *  2. `preventDefault` is only ever called on the Enter that COMPLETES a
 *     recognised scan -- that keypress would otherwise re-submit whatever
 *     the page considers its default action. The digits themselves are
 *     never swallowed, because until Enter arrives we cannot know whether
 *     they came from a gun or from a person.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  // Kept in a ref so that changing the callback (it closes over router and
  // tRPC helpers, so it is a new function every render) does not tear down
  // and re-attach the listener on every single render.
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const buffer = createScanBuffer();
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const clearIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = undefined; } };

    /** True for anything the visitor could be typing into for real. */
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // A modifier means a keyboard shortcut, never a scanner burst.
      if (event.ctrlKey || event.altKey || event.metaKey) { buffer.reset(); clearIdle(); return; }
      if (isTypingTarget(event.target)) { buffer.reset(); clearIdle(); return; }

      const code = buffer.push(event.key, event.timeStamp);
      clearIdle();

      if (code) {
        event.preventDefault();
        onScanRef.current(code);
        return;
      }

      // Fallback for guns configured without an Enter suffix: if the burst
      // simply stops, flush whatever it managed to collect.
      if (buffer.pending) {
        idleTimer = setTimeout(() => {
          const flushed = buffer.flush();
          if (flushed) onScanRef.current(flushed);
        }, SCANNER_IDLE_FLUSH_MS);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearIdle();
    };
  }, [enabled]);
}
