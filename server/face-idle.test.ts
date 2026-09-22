import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { FACE_IDLE_TIMEOUT_MS, FACE_REAUTH_TTL_MS, FACE_VERIFICATION_TTL_MS } from "../shared/face-auth";
import { ADMIN_FACE_COOKIE_NAME, ADMIN_REAUTH_COOKIE_NAME, COOKIE_NAME } from "../shared/const";

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
  countRecentFailedFaceAttempts: vi.fn(async () => 0),
  encryptFaceEnrollmentIfPlain: vi.fn(async () => undefined),
  logAdminAction: vi.fn(async () => undefined),
  // For the token-type tests below: every id resolves to a live, unsuspended
  // account on the current session version.
  getSessionUserById: vi.fn(async (id: number) => ({ id, sessionVersion: 3, suspendedAt: null, passwordHash: "x", role: "admin" })),
}));

const { hasValidFaceProof, issueFaceProof, lockFaceSession, refreshFaceProof } = await import("./faceAuth");
const { assertFaceProofForPanelRole, assertReauthProof, hasValidReauthProof, issueReauthProof } = await import("./_core/faceProof");
const { createContext, signSessionToken } = await import("./_core/context");
const { ENV } = await import("./_core/env");
const { SignJWT } = await import("jose");
const { FACE_REQUIRED_ERR_MSG, REAUTH_REQUIRED_ERR_MSG } = await import("../shared/const");

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

/** The tab every request below comes from unless a test says otherwise --
 *  minting refuses a request with no tab id (2026-09-22). */
const TAB = "tab-test-0001";

function requestWith(jar: Map<string, string>, tab: string | null = TAB) {
  const cookie = Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
  return { headers: { cookie, ...(tab ? { "x-admin-tab": tab } : {}) }, protocol: "https", ip: "203.0.113.7" } as unknown as Request;
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

  it("refuses a proof minted before the idle lock existed (flat 8-hour exp, no abs claim)", async () => {
    // The 2026-09-12 incident: a cookie from the previous deploy was honoured
    // until its own deadline, so a two-hour absence changed nothing.
    const key = new TextEncoder().encode(ENV.cookieSecret);
    const legacy = await new SignJWT({ sub: String(USER), sv: SESSION_VERSION })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(new Date(Date.now() + FACE_VERIFICATION_TTL_MS)).sign(key);
    const jar = new Map([[ADMIN_FACE_COOKIE_NAME, legacy]]);
    expect(await hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION)).toBe(false);
    // ...and it cannot be renewed into a proper one either.
    const { res } = fakeResponse();
    expect((await refreshFaceProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION })).ok).toBe(false);
  });

  describe("server-side enforcement on admin-panel procedures", () => {
    const previous = process.env.ADMIN_FACE_GATE_ENABLED;
    beforeEach(() => { process.env.ADMIN_FACE_GATE_ENABLED = "1"; });
    afterEach(() => { process.env.ADMIN_FACE_GATE_ENABLED = previous; });
    const panelUser = { id: USER, role: "admin", sessionVersion: SESSION_VERSION };

    it("refuses a panel role with no proof, with the message the client maps to the camera", async () => {
      await expect(assertFaceProofForPanelRole({ req: requestWith(new Map()), user: panelUser })).rejects.toMatchObject({ code: "FORBIDDEN", message: FACE_REQUIRED_ERR_MSG });
    });

    it("lets a live proof through, and refuses it again 25 idle minutes later", async () => {
      const { res, jar } = fakeResponse();
      await issueProof(jar, res);
      await expect(assertFaceProofForPanelRole({ req: requestWith(jar), user: panelUser })).resolves.toBeUndefined();
      vi.advanceTimersByTime(FACE_IDLE_TIMEOUT_MS + 1_000);
      await expect(assertFaceProofForPanelRole({ req: requestWith(jar), user: panelUser })).rejects.toMatchObject({ message: FACE_REQUIRED_ERR_MSG });
    });

    it("never asks a plain customer, and does nothing with the gate off", async () => {
      await expect(assertFaceProofForPanelRole({ req: requestWith(new Map()), user: { ...panelUser, role: "user" } })).resolves.toBeUndefined();
      process.env.ADMIN_FACE_GATE_ENABLED = "0";
      await expect(assertFaceProofForPanelRole({ req: requestWith(new Map()), user: panelUser })).resolves.toBeUndefined();
    });
  });
});

