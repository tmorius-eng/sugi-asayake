/**
 * "Facebook-ээр үргэлжлүүлэх" (2026-09-13, growth tier).
 *
 * Meta-ийн Login dialog-той SDK-гүй энгийн OAuth 2.0 authorization-code урсгал:
 *   GET /api/auth/facebook?redirect=/shop   -> facebook.com/dialog/oauth руу 302
 *   GET /api/auth/facebook/callback         <- code + state, сервер талд солигдоно
 *
 * Аюулгүй байдлын тэмдэглэл:
 *  - `state` нь богино хугацааны httpOnly cookie-д хадгалагдсан санамсаргүй 32 байт,
 *    буцаж ирэхэд харьцуулагдана (CSRF / login-fixation хамгаалалт, RFC 6749 §10.12).
 *  - Token солилцоо ба /me дуудлага app secret-тэй сервер-сервер хийгдэнэ; хөтөч
 *    access token хэзээ ч харахгүй. Graph дуудлагад Meta-ийн зөвлөдөг `appsecret_proof`
 *    илгээнэ.
 *  - Зөвхөн app-scoped user id хадгалагдана (users.facebookId). public_profile + email
 *    асууна; имэйл байхгүй бол зүгээр.
 *  - Redirect зорилт зөвхөн same-site зам (Login.tsx-тэй ижил хамгаалалт).
 *  - Нэвтэрсэн хэрэглэгч энэ урсгалд орвол Facebook id-г өөрийн дансандаа ХОЛБОНО,
 *    хоёр дахь данс үүсгэхгүй.
 * Утас үндсэн нэвтрэлт хэвээр; Facebook-ээр үүссэн данс харилцагч профайлаас
 * нэмтэл утасгүй, checkout хүргэлтийн утас асуусаар байна.
 */

import type { Request, Response } from "express";
import { createHmac, randomBytes } from "node:crypto";
import { ENV } from "./env";
import { createContext, signSessionToken } from "./context";
import { getSessionCookieOptions } from "./cookies";
import { hashPassword } from "./password";
import { COOKIE_NAME } from "../../shared/const";
import { createUserFromFacebook, findUserByFacebookId, linkFacebookIdToUser, recordLoginAttempt, touchUserLastSignedIn } from "../db";
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
    // 2026-09-27: Facebook-оор нэвтэрсэн нь нэвтрэлтийн түүхэнд ордоггүй байв.
    await recordLoginAttempt({ email: `facebook:${me.id}`, userId: user.id, success: true, reason: "facebook", ipAddress: req.ip || null });
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
    if (key === name) {
      // 2026-09-23: `decodeURIComponent` нь эвдэрсэн хувь (`%E0%A4%A`) дээр
      // URIError шиддэг. Энэ функц try/catch-ийн ГАДНА дуудагддаг тул тэр
      // уналт нь хүсэлтийг хариугүй болгодог байв.
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
