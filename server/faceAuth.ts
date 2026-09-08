/**
 * Admin face gate (2026-09-08) — server side of the browser-camera face check
 * that stands in front of /admin for the five panel roles.
 *
 * Deliberately mirrors server/verifyMn.ts's shape (issue a single-use
 * challenge, then verify against it) minus the third-party round trip: there
 * is no vendor here, no API key, and no outbound network call. The face model
 * runs in the staff member's browser and only a 128-number descriptor reaches
 * this file.
 *
 * WHAT THIS FILE DOES NOT DO, on purpose: it never receives, stores or
 * forwards a camera image. There is no upload endpoint in this flow. If you
 * are adding one, stop and reconsider — the entire privacy argument for this
 * design (and the reason it needs no cross-border data disclosure under
 * Mongolia's Personal Data Protection Law) rests on frames never leaving the
 * machine they were captured on.
 */

import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import {
  FACE_CHALLENGE_ACTIONS,
  FACE_CHALLENGE_TTL_MS,
  FACE_MATCH_THRESHOLD,
  FACE_MODEL_VERSION,
  FACE_VERIFICATION_TTL_MS,
  faceDescriptorDistance,
  isValidFaceDescriptor,
  type FaceChallengeAction,
} from "../shared/face-auth";
import { ADMIN_FACE_COOKIE_NAME } from "../shared/const";
import { ENV } from "./_core/env";
import {
  consumeFaceChallenge,
  createFaceChallenge,
  getFaceEnrollment,
  recordFaceAttempt,
  touchFaceVerified,
} from "./db";

/** Whether the gate is switched on at all. Everything else in this module is
 *  a no-op path when this is false — see ENV.adminFaceGateEnabled's own
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
async function signFaceProof(userId: number, sessionVersion: number): Promise<string> {
  return new SignJWT({ sub: String(userId), sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + FACE_VERIFICATION_TTL_MS))
    .sign(secretKey());
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
  // Parse the raw header rather than reading `req.cookies`: this app has no
  // cookie-parser middleware, so `req.cookies` is ALWAYS undefined. Using it
  // meant this function silently returned false for everyone -- a successful
  // face check set the cookie, the very next status query failed to see it,
  // and the gate looped on "verified, entering admin..." forever. Same
  // approach server/_core/context.ts already uses for the session cookie.
  const raw = parseCookieHeader(req.headers.cookie ?? "")[ADMIN_FACE_COOKIE_NAME];
  if (!raw) return false;
  try {
    const { payload } = await jwtVerify(raw, secretKey());
    if (Number(payload.sub) !== userId) return false;
    if (Number(payload.sv) !== sessionVersion) return false;
    return true;
  } catch {
    return false;
  }
}

function faceProofCookieOptions(req: Request) {
  const isHttps = req.protocol === "https";
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
    maxAge: FACE_VERIFICATION_TTL_MS,
  };
}

export function clearFaceProofCookie(req: Request, res: Response) {
  res.clearCookie(ADMIN_FACE_COOKIE_NAME, { ...faceProofCookieOptions(req), maxAge: undefined });
}

/**
 * Issues a fresh single-use liveness challenge.
 *
 * The action is randomised per attempt specifically so that a photograph held
 * up to the camera cannot satisfy it, and so a recording of one successful
 * attempt is unlikely to satisfy the next one.
 */
export async function startFaceVerification(userId: number): Promise<{ challengeId: number; action: FaceChallengeAction }> {
  const enrollment = await getFaceEnrollment(userId);
  if (!enrollment) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Царай бүртгэгдээгүй байна." });
  }
  const action = FACE_CHALLENGE_ACTIONS[Math.floor(Math.random() * FACE_CHALLENGE_ACTIONS.length)];
  const challengeId = await createFaceChallenge({
    userId,
    action,
    expiresAt: new Date(Date.now() + FACE_CHALLENGE_TTL_MS),
  });
  return { challengeId, action };
}

export type FaceVerificationResult =
  | { ok: true; distance: number }
  | { ok: false; reason: "no_enrollment" | "stale_model" | "bad_challenge" | "liveness_failed" | "no_match"; distance?: number };

