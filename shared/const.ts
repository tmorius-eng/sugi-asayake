export const COOKIE_NAME = "app_session_id";
/** Identifies an anonymous shopping cart (guest checkout) — see server/db.ts CartOwner. */
export const GUEST_CART_COOKIE_NAME = "guest_cart_token";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const NINETY_DAYS_MS = 1000 * 60 * 60 * 24 * 90;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
/**
 * Flat Ulaanbaatar delivery fee (store pickup is free). A single shared
 * constant so Shop/CartDrawer/Checkout all quote the exact same number —
 * research backs disclosing this early: unexpected shipping costs are the
 * #1 reason for cart abandonment (surfacing it only at checkout, as this
 * app did before, is exactly the pattern that causes it).
 */
export const UB_DELIVERY_FEE_MNT = 10000;
