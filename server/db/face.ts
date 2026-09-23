// server/db/face.ts — Admin царайны бүртгэл/challenge/оролдлого.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, count, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { faceAttempts, faceChallenges, faceEnrollments, users } from "../../drizzle/schema";
import { ENCRYPTED_TEXT_PREFIX, decryptText, encryptText, hasEncryptionKey } from "../_core/crypto";
import { getDb } from "./connection";

// ---------------------------------------------------------------------------
// Admin face gate (2026-09-08). See server/faceAuth.ts for the flow and
// drizzle/schema.ts for what is and is not stored (a 128-number descriptor,
// never a photograph).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Template encryption at rest (2026-09-22 audit). The descriptor is a
// credential in its own right: whoever reads it can submit it and pass the
// face check, because the server compares numbers and never sees a camera.
// It used to sit in the database as plain JSON, so a leaked backup was a
// working second factor for every staff member. Now it is AES-256-GCM under
// INTEGRATIONS_ENCRYPTION_KEY (server/_core/crypto.ts) -- the same key the
// integration credentials already use, so a DB backup alone reveals nothing.
//
// Rows written before this are plain JSON and are still read; each is
// rewritten encrypted the next time its owner passes a face check
// (encryptFaceEnrollmentIfPlain). Writing a NEW template without the key is
// refused rather than silently falling back to plaintext.
// ---------------------------------------------------------------------------

export class FaceTemplateKeyMissingError extends Error {
  constructor() {
    super("INTEGRATIONS_ENCRYPTION_KEY is not configured -- refusing to store a face template in plaintext.");
  }
}

function sealTemplate(json: string): string {
  if (!hasEncryptionKey()) throw new FaceTemplateKeyMissingError();
  return encryptText(json);
}

/** Plaintext JSON back, or null when the stored value cannot be read (wrong
 *  key, tampered, corrupt) -- the caller treats that as "enrol again". */
function openTemplate(stored: string | null): string | null {
  if (stored === null) return null;
  if (!stored.startsWith(ENCRYPTED_TEXT_PREFIX)) return stored;
  try {
    return decryptText(stored);
  } catch {
    return null;
  }
}

/**
 * The enrolment with its template already decrypted. `templateReadable` is
 * false when the stored template cannot be opened (the key changed, or the
 * row was tampered with); faceAuth.status reports that as needing a fresh
 * enrolment instead of failing every check as "your face did not match".
 */
