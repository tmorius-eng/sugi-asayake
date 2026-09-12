import type { SessionUser } from "./_core/context";

/**
 * A complete session user for tests (2026-09-12 audit).
 *
 * Every integration suite used to hand-write its own fake `user` object for
 * appRouter.createCaller. Each time a column was added to `users` (branchId,
 * faceVerifiedAt, lastSeenNotificationId, storeCreditMnt...) those literals
 * fell further behind the real row -- unnoticed, because tsconfig.json
 * excluded test files from type-checking. The day tests were type-checked
 * (tsconfig.tests.json), ninety of them failed on exactly this. One factory
 * with defaults for every field, and a test states only what it cares about.
 */
export function testSessionUser(overrides: Partial<SessionUser> & { id: number }): SessionUser {
  const now = new Date();
  return {
    name: "Test user",
    phone: null,
    avatarUrl: null,
    skinType: null,
    skinConcerns: null,
    interiorStyle: null,
    gender: null,
    primaryDistrict: null,
    skinRoutineComplexity: null,
    hairType: null,
    hairConcerns: null,
    fragrancePreference: null,
    wellnessInterests: null,
    hasYoungChildren: null,
    birthYear: null,
    occupation: null,
    emailOptIn: false,
    smsOptIn: false,
    email: null,
    role: "user",
    emailVerifiedAt: now,
    sessionVersion: 0,
    suspendedAt: null,
    suspendedReason: null,
    loyaltyManualAdjustmentMnt: 0,
    storeCreditMnt: 0,
    faceVerifiedAt: null,
    lastSeenNotificationId: null,
    branchId: null,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    ...overrides,
  };
}
