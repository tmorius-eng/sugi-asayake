import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  consumeFaceChallenge,
  createFaceChallenge,
  createUserWithPassword,
  deleteFaceEnrollment,
  getDb,
  getFaceEnrollment,
  getUserById,
  upsertFaceEnrollment,
} from "./db";
import { faceAttempts, faceChallenges, users } from "../drizzle/schema";
import { FACE_DESCRIPTOR_LENGTH, FACE_MODEL_VERSION } from "../shared/face-auth";

/**
 * Admin face gate (2026-09-08) — real-DB round trips for the parts that
 * cannot be proven with pure unit tests: single-use challenge consumption
 * under concurrency, the enrollment upsert, and the role boundary.
 *
 * Same RUN_AUTH_INTEGRATION_TESTS gate as the rest of the auth suite. Every
 * row this file creates is a throwaway with a marker phone/name and is
 * deleted in afterAll, following the standing rule in CLAUDE.md that tests
 * must never touch real production rows.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const MARKER = `face-gate-test-${Date.now()}`;
const createdUserIds: number[] = [];

function descriptorOf(offset: number): number[] {
  return Array.from({ length: FACE_DESCRIPTOR_LENGTH }, (_, i) => Math.sin((i + 1) * 1.7) * 0.5 + offset);
}

async function makeUser(role: "user" | "staff" | "admin"): Promise<number> {
  // Random 8-digit phone in a range no real Mongolian mobile uses, so a
  // throwaway can never collide with (or be mistaken for) a real account.
  const phone = `7${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  const user = await createUserWithPassword({ phone, password: "test-password-12345", name: `${MARKER} ${role}` });
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ role }).where(eq(users.id, user.id));
  createdUserIds.push(user.id);
  return user.id;
}

function callerFor(userId: number, role: string, sessionVersion = 0) {
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  const ctx: TrpcContext = {
    user: {
      id: userId,
      name: `${MARKER} user`,
      email: null,
      phone: null,
      role,
      sessionVersion,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as unknown as TrpcContext["user"],
    req: { protocol: "https", headers: {}, cookies: {}, ip, socket: { remoteAddress: ip } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("admin face gate (real DB)", () => {
  let staffUserId = 0;
  let customerUserId = 0;

  beforeAll(async () => {
    staffUserId = await makeUser("staff");
    customerUserId = await makeUser("user");
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of createdUserIds) {
      // face_* rows cascade from users, but delete explicitly anyway so a
      // future schema change that drops the cascade can't quietly leave
      // test rows behind in the shared Aiven database.
      await db.delete(faceAttempts).where(eq(faceAttempts.userId, id));
      await db.delete(faceChallenges).where(eq(faceChallenges.userId, id));
      await deleteFaceEnrollment(id);
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("stores an enrollment and replaces it on re-enroll rather than accumulating rows", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const first = await getFaceEnrollment(staffUserId);
    expect(first).toBeTruthy();
    expect(first!.sampleCount).toBe(5);

    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0.01), sampleCount: 3, modelVersion: FACE_MODEL_VERSION });
    const second = await getFaceEnrollment(staffUserId);
    expect(second!.id).toBe(first!.id);
    expect(second!.sampleCount).toBe(3);
    expect(second!.descriptorJson).not.toBe(first!.descriptorJson);
  });

  it("never stores an image — only the numeric descriptor", async () => {
    // Guards the central privacy claim made to staff on the consent screen.
    // If a future change adds an image column, this test should fail and
    // force that decision to be made deliberately.
    const enrollment = await getFaceEnrollment(staffUserId);
    const parsed = JSON.parse(enrollment!.descriptorJson) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as number[]).length).toBe(FACE_DESCRIPTOR_LENGTH);
    const columns = Object.keys(enrollment!);
    expect(columns.some(c => /image|photo|frame|jpeg|png|blob/i.test(c))).toBe(false);
  });

  it("consumes a challenge exactly once", async () => {
    const id = await createFaceChallenge({ userId: staffUserId, action: "blink", expiresAt: new Date(Date.now() + 60_000) });
    expect(await consumeFaceChallenge({ id, userId: staffUserId })).toBeTruthy();
    expect(await consumeFaceChallenge({ id, userId: staffUserId })).toBeUndefined();
  });

  it("consumes a challenge exactly once even when two requests race", async () => {
    // The BUG-003 (2026-09-06 audit) failure mode: a read-then-write guard
    // lets both callers observe "not yet consumed" before either writes.
    const id = await createFaceChallenge({ userId: staffUserId, action: "turn_left", expiresAt: new Date(Date.now() + 60_000) });
    const results = await Promise.all([
      consumeFaceChallenge({ id, userId: staffUserId }),
      consumeFaceChallenge({ id, userId: staffUserId }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("refuses a challenge belonging to another user", async () => {
    const id = await createFaceChallenge({ userId: staffUserId, action: "blink", expiresAt: new Date(Date.now() + 60_000) });
    expect(await consumeFaceChallenge({ id, userId: customerUserId })).toBeUndefined();
    // ...and is still usable by its real owner, i.e. the failed attempt did
    // not burn it.
    expect(await consumeFaceChallenge({ id, userId: staffUserId })).toBeTruthy();
  });

  it("refuses an expired challenge", async () => {
    const id = await createFaceChallenge({ userId: staffUserId, action: "open_mouth", expiresAt: new Date(Date.now() - 1_000) });
    expect(await consumeFaceChallenge({ id, userId: staffUserId })).toBeUndefined();
  });

  it("clears the enrollment on admin reset (the per-user break-glass)", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    expect(await getFaceEnrollment(staffUserId)).toBeTruthy();

    await deleteFaceEnrollment(staffUserId);
    expect(await getFaceEnrollment(staffUserId)).toBeUndefined();
    // The informational timestamp is cleared too, so the admin UI doesn't
    // keep showing a "last verified" for an enrollment that no longer exists.
    const user = await getUserById(staffUserId);
    expect(user?.faceVerifiedAt ?? null).toBeNull();
  });

  it("reports the gate as satisfied for a plain customer, so no shopper is ever prompted", async () => {
    const status = await callerFor(customerUserId, "user").faceAuth.status();
    expect(status.verified).toBe(true);
    expect(status.enrolled).toBe(true);
  });

  it("refuses enrollment from a non-admin-panel role", async () => {
    await expect(
      callerFor(customerUserId, "user").faceAuth.enroll({
        descriptor: descriptorOf(0),
        sampleCount: 5,
        consented: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses enrollment without explicit consent", async () => {
    // The consent gate is enforced by the schema itself (a literal `true`),
    // not merely by the UI that normally precedes it -- a client that skipped
    // the consent screen must still be unable to enroll.
    await expect(
      callerFor(staffUserId, "staff").faceAuth.enroll({
        descriptor: descriptorOf(0),
        sampleCount: 5,
        consented: false as unknown as true,
      }),
    ).rejects.toBeTruthy();
  });

  it("refuses a malformed descriptor", async () => {
    await expect(
      callerFor(staffUserId, "staff").faceAuth.enroll({
        descriptor: new Array(FACE_DESCRIPTOR_LENGTH).fill(NaN),
        sampleCount: 5,
        consented: true,
      }),
    ).rejects.toBeTruthy();
  });

  it("rejects a verification whose descriptor does not match the enrolled face", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const caller = callerFor(staffUserId, "staff");
    const { challengeId } = await caller.faceAuth.startVerification();

    const result = await caller.faceAuth.completeVerification({
      challengeId,
      // Far enough away to be a different person under any sane threshold.
      descriptor: descriptorOf(5),
      livenessPassed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_match");
  });

  it("records a failed liveness check but does not block on it by default", async () => {
    // Liveness is measured and logged on every attempt, but whether it BLOCKS
    // is opt-in via ADMIN_FACE_LIVENESS_ENFORCED -- see that flag's comment in
    // server/_core/env.ts. It was made non-blocking by default after it
    // rejected a legitimate user repeatedly on real hardware while the face
    // match underneath was landing at 0.278 against a 0.6 threshold.
    //
    // The face MATCH is unaffected by that flag and always blocks; that is the
    // actual identity control, and the test above covers it.
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const caller = callerFor(staffUserId, "staff");
    const { challengeId } = await caller.faceAuth.startVerification();

    const result = await caller.faceAuth.completeVerification({
      challengeId,
      descriptor: descriptorOf(0.005),
      livenessPassed: false,
    });

    // Default configuration: the matching face gets in, and the liveness
    // failure is still written to the audit trail.
    expect(result.ok).toBe(true);
    const db = await getDb();
    const rows = await db!.select().from(faceAttempts).where(eq(faceAttempts.userId, staffUserId));
    expect(rows.some(r => r.outcome === "liveness_failed")).toBe(true);
  });

  it("still refuses a face that does not match, regardless of liveness", async () => {
    // The security property that must never depend on a flag: a different
    // person cannot get in even if their client claims liveness passed.
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const caller = callerFor(staffUserId, "staff");
    const { challengeId } = await caller.faceAuth.startVerification();

    const result = await caller.faceAuth.completeVerification({
      challengeId,
      descriptor: descriptorOf(5),
      livenessPassed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_match");
  });

  it("accepts a matching face that passed liveness, and records the attempt", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const caller = callerFor(staffUserId, "staff");
    const { challengeId } = await caller.faceAuth.startVerification();

    const result = await caller.faceAuth.completeVerification({
      challengeId,
      // Same face, slight frame-to-frame noise.
      descriptor: descriptorOf(0.005),
      livenessPassed: true,
    });
    expect(result.ok).toBe(true);

    const db = await getDb();
    const rows = await db!.select().from(faceAttempts).where(eq(faceAttempts.userId, staffUserId));
    const verified = rows.filter(r => r.outcome === "verified");
    expect(verified.length).toBeGreaterThanOrEqual(1);
    // The distance is recorded so the threshold can be tuned from real data
    // rather than guessed at.
    expect(verified[verified.length - 1].distance).not.toBeNull();
  });

  it("rejects a replayed challenge id", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const caller = callerFor(staffUserId, "staff");
    const { challengeId } = await caller.faceAuth.startVerification();

    const first = await caller.faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0.005), livenessPassed: true });
    expect(first.ok).toBe(true);

    const replay = await caller.faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0.005), livenessPassed: true });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe("bad_challenge");
  });

  it("tells a user with a superseded model to re-enroll rather than failing as a mismatch", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: "some-older-model" });
    const caller = callerFor(staffUserId, "staff");

    const status = await caller.faceAuth.status();
    // status() only reports modelStale when the gate is actually enabled;
    // when it is off the whole flow is bypassed, which is correct.
    if (status.gateEnabled) expect(status.modelStale).toBe(true);

    const challengeId = await createFaceChallenge({ userId: staffUserId, action: "blink", expiresAt: new Date(Date.now() + 60_000) });
    const result = await caller.faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0), livenessPassed: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("stale_model");
  });

  it("refuses to start a verification for someone who has not enrolled", async () => {
    await deleteFaceEnrollment(staffUserId);
    await expect(callerFor(staffUserId, "staff").faceAuth.startVerification()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
