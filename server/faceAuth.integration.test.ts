import { hashPassword } from "./_core/password";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_REAUTH_COOKIE_NAME, FACE_REQUIRED_ERR_MSG, REAUTH_REQUIRED_ERR_MSG } from "../shared/const";
import { issueFaceProof } from "./faceAuth";
import { issueReauthProof } from "./_core/faceProof";
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
  purgeExpiredFaceChallenges,
  recordFaceAttempt,
  upsertFaceEnrollment,
} from "./db";
import { adminAuditLogs, faceAttempts, faceChallenges, faceEnrollments, loginAttempts, users } from "../drizzle/schema";
import { FACE_DESCRIPTOR_LENGTH, FACE_FAILURE_LOCKOUT_MAX, FACE_MODEL_VERSION } from "../shared/face-auth";

/**
 * Admin face gate (2026-09-08) — real-DB round trips for the parts that
 * cannot be proven with pure unit tests: single-use challenge consumption
 * under concurrency, the enrollment upsert, and the role boundary.
 *
 * 2026-09-22: plus the password step-up that must come before the face, the
 * per-account lockout, encryption of the stored template, and the removal of
 * the distance oracle.
 *
 * Same RUN_AUTH_INTEGRATION_TESTS gate as the rest of the auth suite. Every
 * row this file creates is a throwaway with a marker phone/name and is
 * deleted in afterAll, following the standing rule in docs/PROJECT-GUIDE.md that tests
 * must never touch real production rows.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const MARKER = `face-gate-test-${Date.now()}`;
const PASSWORD = "test-password-12345";
/** Every request in this file comes from this browser tab. Proofs are bound
 *  to the tab that earned them, and minting refuses a request without one. */
const TAB = "tab-face-test-0001";
const createdUserIds: number[] = [];
const phones = new Map<number, string>();

function descriptorOf(offset: number): number[] {
  return Array.from({ length: FACE_DESCRIPTOR_LENGTH }, (_, i) => Math.sin((i + 1) * 1.7) * 0.5 + offset);
}

