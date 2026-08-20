import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { emailVerificationTokens, passwordResetTokens, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { createEmailVerificationToken, createPasswordResetToken, getDb, getUserById } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// This suite exercises the TIER 0 "forgot password" + "verify email" flows
// against a real database. It is intentionally opt-in because it requires a
// configured development database (same convention as
// commerce.database.integration.test.ts).
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

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
  let userId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for auth account recovery integration tests.");
    const inserted = await db.insert(users).values({
      email,
      passwordHash: await hashPassword("OriginalPassw0rd!"),
      name: "Auth Recovery Test",
      role: "user",
    });
    userId = Number(inserted[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (userId) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("resets the password with a valid token, then rejects reuse, expiry, and garbage tokens", async () => {
    const caller = makeCaller();

    const goodToken = randomBytes(32).toString("base64url");
    await createPasswordResetToken({ userId, tokenHash: tokenHash(goodToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });

    await caller.auth.resetPassword({ token: goodToken, password: "BrandNewPassw0rd!" });

    // The new password now works for login...
    const loginResult = await makeCaller().auth.login({ email, password: "BrandNewPassw0rd!" });
    expect(loginResult.email).toBe(email);

    // ...and the old password no longer does.
    await expect(makeCaller().auth.login({ email, password: "OriginalPassw0rd!" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    // The same token cannot be replayed.
    await expect(caller.auth.resetPassword({ token: goodToken, password: "AnotherPassw0rd!" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // An expired token is rejected.
    const expiredToken = randomBytes(32).toString("base64url");
    await createPasswordResetToken({ userId, tokenHash: tokenHash(expiredToken), expiresAt: new Date(Date.now() - 1000) });
    await expect(makeCaller().auth.resetPassword({ token: expiredToken, password: "AnotherPassw0rd!" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // A token that was never issued is rejected.
    const unknownToken = randomBytes(32).toString("base64url");
    await expect(makeCaller().auth.resetPassword({ token: unknownToken, password: "AnotherPassw0rd!" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("never reveals whether an email is registered", async () => {
    const result = await makeCaller().auth.requestPasswordReset({ email: "definitely-not-registered@example.invalid", origin: "http://localhost:3000" });
    expect(result).toEqual({ success: true });
  });

  it("verifies the email address with a valid token, then rejects reuse and garbage tokens", async () => {
    const goodToken = randomBytes(32).toString("base64url");
    await createEmailVerificationToken({ userId, tokenHash: tokenHash(goodToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });

    let user = await getUserById(userId);
    expect(user?.emailVerifiedAt).toBeFalsy();

    await makeCaller().auth.verifyEmail({ token: goodToken });

    user = await getUserById(userId);
    expect(user?.emailVerifiedAt).toBeTruthy();

    // Replaying the same token fails now that the account is already verified.
    await expect(makeCaller().auth.verifyEmail({ token: goodToken })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const unknownToken = randomBytes(32).toString("base64url");
    await expect(makeCaller().auth.verifyEmail({ token: unknownToken })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
