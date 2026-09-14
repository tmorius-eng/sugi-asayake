/**
 * Каталогийн баркодын боловсруулалт (2026-09-11).
 *
 * ЯАГААД НЭГ ХУВААЛЦСАН МОДУЛЬ: нэг кодыг хэзээ ч зөрөх ёсгүй гурван газар нормчлох
 * ёстой — storefront-ийн хайлтын талбар, POS-ийн скан талбар, серверийн lookup.
 * Сканнер бол зүгээр л keyboard тул бодитоор юу ирэх нь төхөөрөмжөөс хамаарна:
 * зарим загвар newline-ийн оронд tab залгадаг, зарим нь цифрийн бүлэг хооронд нимгэн
 * зай гаргадаг, хайрцгаас код бичиж буй худалдан авагч зураас, зай нэмнэ. Гурвын
 * нэгд л нормчилбол скан POS-д амжилттай, сайтад амжилтгүй (эсвэл эсрэгээр) болж,
 * форматын ялгаа биш бараа байхгүй мэт харагдана.
 *
 * Энэ каталогийн 937 бараа бүр `products.sku`-д бодит 13 оронтой JAN баркодтой
 * (2026-09-11-нд шалгасан: 937/937 ^[0-9]{13}$ таарч, бүгд Японы 45/49 prefix-ээр
 * эхэлдэг), product_variants.sku бүр барааныхтайгаа тэнцүү. Тиймээс яг `sku = ?`
 * lookup энд зөв primitive — багана аль хэдийн NOT NULL + UNIQUE тул индекстэй нэг
 * мөрийн fetch, scan биш.
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
