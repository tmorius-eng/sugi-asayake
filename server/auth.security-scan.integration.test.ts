import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { COOKIE_NAME } from "../shared/const";
import { loginAttempts, sessionRevocations, users } from "../drizzle/schema";
import { createContext, signSessionToken } from "./_core/context";
import type { TrpcContext } from "./_core/context";
import { hashPassword } from "./_core/password";
import { createUserWithPassword, getDb, getUserById, purgeExpiredSessionRevocations } from "./db";
import { appRouter } from "./routers";

// 2026-10-01 аюулгүй байдлын scan, A бүлэг: нэг төхөөрөмжийн logout (jti), нууц үг солих /
// акаунт устгах / Facebook-ийн lockout, анхны хэрэглэгч admin БИШ. Бодит DB шаардана
// (migration 0099 `sugi_staging`-д ажилласан байх ёстой) тул RUN_AUTH_INTEGRATION_TESTS=1-ээр.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const MARKER = `scan-a-${Date.now()}`;
const PASSWORD = `${MARKER}-password`;

/** Бодит cookie-тай, санамсаргүй IP-тэй context (strict rate limit 15 минутын цонхонд IP-ээр тоологддог). */
function contextFor(token: string | null, user: TrpcContext["user"]): TrpcContext {
  const cleared: string[] = [];
  return {
    user,
    req: {
      protocol: "https",
      headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : {},
      ip: `203.0.116.${Math.floor(Math.random() * 250) + 1}`,
      socket: { remoteAddress: "203.0.116.1" },
    } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: (name: string) => { cleared.push(name); } } as unknown as TrpcContext["res"],
  };
}

async function userFromToken(token: string) {
  const ctx = await createContext({ req: { headers: { cookie: `${COOKIE_NAME}=${token}` } }, res: {} } as unknown as Parameters<typeof createContext>[0]);
  return ctx.user;
}

describeWithDatabase("security scan group A (real DB)", () => {
  let userId = 0;
  const phone = `8${String(Date.now()).slice(-7)}`;

  beforeAll(async () => {
    const user = await createUserWithPassword({ phone, passwordHash: await hashPassword(PASSWORD), name: MARKER });
    userId = user.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(sessionRevocations).where(eq(sessionRevocations.userId, userId));
    await db.delete(loginAttempts).where(eq(loginAttempts.userId, userId));
    if (userId) await db.delete(users).where(eq(users.id, userId));
  });

  it("registration never makes anybody admin, even the first account", async () => {
    expect((await getUserById(userId))!.role).toBe("user");
  });

  it("logout ends ONLY this device's token: the copied cookie is dead, the other device keeps working", async () => {
    const user = (await getUserById(userId))!;
    const thisDevice = await signSessionToken(userId, user.sessionVersion);
    const otherDevice = await signSessionToken(userId, user.sessionVersion);
    const sessionUser = await userFromToken(thisDevice);
    expect(sessionUser?.id).toBe(userId);

    await appRouter.createCaller(contextFor(thisDevice, sessionUser)).auth.logout();

    expect(await userFromToken(thisDevice)).toBeNull();
    expect((await userFromToken(otherDevice))?.id).toBe(userId);
    // Давхар logout аюулгүй (idempotent).
    await appRouter.createCaller(contextFor(thisDevice, sessionUser)).auth.logout();
  });

  it("the retention purge removes revocations whose token has expired, and keeps live ones", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    await db.insert(sessionRevocations).values([
      { jti: `${MARKER}-old`.slice(0, 32), userId, expiresAt: new Date(Date.now() - 60_000) },
      { jti: `${MARKER}-new`.slice(0, 32), userId, expiresAt: new Date(Date.now() + 3_600_000) },
    ]);
    await purgeExpiredSessionRevocations();
    const left = await db.select({ jti: sessionRevocations.jti }).from(sessionRevocations).where(eq(sessionRevocations.userId, userId));
    expect(left.map(row => row.jti)).toContain(`${MARKER}-new`.slice(0, 32));
    expect(left.map(row => row.jti)).not.toContain(`${MARKER}-old`.slice(0, 32));
  });

  it("changePassword counts wrong passwords against the account and locks after 10 (a correct one still works from a known IP only)", async () => {
    const user = (await getUserById(userId))!;
    const token = await signSessionToken(userId, user.sessionVersion);
    const sessionUser = await userFromToken(token);
    // Each call uses a fresh random IP, so only the ACCOUNT lockout can stop us.
    for (let i = 0; i < 10; i += 1) {
      await expect(appRouter.createCaller(contextFor(token, sessionUser)).profile.changePassword({ currentPassword: "wrong-password", newPassword: "another-password-1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    await expect(appRouter.createCaller(contextFor(token, sessionUser)).profile.changePassword({ currentPassword: "wrong-password", newPassword: "another-password-1" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // Түгжигдсэн үед зөв нууц үг ч (танил IP-гүй санамсаргүй IP-ээс) нэвтрэхгүй.
    await expect(appRouter.createCaller(contextFor(token, sessionUser)).profile.changePassword({ currentPassword: PASSWORD, newPassword: "another-password-1" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const db = await getDb();
    const reasons = await db!.select({ reason: loginAttempts.reason }).from(loginAttempts).where(eq(loginAttempts.userId, userId));
    expect(reasons.filter(row => row.reason === "password_change_invalid").length).toBeGreaterThanOrEqual(10);
  });
});