/**
 * Completes a face check: consumes the challenge, confirms the browser
 * reported the challenged action as performed, and compares the submitted
 * descriptor against the enrolled one.
 *
 * ON TRUSTING THE CLIENT'S LIVENESS FLAG, stated plainly rather than buried:
 * `livenessPassed` is asserted by the browser, because the frames it was
 * derived from never leave the browser. A technically capable attacker who
 * already holds this account's password could therefore assert it falsely.
 * That does NOT let them in — they would still have to supply a descriptor
 * within matching distance of the enrolled face, which they cannot read and
 * cannot guess — so the liveness step is a deterrent against someone holding
 * a photo to the lens, not a defence against a determined attacker. The
 * password remains the first factor and this remains the second.
 */
export async function completeFaceVerification(input: {
  userId: number;
  sessionVersion: number;
  challengeId: number;
  descriptor: number[];
  livenessPassed: boolean;
  /** Client-measured values, for tuning only -- never trusted for the
   *  pass/fail decision. See the router's own note. */
  diagnostic?: string;
  req: Request;
  res: Response;
}): Promise<FaceVerificationResult> {
  const ip = input.req.ip ?? null;

  if (!isValidFaceDescriptor(input.descriptor)) {
    await recordFaceAttempt({ userId: input.userId, outcome: "error", detail: "invalid_descriptor", ip });
    throw new TRPCError({ code: "BAD_REQUEST", message: "Царайн өгөгдөл буруу байна." });
  }

  const enrollment = await getFaceEnrollment(input.userId);
  if (!enrollment) {
    await recordFaceAttempt({ userId: input.userId, outcome: "error", detail: "no_enrollment", ip });
    return { ok: false, reason: "no_enrollment" };
  }

  // A descriptor produced by a different model is not comparable with this
  // one -- comparing them anyway would reject everybody while looking like a
  // mysterious outage. Surfaced as its own reason so the UI can say
  // "re-enroll" instead of "your face didn't match".
  if (enrollment.modelVersion !== FACE_MODEL_VERSION) {
    await recordFaceAttempt({ userId: input.userId, outcome: "error", detail: "stale_model", ip });
    return { ok: false, reason: "stale_model" };
  }

  // Claimed atomically -- see consumeFaceChallenge. A challenge is usable
  // exactly once, so a replayed submission fails here rather than being
  // silently accepted a second time.
  const challenge = await consumeFaceChallenge({ id: input.challengeId, userId: input.userId });
  if (!challenge) {
    await recordFaceAttempt({ userId: input.userId, outcome: "error", detail: "bad_challenge", ip });
    return { ok: false, reason: "bad_challenge" };
  }

  // Liveness is ALWAYS evaluated and ALWAYS recorded, whether or not it
  // blocks -- see ENV.adminFaceLivenessEnforced for why blocking is opt-in.
  // The face match below is unconditional and is the real identity control.
  if (!input.livenessPassed) {
    await recordFaceAttempt({
      userId: input.userId,
      outcome: "liveness_failed",
      detail: input.diagnostic ? `${challenge.action} ${input.diagnostic}`.slice(0, 160) : challenge.action,
      ip,
    });
    if (ENV.adminFaceLivenessEnforced) return { ok: false, reason: "liveness_failed" };
  }

  let reference: number[];
  try {
    reference = JSON.parse(enrollment.descriptorJson) as number[];
  } catch {
    await recordFaceAttempt({ userId: input.userId, outcome: "error", detail: "corrupt_enrollment", ip });
    return { ok: false, reason: "no_enrollment" };
  }
  if (!isValidFaceDescriptor(reference)) {
    await recordFaceAttempt({ userId: input.userId, outcome: "error", detail: "corrupt_enrollment", ip });
    return { ok: false, reason: "no_enrollment" };
  }

  const distance = faceDescriptorDistance(input.descriptor, reference);
  // Stored as thousandths so the audit trail keeps useful precision in a
  // plain int column (0.583 -> 583) without a float column's comparison
  // quirks. The threshold decision itself is made on the real float above.
  const distanceMilli = Math.round(distance * 1000);

  if (distance > FACE_MATCH_THRESHOLD) {
    await recordFaceAttempt({ userId: input.userId, outcome: "no_match", distance: distanceMilli, detail: challenge.action, ip });
    return { ok: false, reason: "no_match", distance };
  }

  const proof = await signFaceProof(input.userId, input.sessionVersion);
  input.res.cookie(ADMIN_FACE_COOKIE_NAME, proof, faceProofCookieOptions(input.req));
  await touchFaceVerified(input.userId);
  await recordFaceAttempt({ userId: input.userId, outcome: "verified", distance: distanceMilli, detail: challenge.action, ip });
  return { ok: true, distance };
}
