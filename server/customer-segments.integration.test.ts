import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Admin overhaul (2026-09-08, Phase I): getUsersBySegment (server/
// analytics.ts) reuses the exact same matching logic
// getPreferenceSegmentBreakdown's aggregate counts already use -- this
// proves that guarantee empirically ("click 25, get 25" can never drift
// from the aggregate above), not just by code inspection, plus the
// marketingProcedure role boundary.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.160.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.160.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("customer segments integration", () => {
  const marker = `seg${Date.now().toString(36)}`;
  let marketingId = 0;
  const customerIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for customer segments integration tests.");
    const marketingInsert = await db.insert(users).values({ email: `${marker}-marketing@example.invalid`, passwordHash: await hashPassword("MarketingPassw0rd!"), name: "Segments Test Marketing", role: "marketing", emailVerifiedAt: new Date() });
    marketingId = Number(marketingInsert[0].insertId);

    // 3 real "user" role customers: 2 share skinConcerns="acne" (comma-list
    // match), 1 doesn't -- this is the exact case that would break if
    // getUsersBySegment's matching ever drifted from
    // getPreferenceSegmentBreakdown's own comma-list split/trim/filter logic.
    for (const [suffix, skinConcerns] of [["a", "acne,aging"], ["b", "acne"], ["c", "dryness"]] as const) {
      const insert = await db.insert(users).values({ email: `${marker}-cust-${suffix}@example.invalid`, passwordHash: await hashPassword("CustomerPassw0rd!"), name: `Segments Test Customer ${suffix}`, role: "user", skinConcerns, emailVerifiedAt: new Date() });
      customerIds.push(Number(insert[0].insertId));
    }
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(users).where(like(users.email, `${marker}-%`));
  });

  const marketingUser = () => ({ id: marketingId, email: `${marker}-marketing@example.invalid`, name: "Segments Test Marketing", role: "marketing" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });

  it("drill-down row count matches the aggregate count for the same segment (skinConcerns comma-list)", async () => {
    const marketing = callerFor(marketingUser());
    const { preferenceSegments } = await marketing.admin.customerSegments();
    const acneCount = preferenceSegments.topSkinConcerns.find(row => row.value === "acne")?.count ?? 0;
    expect(acneCount).toBeGreaterThanOrEqual(2);

    const drillDown = await marketing.admin.usersBySegment({ field: "skinConcerns", value: "acne" });
    expect(drillDown).toHaveLength(acneCount);
    expect(drillDown.map(u => u.id).sort()).toEqual(expect.arrayContaining([customerIds[0], customerIds[1]]));
    expect(drillDown.some(u => u.id === customerIds[2])).toBe(false);

    // Real PII is present -- this is the deliberate, Tom-confirmed scope
    // expansion the drill-down exists for.
    expect(drillDown.find(u => u.id === customerIds[0])).toMatchObject({ name: "Segments Test Customer a", email: `${marker}-cust-a@example.invalid` });
  });

  it("keeps usersBySegment and customerSegments marketing/admin-only, rejecting finance and warehouse", async () => {
    const finance = callerFor({ ...marketingUser(), role: "finance" });
    const warehouse = callerFor({ ...marketingUser(), role: "warehouse" });
    await expect(finance.admin.customerSegments()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(warehouse.admin.usersBySegment({ field: "skinConcerns", value: "acne" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
