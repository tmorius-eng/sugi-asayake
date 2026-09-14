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

import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { FACE_IDLE_TIMEOUT_MS, FACE_VERIFICATION_TTL_MS, isAdminPanelRole } from "../../shared/face-auth";
import { ADMIN_FACE_COOKIE_NAME, FACE_REQUIRED_ERR_MSG } from "../../shared/const";
import { ENV } from "./env";

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
let devFallbackSecret: Uint8Array | null = null;
function secretKey(): Uint8Array {
  if (ENV.cookieSecret) return new TextEncoder().encode(ENV.cookieSecret);
  if (!devFallbackSecret) devFallbackSecret = new TextEncoder().encode(Math.random().toString(36) + Date.now());
  return devFallbackSecret;
}

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
const NO_TAB = "-";
const MAX_BOUND_TABS = 6;
export function tabIdFrom(req: Request): string {
  const raw = req.headers?.[ADMIN_TAB_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : NO_TAB;
}

async function signFaceProof(userId: number, sessionVersion: number, absoluteDeadlineMs: number, tabs: readonly string[]): Promise<string> {
  // Two deadlines in one token. `exp` is the IDLE one and slides forward on
  // real activity (see refreshFaceProof); `abs` is the absolute one and is
  // copied unchanged through every refresh, so renewing can extend a working
  // session but can never outlast the shift-length cap.
  const idleDeadline = Math.min(Date.now() + FACE_IDLE_TIMEOUT_MS, absoluteDeadlineMs);
  return new SignJWT({ sub: String(userId), sv: sessionVersion, abs: absoluteDeadlineMs, tabs: tabs.slice(-MAX_BOUND_TABS) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(idleDeadline))
    .sign(secretKey());
}

/** The proof this request carries, or null when there is not a valid one.
 *  Shared by the status check and the heartbeat so they can never disagree. */
async function readFaceProof(req: Request, userId: number, sessionVersion: number, options: { anyTab?: boolean } = {}): Promise<{ absoluteDeadlineMs: number; idleDeadlineMs: number; tabs: string[] } | null> {
  const raw = parseCookieHeader(req.headers.cookie ?? "")[ADMIN_FACE_COOKIE_NAME];
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secretKey());
    if (Number(payload.sub) !== userId) return null;
    if (Number(payload.sv) !== sessionVersion) return null;
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
    if (!options.anyTab && !tabs.includes(tabIdFrom(req))) return null;
    return { absoluteDeadlineMs, idleDeadlineMs, tabs };
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
export async function hasValidFaceProof(req: Request, userId: number, sessionVersion: number): Promise<boolean> {
  // readFaceProof parses the raw header rather than reading `req.cookies`:
  // this app has no cookie-parser middleware, so `req.cookies` is ALWAYS
  // undefined. Using it meant this check silently returned false for
  // everyone -- a successful face check set the cookie, the very next status
  // query failed to see it, and the gate looped on "verified, entering
  // admin..." forever. Same approach server/_core/context.ts already uses for
  // the session cookie.
  return (await readFaceProof(req, userId, sessionVersion)) !== null;
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
export async function issueFaceProof(input: { req: Request; res: Response; userId: number; sessionVersion: number }): Promise<void> {
  // A second tab that passes the camera JOINS the existing proof (its
  // absolute window and its other tabs kept) rather than replacing it, so
  // two open admin tabs do not keep locking each other out.
  const existing = await readFaceProof(input.req, input.userId, input.sessionVersion, { anyTab: true });
  const tab = tabIdFrom(input.req);
  const tabs = existing ? [...existing.tabs.filter(t => t !== tab), tab] : [tab];
  const absolute = existing ? existing.absoluteDeadlineMs : Date.now() + FACE_VERIFICATION_TTL_MS;
  const proof = await signFaceProof(input.userId, input.sessionVersion, absolute, tabs);
  input.res.cookie(ADMIN_FACE_COOKIE_NAME, proof, faceProofCookieOptions(input.req));
}

export async function refreshFaceProof(input: { req: Request; res: Response; userId: number; sessionVersion: number }): Promise<{ ok: boolean; idleExpiresAt: number | null; absoluteExpiresAt: number | null }> {
  const proof = await readFaceProof(input.req, input.userId, input.sessionVersion);
  if (!proof) return { ok: false, idleExpiresAt: null, absoluteExpiresAt: null };
  const renewed = await signFaceProof(input.userId, input.sessionVersion, proof.absoluteDeadlineMs, proof.tabs);
  input.res.cookie(ADMIN_FACE_COOKIE_NAME, renewed, faceProofCookieOptions(input.req));
  return {
    ok: true,
    idleExpiresAt: Math.min(Date.now() + FACE_IDLE_TIMEOUT_MS, proof.absoluteDeadlineMs),
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
 * The server-side half of the gate, run by every admin-panel procedure
 * (server/_core/trpc.ts). The screen gate decides what to RENDER; this
 * decides what the server will DO. With the gate on, a panel-role account
 * whose browser holds no live proof gets FORBIDDEN with FACE_REQUIRED_ERR_MSG,
 * which the client maps to "show the camera again" (client/src/main.tsx).
 *
 * Plain customers are never asked -- they have no panel to protect -- and
 * with the gate off nothing here runs, exactly like faceAuth.status.
 */
export async function assertFaceProofForPanelRole(input: { req: Request; user: { id: number; role: string | null; sessionVersion: number } }): Promise<void> {
  if (!isFaceGateEnabled() || !isAdminPanelRole(input.user.role)) return;
  if (await hasValidFaceProof(input.req, input.user.id, input.user.sessionVersion)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: FACE_REQUIRED_ERR_MSG });
}
