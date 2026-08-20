import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminAuditLogs, loginAttempts, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// TIER 4: admin.auditLogs / admin.loginHistory against a real database —
// verifies the actual persisted rows (login_attempts, admin_audit_logs), not
// just the RBAC boundary (see commerce.router.test.ts for that in-memory
// check). Opt-in for the same reason as the other *.integration.test.ts
// suites: it needs a configured development database.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.113.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.113.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("admin security center integration", () => {
  const marker = `security-center-test-${Date.now()}`;
  const adminEmail = `${marker}-admin@example.invalid`;
  const targetEmail = `${marker}-target@example.invalid`;
  let adminUserId = 0;
  let targetUserId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for admin security center integration tests.");
    const adminInsert = await db.insert(users).values({ email: adminEmail, passwordHash: await hashPassword("AdminPassw0rd!"), name: "Security Center Admin", role: "admin", emailVerifiedAt: new Date() });
    adminUserId = Number(adminInsert[0].insertId);
    const targetInsert = await db.insert(users).values({ email: targetEmail, passwordHash: await hashPassword("TargetPassw0rd!"), name: "Security Center Target", role: "user", emailVerifiedAt: new Date() });
    targetUserId = Number(targetInsert[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(loginAttempts).where(eq(loginAttempts.userId, targetUserId));
    await db.delete(loginAttempts).where(eq(loginAttempts.userId, adminUserId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminUserId));
    if (targetUserId) await db.delete(users).where(eq(users.id, targetUserId));
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
  });

  it("records a failed then a successful login attempt, both visible via admin.loginHistory", async () => {
    const anon = callerFor(null);
    await expect(anon.auth.login({ email: targetEmail, password: "WrongPassword!" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await anon.auth.login({ email: targetEmail, password: "TargetPassw0rd!" });

    const admin = callerFor({ id: adminUserId, email: adminEmail, name: "Security Center Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    const history = await admin.admin.loginHistory({ email: targetEmail, outcome: "all" });
    expect(history.length).toBeGreaterThanOrEqual(2);
    const failed = history.find(entry => !entry.success);
    const succeeded = history.find(entry => entry.success);
    expect(failed?.reason).toBe("invalid_credentials");
    expect(succeeded?.userId).toBe(targetUserId);

    const failedOnly = await admin.admin.loginHistory({ email: targetEmail, outcome: "failed" });
    expect(failedOnly.every(entry => !entry.success)).toBe(true);
    const successOnly = await admin.admin.loginHistory({ email: targetEmail, outcome: "success" });
    expect(successOnly.every(entry => entry.success)).toBe(true);
  });

  it("surfaces a real admin action via admin.auditLogs, filterable by action/actor/date", async () => {
    const admin = callerFor({ id: adminUserId, email: adminEmail, name: "Security Center Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    await admin.admin.suspendUser({ userId: targetUserId, reason: "audit log integration test" });

    const byAction = await admin.admin.auditLogs({ action: "user.suspended", actorEmail: adminEmail });
    const match = byAction.find(entry => entry.entityId === targetUserId);
    expect(match).toBeTruthy();
    expect(match?.actorEmail).toBe(adminEmail);

    const dateFrom = new Date(Date.now() - 60_000);
    const inRange = await admin.admin.auditLogs({ action: "user.suspended", dateFrom });
    expect(inRange.some(entry => entry.entityId === targetUserId)).toBe(true);

    const dateTooLate = new Date(Date.now() + 60_000);
    const outOfRange = await admin.admin.auditLogs({ action: "user.suspended", dateFrom: dateTooLate });
    expect(outOfRange.some(entry => entry.entityId === targetUserId)).toBe(false);

    // Clean up the suspension itself so afterAll's user delete isn't the
    // only thing undoing it.
    await admin.admin.unsuspendUser({ userId: targetUserId });
  });
});