async function makeUser(role: "user" | "staff" | "admin"): Promise<number> {
  // Random 8-digit phone in a range no real Mongolian mobile uses, so a
  // throwaway can never collide with (or be mistaken for) a real account.
  const phone = `7${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  // createUserWithPassword takes a HASH. This used to pass `password`, which
  // the type does not have, so the row was written with no usable hash --
  // invisible while test files were excluded from type-checking.
  const user = await createUserWithPassword({ phone, passwordHash: await hashPassword(PASSWORD), name: `${MARKER} ${role}` });
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ role }).where(eq(users.id, user.id));
  createdUserIds.push(user.id);
  phones.set(user.id, phone);
  return user.id;
}

/** A tRPC caller for one account in TAB. `jar` (optional) collects the
 *  cookies the server sets, exactly as a browser would. */
function callerFor(userId: number, role: string, sessionVersion = 0, cookie?: string, jar?: Map<string, string>) {
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
    req: { protocol: "https", headers: { "x-admin-tab": TAB, ...(cookie ? { cookie } : {}) }, cookies: {}, ip, socket: { remoteAddress: ip } } as unknown as TrpcContext["req"],
    res: { cookie: (name: string, value: string) => { jar?.set(name, value); }, clearCookie: (name: string) => { jar?.delete(name); } } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

/** The cookies a browser in TAB would hold after the password step-up and,
 *  optionally, a passed face check -- minted by the real server functions. */
async function proofCookie(userId: number, options: { sessionVersion?: number; face?: boolean } = {}): Promise<string> {
  const jar = new Map<string, string>();
  const res = { cookie: (name: string, value: string) => { jar.set(name, value); }, clearCookie: () => undefined } as unknown as TrpcContext["res"];
  const req = () => ({ protocol: "https", headers: { "x-admin-tab": TAB, cookie: Array.from(jar, ([n, v]) => `${n}=${v}`).join("; ") } }) as unknown as TrpcContext["req"];
  const sessionVersion = options.sessionVersion ?? 0;
  // Face first: a passed face check uses up the password step (one-shot), so
  // a caller that needs BOTH (e.g. replacing a working face) gets the step
  // entered after it, the way a browser would by confirming the password again.
  if (options.face) await issueFaceProof({ req: req(), res, userId, sessionVersion });
  await issueReauthProof({ req: req(), res, userId, sessionVersion });
  return Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
}

describeWithDatabase("admin face gate (real DB)", () => {
  let staffUserId = 0;
  let customerUserId = 0;

  // The suite setup turns the gate off for every other file (their callers
  // carry no proof cookie); this file is about the gate, so it turns it on.
  beforeAll(() => { process.env.ADMIN_FACE_GATE_ENABLED = "1"; });
  afterAll(() => { process.env.ADMIN_FACE_GATE_ENABLED = "0"; });

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
      // test rows behind in the shared database. Audit rows (the lockout
      // writes one) RESTRICT the user delete; login attempts would be left
      // orphaned with the throwaway phone.
      await db.delete(faceAttempts).where(eq(faceAttempts.userId, id));
      await db.delete(faceChallenges).where(eq(faceChallenges.userId, id));
      await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, id));
      await db.delete(loginAttempts).where(eq(loginAttempts.userId, id));
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

  it("stores the template ENCRYPTED at rest and reads it back transparently (2026-09-22)", async () => {
    await upsertFaceEnrollment({
      userId: staffUserId,
      descriptor: descriptorOf(0),
      sampleCount: 5,
      poses: Array.from({ length: 12 }, (_, i) => ({ pose: `s${i}`, descriptor: descriptorOf(i / 1000) })),
      modelVersion: FACE_MODEL_VERSION,
    });
    const db = await getDb();
    const [raw] = await db!.select().from(faceEnrollments).where(eq(faceEnrollments.userId, staffUserId));
    // A leaked backup must not be a working second factor.
    expect(raw.descriptorJson.startsWith("enc1:")).toBe(true);
    expect(raw.posesJson!.startsWith("enc1:")).toBe(true);
    expect(raw.descriptorJson).not.toContain(String(descriptorOf(0)[0]).slice(0, 8));
    // Twelve poses must still fit a TEXT column (why the blob is base64).
    expect(raw.posesJson!.length).toBeLessThan(65_535);
    const read = await getFaceEnrollment(staffUserId);
    expect(read!.templateReadable).toBe(true);
    expect(JSON.parse(read!.descriptorJson)).toEqual(descriptorOf(0));
    expect((JSON.parse(read!.posesJson!) as unknown[]).length).toBe(12);
  });

  it("still verifies a legacy PLAINTEXT template, and re-encrypts it on that success", async () => {
    const db = await getDb();
    await deleteFaceEnrollment(staffUserId);
    await db!.insert(faceEnrollments).values({ userId: staffUserId, descriptorJson: JSON.stringify(descriptorOf(0)), sampleCount: 5, modelVersion: FACE_MODEL_VERSION, consentedAt: new Date() });
    const caller = callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId));
    const { challengeId } = await caller.faceAuth.startVerification();
    const result = await caller.faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0.005), livenessPassed: true });
    expect(result.ok).toBe(true);
    const [raw] = await db!.select().from(faceEnrollments).where(eq(faceEnrollments.userId, staffUserId));
    expect(raw.descriptorJson.startsWith("enc1:")).toBe(true);
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

  it("purges challenges that expired more than a day ago, and only those (retention, 2026-09-22)", async () => {
    const old = await createFaceChallenge({ userId: staffUserId, action: "blink", expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
    const fresh = await createFaceChallenge({ userId: staffUserId, action: "blink", expiresAt: new Date(Date.now() + 60_000) });
    await purgeExpiredFaceChallenges(24);
    const db = await getDb();
    const left = (await db!.select({ id: faceChallenges.id }).from(faceChallenges).where(eq(faceChallenges.userId, staffUserId))).map(r => r.id);
    expect(left).not.toContain(old);
    expect(left).toContain(fresh);
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

  it("treats a reset enrollment as unverified even if a proof cookie survives", async () => {
    // A real hole found while wiping data for a clean test: the proof cookie
    // and the enrollment were checked independently, so clearing someone's
    // enrollment left their existing proof valid for its full 8-hour window.
    // An admin revoking access would not actually revoke anything until that
    // cookie expired. status() now requires BOTH.
    await deleteFaceEnrollment(staffUserId);
    const status = await callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId, { face: true })).faceAuth.status();
    expect(status.gateEnabled).toBe(true);
    expect(status.enrolled).toBe(false);
    expect(status.verified).toBe(false);
  });

  it("the API itself refuses an admin-panel call without a live proof, and accepts one with it", async () => {
    // 2026-09-12 incident: the gate used to be a screen. The panel asked for
    // the face; the procedures it called did not, so an expired (or absent)
    // proof still let every admin call through.
    const adminId = await makeUser("admin");
    await expect(callerFor(adminId, "admin").admin.integrations()).rejects.toMatchObject({ code: "FORBIDDEN", message: FACE_REQUIRED_ERR_MSG });
    // The password step alone opens nothing -- it only allows the face check.
    await expect(callerFor(adminId, "admin", 0, await proofCookie(adminId)).admin.integrations()).rejects.toMatchObject({ message: FACE_REQUIRED_ERR_MSG });

    const cookie = await proofCookie(adminId, { face: true });
    await expect(callerFor(adminId, "admin", 0, cookie).admin.integrations()).resolves.toBeDefined();
    // A proof for a superseded session is no proof.
    await expect(callerFor(adminId, "admin", 1, cookie).admin.integrations()).rejects.toMatchObject({ message: FACE_REQUIRED_ERR_MSG });
  });

  it("reports the gate as satisfied for a plain customer, so no shopper is ever prompted", async () => {
    const status = await callerFor(customerUserId, "user").faceAuth.status();
    expect(status.verified).toBe(true);
    expect(status.enrolled).toBe(true);
    expect(status.passwordConfirmed).toBe(true);
  });

  // --- password step-up (2026-09-22) ---------------------------------------

  it("reports the password step as missing until it is done in this tab", async () => {
    expect((await callerFor(staffUserId, "staff").faceAuth.status()).passwordConfirmed).toBe(false);
    expect((await callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId)).faceAuth.status()).passwordConfirmed).toBe(true);
  });

  it("refuses to start a face check, enrol a face or open a QR handoff on the session cookie alone", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const bare = callerFor(staffUserId, "staff");
    await expect(bare.faceAuth.startVerification()).rejects.toMatchObject({ code: "FORBIDDEN", message: REAUTH_REQUIRED_ERR_MSG });
    await expect(bare.faceAuth.enroll({ descriptor: descriptorOf(3), sampleCount: 5, consented: true })).rejects.toMatchObject({ code: "FORBIDDEN", message: REAUTH_REQUIRED_ERR_MSG });
    await expect(bare.faceAuth.startHandoff()).rejects.toMatchObject({ code: "FORBIDDEN", message: REAUTH_REQUIRED_ERR_MSG });
    // The face on file is untouched.
    expect(JSON.parse((await getFaceEnrollment(staffUserId))!.descriptorJson)).toEqual(descriptorOf(0));
  });

  it("confirmPassword: a wrong password is refused, the right one sets the step-up cookie", async () => {
    await expect(callerFor(staffUserId, "staff").faceAuth.confirmPassword({ password: "not-the-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const jar = new Map<string, string>();
    await expect(callerFor(staffUserId, "staff", 0, undefined, jar).faceAuth.confirmPassword({ password: PASSWORD })).resolves.toEqual({ ok: true });
    expect(jar.has(ADMIN_REAUTH_COOKIE_NAME)).toBe(true);
    const cookie = Array.from(jar, ([n, v]) => `${n}=${v}`).join("; ");
    expect((await callerFor(staffUserId, "staff", 0, cookie).faceAuth.status()).passwordConfirmed).toBe(true);
    // A customer has no /admin to confirm a password for.
    await expect(callerFor(customerUserId, "user").faceAuth.confirmPassword({ password: PASSWORD })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("confirmPassword shares the login's per-account lockout", async () => {
    const lockedId = await makeUser("staff");
    const db = await getDb();
    await db!.insert(loginAttempts).values(Array.from({ length: 10 }, () => ({ email: phones.get(lockedId)!, userId: lockedId, success: false, reason: "invalid_credentials", ipAddress: "203.0.113.9" })));
    // Even the RIGHT password is refused while the account is locked.
    await expect(callerFor(lockedId, "staff").faceAuth.confirmPassword({ password: PASSWORD })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("a sign-in on /login does NOT count as the /admin password step (Tom: the password screen must appear at /admin)", async () => {
    const adminId = await makeUser("admin");
    // A per-run IP: the login tier counts in the database, and a fixed one
    // would block a re-run inside 15 minutes.
    const ip = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
    const loginCaller = (jar: Map<string, string>) => appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: { "x-admin-tab": TAB }, ip, socket: { remoteAddress: ip } } as unknown as TrpcContext["req"],
      res: { cookie: (name: string, value: string) => { jar.set(name, value); }, clearCookie: () => undefined } as unknown as TrpcContext["res"],
    });
    const adminJar = new Map<string, string>();
    await loginCaller(adminJar).auth.login({ phone: phones.get(adminId)!, password: PASSWORD });
    expect(adminJar.has(ADMIN_REAUTH_COOKIE_NAME)).toBe(false);
    expect((await callerFor(adminId, "admin").faceAuth.status()).passwordConfirmed).toBe(false);
  });

  it("replacing a face that still works needs the CURRENT face too (Tom: password + current face)", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const passwordOnly = callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId));
    await expect(passwordOnly.faceAuth.enroll({ descriptor: descriptorOf(3), sampleCount: 5, consented: true })).rejects.toMatchObject({ code: "FORBIDDEN", message: FACE_REQUIRED_ERR_MSG });
    expect(JSON.parse((await getFaceEnrollment(staffUserId))!.descriptorJson)).toEqual(descriptorOf(0));

    const withFace = callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId, { face: true }));
    await expect(withFace.faceAuth.enroll({ descriptor: descriptorOf(0.02), sampleCount: 5, consented: true })).resolves.toEqual({ ok: true });
    expect(JSON.parse((await getFaceEnrollment(staffUserId))!.descriptorJson)).toEqual(descriptorOf(0.02));
  });

  it("a FIRST enrolment (or a stale one) needs only the password step", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: "some-older-model" });
    const caller = callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId));
    await expect(caller.faceAuth.enroll({ descriptor: descriptorOf(0), sampleCount: 5, consented: true })).resolves.toEqual({ ok: true });
    await deleteFaceEnrollment(staffUserId);
    await expect(caller.faceAuth.enroll({ descriptor: descriptorOf(0), sampleCount: 5, consented: true })).resolves.toEqual({ ok: true });
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
      callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId)).faceAuth.enroll({
        descriptor: descriptorOf(0),
        sampleCount: 5,
        consented: false as unknown as true,
      }),
    ).rejects.toBeTruthy();
  });

  it("refuses a malformed descriptor", async () => {
    await deleteFaceEnrollment(staffUserId);
    await expect(
      callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId)).faceAuth.enroll({
        descriptor: new Array(FACE_DESCRIPTOR_LENGTH).fill(NaN),
        sampleCount: 5,
        consented: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // --- verification ----------------------------------------------------------

  it("rejects a verification whose descriptor does not match the enrolled face, without saying how close it was", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const caller = callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId));
    const { challengeId, action } = await caller.faceAuth.startVerification();
    // Every login challenge is a blink now (FACE_LOGIN_CHALLENGE).
    expect(action).toBe("blink");

    const result = await caller.faceAuth.completeVerification({
      challengeId,
      // Far enough away to be a different person under any sane threshold.
      descriptor: descriptorOf(5),
      livenessPassed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_match");
    // No distance leaves the server: it would be a hill-climbing oracle.
    expect(result).not.toHaveProperty("distance");
    // ...but it is recorded for the Security Center.
    const db = await getDb();
    const rows = await db!.select().from(faceAttempts).where(eq(faceAttempts.userId, staffUserId));
    expect(rows.filter(r => r.outcome === "no_match").every(r => r.distance !== null)).toBe(true);
  });

  it("refuses a face with no blink by default (liveness is enforced since 2026-09-22), and records it", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const caller = callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId));
    const { challengeId } = await caller.faceAuth.startVerification();

    const result = await caller.faceAuth.completeVerification({
      challengeId,
      descriptor: descriptorOf(0.005),
      livenessPassed: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("liveness_failed");
    const db = await getDb();
    const rows = await db!.select().from(faceAttempts).where(eq(faceAttempts.userId, staffUserId));
    expect(rows.some(r => r.outcome === "liveness_failed")).toBe(true);
  });

  it("ADMIN_FACE_LIVENESS_ENFORCED=0 switches blocking off again (still recorded)", async () => {
    const previous = process.env.ADMIN_FACE_LIVENESS_ENFORCED;
    process.env.ADMIN_FACE_LIVENESS_ENFORCED = "0";
    try {
      await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
      const caller = callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId));
      const { challengeId } = await caller.faceAuth.startVerification();
      const result = await caller.faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0.005), livenessPassed: false });
      expect(result.ok).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.ADMIN_FACE_LIVENESS_ENFORCED;
      else process.env.ADMIN_FACE_LIVENESS_ENFORCED = previous;
    }
  });

  it("a passed face check uses up the password step: the next face check (idle lock) needs the password again", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const jar = new Map<string, string>();
    for (const part of (await proofCookie(staffUserId)).split("; ")) { const i = part.indexOf("="); jar.set(part.slice(0, i), part.slice(i + 1)); }
    const browser = () => callerFor(staffUserId, "staff", 0, Array.from(jar, ([n, v]) => `${n}=${v}`).join("; "), jar);
    const { challengeId } = await browser().faceAuth.startVerification();
    expect((await browser().faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0.005), livenessPassed: true })).ok).toBe(true);
    const status = await browser().faceAuth.status();
    expect(status.verified).toBe(true);
    expect(status.passwordConfirmed).toBe(false);
    // A second face check (what the idle lock leads to) is refused without it.
    await expect(browser().faceAuth.startVerification()).rejects.toMatchObject({ message: REAUTH_REQUIRED_ERR_MSG });
  });

  it("accepts a matching face that passed liveness, and records the attempt", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const caller = callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId));
    const { challengeId } = await caller.faceAuth.startVerification();

    const result = await caller.faceAuth.completeVerification({
      challengeId,
      // Same face, slight frame-to-frame noise.
      descriptor: descriptorOf(0.005),
      livenessPassed: true,
    });
    expect(result).toEqual({ ok: true });

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
    const caller = callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId));
    const { challengeId } = await caller.faceAuth.startVerification();

    const first = await caller.faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0.005), livenessPassed: true });
    expect(first.ok).toBe(true);

    const replay = await caller.faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0.005), livenessPassed: true });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe("bad_challenge");
  });

  it("locks the ACCOUNT after repeated failures, whatever IP the attempts come from", async () => {
    const lockedId = await makeUser("staff");
    await upsertFaceEnrollment({ userId: lockedId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    for (let i = 0; i < FACE_FAILURE_LOCKOUT_MAX; i += 1) {
      await recordFaceAttempt({ userId: lockedId, outcome: "no_match", distance: 900, detail: "test", ip: `198.51.100.${i + 1}` });
    }
    const caller = callerFor(lockedId, "staff", 0, await proofCookie(lockedId));
    await expect(caller.faceAuth.startVerification()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // A challenge obtained before the lockout cannot be completed either.
    const challengeId = await createFaceChallenge({ userId: lockedId, action: "blink", expiresAt: new Date(Date.now() + 60_000) });
    await expect(caller.faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0), livenessPassed: true })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("an admin's reset really gets a locked-out person back in: failures against the OLD face do not lock the new one", async () => {
    const personId = await makeUser("staff");
    await upsertFaceEnrollment({ userId: personId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    const db = await getDb();
    // The old face was enrolled five minutes ago; five failures against it
    // two minutes ago (both before the re-enrolment below).
    await db!.update(faceEnrollments).set({ updatedAt: new Date(Date.now() - 5 * 60 * 1000) }).where(eq(faceEnrollments.userId, personId));
    const before = new Date(Date.now() - 2 * 60 * 1000);
    await db!.insert(faceAttempts).values(Array.from({ length: FACE_FAILURE_LOCKOUT_MAX }, () => ({ userId: personId, outcome: "no_match" as const, distance: 900, detail: "test", ip: "198.51.100.1", createdAt: before })));
    const caller = callerFor(personId, "staff", 0, await proofCookie(personId));
    await expect(caller.faceAuth.startVerification()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // Admin: "Царайн бүртгэлийг цуцлах", then the person enrols afresh.
    await deleteFaceEnrollment(personId);
    await caller.faceAuth.enroll({ descriptor: descriptorOf(0.001), sampleCount: 5, consented: true });
    await expect(caller.faceAuth.startVerification()).resolves.toMatchObject({ action: "blink" });
  });

  it("with ADMIN_FACE_LIVENESS_ENFORCED=0 a missing blink PASSED, so it does not count towards the lockout", async () => {
    const personId = await makeUser("staff");
    await upsertFaceEnrollment({ userId: personId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    for (let i = 0; i < FACE_FAILURE_LOCKOUT_MAX; i += 1) {
      await recordFaceAttempt({ userId: personId, outcome: "liveness_failed", detail: "test", ip: "198.51.100.2" });
    }
    const caller = callerFor(personId, "staff", 0, await proofCookie(personId));
    // Enforced (the default): those five were real refusals.
    await expect(caller.faceAuth.startVerification()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const previous = process.env.ADMIN_FACE_LIVENESS_ENFORCED;
    process.env.ADMIN_FACE_LIVENESS_ENFORCED = "0";
    try {
      await expect(caller.faceAuth.startVerification()).resolves.toMatchObject({ action: "blink" });
    } finally {
      if (previous === undefined) delete process.env.ADMIN_FACE_LIVENESS_ENFORCED;
      else process.env.ADMIN_FACE_LIVENESS_ENFORCED = previous;
    }
  });

  it("the phone side of a QR handoff cannot mint ITSELF a proof via completeVerification (no password there)", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: FACE_MODEL_VERSION });
    // A challenge as startHandoffVerification would hand the phone.
    const challengeId = await createFaceChallenge({ userId: staffUserId, action: "blink", expiresAt: new Date(Date.now() + 60_000) });
    const jar = new Map<string, string>();
    const phone = callerFor(staffUserId, "staff", 0, undefined, jar);
    await expect(phone.faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0.005), livenessPassed: true })).rejects.toMatchObject({ code: "FORBIDDEN", message: REAUTH_REQUIRED_ERR_MSG });
    expect(jar.size).toBe(0);
  });

  it("tells a user with a superseded model to re-enroll rather than failing as a mismatch", async () => {
    await upsertFaceEnrollment({ userId: staffUserId, descriptor: descriptorOf(0), sampleCount: 5, modelVersion: "some-older-model" });
    const caller = callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId));

    const status = await caller.faceAuth.status();
    expect(status.modelStale).toBe(true);

    const challengeId = await createFaceChallenge({ userId: staffUserId, action: "blink", expiresAt: new Date(Date.now() + 60_000) });
    const result = await caller.faceAuth.completeVerification({ challengeId, descriptor: descriptorOf(0), livenessPassed: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("stale_model");
  });

  it("asks for a fresh enrolment when the stored template can no longer be decrypted", async () => {
    const db = await getDb();
    await deleteFaceEnrollment(staffUserId);
    await db!.insert(faceEnrollments).values({ userId: staffUserId, descriptorJson: "enc1:AAAA:BBBB:CCCC", sampleCount: 5, modelVersion: FACE_MODEL_VERSION, consentedAt: new Date() });
    const status = await callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId)).faceAuth.status();
    expect(status.enrolled).toBe(true);
    expect(status.modelStale).toBe(true);
  });

  it("refuses to start a verification for someone who has not enrolled", async () => {
    await deleteFaceEnrollment(staffUserId);
    await expect(callerFor(staffUserId, "staff", 0, await proofCookie(staffUserId)).faceAuth.startVerification()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
