/**
 * Admin царайны хаалга (2026-09-08) — панелийн 5 эрхийн /admin-ий өмнө зогсдог
 * хөтчийн камерын царайн шалгалтын серверийн тал.
 *
 * server/verifyMn.ts-ийн хэлбэрийг санаатай тусгана (нэг удаагийн challenge өгч,
 * түүнтэй тулгаж баталгаажуулах) гуравдагч талын round trip-гүйгээр: энд вендор,
 * API түлхүүр, гадагш сүлжээний дуудлага байхгүй. Царайн загвар ажилтны хөтөч дээр
 * ажиллаж, зөвхөн 128 тооны descriptor энэ файлд хүрнэ.
 *
 * ЭНЭ ФАЙЛ САНААТАЙГААР ЮУ ХИЙДЭГГҮЙ: камерын зургийг хэзээ ч хүлээн авахгүй,
 * хадгалахгүй, дамжуулахгүй. Энэ урсгалд upload endpoint байхгүй. Нэмэх гэж байвал
 * зогсоод дахин бод — энэ дизайны бүх нууцлалын үндэслэл (Монголын Хувь хүний
 * мэдээлэл хамгаалах хуулиар хил дамнасан өгөгдлийн мэдэгдэл шаарддаггүй шалтгаан)
 * frame авсан машинаасаа хэзээ ч гардаггүйд тулгуурладаг.
 */

import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import {
  FACE_CHALLENGE_TTL_MS,
  FACE_FAILURE_LOCKOUT_MAX,
  FACE_FAILURE_LOCKOUT_WINDOW_MS,
  FACE_LOGIN_CHALLENGE,
  FACE_MATCH_THRESHOLD,
  FACE_MODEL_VERSION,
  bestFaceDistance,
  isValidFaceDescriptor,
  type FaceChallengeAction,
} from "../shared/face-auth";
import { ENV } from "./_core/env";
import {
  consumeFaceChallenge,
  countRecentFailedFaceAttempts,
  createFaceChallenge,
  encryptFaceEnrollmentIfPlain,
  getFaceEnrollment,
  logAdminAction,
  recordFaceAttempt,
  touchFaceVerified,
} from "./db";

// The proof cookie itself (sign / read / refresh / clear) lives in
// server/_core/faceProof.ts so the tRPC layer can enforce it without a
// domain import; re-exported here so existing callers and tests keep
// their import path.
export { clearFaceProofCookie, faceProofIdleTimeoutMs, hasValidFaceProof, isFaceGateEnabled, issueFaceProof, refreshFaceProof } from "./_core/faceProof";
import { clearFaceProofCookie, issueFaceProof } from "./_core/faceProof";

/**
 * Ends the face session now: /admin locks and asks for the face again.
 *
 * Called by the browser when its idle timer fires, and available as a
 * deliberate "lock this screen" action. Recorded in face_attempts so the
 * Security Center shows locks next to matches and failures -- an audit trail
 * that only holds failures cannot answer "was this screen left open?".
 */
export async function lockFaceSession(input: { req: Request; res: Response; userId: number; reason: "idle" | "manual" }): Promise<void> {
  clearFaceProofCookie(input.req, input.res);
  await recordFaceAttempt({ userId: input.userId, outcome: "idle_locked", detail: input.reason, ip: input.req.ip ?? null });
}



/**
 * Per-account lockout (2026-09-22 audit). The IP rate limit alone let anyone
 * with several addresses keep trying descriptors against one account; after
 * FACE_FAILURE_LOCKOUT_MAX real failures inside the window no further check
 * starts or completes for that account until the window passes.
 *
 * An admin can get the person in sooner by resetting their enrolment: only
 * failures since the current enrolment was written count (`enrolledAt`). A
 * missing blink counts only while it actually blocks -- with
 * ADMIN_FACE_LIVENESS_ENFORCED=0 those attempts PASSED, and must not lock.
 */
export async function assertFaceNotLockedOut(userId: number, ip: string | null, enrolledAt?: Date): Promise<void> {
  const failures = await countRecentFailedFaceAttempts(userId, FACE_FAILURE_LOCKOUT_WINDOW_MS, {
    since: enrolledAt,
    outcomes: ENV.adminFaceLivenessEnforced ? ["no_match", "liveness_failed"] : ["no_match"],
  });
  if (failures < FACE_FAILURE_LOCKOUT_MAX) return;
  // Logged once per refused attempt so the Security Center shows the
  // lockout next to the failures that caused it.
  await logAdminAction({ actorUserId: userId, action: "face.lockout", entityType: "user", entityId: userId, metadata: { failures, ip } });
  throw new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: `Царай ${FACE_FAILURE_LOCKOUT_MAX} удаа таарсангүй тул түр түгжигдлээ. 15 минутын дараа дахин оролдоно уу, эсвэл админд хандаж бүртгэлээ шинэчлүүлнэ үү.`,
  });
}

