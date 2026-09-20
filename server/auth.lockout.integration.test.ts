import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { loginAttempts, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

/**
 * Аудит 2026-09-20 (P0-3): данс тус бүрийн lockout. IP-ийн tier-ээс тусдаа —
 * энд оролдлого бүр ӨӨР IP-ээс ирдэг (олон гарцтай халдагчийг дуурайна) тул
 * IP-ийн лимит хэзээ ч хүрэхгүй; 10 буруу оролдлогын дараа ЗӨВ нууц үг ч
 * татгалзагдах ёстой. Бодит DB дээр, throwaway хэрэглэгчээр.
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const RUN_SUBNET = Math.floor(Math.random() * 200) + 10;
let octet = 1;
function callerFromFreshIp() {
  octet += 1;
  const ip = `10.${RUN_SUBNET}.77.${octet}`;
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {}, ip, socket: { remoteAddress: ip } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("auth.login per-account lockout", () => {
  // A real-looking 8-digit mobile that cannot collide with a customer: 7xxx
  // numbers are landlines in Mongolia and the suffix is time-based.
  const phone = `7${String(Date.now()).slice(-7)}`;
  const password = "Lockout-Test-Passw0rd!";
  let userId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for the lockout test.");
    const inserted = await db.insert(users).values({ phone, passwordHash: await hashPassword(password), name: "Lockout Test", role: "user" });
    userId = Number(inserted[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db || !userId) return;
    await db.delete(loginAttempts).where(eq(loginAttempts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("locks the account after 10 failures from different IPs, then refuses even the right password", async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await expect(callerFromFreshIp().auth.login({ phone, password: "wrong-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    await expect(callerFromFreshIp().auth.login({ phone, password })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const db = await getDb();
    const [locked] = await db!.select({ reason: loginAttempts.reason }).from(loginAttempts).where(eq(loginAttempts.userId, userId)).orderBy(loginAttempts.id).limit(1).offset(10);
    expect(locked?.reason).toBe("locked");
  });

  it("a wrong password for an account that is not locked still says UNAUTHORIZED, not locked", async () => {
    const db = await getDb();
    await db!.delete(loginAttempts).where(eq(loginAttempts.userId, userId));
    await expect(callerFromFreshIp().auth.login({ phone, password: "wrong-again" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(callerFromFreshIp().auth.login({ phone, password })).resolves.toMatchObject({ id: userId });
  });
});