describe("face proof is bound to the browser tab that earned it (2026-09-14)", () => {
  it("rejects the same cookie from another tab or with no tab header, accepts it from the verified tab, and lets a second tab join", async () => {
    const { res, jar } = fakeResponse();
    await issueFaceProof({ req: requestWith(jar, "tab-aaaaaaaa"), res, userId: USER, sessionVersion: SESSION_VERSION });
    expect(await hasValidFaceProof(requestWith(jar, "tab-aaaaaaaa"), USER, SESSION_VERSION)).toBe(true);
    // A freshly opened tab has a new id -- exactly the "closed the tab and came back" case.
    expect(await hasValidFaceProof(requestWith(jar, "tab-bbbbbbbb"), USER, SESSION_VERSION)).toBe(false);
    // A replayed cookie with no tab header at all is not a proof either.
    expect(await hasValidFaceProof(requestWith(jar, null), USER, SESSION_VERSION)).toBe(false);
    // The second tab passes the camera: it joins, and the first keeps working.
    await issueFaceProof({ req: requestWith(jar, "tab-bbbbbbbb"), res, userId: USER, sessionVersion: SESSION_VERSION });
    expect(await hasValidFaceProof(requestWith(jar, "tab-bbbbbbbb"), USER, SESSION_VERSION)).toBe(true);
    expect(await hasValidFaceProof(requestWith(jar, "tab-aaaaaaaa"), USER, SESSION_VERSION)).toBe(true);
  });
});


describe("minting needs a real tab id (2026-09-22)", () => {
  it("refuses to mint a face proof or a password step-up for a header-less request", async () => {
    const { res, jar } = fakeResponse();
    await expect(issueFaceProof({ req: requestWith(jar, null), res, userId: USER, sessionVersion: SESSION_VERSION })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(issueReauthProof({ req: requestWith(jar, null), res, userId: USER, sessionVersion: SESSION_VERSION })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(jar.size).toBe(0);
  });
});

describe("password step-up before the face (2026-09-22, Tom: password -> face -> admin)", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-09-22T09:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("is valid in the tab it was entered in, for FACE_REAUTH_TTL_MS, and not in another tab", async () => {
    const { res, jar } = fakeResponse();
    await issueReauthProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
    expect(jar.has(ADMIN_REAUTH_COOKIE_NAME)).toBe(true);
    expect(await hasValidReauthProof(requestWith(jar), USER, SESSION_VERSION)).toBe(true);
    // A new tab (closed and reopened) needs the password again.
    expect(await hasValidReauthProof(requestWith(jar, "tab-other-0001"), USER, SESSION_VERSION)).toBe(false);
    vi.advanceTimersByTime(FACE_REAUTH_TTL_MS - 60_000);
    expect(await hasValidReauthProof(requestWith(jar), USER, SESSION_VERSION)).toBe(true);
    vi.advanceTimersByTime(120_000);
    expect(await hasValidReauthProof(requestWith(jar), USER, SESSION_VERSION)).toBe(false);
  });

  it("belongs to one account and one session version", async () => {
    const { res, jar } = fakeResponse();
    await issueReauthProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
    expect(await hasValidReauthProof(requestWith(jar), USER + 1, SESSION_VERSION)).toBe(false);
    expect(await hasValidReauthProof(requestWith(jar), USER, SESSION_VERSION + 1)).toBe(false);
  });

  it("survives an idle lock (the face is asked again, not the password)", async () => {
    const { res, jar } = fakeResponse();
    await issueReauthProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
    await issueProof(jar, res);
    await lockFaceSession({ req: requestWith(jar), res, userId: USER, reason: "idle" });
    expect(await hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION)).toBe(false);
    expect(await hasValidReauthProof(requestWith(jar), USER, SESSION_VERSION)).toBe(true);
  });

  it("caps the face proof's absolute window at the password's (8 hours counted from the PASSWORD)", async () => {
    const { res, jar } = fakeResponse();
    await issueReauthProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
    // Seven hours later the face is passed; it must end one hour on, when the
    // password step does -- not eight hours after the face.
    vi.advanceTimersByTime(7 * 60 * 60 * 1000);
    await issueProof(jar, res);
    for (let i = 0; i < 8; i += 1) {
      vi.advanceTimersByTime(10 * 60 * 1000);
      await refreshFaceProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
    }
    expect(await hasValidFaceProof(requestWith(jar), USER, SESSION_VERSION)).toBe(false);
  });

  it("assertReauthProof refuses without it (the message the client maps to the password screen) and is a no-op with the gate off", async () => {
    const previous = process.env.ADMIN_FACE_GATE_ENABLED;
    try {
      process.env.ADMIN_FACE_GATE_ENABLED = "1";
      await expect(assertReauthProof({ req: requestWith(new Map()), user: { id: USER, sessionVersion: SESSION_VERSION } })).rejects.toMatchObject({ code: "FORBIDDEN", message: REAUTH_REQUIRED_ERR_MSG });
      const { res, jar } = fakeResponse();
      await issueReauthProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
      await expect(assertReauthProof({ req: requestWith(jar), user: { id: USER, sessionVersion: SESSION_VERSION } })).resolves.toBeUndefined();
      process.env.ADMIN_FACE_GATE_ENABLED = "0";
      await expect(assertReauthProof({ req: requestWith(new Map()), user: { id: USER, sessionVersion: SESSION_VERSION } })).resolves.toBeUndefined();
    } finally {
      process.env.ADMIN_FACE_GATE_ENABLED = previous;
    }
  });
});

