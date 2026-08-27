import type { Request } from "express";
import { NINETY_DAYS_MS, ONE_YEAR_MS } from "../../shared/const";

/**
 * Cookie options for the app's own session cookie.
 *
 * The previous Manus OAuth flow needed `SameSite=None` because the login
 * redirect round-tripped through a different origin (the Manus OAuth portal).
 * Email+password login is same-origin end to end, so `SameSite=Lax` is both
 * sufficient and safer (it is dropped on genuine cross-site requests, which
 * is exactly what we want for a session cookie).
 */
export function getSessionCookieOptions(req: Request) {
  const isHttps = req.protocol === "https";
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ONE_YEAR_MS,
  };
}

/**
 * Cookie options for the anonymous "guest cart" identifier (see
 * shared/const.ts GUEST_CART_COOKIE_NAME). Same shape as the session cookie
 * but shorter-lived — an abandoned cart doesn't need to outlive a year, and
 * keeping it shorter bounds how many stale guest `carts` rows accumulate.
 */
export function getGuestCartCookieOptions(req: Request) {
  const isHttps = req.protocol === "https";
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
    maxAge: NINETY_DAYS_MS,
  };
}

/**
 * Cookie options for the anonymous visitor-session identifier (Tier E
 * analytics — see shared/const.ts VISITOR_SESSION_COOKIE_NAME). A long,
 * fixed lifetime on purpose: the real "session" boundary (30 minutes of
 * inactivity) lives entirely in the DB-side lastSeenAt check in
 * server/db.ts's resolvePageviewSession, not in cookie expiry — a cookie
 * that itself expired mid-visit would otherwise incorrectly fragment one
 * long continuous browsing session into several.
 */
export function getVisitorSessionCookieOptions(req: Request) {
  const isHttps = req.protocol === "https";
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
    maxAge: NINETY_DAYS_MS,
  };
}