/**
 * Issues a fresh single-use challenge. Always a blink since 2026-09-22 (see
 * FACE_LOGIN_CHALLENGE): the browser refuses to submit without one, and the
 * server refuses a submission that reports none (ENV.adminFaceLivenessEnforced).
 */
export async function startFaceVerification(userId: number, ip: string | null = null): Promise<{ challengeId: number; action: FaceChallengeAction }> {
  const enrollment = await getFaceEnrollment(userId);
  if (!enrollment) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Царай бүртгэгдээгүй байна." });
  }
  await assertFaceNotLockedOut(userId, ip, enrollment.updatedAt);
  const action = FACE_LOGIN_CHALLENGE;
  const challengeId = await createFaceChallenge({
    userId,
    action,
    expiresAt: new Date(Date.now() + FACE_CHALLENGE_TTL_MS),
  });
  return { challengeId, action };
}

/**
 * What the BROWSER is told. Deliberately no distance (2026-09-22 audit): an
 * exact distance on every failure is a hill-climbing oracle -- nudge a
 * descriptor, watch the number fall, repeat until it is under the threshold.
 * The distance stays in face_attempts, where the Security Center reads it.
 */
export type FaceVerificationResult =
  | { ok: true }
  | { ok: false; reason: "no_enrollment" | "stale_model" | "bad_challenge" | "liveness_failed" | "no_match" };

/**
 * Completes a face check: consumes the challenge, confirms the browser
 * reported the challenged action as performed, and compares the submitted
 * descriptor against the enrolled one.
 *
 * ON TRUSTING THE CLIENT'S LIVENESS FLAG, stated plainly rather than buried
 * (2026-09-22: blocking by default now, see ENV.adminFaceLivenessEnforced):
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
  /**
   * Whether a successful match should mint the proof cookie on `res`
   * (2026-09-16). False for the QR handoff: the PHONE passes the camera
   * check, but the proof belongs to the desktop and is minted later, on the
   * desktop's own polling request (server/faceHandoff.ts). Minting here too
   * would hand the phone admin access it never asked for.
   */
  issueProof?: boolean;
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
  await assertFaceNotLockedOut(input.userId, ip, enrollment.updatedAt);

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

  // Build the set of stored views of this face: the averaged frontal
  // descriptor, plus every per-pose descriptor captured during the guided
  // enrollment. Verification compares against ALL of them and keeps the
  // closest -- a person sitting slightly turned should be matched against
  // the angled view that was enrolled for exactly that, not forced through a
  // frontal-only reference that inflates the distance and rejects them.
  const references: number[][] = [];
  try {
    const primary = JSON.parse(enrollment.descriptorJson) as number[];
    if (isValidFaceDescriptor(primary)) references.push(primary);
  } catch {
    // Fall through -- poses below may still provide a usable reference.
  }
  if (enrollment.posesJson) {
    try {
      const poses = JSON.parse(enrollment.posesJson) as { pose: string; descriptor: number[] }[];
      for (const p of poses) {
        if (Array.isArray(p?.descriptor) && isValidFaceDescriptor(p.descriptor)) references.push(p.descriptor);
      }
    } catch {
      // A corrupt poses blob must not break an otherwise valid enrollment.
    }
  }

  if (references.length === 0) {
    await recordFaceAttempt({ userId: input.userId, outcome: "error", detail: "corrupt_enrollment", ip });
    return { ok: false, reason: "no_enrollment" };
  }

  const best = bestFaceDistance(input.descriptor, references);
  if (best === null) {
    await recordFaceAttempt({ userId: input.userId, outcome: "error", detail: "corrupt_enrollment", ip });
    return { ok: false, reason: "no_enrollment" };
  }
  const distance = best;
  // Stored as thousandths so the audit trail keeps useful precision in a
  // plain int column (0.583 -> 583) without a float column's comparison
  // quirks. The threshold decision itself is made on the real float above.
  const distanceMilli = Math.round(distance * 1000);

  if (distance > FACE_MATCH_THRESHOLD) {
    await recordFaceAttempt({ userId: input.userId, outcome: "no_match", distance: distanceMilli, detail: challenge.action, ip });
    return { ok: false, reason: "no_match" };
  }

  if (input.issueProof !== false) {
    await issueFaceProof({ req: input.req, res: input.res, userId: input.userId, sessionVersion: input.sessionVersion });
  }
  await touchFaceVerified(input.userId);
  await recordFaceAttempt({ userId: input.userId, outcome: "verified", distance: distanceMilli, detail: input.issueProof === false ? `handoff ${challenge.action}`.slice(0, 160) : challenge.action, ip });
  // A template stored before encryption at rest is rewritten encrypted now,
  // by the person it belongs to, with no manual migration step.
  await encryptFaceEnrollmentIfPlain(input.userId);
  return { ok: true };
}
