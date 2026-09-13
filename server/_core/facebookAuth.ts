/**
 * "Continue with Facebook" (2026-09-13, growth tier).
 *
 * Plain OAuth 2.0 authorization-code flow against Meta's Login dialog, no SDK:
 *   GET /api/auth/facebook?redirect=/shop   -> 302 to facebook.com/dialog/oauth
 *   GET /api/auth/facebook/callback         <- code + state, exchanged server-side
 *
 * Security notes:
 *  - `state` is a random 32-byte value kept in a short-lived httpOnly cookie
 *    and compared on return (CSRF / login-fixation guard, RFC 6749 §10.12).
 *  - The token exchange and the /me call happen server-to-server with the
 *    app secret; the browser never sees an access token. `appsecret_proof`
 *    is sent on the Graph call as Meta recommends for server calls.
 *  - Only the app-scoped user id is stored (users.facebookId). We ask for
 *    public_profile + email; a missing email is fine.
 *  - Redirect targets are same-site paths only (same guard as Login.tsx).
 *  - A signed-in user hitting the flow LINKS the Facebook id to their own
 *    account instead of creating a second one.
 * Phone stays the primary login; a Facebook-created account has no phone
 * until the customer adds one from the profile page, and checkout asks for
 * a delivery phone anyway.
 */

import type { Request, Response } from "express";
import { createHmac, randomBytes } from "node:crypto";
import { ENV } from "./env";
import { createContext, signSessionToken } from "./context";
import { getSessionCookieOptions } from "./cookies";
import { hashPassword } from "./password";
import { COOKIE_NAME } from "../../shared/const";
import { createUserFromFacebook, findUserByFacebookId, linkFacebookIdToUser, touchUserLastSignedIn } from "../db";
import { mergeGuestCartAndClearCookie } from "../routers";

const GRAPH = "https://graph.facebook.com/v26.0";
const DIALOG = "https://www.facebook.com/v26.0/dialog/oauth";
const STATE_COOKIE = "sugi_fb_oauth";
const STATE_TTL_MS = 10 * 60 * 1000;

export const facebookLoginEnabled = () => Boolean(ENV.facebookAppId && ENV.facebookAppSecret);

function baseUrl(req: Request): string {
  if (ENV.publicBaseUrl) return ENV.publicBaseUrl;
  return `${req.protocol}://${req.get("host")}`;
}
const callbackUrl = (req: Request) => `${baseUrl(req)}/api/auth/facebook/callback`;

/** Same-site path only: must start with a single "/" (not "//host"). */
function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return "/";
  return /^\/(?!\/)/.test(value) && value.length <= 500 ? value : "/";
}

function stateCookieOptions(req: Request) {
  return { ...getSessionCookieOptions(req), maxAge: STATE_TTL_MS };
}

export function startFacebookLogin(req: Request, res: Response) {
  if (!facebookLoginEnabled()) return res.status(404).type("text/plain").send("Facebook login is not configured");
  const state = randomBytes(32).toString("hex");
  const redirect = safeRedirect(req.query.redirect);
  res.cookie(STATE_COOKIE, JSON.stringify({ state, redirect, ts: Date.now() }), stateCookieOptions(req));
  const url = new URL(DIALOG);
  url.searchParams.set("client_id", ENV.facebookAppId);
  url.searchParams.set("redirect_uri", callbackUrl(req));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "public_profile,email");
  return res.redirect(302, url.toString());
}

type GraphMe = { id: string; name?: string; email?: string; picture?: { data?: { url?: string; is_silhouette?: boolean } } };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Graph API ${response.status}`);
  return body;
}

export async function finishFacebookLogin(req: Request, res: Response) {
  const fail = (reason: string) => res.redirect(302, `/login?error=facebook&reason=${encodeURIComponent(reason)}`);
  if (!facebookLoginEnabled()) return res.status(404).type("text/plain").send("Facebook login is not configured");

  // State check.
  const raw = parseCookie(req.headers.cookie ?? "", STATE_COOKIE);
  res.clearCookie(STATE_COOKIE, { ...stateCookieOptions(req), maxAge: -1 });
  let saved: { state: string; redirect: string; ts: number } | null;
  try { saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!saved || !state || saved.state !== state || Date.now() - saved.ts > STATE_TTL_MS) return fail("state");
  if (typeof req.query.error === "string") return fail(req.query.error_reason === "user_denied" ? "denied" : "provider");
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) return fail("code");

  try {
    // Code -> token (server-side, with the app secret).
    const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", ENV.facebookAppId);
    tokenUrl.searchParams.set("client_secret", ENV.facebookAppSecret);
    tokenUrl.searchParams.set("redirect_uri", callbackUrl(req));
    tokenUrl.searchParams.set("code", code);
    const token = await fetchJson<{ access_token: string }>(tokenUrl.toString());

    // Token -> profile (appsecret_proof binds the call to our app).
    const proof = createHmac("sha256", ENV.facebookAppSecret).update(token.access_token).digest("hex");
    const meUrl = new URL(`${GRAPH}/me`);
    meUrl.searchParams.set("fields", "id,name,email,picture.width(256).height(256)");
    meUrl.searchParams.set("access_token", token.access_token);
    meUrl.searchParams.set("appsecret_proof", proof);
    const me = await fetchJson<GraphMe>(meUrl.toString());
    if (!me.id) return fail("profile");

    const ctx = await createContext({ req, res } as Parameters<typeof createContext>[0]);
    const avatar = me.picture?.data && !me.picture.data.is_silhouette ? (me.picture.data.url ?? null) : null;

    // Signed in already -> link, don't create.
    if (ctx.user) {
      await linkFacebookIdToUser(ctx.user.id, me.id);
      return res.redirect(302, saved.redirect === "/" ? "/profile?facebook=linked" : saved.redirect);
    }

    let user = await findUserByFacebookId(me.id);
    if (!user) {
      user = await createUserFromFacebook({
        facebookId: me.id,
        name: me.name?.trim() || null,
        email: me.email?.trim().toLowerCase() || null,
        avatarUrl: avatar,
        passwordHash: await hashPassword(randomBytes(32).toString("hex")),
      });
    }
    if (!user) return fail("account");
    if (user.suspendedAt) return fail("suspended");

    await touchUserLastSignedIn(user.id);
    const session = await signSessionToken(user.id, user.sessionVersion);
    res.cookie(COOKIE_NAME, session, getSessionCookieOptions(req));
    await mergeGuestCartAndClearCookie({ ...ctx, user: null }, user.id);
    return res.redirect(302, saved.redirect);
  } catch (error) {
    console.error("[facebook-auth]", error instanceof Error ? error.message : error);
    return fail(error instanceof Error && /холбогдсон/.test(error.message) ? "linked-elsewhere" : "exchange");
  }
}

function parseCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
