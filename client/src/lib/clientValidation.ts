// 2026-09-27: client-side mirrors of server/routers.ts's zod rules
// (phoneSchema, addressWriteSchema, checkout.createOrder's input) so a
// shopper sees an error ON THE FIELD before submitting instead of a bare
// toast after the server round-trip rejects it (WCAG 3.3.1, PROJECT-GUIDE's
// useFieldErrors convention). Kept here (not shared/) since it only mirrors
// -- the server schemas stay the one source of truth; if they change, these
// need updating by hand, they are not imported from the server.

/** phoneSchema: `/^[0-9+()\-\s]{6,40}$/` AND at least 8 digits once stripped. */
export function isValidPhoneInput(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 6 || trimmed.length > 40) return false;
  if (!/^[0-9+()\-\s]{6,40}$/.test(trimmed)) return false;
  return trimmed.replace(/\D/g, "").length >= 8;
}

/** checkout.createOrder's `customerEmail: z.string().trim().email().max(320)`. */
export function isValidEmailInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) return false;
  // Same pragmatic shape zod's own .email() checks for -- not meant to be
  // exhaustive (the server has the real, final say), just to catch an
  // obviously malformed address before a round trip.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export const MIN_NAME_LENGTH = 2;
export const MIN_ADDRESS_LENGTH = 8;
export const MIN_RECIPIENT_NAME_LENGTH = 2;
export const MIN_LABEL_LENGTH = 1;
