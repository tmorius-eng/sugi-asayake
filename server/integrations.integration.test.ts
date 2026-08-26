import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminAuditLogs, integrationConfigs, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import { decryptJson, encryptJson } from "./_core/crypto";
import type { TrpcContext } from "./_core/context";

// Admin-manageable third-party provider config (eBarimt/StorePay/Golomt
// card/eBuuhia courier). Real, DB-persisted, encrypted at rest -- verifies
// staff (not just guests) are blocked, credentials round-trip through
// encryption correctly, and the server never leaks decrypted values back to
// the caller.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.118.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.118.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describe("integration config encryption (unit)", () => {
  it("round-trips a credential object through encryptJson/decryptJson", () => {
    const original = { apiKey: "sk_live_abc123", merchantId: "M-99" };
    const blob = encryptJson(original);
    expect(blob.split(":")).toHaveLength(3);
    expect(decryptJson(blob)).toEqual(original);
  });

  it("throws on a tampered blob rather than silently returning garbage", () => {
    const blob = encryptJson({ apiKey: "sk_live_abc123" });
    const [iv, authTag, ciphertext] = blob.split(":");
    const tampered = `${iv}:${authTag}:${ciphertext.slice(0, -2)}00`;
    expect(() => decryptJson(tampered)).toThrow();
  });
});

describeWithDatabase("integration config admin API", () => {
  const marker = `integration-test-${Date.now()}`;
  const adminEmail = `${marker}-admin@example.invalid`;
  const staffEmail = `${marker}-staff@example.invalid`;
  let adminId = 0;
  let staffId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for integration config tests.");
    const adminInsert = await db.insert(users).values({ email: adminEmail, passwordHash: await hashPassword("AdminPassw0rd!"), name: "Integration Test Admin", role: "admin", emailVerifiedAt: new Date() });
    adminId = Number(adminInsert[0].insertId);
    const staffInsert = await db.insert(users).values({ email: staffEmail, passwordHash: await hashPassword("StaffPassw0rd!"), name: "Integration Test Staff", role: "staff", emailVerifiedAt: new Date() });
    staffId = Number(staffInsert[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(integrationConfigs).where(eq(integrationConfigs.provider, "ebarimt"));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.id, staffId));
  });

  function admin() {
    return callerFor({ id: adminId, email: adminEmail, name: "Integration Test Admin", role: "admin", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }
  function staff() {
    return callerFor({ id: staffId, email: staffEmail, name: "Integration Test Staff", role: "staff", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }

  it("rejects staff (not just guests) from viewing or editing integrations -- these are admin-only, unlike most admin.* endpoints", async () => {
    await expect(staff().admin.integrations()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(staff().admin.updateIntegration({ provider: "ebarimt", isActive: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists all four providers even before any row has been created (lazy defaults)", async () => {
    const list = await admin().admin.integrations();
    const providers = list.map(row => row.provider).sort();
    expect(providers).toEqual(["card_golomt", "courier_ebuuhia", "ebarimt", "storepay"]);
    const ebarimt = list.find(row => row.provider === "ebarimt");
    expect(ebarimt).toMatchObject({ isActive: false, hasCredentials: false, configuredKeys: [] });
  });

  it("toggles isActive without needing credentials, and never leaks decrypted values back", async () => {
    const admin1 = admin();
    await admin1.admin.updateIntegration({ provider: "ebarimt", isActive: true });
    const afterToggle = await admin1.admin.integrations().then(list => list.find(row => row.provider === "ebarimt"));
    expect(afterToggle?.isActive).toBe(true);
    expect(afterToggle?.hasCredentials).toBe(false);

    const saved = await admin1.admin.updateIntegration({ provider: "ebarimt", config: { posNumber: "12345678", apiKey: "secret-value-xyz" } });
    expect(saved.hasCredentials).toBe(true);
    expect(saved.configuredKeys.sort()).toEqual(["apiKey", "posNumber"]);
    // The whole point: the raw secret string must never appear anywhere in
    // the returned object, only the key names.
    expect(JSON.stringify(saved)).not.toContain("secret-value-xyz");

    // Confirm it's genuinely encrypted at rest in the DB, not just hidden by the API shape.
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for integration config tests.");
    const row = await db.select().from(integrationConfigs).where(eq(integrationConfigs.provider, "ebarimt")).limit(1);
    expect(row[0]?.encryptedConfig).toBeTruthy();
    expect(row[0]?.encryptedConfig).not.toContain("secret-value-xyz");
    expect(decryptJson(row[0]!.encryptedConfig!)).toEqual({ posNumber: "12345678", apiKey: "secret-value-xyz" });
  });

  it("toggling isActive alone does not wipe previously-saved credentials", async () => {
    const admin1 = admin();
    await admin1.admin.updateIntegration({ provider: "ebarimt", config: { apiKey: "keep-me" } });
    await admin1.admin.updateIntegration({ provider: "ebarimt", isActive: false });
    const list = await admin1.admin.integrations();
    const ebarimt = list.find(row => row.provider === "ebarimt");
    expect(ebarimt?.isActive).toBe(false);
    expect(ebarimt?.hasCredentials).toBe(true);
    expect(ebarimt?.configuredKeys).toEqual(["apiKey"]);
  });
});
