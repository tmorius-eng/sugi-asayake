import { describe, expect, it } from "vitest";
import { normalizePhoneForSms } from "./_core/notification";

describe("normalizePhoneForSms", () => {
  it("prefixes a bare 8-digit Mongolian number with the 976 country code", () => {
    expect(normalizePhoneForSms("88112233")).toBe("97688112233");
  });

  it("strips spaces, dashes, parens and a leading + from an already-prefixed number", () => {
    expect(normalizePhoneForSms("+976 8811-2233")).toBe("97688112233");
    expect(normalizePhoneForSms("(976) 88 11 22 33")).toBe("97688112233");
  });

  it("rejects numbers that don't resolve to 976 + 8 digits", () => {
    expect(normalizePhoneForSms("123")).toBeNull();
    expect(normalizePhoneForSms("+1 415 555 0100")).toBeNull();
    expect(normalizePhoneForSms("")).toBeNull();
  });
});
