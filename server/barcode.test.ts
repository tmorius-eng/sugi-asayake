import { describe, expect, it } from "vitest";
import { createScanBuffer, looksLikeBarcode, normaliseBarcode, SCANNER_MAX_KEY_GAP_MS } from "@shared/barcode";

/** Types a whole code into a buffer at a fixed inter-key gap. */
const type = (buffer: ReturnType<typeof createScanBuffer>, code: string, gapMs: number, startMs = 1000) => {
  let result: string | null = null;
  let at = startMs;
  for (const char of code) {
    result = buffer.push(char, at);
    at += gapMs;
  }
  return { result, at };
};

describe("normaliseBarcode", () => {
  it("strips what a scanner, a spreadsheet or a human adds around the digits", () => {
    expect(normaliseBarcode("4582526990042")).toBe("4582526990042");
    expect(normaliseBarcode(" 4582526990042\r\n")).toBe("4582526990042");
    expect(normaliseBarcode("458-2526-990042")).toBe("4582526990042");
    expect(normaliseBarcode("4582 5269 90042")).toBe("4582526990042");
    // Thin space / non-breaking space / zero-width space, as pasted out of
    // a PDF or a spreadsheet cell.
    expect(normaliseBarcode("4582 526 990​042")).toBe("4582526990042");
  });

  it("leaves non-numeric text alone rather than mangling it into digits", () => {
    expect(normaliseBarcode("shampoo")).toBe("shampoo");
  });
});

describe("looksLikeBarcode", () => {
  it("accepts the real GTIN widths", () => {
    expect(looksLikeBarcode("4582526990042")).toBe(true); // JAN-13, the whole catalogue
    expect(looksLikeBarcode("45825269")).toBe(true);      // EAN-8
    expect(looksLikeBarcode("458252699004")).toBe(true);  // UPC-12
  });

  it("rejects search phrases and stray digits", () => {
    expect(looksLikeBarcode("shampoo")).toBe(false);
    expect(looksLikeBarcode("4582")).toBe(false);            // too short
    expect(looksLikeBarcode("458252699004212")).toBe(false); // too long
    expect(looksLikeBarcode("458252699004a")).toBe(false);   // not all digits
    expect(looksLikeBarcode("")).toBe(false);
  });
});

describe("createScanBuffer", () => {
  it("returns the code when the gun finishes with Enter", () => {
    const buffer = createScanBuffer();
    const { result, at } = type(buffer, "4582526990042", 10);
    expect(result).toBeNull(); // nothing fires until the burst completes
    expect(buffer.push("Enter", at)).toBe("4582526990042");
  });

  it("accepts a Tab suffix, which is the other common scanner configuration", () => {
    const buffer = createScanBuffer();
    const { at } = type(buffer, "4582526990042", 10);
    expect(buffer.push("Tab", at)).toBe("4582526990042");
  });

  it("returns the code from the idle flush when the gun sends no Enter suffix", () => {
    const buffer = createScanBuffer();
    type(buffer, "4582526990042", 10);
    expect(buffer.flush()).toBe("4582526990042");
  });

  it("ignores human-speed typing even when the digits form a valid code", () => {
    const buffer = createScanBuffer();
    // 120ms per key -- a person at the keyboard. Each keystroke restarts
    // the burst, so only the final digit is ever buffered.
    const { at } = type(buffer, "4582526990042", 120);
    expect(buffer.pending).toBe("2");
    expect(buffer.push("Enter", at)).toBeNull();
  });

  it("treats a gap of exactly the threshold as still scanner-speed", () => {
    const buffer = createScanBuffer();
    const { at } = type(buffer, "4582526990042", SCANNER_MAX_KEY_GAP_MS);
    expect(buffer.push("Enter", at)).toBe("4582526990042");
  });

  it("survives a bare Shift keydown in the middle of the burst", () => {
    const buffer = createScanBuffer();
    let at = 1000;
    for (const char of "458252") { buffer.push(char, at); at += 10; }
    buffer.push("Shift", at); at += 10;   // must neither append nor reset
    for (const char of "6990042") { buffer.push(char, at); at += 10; }
    expect(buffer.push("Enter", at)).toBe("4582526990042");
  });

  it("abandons the burst when a non-digit key arrives", () => {
    const buffer = createScanBuffer();
    buffer.push("4", 1000);
    buffer.push("5", 1010);
    buffer.push("a", 1020);
    expect(buffer.pending).toBe("");
    expect(buffer.push("Enter", 1030)).toBeNull();
  });

  it("does not fire on a burst that is too short to be a barcode", () => {
    const buffer = createScanBuffer();
    const { at } = type(buffer, "4582", 10);
    expect(buffer.push("Enter", at)).toBeNull();
  });

  it("drops a runaway burst instead of growing without bound", () => {
    const buffer = createScanBuffer();
    type(buffer, "123456789012345678901234567890", 10);
    expect(buffer.pending.length).toBeLessThanOrEqual(14);
  });

  it("starts a clean burst when a second scan follows the first", () => {
    const buffer = createScanBuffer();
    const first = type(buffer, "4582526990042", 10);
    expect(buffer.push("Enter", first.at)).toBe("4582526990042");
    // Second scan a full second later -- the gap must not poison it.
    const second = type(buffer, "4901234567894", 10, first.at + 1000);
    expect(buffer.push("Enter", second.at)).toBe("4901234567894");
  });

  it("recovers when a human's stray digits precede a real scan", () => {
    const buffer = createScanBuffer();
    buffer.push("7", 1000);            // someone idly hit a key
    const scan = type(buffer, "4582526990042", 10, 5000); // scan much later
    expect(buffer.push("Enter", scan.at)).toBe("4582526990042");
  });
});
