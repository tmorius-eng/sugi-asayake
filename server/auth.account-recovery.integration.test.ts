import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { emailVerificationTokens, passwordResetTokens, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { createEmailVerificationCode, createPasswordResetCode, getDb, getUserByEmail, getUserById } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// This suite exercises the TIER 0 "forgot password" + "verify email" flows
// (both now 6-digit OTP codes, not link tokens — see server/routers.ts
// auth.register/confirmRegistration/requestPasswordReset/resetPassword)
// against a real database. It is intentionally opt-in because it requires a
// configured development database (same convention as
// commerce.database.integration.test.ts).
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
// A code guaranteed to differ from `code` (mod 1e6), for "wrong code" cases.
const wrongCodeFor = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

function makeCaller(overrides: Partial<TrpcContext> = {}) {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {}, ip: `127.0.0.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "127.0.0.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
    ...overrides,
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("auth account recovery integration", () => {
  const marker = `auth-recovery-test-${Date.now()}`;
  const email = `${marker}@example.invalid`;
  const registerEmail = `${marker}-register@example.invalid`;
  let userId = 0;
  const extraUserIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for auth account recovery integration tests.");
    // Pre-verified, as a real account would be by the time it can log in at
    // all (auth.login requires emailVerifiedAt — see the login gate test
    // below for the case where it's still null).
    const inserted = await db.insert(users).values({
      email,
      passwordHash: await hashPassword("OriginalPassw0rd!"),
      name: "Auth Recovery Test",
      role: "user",
      emailVerifiedAt: new Date(),
    });
    userId = Number(inserted[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of [userId, ...extraUserIds]) {
      if (!id) continue;
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("resets the password with a valid code, then rejects reuse, expiry, and garbage codes", async () => {
    const caller = makeCaller();

    const goodCode = "482913";
    await createPasswordResetCode({ userId, codeHash: tokenHash(goodCode), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });

    await caller.auth.resetPassword({ email, code: goodCode, password: "BrandNewPassw0rd!" });

    // The new password now works for login...
    const loginResult = await makeCaller().auth.login({ email, password: "BrandNewPassw0rd!" });
    expect(loginResult.email).toBe(email);

    // ...and the old password no longer does.
    await expect(makeCaller().auth.login({ email, password: "OriginalPassw0rd!" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    // The same code cannot be replayed.
    await expect(caller.auth.resetPassword({ email, code: goodCode, password: "AnotherPassw0rd!" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // An expired code is rejected.
    const expiredCode = "111222";
    await createPasswordResetCode({ userId, codeHash: tokenHash(expiredCode), expiresAt: new Date(Date.now() - 1000) });
    await expect(makeCaller().auth.resetPassword({ email, code: expiredCode, password: "AnotherPassw0rd!" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // A code that was never issued is rejected.
    await expect(makeCaller().auth.resetPassword({ email, code: "999999", password: "AnotherPassw0rd!" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("burns a code after 5 wrong guesses, independent of its expiry", async () => {
    const code = "635127";
    const wrong = wrongCodeFor(code);
    await createPasswordResetCode({ userId, codeHash: tokenHash(code), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });

    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(makeCaller().auth.resetPassword({ email, code: wrong, password: "AnotherPassw0rd!" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }

    // Even the correct code is now rejected — the row was burned on the 5th
    // wrong guess, not just rate-limited.
    await expect(makeCaller().auth.resetPassword({ email, code, password: "AnotherPassw0rd!" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("never reveals whether an email is registered", async () => {
    const result = await makeCaller().auth.requestPasswordReset({ email: "definitely-not-registered@example.invalid" });
    expect(result).toEqual({ success: true });
  });

  it("verifies the email address with a valid code (legacy logged-in flow), then rejects reuse and garbage codes", async () => {
    const goodCode = "204857";
    await createEmailVerificationCode({ userId, codeHash: tokenHash(goodCode), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });

    const user = await getUserById(userId);
    if (!user) throw new Error("test user missing");
    const { passwordHash: _passwordHash, ...sessionUser } = user;
    const loggedInCaller = makeCaller({ user: sessionUser });

    await loggedInCaller.auth.verifyEmailCode({ code: goodCode });
    const after = await getUserById(userId);
    expect(after?.emailVerifiedAt).toBeTruthy();

    // Replaying the same code fails — it was marked used the first time.
    await expect(loggedInCaller.auth.verifyEmailCode({ code: goodCode })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(loggedInCaller.auth.verifyEmailCode({ code: wrongCodeFor(goodCode) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("register -> login is refused until confirmRegistration checks out the emailed code", async () => {
    const registered = await makeCaller().auth.register({ email: registerEmail, password: "FreshPassw0rd!" });
    expect(registered).toEqual({ pendingVerification: true, email: registerEmail, codeSent: expect.any(Boolean) });

    const pending = await getUserByEmail(registerEmail);
    expect(pending).toBeTruthy();
    if (pending) extraUserIds.push(pending.id);
    expect(pending?.emailVerifiedAt).toBeFalsy();

    // Registered, but never confirmed: login is refused even with the
    // correct password — this is the loophole the emailVerifiedAt gate on
    // auth.login exists to close.
    await expect(makeCaller().auth.login({ email: registerEmail, password: "FreshPassw0rd!" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Wrong code during confirmation is rejected without confirming the account.
    const realCode = "770044";
    await createEmailVerificationCode({ userId: pending!.id, codeHash: tokenHash(realCode), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    await expect(makeCaller().auth.confirmRegistration({ email: registerEmail, code: wrongCodeFor(realCode) })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // The correct code confirms the account and logs it in (no separate
    // auth.login call needed — confirmRegistration issues the session).
    const confirmed = await makeCaller().auth.confirmRegistration({ email: registerEmail, code: realCode });
    expect(confirmed.email).toBe(registerEmail);
    expect(confirmed.emailVerifiedAt).toBeTruthy();

    // From here on, a normal login works too.
    const loginResult = await makeCaller().auth.login({ email: registerEmail, password: "FreshPassw0rd!" });
    expect(loginResult.email).toBe(registerEmail);
  });

  it("resendRegistrationCode and re-registering a pending (unconfirmed) email both succeed without enumerating real accounts", async () => {
    // Resending for an email with no pending registration at all still
    // returns the generic success shape.
    await expect(makeCaller().auth.resendRegistrationCode({ email: "no-such-pending@example.invalid" })).resolves.toEqual({ success: true });

    // Re-submitting the register form for an email that's ALREADY verified
    // is a real conflict, not treated as a retry.
    await expect(makeCaller().auth.register({ email, password: "SomeOtherPassw0rd!" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