describe("token types cannot stand in for each other (2026-09-22 audit)", () => {
  async function sessionUserFrom(cookieName: string, value: string) {
    const req = { headers: { cookie: `${cookieName}=${value}` } } as unknown as Request;
    const ctx = await createContext({ req, res: {} as Response, info: {} } as unknown as Parameters<typeof createContext>[0]);
    return ctx.user;
  }

  it("refuses a face proof or a password step-up pasted into the session cookie", async () => {
    const { res, jar } = fakeResponse();
    await issueReauthProof({ req: requestWith(jar), res, userId: USER, sessionVersion: SESSION_VERSION });
    await issueProof(jar, res);
    expect(await sessionUserFrom(COOKIE_NAME, jar.get(ADMIN_FACE_COOKIE_NAME)!)).toBeNull();
    expect(await sessionUserFrom(COOKIE_NAME, jar.get(ADMIN_REAUTH_COOKIE_NAME)!)).toBeNull();
    // ...and neither proof is accepted in the other's place.
    const swapped = new Map([[ADMIN_FACE_COOKIE_NAME, jar.get(ADMIN_REAUTH_COOKIE_NAME)!], [ADMIN_REAUTH_COOKIE_NAME, jar.get(ADMIN_FACE_COOKIE_NAME)!]]);
    expect(await hasValidFaceProof(requestWith(swapped), USER, SESSION_VERSION)).toBe(false);
    expect(await hasValidReauthProof(requestWith(swapped), USER, SESSION_VERSION)).toBe(false);
  });

  it("still accepts a real session, including one minted before typ existed (nobody is signed out)", async () => {
    expect((await sessionUserFrom(COOKIE_NAME, await signSessionToken(USER, SESSION_VERSION)))?.id).toBe(USER);
    const key = new TextEncoder().encode(ENV.cookieSecret);
    const legacySession = await new SignJWT({ sub: String(USER), sv: SESSION_VERSION })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("365d").sign(key);
    expect((await sessionUserFrom(COOKIE_NAME, legacySession))?.id).toBe(USER);
    // A session token is not a proof of anything at the gate.
    const asProof = new Map([[ADMIN_FACE_COOKIE_NAME, legacySession], [ADMIN_REAUTH_COOKIE_NAME, legacySession]]);
    expect(await hasValidFaceProof(requestWith(asProof), USER, SESSION_VERSION)).toBe(false);
    expect(await hasValidReauthProof(requestWith(asProof), USER, SESSION_VERSION)).toBe(false);
  });
});
