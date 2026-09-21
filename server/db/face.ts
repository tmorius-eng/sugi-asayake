// server/db/face.ts — Admin царайны бүртгэл/challenge/оролдлого.
// 2026-09-21: server/db.ts (7 066 мөр) домэйнээр хуваагдав; server/db.ts нь одоо barrel
// (export *) тул import зам өөрчлөгдөөгүй. Функц зөөхдөө энэ файлын import-ыг мөн шинэчил.

import { and, desc, eq, isNull } from "drizzle-orm";
import { faceAttempts, faceChallenges, faceEnrollments, users } from "../../drizzle/schema";
import { getDb } from "./connection";

// ---------------------------------------------------------------------------
// Admin face gate (2026-09-08). See server/faceAuth.ts for the flow and
// drizzle/schema.ts for what is and is not stored (a 128-number descriptor,
// never a photograph).
// ---------------------------------------------------------------------------

export async function getFaceEnrollment(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(faceEnrollments).where(eq(faceEnrollments.userId, userId)).limit(1);
  return rows[0];
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
  const descriptorJson = JSON.stringify(input.descriptor);
  const posesJson = input.poses?.length ? JSON.stringify(input.poses) : null;
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
    .orderBy(desc(faceAttempts.createdAt))
    .limit(limit);
  return rows;
}