export async function getFaceEnrollment(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(faceEnrollments).where(eq(faceEnrollments.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return undefined;
  const descriptorJson = openTemplate(row.descriptorJson);
  const posesJson = row.posesJson === null ? null : openTemplate(row.posesJson);
  const templateReadable = descriptorJson !== null && (row.posesJson === null || posesJson !== null);
  return {
    ...row,
    descriptorJson: descriptorJson ?? "",
    posesJson,
    templateReadable,
    templateEncrypted: row.descriptorJson.startsWith(ENCRYPTED_TEXT_PREFIX),
  };
}

/**
 * Rewrites a legacy plaintext template encrypted. Called after a successful
 * face check, so the switch-over needs no manual migration step. Guarded on
 * the old value so it can never overwrite a re-enrolment that landed in
 * between.
 */
export async function encryptFaceEnrollmentIfPlain(userId: number): Promise<void> {
  if (!hasEncryptionKey()) return;
  const db = await getDb();
  if (!db) return;
  const [row] = await db.select().from(faceEnrollments).where(eq(faceEnrollments.userId, userId)).limit(1);
  if (!row || row.descriptorJson.startsWith(ENCRYPTED_TEXT_PREFIX)) return;
  await db.update(faceEnrollments)
    .set({
      descriptorJson: encryptText(row.descriptorJson),
      posesJson: row.posesJson === null || row.posesJson.startsWith(ENCRYPTED_TEXT_PREFIX) ? row.posesJson : encryptText(row.posesJson),
    })
    .where(and(eq(faceEnrollments.userId, userId), eq(faceEnrollments.descriptorJson, row.descriptorJson)));
}

/** Upsert rather than insert: re-enrolling (new glasses, a beard, a better
 *  camera) must replace the reference vector in place, not accumulate stale
 *  rows that could later be compared against. */
export async function upsertFaceEnrollment(input: {
  userId: number;
  descriptor: number[];
  sampleCount: number;
  modelVersion: string;
  /** Per-pose descriptors from the guided enrollment (centre/left/right).
   *  Optional so older callers and older enrollments keep working. */
  poses?: { pose: string; descriptor: number[] }[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const descriptorJson = sealTemplate(JSON.stringify(input.descriptor));
  const posesJson = input.poses?.length ? sealTemplate(JSON.stringify(input.poses)) : null;
  const existing = await getFaceEnrollment(input.userId);
  if (existing) {
    await db.update(faceEnrollments)
      .set({ descriptorJson, posesJson, sampleCount: input.sampleCount, modelVersion: input.modelVersion })
      .where(eq(faceEnrollments.userId, input.userId));
    return;
  }
  await db.insert(faceEnrollments).values({
    userId: input.userId,
    descriptorJson,
    posesJson,
    sampleCount: input.sampleCount,
    modelVersion: input.modelVersion,
    consentedAt: new Date(),
  });
}

/** Break-glass: clears one person's enrolled face so they re-enroll on their
 *  next /admin visit. The per-user counterpart to the ADMIN_FACE_GATE_ENABLED
 *  kill switch, for when one camera/face is the problem rather than the whole
 *  feature. */
export async function deleteFaceEnrollment(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(faceEnrollments).where(eq(faceEnrollments.userId, userId));
  await db.update(users).set({ faceVerifiedAt: null }).where(eq(users.id, userId));
}

export async function createFaceChallenge(input: { userId: number; action: "blink" | "turn_left" | "turn_right" | "open_mouth"; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inserted = await db.insert(faceChallenges).values({ userId: input.userId, action: input.action, expiresAt: input.expiresAt });
  return Number(inserted[0].insertId);
}

/**
 * Claims a challenge for single use and returns it, or undefined if it was
 * already used / expired / belongs to someone else.
 *
 * Uses the same atomic WHERE-guard + affectedRows idiom as
 * resetPasswordViaPhoneSession above (audit finding BUG-003, 2026-09-06):
 * reading `consumedAt` and then writing it would let two concurrent
 * submissions both pass the read before either wrote.
 */
export async function consumeFaceChallenge(input: { id: number; userId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(faceChallenges).where(eq(faceChallenges.id, input.id)).limit(1);
  const challenge = rows[0];
  if (!challenge) return undefined;
  if (challenge.userId !== input.userId) return undefined;
  if (challenge.expiresAt.getTime() <= Date.now()) return undefined;

  const claimed = await db.update(faceChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(faceChallenges.id, challenge.id), isNull(faceChallenges.consumedAt)));
  if (Number(claimed[0].affectedRows ?? 0) !== 1) return undefined;
  return challenge;
}

/**
 * Failed face checks for one account inside the window -- the per-account
 * lockout (shared/face-auth.ts FACE_FAILURE_LOCKOUT_*). Only real failures
 * count (`outcomes`: a non-matching face, and a missing blink only while that
 * blocks). Errors (expired challenge, stale model) are the system's fault,
 * not a guess.
 *
 * `since` is the current enrolment's last write: failures against a face
 * that has since been replaced (an admin reset, then a fresh enrolment) do
 * not keep the new one locked -- otherwise "reset their enrolment" would not
 * actually get anyone back in for 15 minutes.
 */
export async function countRecentFailedFaceAttempts(userId: number, windowMs: number, options: { since?: Date; outcomes?: ("no_match" | "liveness_failed")[] } = {}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const windowStart = Date.now() - windowMs;
  const from = new Date(Math.max(windowStart, options.since?.getTime() ?? windowStart));
  const [row] = await db
    .select({ n: count() })
    .from(faceAttempts)
    .where(and(
      eq(faceAttempts.userId, userId),
      inArray(faceAttempts.outcome, options.outcomes ?? ["no_match", "liveness_failed"]),
      gte(faceAttempts.createdAt, from),
    ));
  return Number(row?.n ?? 0);
}

/** Retention for face_challenges (2026-09-22): a challenge lives 3 minutes, so
 *  nothing older than a day is of any use -- but nothing deleted them, and the
 *  table grew by one row per attempt forever. Run by the daily retention job
 *  (server/automation.ts). */
export async function purgeExpiredFaceChallenges(olderThanHours = 24): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const result = await db.delete(faceChallenges).where(lt(faceChallenges.expiresAt, cutoff));
  return Number(result[0].affectedRows ?? 0);
}

export async function recordFaceAttempt(input: {
  userId: number | null;
  outcome: "enrolled" | "verified" | "no_match" | "liveness_failed" | "error" | "idle_locked";
  distance?: number | null;
  detail?: string | null;
  ip?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  // Never let audit-logging failure break the flow it is observing -- a full
  // disk or a locked table should not lock staff out of /admin.
  try {
    await db.insert(faceAttempts).values({
      userId: input.userId,
      outcome: input.outcome,
      distance: input.distance ?? null,
      detail: input.detail ?? null,
      ip: input.ip ?? null,
    });
  } catch {
    // Intentionally swallowed; see comment above.
  }
}

export async function touchFaceVerified(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ faceVerifiedAt: new Date() }).where(eq(users.id, userId));
}

/** Powers the Security Center's face-gate tab. Joined to users so the table
 *  can show who each attempt belonged to, mirroring the login-history tab. */
export async function getFaceAttempts(input: { limit?: number; userId?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const rows = await db
    .select({
      id: faceAttempts.id,
      userId: faceAttempts.userId,
      outcome: faceAttempts.outcome,
      distance: faceAttempts.distance,
      detail: faceAttempts.detail,
      ip: faceAttempts.ip,
      createdAt: faceAttempts.createdAt,
      userName: users.name,
      userPhone: users.phone,
      userRole: users.role,
    })
    .from(faceAttempts)
    .leftJoin(users, eq(faceAttempts.userId, users.id))
    .where(input.userId ? eq(faceAttempts.userId, input.userId) : undefined)
    // 2026-09-23: `id` тэнцвэр (секундын нарийвчлалтай timestamp).
    .orderBy(desc(faceAttempts.createdAt), desc(faceAttempts.id))
    .limit(limit);
  return rows;
}
