/**
 * Admin царайны хаалганы БАТАЛГАА: "энэ хөтөч энэ дансанд царайн шалгалт давсан"
 * гэсэн гарын үсэгтэй, төхөөрөмж бүрийн cookie. Цэвэр — jose, cookie header, env,
 * shared тогтмолууд. DB-гүй тул server/_core/trpc.ts домэйн татахгүйгээр admin
 * панелийн procedure бүрт шаардаж чадна.
 *
 * 2026-09-12-нд бодит incident-ийн дараа server/faceAuth.ts-ээс салгав: idle lock
 * (25 минут, commit 618eeec) зөвхөн ДЭЛГЭЦ дээр хэрэгжиж байв. Proof cookie цагтаа
 * дуусдаг ч /admin-ийн ард байгаа tRPC procedure-ууд хэзээ ч асуудаггүй, өмнөх
 * deploy-ийн proof (тэгш 8 цагийн `exp`, `abs` claim-гүй) дуустал хүлээн зөвшөөрөгдөж
 * байв. Tom лаптопоо хоёр цаг орхиод буцахад панель ажилласаар байсан. Хоёр цоорхой
 * энд хаагдсан: хуучин proof татгалзагдана (readFaceProof), панелийн procedure бүр
 * `assertFaceProofForPanelRole` ажиллуулна.
 */

import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { parseCookie as parseCookieHeader } from "cookie";
import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { FACE_IDLE_TIMEOUT_MS, FACE_REAUTH_TTL_MS, FACE_VERIFICATION_TTL_MS, isAdminPanelRole } from "../../shared/face-auth";
import { ADMIN_FACE_COOKIE_NAME, ADMIN_REAUTH_COOKIE_NAME, FACE_REQUIRED_ERR_MSG, REAUTH_REQUIRED_ERR_MSG } from "../../shared/const";
import { ENV } from "./env";
import { bumpFaceGrantVersion } from "../db";

/** Whether the gate is switched on at all. Everything else in this module is
 *  a no-op path when this is false -- see ENV.adminFaceGateEnabled's own
 *  comment for why this escape hatch exists. */
export function isFaceGateEnabled(): boolean {
  return ENV.adminFaceGateEnabled;
}

// Signing key for the per-device proof cookie. Reuses the session secret
// rather than introducing a second one: this cookie is exactly as sensitive
// as a session (it is a factor in admin access), so it should live and die by
// the same secret, and a separate key would be one more thing to lose. Falls
// back the same way server/_core/context.ts does — a per-process random key
// when JWT_SECRET is unset, which fails safe (nothing survives a restart)
// instead of using a committed constant. assertProductionSecrets() already
// refuses to start production without a real JWT_SECRET.
//
// TOKEN TYPES (2026-09-22 audit): the session, the face proof and the password
// step-up are all HS256 under this one key, so each carries a `typ` claim and
// every reader refuses the other two. Before this a face-proof value pasted
// into the session cookie was accepted as a full session -- {sub, sv} was all
// the session reader looked at (server/_core/context.ts).
let devFallbackSecret: Uint8Array | null = null;
function secretKey(): Uint8Array {
  if (ENV.cookieSecret) return new TextEncoder().encode(ENV.cookieSecret);
  // Same fallback as context.ts: 32 random bytes, never Math.random().
  if (!devFallbackSecret) devFallbackSecret = new Uint8Array(randomBytes(32));
  return devFallbackSecret;
}
const FACE_TYP = "face";
const REAUTH_TYP = "reauth";

/**
 * Mints the proof that THIS browser passed a face check for THIS account.
 *
 * Carries sessionVersion so the proof dies with the session it belongs to:
 * a password reset or "sign out everywhere" invalidates it automatically,
 * without this module needing to know those flows exist.
 */
/**
 * Which browser tab is asking (2026-09-14, Tom: closing the /admin tab and
 * opening it again went straight in -- "ayultai").
 *
 * The proof cookie survives a closed tab; a value in sessionStorage does
 * not. The browser keeps a random id per tab there and sends it as
 * `x-admin-tab` on every API call (client/src/lib/adminTab.ts); the proof
 * records the tabs it was verified in, and a request from any other tab --
 * a freshly opened one, or a stolen cookie replayed elsewhere -- is no
 * proof at all. A request with no header (tests, curl) binds to "-", a value
 * a real tab never has.
 */
