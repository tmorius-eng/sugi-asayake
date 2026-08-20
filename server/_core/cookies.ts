import type { Request } from "express";
import { ONE_YEAR_MS } from "../../shared/const";

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
