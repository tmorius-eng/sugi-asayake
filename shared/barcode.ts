/**
 * Barcode handling for the catalogue (2026-09-11).
 *
 * WHY THIS IS ONE SHARED MODULE: the same code has to be normalised in
 * three places that must never disagree -- the storefront's search box,
 * the POS register's scan field, and the server's lookup. A scanner gun is
 * just a keyboard, so what actually arrives varies by device: some models
 * append a tab instead of a newline, some emit thin spaces between digit
 * groups, and a shopper typing a code off a box will add hyphens or
 * spaces. Normalising in only one of the three would make a scan succeed
 * at the register but fail on the site (or the reverse), which reads as a
 * missing product rather than a formatting difference.
 *
 * All 937 products in this catalogue carry a real 13-digit JAN barcode in
 * `products.sku` (verified 2026-09-11: 937/937 match ^[0-9]{13}$ and all
 * start with the Japanese 45/49 prefix), and every product_variants.sku
 * equals its product's. That is why an exact `sku = ?` lookup is the right
 * primitive here -- the column is already NOT NULL + UNIQUE, so it is an
 * indexed single-row fetch, not a scan.
 */

/** Longest code we will ever accept -- guards the DB lookups against junk. */
export const MAX_BARCODE_LENGTH = 14;

/**
 * Strips everything a scanner, a phone camera or a human might add around
 * the digits: whitespace (including the trailing CR/LF/tab scanner guns
 * send as their "enter"), hyphens and the thin/non-breaking spaces that
 * appear when a code is copied out of a PDF or a spreadsheet.
 */
export const normaliseBarcode = (raw: string) =>
  // eslint-disable-next-line no-irregular-whitespace -- the class lists the thin and no-break spaces a copied code carries; that is the point
  raw.replace(/[\s  -​\-_]/g, "");

/**
 * True when the input is plausibly a product barcode rather than a search
 * phrase. Deliberately loose on length (8/12/13/14 are all real GTIN
 * widths) so that adding a non-JAN product later does not silently stop
 * scanning from working -- the lookup itself is an exact match, so a false
 * positive here costs one indexed query that returns nothing.
 */
export const looksLikeBarcode = (value: string) => {
  const code = normaliseBarcode(value);
  return code.length >= 8 && code.length <= MAX_BARCODE_LENGTH && /^[0-9]+$/.test(code);
};

/**
 * A USB scanner (the shop's QY-2100 and every other "keyboard wedge"
 * model) is not a camera and not a serial device -- to the browser it is
 * an ordinary USB keyboard that types the digits and then presses Enter.
 * There is no API that says "this came from a scanner", so the ONLY signal
 * available is speed: the gun emits keystrokes roughly every 5-20ms, while
 * a fast human types a digit every ~80-150ms. Anything slower than this
 * gap is treated as a person and the buffer is thrown away.
 */
export const SCANNER_MAX_KEY_GAP_MS = 50;

/**
 * Some scanners can be configured to send no Enter suffix at all. This is
 * how long we wait after the last digit before deciding the burst is over
 * and flushing it anyway -- comfortably longer than the gun's own key gap,
 * comfortably shorter than a human reaching for the next key.
 */
export const SCANNER_IDLE_FLUSH_MS = 80;

/**
 * The pure state machine behind the scan listener, kept out of the React
 * hook so it can be unit-tested without a DOM or fake timers: feed it
 * keystrokes with timestamps, and it tells you when a complete barcode has
 * been scanned.
 *
 * Returns the finished code from `push`/`flush`, or null when the burst is
 * still in progress (or was human typing).
 */
export function createScanBuffer(maxGapMs = SCANNER_MAX_KEY_GAP_MS) {
  let digits = "";
  let lastAtMs = 0;

  const reset = () => { digits = ""; lastAtMs = 0; };

  return {
    /**
     * @param key   the KeyboardEvent.key value
     * @param atMs  event timestamp in ms
     * @returns the completed barcode when `key` finished one, else null
     */
    push(key: string, atMs: number): string | null {
      // Enter is the factory default suffix, but these guns are configured
      // by scanning setup barcodes out of their manual and Tab is the other
      // common choice (it is what you want when the target is a
      // spreadsheet). Neither character can ever appear inside a barcode,
      // so both simply mean "burst finished". Without this, a Tab-suffixed
      // scanner would hit the non-digit branch below, wipe the buffer, and
      // the scan would vanish with no error shown.
      if (key === "Enter" || key === "Tab") {
        const done = looksLikeBarcode(digits) ? digits : null;
        reset();
        return done;
      }
      // A bare modifier keydown carries no character and must not count
      // either way -- some guns raise Shift around the payload, and
      // treating that as "not a digit" would silently discard the scan.
      if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta" || key === "CapsLock") return null;
      // Anything else that is not a single digit (a letter, an arrow key)
      // means this was never a barcode burst.
      if (key.length !== 1 || key < "0" || key > "9") {
        reset();
        return null;
      }
      // Too slow to be the gun -- start a fresh burst from this keystroke
      // rather than appending to whatever a person typed earlier.
      if (digits && atMs - lastAtMs > maxGapMs) digits = "";
      digits += key;
      lastAtMs = atMs;
      // A JAN/EAN-13 is the longest code this catalogue uses; stopping at
      // the cap keeps a stuck key from growing the buffer without bound.
      if (digits.length > MAX_BARCODE_LENGTH) reset();
      return null;
    },

    /** Called by the idle timer for scanners configured without an Enter suffix. */
    flush(): string | null {
      const done = looksLikeBarcode(digits) ? digits : null;
      reset();
      return done;
    },

    get pending() { return digits; },
    reset,
  };
}