const ADMIN_TAB_HEADER = "x-admin-tab";
export const NO_TAB = "-";
const MAX_BOUND_TABS = 6;
/**
 * JWT-д табын id-г түүхий хэлбэрээр БИШ, sha256-ийн хэшээр хадгална (2026-10-01).
 * Proof cookie нь httpOnly ч түүний payload base64 тул уншигдаж болно; түүхий id
 * ил байвал хулгайлсан cookie-г тэр табын id-тай header-тэй хамт дахин ашиглах
 * нь хялбар болно. Хэш нь ямар id хэрэгтэйг ил болгохгүй.
 */
export function hashTabId(tab: string): string {
  return createHash("sha256").update(tab).digest("hex").slice(0, 32);
}

export function tabIdFrom(req: Request): string {
  const raw = req.headers?.[ADMIN_TAB_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : NO_TAB;
}

async function signFaceProof(userId: number, sessionVersion: number, faceGrantVersion: number, absoluteDeadlineMs: number, tabs: readonly string[], idleTimeoutMs: number): Promise<string> {
  // Two deadlines in one token. `exp` is the IDLE one and slides forward on
  // real activity (see refreshFaceProof); `abs` is the absolute one and is
  // copied unchanged through every refresh, so renewing can extend a working
  // session but can never outlast the shift-length cap.
  //
  // `idle` (2026-09-16) carries the proof's OWN idle window so a shorter one
  // survives a heartbeat. A handoff-unlocked session gets 10 minutes instead
  // of 25 (shared/face-auth.ts FACE_HANDOFF_IDLE_TIMEOUT_MS); without this
  // claim the very first heartbeat would re-sign it with the standard window
  // and silently hand it the longer session it was deliberately denied.
  const window = Math.min(Math.max(idleTimeoutMs, 60_000), FACE_IDLE_TIMEOUT_MS);
  const idleDeadline = Math.min(Date.now() + window, absoluteDeadlineMs);
  return new SignJWT({ typ: FACE_TYP, sub: String(userId), sv: sessionVersion, fgv: faceGrantVersion, abs: absoluteDeadlineMs, idle: window, tabs: tabs.slice(-MAX_BOUND_TABS) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(idleDeadline))
    .sign(secretKey());
}

/** The proof this request carries, or null when there is not a valid one.
 *  Shared by the status check and the heartbeat so they can never disagree. */
async function readFaceProof(req: Request, userId: number, sessionVersion: number, faceGrantVersion: number, options: { anyTab?: boolean } = {}): Promise<{ absoluteDeadlineMs: number; idleDeadlineMs: number; idleTimeoutMs: number; tabs: string[] } | null> {
  const raw = parseCookieHeader(req.headers.cookie ?? "")[ADMIN_FACE_COOKIE_NAME];
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secretKey());
    // A proof minted before `typ` existed is refused: one more pass through
    // the password + camera, same policy as the missing-`abs` case below.
    if (payload.typ !== FACE_TYP) return null;
    if (Number(payload.sub) !== userId) return null;
    if (Number(payload.sv) !== sessionVersion) return null;
    // `fgv` (2026-10-01): lock, царайны дахин бүртгэл, step-up зарцуулалт, амжилттай
    // царай бүрт users.faceGrantVersion өсдөг. `fgv`-гүй (хуучин) эсвэл зөрүүтэй
    // proof — cookie хуулсан ч — хүчингүй.
    if (Number(payload.fgv) !== faceGrantVersion) return null;
    // jwtVerify already rejected an expired `exp` (the idle deadline). The
    // absolute deadline is checked here: a token minted before this claim
    // existed has none, and is treated as expiring at its own idle deadline.
    const absoluteDeadlineMs = Number(payload.abs);
    const idleDeadlineMs = Number(payload.exp) * 1000;
    // No `abs` = minted before the idle lock existed, with a flat 8-hour
    // `exp`. Honouring it "until its own deadline" (the first version of
    // this line) is how a two-hour absence went unnoticed on 2026-09-12:
    // the proof predated the deploy. Such a proof is simply invalid now;
    // the person passes the camera once and gets a proper one.
    if (!Number.isFinite(absoluteDeadlineMs)) return null;
    // An idle deadline further out than the rule allows is refused too,
    // whatever it was signed with.
    if (idleDeadlineMs > absoluteDeadlineMs || idleDeadlineMs - Date.now() > FACE_IDLE_TIMEOUT_MS + 5_000) return null;
    if (absoluteDeadlineMs <= Date.now()) return null;
    // Tab binding. A proof without `tabs` predates this rule and is invalid
    // (one more camera pass, same policy as the missing-`abs` case above).
    const tabs = Array.isArray(payload.tabs) ? payload.tabs.filter((t): t is string => typeof t === "string") : null;
    if (!tabs || tabs.length === 0) return null;
    if (!options.anyTab && !tabs.includes(hashTabId(tabIdFrom(req)))) return null;
    // A proof minted before the `idle` claim existed keeps the standard
    // window -- the sanity check above already bounds it.
    const claimed = Number(payload.idle);
    const idleTimeoutMs = Number.isFinite(claimed) ? Math.min(Math.max(claimed, 60_000), FACE_IDLE_TIMEOUT_MS) : FACE_IDLE_TIMEOUT_MS;
    return { absoluteDeadlineMs, idleDeadlineMs, idleTimeoutMs, tabs };
  } catch {
    return null;
  }
}

