import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testSessionUser } from "./_test-helpers";
import { eq, like } from "drizzle-orm";
import { adminAuditLogs, pushSubscriptions, users } from "../drizzle/schema";

// Admin overhaul (2026-09-08, Phase J): mass email/SMS campaigns. Stub
// sendAccountEmail so this test verifies sendCampaign's own counting/filter
// logic deterministically, rather than depending on whether BREVO_API_KEY
// happens to be configured in whatever environment runs this suite (it
// currently is not -- deliverEmail's own no-op fallback already returns
// `false`, i.e. "not actually delivered", which would otherwise make a
// naive "sentCount===1" assertion here fail for a reason that has nothing
// to do with this feature). No real network call reaches Brevo either way.
vi.mock("./_core/notification", async importOriginal => {
  const actual = await importOriginal<typeof import("./_core/notification")>();
  return { ...actual, sendAccountEmail: vi.fn(async () => true), sendAccountSms: vi.fn(async () => true) };
});

import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.170.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.170.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("mass campaign integration", () => {
  const marker = `cmp${Date.now().toString(36)}`;
  let marketingId = 0;
  let optedInId = 0;
  let optedOutId = 0;
  let noEmailId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for campaigns integration tests.");
    const marketingInsert = await db.insert(users).values({ email: `${marker}-marketing@example.invalid`, passwordHash: await hashPassword("MarketingPassw0rd!"), name: "Campaign Test Marketing", role: "marketing", emailVerifiedAt: new Date() });
    marketingId = Number(marketingInsert[0].insertId);

    const optedInInsert = await db.insert(users).values({ email: `${marker}-optedin@example.invalid`, passwordHash: await hashPassword("CustomerPassw0rd!"), name: "Campaign Test Opted In", role: "user", emailOptIn: true, emailVerifiedAt: new Date() });
    optedInId = Number(optedInInsert[0].insertId);
    const optedOutInsert = await db.insert(users).values({ email: `${marker}-optedout@example.invalid`, passwordHash: await hashPassword("CustomerPassw0rd!"), name: "Campaign Test Opted Out", role: "user", emailOptIn: false, emailVerifiedAt: new Date() });
    optedOutId = Number(optedOutInsert[0].insertId);
    // Phone-only account (no email on file) -- must never be counted
    // "eligible" for an email campaign even though emailOptIn defaults true.
    const noEmailInsert = await db.insert(users).values({ phone: `9${Date.now().toString().slice(-7)}`, passwordHash: await hashPassword("CustomerPassw0rd!"), name: "Campaign Test No Email", role: "user", emailOptIn: true, emailVerifiedAt: new Date() });
    noEmailId = Number(noEmailInsert[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (marketingId) await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, marketingId));
    await db.delete(users).where(like(users.email, `${marker}-%`));
    if (noEmailId) await db.delete(users).where(eq(users.id, noEmailId));
  });

  const marketingUser = () => testSessionUser({ id: marketingId, email: `${marker}-marketing@example.invalid`, name: "Campaign Test Marketing", role: "marketing" as const, emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });

  it("filters out opted-out and email-less recipients before sending, and reports accurate counts", async () => {
    const marketing = callerFor(marketingUser());
    const result = await marketing.admin.sendCampaign({
      userIds: [optedInId, optedOutId, noEmailId],
      channel: "email",
      subject: "QA campaign subject",
      body: "QA campaign body text.",
      sourceLabel: "QA regression",
    });
    expect(result.recipientCount).toBe(3);
    expect(result.eligibleCount).toBe(1);
    expect(result.skippedOptOutCount).toBe(2);
    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it("refuses to send the identical campaign again within ten minutes (double click / second tab), but allows a changed one", async () => {
    const marketing = callerFor(marketingUser());
    const campaign = { userIds: [optedInId, optedOutId], channel: "email" as const, subject: "QA dedupe subject", body: "QA dedupe body." };
    await marketing.admin.sendCampaign(campaign);
    await expect(marketing.admin.sendCampaign({ ...campaign, userIds: [optedOutId, optedInId] })).rejects.toMatchObject({ code: "CONFLICT" });
    const changed = await marketing.admin.sendCampaign({ ...campaign, body: "QA dedupe body, corrected." });
    expect(changed.sentCount).toBe(1);
  });

  it("blocks SMS campaigns while SMS_CAMPAIGNS_ENABLED is unset", async () => {
    const marketing = callerFor(marketingUser());
    await expect(marketing.admin.sendCampaign({ userIds: [optedInId], channel: "sms", subject: "x", body: "x" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  /**
   * Push суваг (2026-09-16). Хамгийн чухал дүрэм: тугтай ч БҮРТГЭЛГҮЙ хүн
   * эрхшээлгүй. Үүнгүйгээр админ "бүгдэд илгээлээ" гэж харах атлаа хэн ч
   * хүлээж авахгүй байж болно (`push_subscriptions` production дээр 0 байсан).
   */
  it("push сувагт зөвхөн мэдэгдлээ асаасан хүн эрхшээлтэй", async () => {
    const marketing = callerFor(marketingUser());
    const db = await getDb();
    if (!db) throw new Error("DB required");

    // Хоёулаа pushOptIn=true (анхдагч), гэвч зөвхөн нэг нь бүртгэлтэй.
    await db.insert(pushSubscriptions).values({
      userId: optedInId,
      endpoint: `https://push.example.invalid/${marker}-a`,
      p256dh: "BJ3QFm5cQxV9hfQOTBiG6dsRp6cDjT0SwIbGcIcD1nQ",
      auth: "cGFzc3dvcmRwYXNzd29yZA",
    });

    const reach = await marketing.admin.campaignReach({ userIds: [optedInId, optedOutId, noEmailId], channel: "push" });
    expect(reach.selected).toBe(3);
    expect(reach.reachable, "бүртгэлтэй ганц хүн").toBe(1);

    // pushOptIn-ийг унтраавал бүртгэлтэй ч эрхшээлгүй — зар нь захиалгын
    // мэдэгдлээс ТУСДАА зөвшөөрөл (migration 0086).
    await db.update(users).set({ pushOptIn: false }).where(eq(users.id, optedInId));
    const afterOptOut = await marketing.admin.campaignReach({ userIds: [optedInId], channel: "push" });
    expect(afterOptOut.reachable).toBe(0);
    await db.update(users).set({ pushOptIn: true }).where(eq(users.id, optedInId));

    // Гадаад холбоос хориотой: мэдэгдлийг фишингийн тээвэр болгож болохгүй.
    await expect(marketing.admin.sendCampaign({
      userIds: [optedInId], channel: "push", subject: "QA push", body: "QA push body", url: "https://evil.example.com/",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, optedInId));
  });

  it("keeps campaigns marketing/admin-only, rejecting finance and warehouse", async () => {
    const finance = callerFor({ ...marketingUser(), role: "finance" });
    const warehouse = callerFor({ ...marketingUser(), role: "warehouse" });
    await expect(finance.admin.sendCampaign({ userIds: [optedInId], channel: "email", subject: "x", body: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(warehouse.admin.campaignAllUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
