export const COOKIE_NAME = "app_session_id";
/** Identifies an anonymous shopping cart (guest checkout) — see server/db.ts CartOwner. */
export const GUEST_CART_COOKIE_NAME = "guest_cart_token";
/** Tier E analytics: identifies an anonymous browsing session for Conversion
 *  Rate tracking — see drizzle/schema.ts's visitorSessions and
 *  server/routers.ts's telemetry.pageview. Deliberately a separate cookie
 *  from both the auth session and the guest-cart token above (own concern,
 *  own lifetime). */
export const VISITOR_SESSION_COOKIE_NAME = "sugi_visitor_session";
/**
 * Admin face gate (2026-09-08): proof that THIS browser, on THIS device, has
 * passed a face check for the currently signed-in staff account.
 *
 * Deliberately a separate, short-lived cookie rather than a column on `users`
 * alone: the gate has to be per-device. An account-level "verified at"
 * timestamp would mean passing the check on the shop computer silently opened
 * /admin on someone else's laptop too, defeating the point of a second
 * factor. Signed with the same secret as the session token and carrying the
 * account's sessionVersion, so "sign out everywhere" and password resets
 * invalidate it exactly like a session.
 */
export const ADMIN_FACE_COOKIE_NAME = "sugi_admin_face";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const NINETY_DAYS_MS = 1000 * 60 * 60 * 24 * 90;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
/** Admin-panel call made without a live face proof (gate on, idle lock lapsed,
 *  or a proof from before the idle lock existed). The client shows the camera. */
export const FACE_REQUIRED_ERR_MSG = 'Face verification required (10003)';
/**
 * Flat Ulaanbaatar delivery fee (store pickup is free). A single shared
 * constant so Shop/CartDrawer/Checkout all quote the exact same number —
 * research backs disclosing this early: unexpected shipping costs are the
 * #1 reason for cart abandonment (surfacing it only at checkout, as this
 * app did before, is exactly the pattern that causes it).
 */
export const UB_DELIVERY_FEE_MNT = 10000;