/**
 * Reads the proof cookie and reports whether this specific device currently
 * holds a valid face check for this specific account.
 *
 * Returns false (never throws) for every failure mode — missing, expired,
 * tampered, or belonging to a different user or a superseded session — so a
 * bad cookie simply means "verify again", not a broken admin panel.
 */
/** The live proof's own idle window, for the client's countdown -- a
 *  handoff-unlocked session runs on the shorter one (10 minutes), and the
 *  browser has to show the same number the server will enforce. */
export async function faceProofIdleTimeoutMs(req: Request, userId: number, sessionVersion: number, faceGrantVersion: number): Promise<number | null> {
  const proof = await readFaceProof(req, userId, sessionVersion, faceGrantVersion);
  return proof ? proof.idleTimeoutMs : null;
}

export async function hasValidFaceProof(req: Request, userId: number, sessionVersion: number, faceGrantVersion: number, options: { anyTab?: boolean } = {}): Promise<boolean> {
  // readFaceProof parses the raw header rather than reading `req.cookies`:
  // this app has no cookie-parser middleware, so `req.cookies` is ALWAYS
  // undefined. Using it meant this check silently returned false for
  // everyone -- a successful face check set the cookie, the very next status
  // query failed to see it, and the gate looped on "verified, entering
  // admin..." forever. Same approach server/_core/context.ts already uses for
  // the session cookie.
  return (await readFaceProof(req, userId, sessionVersion, faceGrantVersion, options)) !== null;
}

/**
 * Slides the idle deadline forward because the person is actually working
 * (server/routers.ts's faceAuth.heartbeat, called only after REAL input in
 * the browser -- never by the panel's own polling).
 *
 * Renewing is not the same as verifying: it needs an already-valid proof, and
 * it carries the original absolute deadline over untouched. An expired proof
 * cannot be revived here, only by passing the camera check again.
 */
/**
 * Mints a proof and puts it on the response: one fresh face check, starting a
 * new absolute window with the idle deadline sliding inside it.
 *
 * Its own function because two paths need exactly this and must not drift --
 * completeFaceVerification below, and the idle-timeout tests, which have to
 * exercise the real cookie rather than a re-implementation of it.
 */
