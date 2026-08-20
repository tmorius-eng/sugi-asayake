import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { COOKIE_NAME } from "../shared/const";
import { passwordResetTokens, users } from "../drizzle/schema";
import { createContext, signSessionToken } from "./_core/context";
import { bumpUserSessionVersion, createPasswordResetToken, getDb, resetPasswordWithToken } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// TIER 1: there is no refresh-token rotation, so a "sign out everywhere"
// request (and a password reset) instead bump `users.sessionVersion` and
// embed it in the JWT — a token minted before the bump must stop working
// immediately, even though it hasn't expired. This exercises the real
// sign/verify code path (server/_core/context.ts), not just the HTTP layer.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

function contextFor(sessionToken: string): Promise<TrpcContext> {
  const options = {
    req: { headers: { cookie: `${COOKIE_NAME}=${sessionToken}` } },
    res: {},
  } as unknown as Parameters<typeof createContext>[0];
  return createContext(options);
}

describeWithDatabase("session versioning integration", () => {
  const marker = `session-version-test-${Date.now()}`;
  const email = `${marker}@example.invalid`;
  let userId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for session versioning integration tests.");
    const inserted = await db.insert(users).values({
      email,
      passwordHash: await hashPassword("OriginalPassw0rd!"),
      name: "Session Versioning Test",
      role: "user",
    });
    userId = Number(inserted[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (userId) await db.delete(users).where(eq(users.id, userId));
  });

  it("rejects an old token after an explicit sign-out-everywhere bump", async () => {
    const oldToken = await signSessionToken(userId, 0);

    const beforeCtx = await contextFor(oldToken);
    expect(beforeCtx.user?.id).toBe(userId);

    await bumpUserSessionVersion(userId);

    const afterCtx = await contextFor(oldToken);
    expect(afterCtx.user).toBeNull();

    // A freshly minted token (with the new sessionVersion) still works.
    const db = await getDb();
    const [current] = await db!.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, userId));
    const newToken = await signSessionToken(userId, current!.sessionVersion);
    const newCtx = await contextFor(newToken);
    expect(newCtx.user?.id).toBe(userId);
  });

  it("rejects a pre-reset token after the password is reset", async () => {
    const db = await getDb();
    const [current] = await db!.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, userId));
    const preResetToken = await signSessionToken(userId, current!.sessionVersion);
    expect((await contextFor(preResetToken)).user?.id).toBe(userId);

    const resetToken = randomBytes(32).toString("base64url");
    await createPasswordResetToken({ userId, tokenHash: tokenHash(resetToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    await resetPasswordWithToken({ tokenHash: tokenHash(resetToken), passwordHash: await hashPassword("YetAnotherPassw0rd!") });

    expect((await contextFor(preResetToken)).user).toBeNull();
  });

  it("cleans up dangling password reset tokens when the owning user is deleted (FK cascade)", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    const token = randomBytes(32).toString("base64url");
    await createPasswordResetToken({ userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });

    await db.delete(users).where(eq(users.id, userId));
    userId = 0; // already gone — afterAll shouldn't try to delete it again

    const remaining = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash(token)));
    expect(remaining).toHaveLength(0);
  });
});
