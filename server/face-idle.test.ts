import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { FACE_IDLE_TIMEOUT_MS, FACE_VERIFICATION_TTL_MS } from "../shared/face-auth";
import { ADMIN_FACE_COOKIE_NAME } from "../shared/const";

/**
 * The /admin idle lock (2026-09-12): 25 minutes without real interaction and
 * the face check expires, however long the shift has been running.
 *
 * These are the rules a reviewer should be able to check without trusting a
 * screenshot, so they are tested against the real cookie the server issues,
 * with time moved forward rather than waited out:
 *
 *   - a fresh proof is valid, and stops being valid 25 idle minutes later;
 *   - activity renews it, and can keep renewing it all shift;
 *   - renewing can NEVER push past the 8-hour absolute cap;
 *   - an expired proof cannot be renewed -- only the camera brings it back;
 *   - a proof belonging to another account, or to a superseded session, is
 *     refused (a password reset must invalidate it).
 *
 * No database: face proofs live entirely in a signed cookie.
 */
vi.mock("./db", () => ({
  recordFaceAttempt: vi.fn(async () => undefined),
  getFaceEnrollment: vi.fn(async () => null),
  getFaceChallenge: vi.fn(async () => null),
  consumeFaceChallenge: vi.fn(async () => undefined),
  createFaceChallenge: vi.fn(async () => ({ challengeId: 1, action: "blink" })),
  touchFaceVerified: vi.fn(async () => undefined),
  deleteFaceEnrollment: vi.fn(async () => undefined),
  upsertFaceEnrollment: vi.fn(async () => undefined),
}));

const { hasValidFaceProof, issueFaceProof, lockFaceSession, refreshFaceProof } = await import("./faceAuth");

const USER = 42;
const SESSION_VERSION = 3;

/** A response that remembers the cookie it was given, and a request built
 *  from that cookie -- the round trip a browser actually performs. */
function fakeResponse() {
  const jar = new Map<string, string>();
  const res = {
    cookie: (name: string, value: string) => { jar.set(name, value); },
    clearCookie: (name: string) => { jar.delete(name); },
  } as unknown as Response;
  return { res, jar };
}

function requestWith(jar: Map<string, string>) {
  const cookie = Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
  return { headers: { cookie }, protocol: "https", ip: "203.0.113.7" } as unknown as Request;
}

async function issueProof(jar: Map<string, string>, res: Response) {
  await issueFaceProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
}

describe("admin face gate idle timeout", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-09-12T09:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("keeps a fresh check valid, and expires it after 25 idle minutes", async () => {
    const { res, jar } = fakeResponse();
    await issueProof(jar, res);
    await expect(hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION)).resolves.toBe(true);

    vi.advanceTimersByTime(FACE_IDLE_TIMEOUT_MS - 60_000); // 24 minutes: still working
    await expect(hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION)).resolves.toBe(true);

    vi.advanceTimersByTime(120_000); // past 25
    await expect(hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION)).resolves.toBe(false);
  });

  it("renews on activity, so somebody working is never interrupted", async () => {
    const { res, jar } = fakeResponse();
    await issueProof(jar, res);
    // Four hours of working: a beat every 20 minutes.
    for (let minute = 0; minute < 240; minute += 20) {
      vi.advanceTimersByTime(20 * 60_000);
      const renewed = await refreshFaceProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
      expect(renewed.ok).toBe(true);
    }
    await expect(hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION)).resolves.toBe(true);
  });

  it("never renews past the absolute cap, however busy the shift", async () => {
    const { res, jar } = fakeResponse();
    await issueProof(jar, res);
    const start = Date.now();
    // Beat every 10 minutes for 9 hours -- an hour past the 8-hour cap.
    let lastOk = 0;
    for (let elapsed = 10 * 60_000; elapsed <= 9 * 60 * 60_000; elapsed += 10 * 60_000) {
      vi.advanceTimersByTime(10 * 60_000);
      const renewed = await refreshFaceProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
      if (renewed.ok) {
        lastOk = elapsed;
        // The renewed idle deadline can reach the cap but never exceed it.
        expect(renewed.idleExpiresAt!).toBeLessThanOrEqual(start + FACE_VERIFICATION_TTL_MS);
      }
    }
    expect(lastOk).toBeLessThanOrEqual(FACE_VERIFICATION_TTL_MS);
    await expect(hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION)).resolves.toBe(false);
  });

  it("refuses to renew a proof that already went idle -- only the camera brings it back", async () => {
    const { res, jar } = fakeResponse();
    await issueProof(jar, res);
    vi.advanceTimersByTime(FACE_IDLE_TIMEOUT_MS + 1000);
    const renewed = await refreshFaceProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
    expect(renewed).toMatchObject({ ok: false, idleExpiresAt: null });
    await expect(hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION)).resolves.toBe(false);
  });

  it("locking clears the proof immediately", async () => {
    const { res, jar } = fakeResponse();
    await issueProof(jar, res);
    await lockFaceSession({ req: requestWith(jar), res, userId: USER, reason: "idle" });
    await expect(hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION)).resolves.toBe(false);
  });

  it("belongs to one account and one session: another user's, or a reset session's, is refused", async () => {
    const { res, jar } = fakeResponse();
    await issueProof(jar, res);
    await expect(hasValidFaceProof(requestWith(jar), USER + 1, SESSION_VERSION)).resolves.toBe(false);
    // A password reset / "sign out everywhere" bumps sessionVersion.
    await expect(hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION + 1)).resolves.toBe(false);
  });

  it("treats a missing or tampered cookie as 'verify again', never as an error", async () => {
    await expect(hasValidFaceProof(requestWith(new Map()), USER, SESSION_VERSION)).resolves.toBe(false);
    const tampered = new Map([[ADMIN_FACE_COOKIE_NAME, "not.a.jwt"]]);
    await expect(hasValidFaceProof(requestWith(tampered), USER, SESSION_VERSION)).resolves.toBe(false);
  });
});
