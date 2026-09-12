/**
 * The admin face gate's PROOF: a signed, per-device cookie saying "this
 * browser passed a face check for this account". Pure -- jose, the cookie
 * header, env, shared constants. No database, so server/_core/trpc.ts can
 * enforce it on every admin-panel procedure without pulling the domain in.
 *
 * Split out of server/faceAuth.ts on 2026-09-12 after a real incident: the
 * idle lock (25 minutes, commit 618eeec) was enforced by the SCREEN only.
 * The proof cookie expired on time, but the tRPC procedures behind /admin
 * never asked for it, and a proof minted by the previous deploy (a flat
 * 8-hour `exp`, no `abs` claim) was accepted as-is until it ran out. Tom
 * left the laptop for two hours and came back to a working panel. Both
 * holes are closed here: legacy proofs are refused (readFaceProof), and
 * `assertFaceProofForPanelRole` is what every panel procedure runs.
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
async function signFaceProof(userId: number, sessionVersion: number, absoluteDeadlineMs: number): Promise<string> {
  // Two deadlines in one token. `exp` is the IDLE one and slides forward on
  // real activity (see refreshFaceProof); `abs` is the absolute one and is
  // copied unchanged through every refresh, so renewing can extend a working
  // session but can never outlast the shift-length cap.
  const idleDeadline = Math.min(Date.now() + FACE_IDLE_TIMEOUT_MS, absoluteDeadlineMs);
  return new SignJWT({ sub: String(userId), sv: sessionVersion, abs: absoluteDeadlineMs })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(idleDeadline))
    .sign(secretKey());
}

/** The proof this request carries, or null when there is not a valid one.
 *  Shared by the status check and the heartbeat so they can never disagree. */
async function readFaceProof(req: Request, userId: number, sessionVersion: number): Promise<{ absoluteDeadlineMs: number; idleDeadlineMs: number } | null> {
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
    return { absoluteDeadlineMs, idleDeadlineMs };
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
  const proof = await signFaceProof(input.userId, input.sessionVersion, Date.now() + FACE_VERIFICATION_TTL_MS);
  input.res.cookie(ADMIN_FACE_COOKIE_NAME, proof, faceProofCookieOptions(input.req));
}

export async function refreshFaceProof(input: { req: Request; res: Response; userId: number; sessionVersion: number }): Promise<{ ok: boolean; idleExpiresAt: number | null; absoluteExpiresAt: number | null }> {
  const proof = await readFaceProof(input.req, input.userId, input.sessionVersion);
  if (!proof) return { ok: false, idleExpiresAt: null, absoluteExpiresAt: null };
  const renewed = await signFaceProof(input.userId, input.sessionVersion, proof.absoluteDeadlineMs);
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
