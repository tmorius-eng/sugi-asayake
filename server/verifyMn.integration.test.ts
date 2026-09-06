import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// 2026-09-05: this machine's real .env now carries a real VERIFY_MN_API_KEY
// (Tom went and got one, see CLAUDE.md) -- so the "no key configured"
// premise this file's second test below relies on is no longer actually
// true here, and it would otherwise fire a REAL request at verify.mn's live
// API every time the suite runs (it did, once, before this fix: a real
// session for testPhone). A *partial* mock (unlike verifyMn.test.ts's full
// replacement) since this file's other imports (getDb, appRouter) genuinely
// need every other real ENV value (DATABASE_URL etc.) to keep working.
vi.mock("./_core/env", async importOriginal => {
  const actual = await importOriginal<typeof import("./_core/env")>();
  return { ENV: { ...actual.ENV, verifyMnApiKey: "" } };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { attachPhoneFromVerifiedSession, createUserWithPassword, getDb, getUserById, resetPasswordViaPhoneSession } from "./db";
import { hashPassword, verifyPassword } from "./_core/password";
import { phoneVerificationSessions, users } from "../drizzle/schema";

// Real-DB round trip, same RUN_AUTH_INTEGRATION_TESTS gate as
// server/auth.rate-limit.test.ts and the rest of the auth suite.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function makeCaller() {
  const ip = `203.0.114.${Math.floor(Math.random() * 200) + 1}`;
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {}, ip, socket: { remoteAddress: ip } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

// VERIFY_MN_API_KEY is forced empty above regardless of the real .env, and
// server/routers.ts's resetPasswordViaPhone/attachPhoneViaVerification
// procedures deliberately re-check verify.mn's LIVE status before spending
// any session (never trusting a cached column alone -- see their own
// comments) -- so a real end-to-end "verified" round trip through the
// ROUTER can't be exercised without live credentials. What this file tests
// instead, split accordingly:
//   - the router-level anti-enumeration and "real account found" branches
//     of startPhoneVerification/phoneVerificationStatus, which don't need
//     verify.mn to be configured to prove they behave correctly;
//   - the server/db.ts spend-a-session functions directly (as the plan
//     called for: "fake a verified session row directly in DB, since we
//     can't make a real phone reply in CI"), which is the part that has
//     nothing to do with verify.mn's live API at all.
describeWithDatabase("verify.mn phone verification integration", () => {
  const testPhone = "88112233";
  let userId: number;

  beforeAll(async () => {
    const user = await createUserWithPassword({ phone: testPhone, passwordHash: await hashPassword("initial-password-1"), name: "VerifyMn Test" });
    userId = user.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(phoneVerificationSessions).where(eq(phoneVerificationSessions.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("never contacts verify.mn for a phone with no matching account (anti-enumeration)", async () => {
    const result = await makeCaller().auth.startPhoneVerification({ phone: "99009900", purpose: "password_reset" });
    expect(result.sessionId).toMatch(/^noop:/);
    // A no-op session must behave like a real never-verified one forever --
    // polling it never flips true.
    const status = await makeCaller().auth.phoneVerificationStatus({ sessionId: result.sessionId });
    expect(status.status).toBe("pending");
  });

  it("finds the real account for a matching phone and attempts a real session (fails only because no VERIFY_MN_API_KEY is set here)", async () => {
    await expect(makeCaller().auth.startPhoneVerification({ phone: testPhone, purpose: "password_reset" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("spends a real VERIFIED session exactly once, bumping sessionVersion, and rejects replay", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for this test.");
    const inserted = await db.insert(phoneVerificationSessions).values({
      userId, purpose: "password_reset", phone: testPhone, verifyMnSessionId: `test-verified-${Date.now()}`, code: "123456", status: "verified", expiresAt: new Date(Date.now() + 60_000),
    });
    const sessionId = Number(inserted[0].insertId);

    const before = await getUserById(userId);
    const newPasswordHash = await hashPassword("brand-new-password-2");
    await resetPasswordViaPhoneSession({ sessionId, passwordHash: newPasswordHash });
    const after = await getUserById(userId);

    expect(after!.passwordHash).toBe(newPasswordHash);
    expect(after!.sessionVersion).toBeGreaterThan(before!.sessionVersion);
    expect(await verifyPassword("brand-new-password-2", after!.passwordHash)).toBe(true);

    // Replay: the same, now-consumed session must not work a second time.
    await expect(resetPasswordViaPhoneSession({ sessionId, passwordHash: await hashPassword("third-password-3") })).rejects.toThrow("аль хэдийн ашиглагдсан");
  });

  it("sets users.phone from a register-purpose VERIFIED session", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for this test.");
    const newPhone = "88445566";
    const inserted = await db.insert(phoneVerificationSessions).values({
      userId, purpose: "register", phone: newPhone, verifyMnSessionId: `test-register-${Date.now()}`, code: "654321", status: "verified", expiresAt: new Date(Date.now() + 60_000),
    });
    const sessionId = Number(inserted[0].insertId);

    await attachPhoneFromVerifiedSession({ sessionId });
    const updated = await getUserById(userId);
    expect(updated!.phone).toBe(newPhone);
  });
});
