/**
 * One rule for a Mongolian mobile number (2026-09-12), shared because the
 * checkout page and the server must agree on it: the page asks StorePay what
 * a number may borrow and then compares the answer against the number the
 * shopper typed, so a different normalisation on either side would silently
 * compare two different phones.
 *
 * Accepts what people actually type -- "9911 2233", "+976-9911-2233",
 * "97699112233" -- and returns the bare local 8 digits, or null when it is
 * not a mobile number. Mongolian mobile prefixes start at 5 (no operator
 * issues 1xxxxxxx or 2xxxxxxx mobiles).
 */
export function normaliseMongolianMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const local = digits.startsWith("976") && digits.length === 11 ? digits.slice(3) : digits;
  return /^[5-9]\d{7}$/.test(local) ? local : null;
}