export async function issueFaceProof(input: { req: Request; res: Response; userId: number; sessionVersion: number; faceGrantVersion: number; idleTimeoutMs?: number }): Promise<void> {
  // A second tab that passes the camera JOINS the existing proof (its
  // absolute window and its other tabs kept) rather than replacing it, so
  // two open admin tabs do not keep locking each other out.
  const existing = await readFaceProof(input.req, input.userId, input.sessionVersion, input.faceGrantVersion, { anyTab: true });
  const tab = hashTabId(requireRealTab(input.req));
  const tabs = existing ? [...existing.tabs.filter(t => t !== tab), tab] : [tab];
  const absolute = existing ? existing.absoluteDeadlineMs : Date.now() + FACE_VERIFICATION_TTL_MS;
  // Joining an existing proof keeps the SHORTER of the two idle windows: a
  // handoff-unlocked session must not be widened by later verifying on a
  // second tab, and a normal session is never shortened by accident either --
  // whichever is stricter wins.
  const idleTimeoutMs = Math.min(input.idleTimeoutMs ?? FACE_IDLE_TIMEOUT_MS, existing?.idleTimeoutMs ?? FACE_IDLE_TIMEOUT_MS);
  // 2026-10-01: нэг удаагийн grant. Баталгаажуулалт бүр faceGrantVersion-ийг өсгөж,
  // шинэ proof-ийг шинэ утгаар гарын үсэг зурна — өмнө олгосон БҮХ proof ба
  // зарцуулагдсан нууц үгийн step-up (cookie-г хуулж аваад дахин ашиглах) хүчингүй
  // болно. Одоогийн cookie-д байгаа табууд (дээр уншсан) шинэ утгаар дахин
  // гарын үсэг зурагдаж хамт үлдэнэ.
  const nextVersion = await bumpFaceGrantVersion(input.userId);
  const proof = await signFaceProof(input.userId, input.sessionVersion, nextVersion, absolute, tabs, idleTimeoutMs);
  input.res.cookie(ADMIN_FACE_COOKIE_NAME, proof, faceProofCookieOptions(input.req));
  // The password step that allowed this check is used up (one-shot, see
  // FACE_REAUTH_TTL_MS): the next time this tab needs the face -- idle lock,
  // 8 hours -- it needs the password first again.
  await consumeReauthForTab(input.req, input.res, input.userId, input.sessionVersion, input.faceGrantVersion, nextVersion, tab);
}

export async function refreshFaceProof(input: { req: Request; res: Response; userId: number; sessionVersion: number; faceGrantVersion: number }): Promise<{ ok: boolean; idleExpiresAt: number | null; absoluteExpiresAt: number | null }> {
  const proof = await readFaceProof(input.req, input.userId, input.sessionVersion, input.faceGrantVersion);
  if (!proof) return { ok: false, idleExpiresAt: null, absoluteExpiresAt: null };
  const renewed = await signFaceProof(input.userId, input.sessionVersion, input.faceGrantVersion, proof.absoluteDeadlineMs, proof.tabs, proof.idleTimeoutMs);
  input.res.cookie(ADMIN_FACE_COOKIE_NAME, renewed, faceProofCookieOptions(input.req));
  return {
    ok: true,
    idleExpiresAt: Math.min(Date.now() + proof.idleTimeoutMs, proof.absoluteDeadlineMs),
    absoluteExpiresAt: proof.absoluteDeadlineMs,
  };
}


export function faceProofCookieOptions(req: Request) {
  const isHttps = req.protocol === "https";
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
    // The browser keeps the cookie for the whole absolute window; it is the
    // token INSIDE it whose `exp` enforces the idle timeout. Setting maxAge
    // to the idle timeout instead would work by accident but leave nothing to
    // clear once it lapsed, and a refresh would look like a new login.
    maxAge: FACE_VERIFICATION_TTL_MS,
  };
}

export function clearFaceProofCookie(req: Request, res: Response) {
  res.clearCookie(ADMIN_FACE_COOKIE_NAME, { ...faceProofCookieOptions(req), maxAge: undefined });
}

/**
 * Minting refuses a request with no real tab id (2026-09-22 audit). Reading a
 * "-" binding is harmless, but a proof MINTED for "-" would be honoured by
 * every header-less request afterwards -- one shared, guessable identity. A
 * real browser always sends the header (client/src/main.tsx), so only scripts
 * and tests ever hit this.
 */
export function requireRealTab(req: Request): string {
  const tab = tabIdFrom(req);
  if (tab === NO_TAB) throw new TRPCError({ code: "BAD_REQUEST", message: "Хөтчийн таб тодорхойгүй байна. Хуудсаа дахин ачаална уу." });
  return tab;
}

