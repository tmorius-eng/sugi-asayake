import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { testSessionUser } from "./_test-helpers";
import { adminAuditLogs, jobPostings, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// 2026-09-14: /careers-ийн ажлын байрны зар — админаас нэмэх, засах, нуух,
// устгах бүх зам бодит DB дээр. Хамгийн чухал шалгалт нь НУУСАН зар нийтийн
// жагсаалтад ОГТ гарахгүй байх: ноорог зар storefront дээр харагдвал дуусаагүй
// ажлын байр нийтэд зарлагдсан болно.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]) {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "198.51.100.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("job postings", () => {
  const marker = `jp${Date.now().toString(36)}`;
  let adminId = 0;
  const createdIds: number[] = [];
  const base = () => ({ emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  const admin = () => callerFor(testSessionUser({ ...base(), id: adminId, email: `${marker}-admin@example.invalid`, name: "JP Admin", role: "admin" }));
  const guest = () => callerFor(null);

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    adminId = Number((await db.insert(users).values({ email: `${marker}-admin@example.invalid`, passwordHash: await hashPassword("JpPassw0rd!"), name: "JP Admin", role: "admin", emailVerifiedAt: new Date() }))[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (createdIds.length) await db.delete(jobPostings).where(inArray(jobPostings.id, createdIds));
    await db.delete(adminAuditLogs).where(inArray(adminAuditLogs.actorUserId, [adminId]));
    await db.delete(users).where(inArray(users.id, [adminId]));
  });

  it("creates a published posting that the public page can read", async () => {
    const saved = await admin().admin.saveJobPosting({
      title: `${marker} Дэлгүүрийн зөвлөх`,
      employmentType: "Бүтэн цаг",
      location: "Улаанбаатар",
      salaryRange: "1,500,000₮-с",
      description: "Үүрэг: харилцагчид зөвлөх.",
      applyEmail: "jobs@example.invalid",
      applyUrl: null,
      isPublished: true,
      sortOrder: 0,
    });
    createdIds.push(saved.id);

    const publicList = await guest().content.jobPostings();
    const mine = publicList.find(posting => posting.id === saved.id);
    expect(mine).toBeDefined();
    expect(mine!.title).toBe(`${marker} Дэлгүүрийн зөвлөх`);
    expect(mine!.salaryRange).toBe("1,500,000₮-с");
    expect(mine!.applyEmail).toBe("jobs@example.invalid");
  });

  it("hides a draft posting from the public page but keeps it for the admin", async () => {
    const saved = await admin().admin.saveJobPosting({
      title: `${marker} Ноорог байр`,
      employmentType: "Цагийн",
      location: "Улаанбаатар",
      salaryRange: "",
      description: null,
      applyEmail: null,
      applyUrl: null,
      isPublished: false,
      sortOrder: 1,
    });
    createdIds.push(saved.id);

    expect((await guest().content.jobPostings()).some(posting => posting.id === saved.id)).toBe(false);
    expect((await admin().admin.jobPostings()).some(posting => posting.id === saved.id)).toBe(true);
  });

  it("saves an edit and shows it on the public page (cache is dropped on write)", async () => {
    const id = createdIds[0];
    await admin().admin.saveJobPosting({
      id,
      title: `${marker} Ахлах зөвлөх`,
      employmentType: "Бүтэн цаг",
      location: "Улаанбаатар, Орос элчин",
      salaryRange: "2,000,000₮-с",
      description: "Шинэчилсэн тайлбар.",
      applyEmail: null,
      applyUrl: "https://example.invalid/apply",
      isPublished: true,
      sortOrder: 0,
    });

    const mine = (await guest().content.jobPostings()).find(posting => posting.id === id);
    expect(mine!.title).toBe(`${marker} Ахлах зөвлөх`);
    expect(mine!.location).toBe("Улаанбаатар, Орос элчин");
    expect(mine!.applyUrl).toBe("https://example.invalid/apply");
    expect(mine!.applyEmail).toBeNull();
  });

  it("refuses a posting with no real title", async () => {
    await expect(admin().admin.saveJobPosting({
      title: " ",
      employmentType: "",
      location: "",
      salaryRange: "",
      description: null,
      applyEmail: null,
      applyUrl: null,
      isPublished: true,
      sortOrder: 0,
    })).rejects.toThrow();
  });

  it("refuses to let a signed-out visitor write", async () => {
    await expect(guest().admin.saveJobPosting({
      title: `${marker} Зөвшөөрөлгүй`,
      employmentType: "",
      location: "",
      salaryRange: "",
      description: null,
      applyEmail: null,
      applyUrl: null,
      isPublished: true,
      sortOrder: 0,
    })).rejects.toThrow();
  });

  it("deletes a posting", async () => {
    const id = createdIds.pop()!;
    await admin().admin.deleteJobPosting({ id });
    expect((await admin().admin.jobPostings()).some(posting => posting.id === id)).toBe(false);
  });
});