// ---------------------------------------------------------------------------
// Password step-up (2026-09-22, Tom: "/admin-д эхлээд нууц үгээ хийгээд,
// дараа нь царай таних систем гарч ирээд... гэж хоёулаа ярьсан. Одоо нууц үг
// шаардахгүй, зүгээр нүүрээ таниад л орж байна").
//
// Why it was missing: the session cookie lives 365 days, so the password was
// asked exactly once, at the first sign-in; every later visit to /admin went
// straight to the camera. docs/ADMIN-MANUAL.md section 1 and
// docs/FACE-HANDOFF-PLAN.md control #7 both promised "password, then face" --
// nothing enforced it.
//
// This cookie is that promise: "the password for this account was entered in
// THIS tab, on the /admin password screen, within the last FACE_REAUTH_TTL_MS".
// Minted ONLY by faceAuth.confirmPassword (a sign-in on /login does not count:
// Tom wants the password screen at /admin itself); required before a face
// check can start or complete, before a face is enrolled, and before the
// desktop opens a QR handoff (server/routers.ts). ONE-SHOT: a successful face
// check uses it up (consumeReauthForTab), so every face check -- a new tab,
// the idle lock, 8 hours, signing out -- is password first, then face. Bound
// like the face proof: user, sessionVersion, the tabs it was entered in.
// ---------------------------------------------------------------------------

async function signReauthProof(userId: number, sessionVersion: number, faceGrantVersion: number, absoluteDeadlineMs: number, tabs: readonly string[]): Promise<string> {
  return new SignJWT({ typ: REAUTH_TYP, sub: String(userId), sv: sessionVersion, fgv: faceGrantVersion, tabs: tabs.slice(-MAX_BOUND_TABS) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(absoluteDeadlineMs))
    .sign(secretKey());
}

async function readReauthProof(req: Request, userId: number, sessionVersion: number, faceGrantVersion: number, options: { anyTab?: boolean } = {}): Promise<{ absoluteDeadlineMs: number; tabs: string[] } | null> {
  const raw = parseCookieHeader(req.headers?.cookie ?? "")[ADMIN_REAUTH_COOKIE_NAME];
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secretKey());
    if (payload.typ !== REAUTH_TYP) return null;
    if (Number(payload.sub) !== userId) return null;
    if (Number(payload.sv) !== sessionVersion) return null;
    if (Number(payload.fgv) !== faceGrantVersion) return null;
    const absoluteDeadlineMs = Number(payload.exp) * 1000;
    // A deadline further out than the rule allows is refused, whatever it was
    // signed with.
    if (!Number.isFinite(absoluteDeadlineMs) || absoluteDeadlineMs - Date.now() > FACE_REAUTH_TTL_MS + 5_000) return null;
    const tabs = Array.isArray(payload.tabs) ? payload.tabs.filter((t): t is string => typeof t === "string") : [];
    if (tabs.length === 0) return null;
    if (!options.anyTab && !tabs.includes(hashTabId(tabIdFrom(req)))) return null;
    return { absoluteDeadlineMs, tabs };
  } catch {
    return null;
  }
}

/**
 * Records a just-verified password for this tab. A second tab joins the same
 * cookie (up to MAX_BOUND_TABS) and a fresh password restarts the window --
 * the password has just been proven again.
 */
export async function issueReauthProof(input: { req: Request; res: Response; userId: number; sessionVersion: number; faceGrantVersion: number }): Promise<void> {
  const tab = hashTabId(requireRealTab(input.req));
  const existing = await readReauthProof(input.req, input.userId, input.sessionVersion, input.faceGrantVersion, { anyTab: true });
  const tabs = existing ? [...existing.tabs.filter(t => t !== tab), tab] : [tab];
  const token = await signReauthProof(input.userId, input.sessionVersion, input.faceGrantVersion, Date.now() + FACE_REAUTH_TTL_MS, tabs);
  input.res.cookie(ADMIN_REAUTH_COOKIE_NAME, token, { ...faceProofCookieOptions(input.req), maxAge: FACE_REAUTH_TTL_MS });
}

/** Whether this tab holds a live password step-up for this account. */
export async function hasValidReauthProof(req: Request, userId: number, sessionVersion: number, faceGrantVersion: number): Promise<boolean> {
  return (await readReauthProof(req, userId, sessionVersion, faceGrantVersion)) !== null;
}

/**
 * The server-side half of the password step. Throws FORBIDDEN with
 * REAUTH_REQUIRED_ERR_MSG, which the client maps to "show the password screen"
 * (client/src/main.tsx). A no-op with the gate off: the escape hatch switches
 * off the whole second-factor flow, password step included.
 */
export async function assertReauthProof(input: { req: Request; user: { id: number; sessionVersion: number; faceGrantVersion: number }; evenWhenGateOff?: boolean }): Promise<void> {
  // 2026-09-27: `evenWhenGateOff` — царай БҮРТГЭХ нь хаалга унтраалттай үед ч нууц
  // үг шаардана: эс бөгөөс засвар үйлчилгээний үед хулгайлсан session дангаараа
  // эзний царайг өөрийнхөөрөө сольж, хаалга дахин асахад шууд нэвтэрнэ.
  if (!isFaceGateEnabled() && !input.evenWhenGateOff) return;
  if (await hasValidReauthProof(input.req, input.user.id, input.user.sessionVersion, input.user.faceGrantVersion)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: REAUTH_REQUIRED_ERR_MSG });
}

export function clearReauthCookie(req: Request, res: Response) {
  res.clearCookie(ADMIN_REAUTH_COOKIE_NAME, { ...faceProofCookieOptions(req), maxAge: undefined });
}

/**
 * Царайг ДАХИН БҮРТГЭСНИЙ дараа (2026-10-01): faceGrantVersion-ийг өсгөж өмнө олгосон
 * БҮХ царайны proof-ийг хүчингүй болгоно, харин энэ хөтчийн нууц үгийн step-up-ийг
 * (хугацаа, табуудтай нь) шинэ утгаар дахин гарын үсэглэнэ — бүртгэлийн дараах
 * шууд царайн шалгалт нууц үгийг дахин асуухгүй. Царайн proof cookie-г мөн цэвэрлэнэ.
 */
export async function rotateFaceGrant(input: { req: Request; res: Response; userId: number; sessionVersion: number; faceGrantVersion: number }): Promise<void> {
  const reauth = await readReauthProof(input.req, input.userId, input.sessionVersion, input.faceGrantVersion, { anyTab: true });
  const nextVersion = await bumpFaceGrantVersion(input.userId);
  clearFaceProofCookie(input.req, input.res);
  if (!reauth) return;
  const token = await signReauthProof(input.userId, input.sessionVersion, nextVersion, reauth.absoluteDeadlineMs, reauth.tabs);
  input.res.cookie(ADMIN_REAUTH_COOKIE_NAME, token, { ...faceProofCookieOptions(input.req), maxAge: Math.max(0, reauth.absoluteDeadlineMs - Date.now()) });
}

/** Uses up this tab's password step. Other tabs that entered the password and
 *  are still mid-way through their own face check keep theirs. */
async function consumeReauthForTab(req: Request, res: Response, userId: number, sessionVersion: number, currentFaceGrantVersion: number, nextFaceGrantVersion: number, tab: string): Promise<void> {
  const existing = await readReauthProof(req, userId, sessionVersion, currentFaceGrantVersion, { anyTab: true });
  if (!existing) return;
  const remaining = existing.tabs.filter(t => t !== tab);
  if (remaining.length === 0) {
    clearReauthCookie(req, res);
    return;
  }
  const token = await signReauthProof(userId, sessionVersion, nextFaceGrantVersion, existing.absoluteDeadlineMs, remaining);
  res.cookie(ADMIN_REAUTH_COOKIE_NAME, token, { ...faceProofCookieOptions(req), maxAge: Math.max(0, existing.absoluteDeadlineMs - Date.now()) });
}


/**
 * The server-side half of the gate, run by every admin-panel procedure
 * (server/_core/trpc.ts). The screen gate decides what to RENDER; this
 * decides what the server will DO. With the gate on, a panel-role account
 * whose browser holds no live proof gets FORBIDDEN with FACE_REQUIRED_ERR_MSG,
 * which the client maps to "show the camera again" (client/src/main.tsx).
 *
 * Plain customers are never asked -- they have no panel to protect -- and
 * with the gate off nothing here runs, exactly like faceAuth.status.
 */
export async function assertFaceProofForPanelRole(input: { req: Request; user: { id: number; role: string | null; sessionVersion: number; faceGrantVersion: number } }): Promise<void> {
  if (!isFaceGateEnabled() || !isAdminPanelRole(input.user.role)) return;
  if (await hasValidFaceProof(input.req, input.user.id, input.user.sessionVersion, input.user.faceGrantVersion)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: FACE_REQUIRED_ERR_MSG });
}
