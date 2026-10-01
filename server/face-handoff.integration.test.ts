import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { adminAuditLogs, faceHandoffRequests, users } from "../drizzle/schema";
import { getDb, getUserById } from "./db";
import { hashPassword } from "./_core/password";
import { hasValidFaceProof } from "./_core/faceProof";
import {
  approveFaceHandoff,
  assertHandoffApprovable,
  claimFaceHandoff,
  denyFaceHandoff,
  describeUserAgent,
  getFaceHandoffContext,
  purgeExpiredFaceHandoffs,
  startFaceHandoff,
} from "./faceHandoff";

/**
 * Камергүй компьютерийн QR handoff (2026-09-16, docs/FACE-HANDOFF-PLAN.md).
 *
 * Энд ЦАРАЙГ шалгахгүй — тэр нь `completeFaceVerification`-ийн ажил бөгөөд
 * өөрийн тесттэй. Энэ багц нь **төлвийн машин ба аюулгүйн хилүүд**-ийг
 * шалгана: хэн батлах эрхтэй, юу нэг удаа, юу хугацаатай, proof хэзээ хэнд
 * очих. Бодит MySQL шаардлагатай (нөхцөлт UPDATE-ийн атомик байдал).
 */
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

/** Хөтчийн оронд: cookie-г барьж авдаг хуурамч req/res хос. */
function fakeDevice(options: { tab?: string; ip?: string; agent?: string } = {}) {
  const jar: Record<string, string> = {};
  const req = {
    protocol: "https",
    ip: options.ip ?? "203.0.113.10",
    headers: {
      "user-agent": options.agent ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
      "x-admin-tab": options.tab ?? "tab-desktop-0001",
      get cookie() { return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; "); },
    },
    socket: { remoteAddress: options.ip ?? "203.0.113.10" },
  } as unknown as Request;
  const res = { cookie: (name: string, value: string) => { jar[name] = value; }, clearCookie: (name: string) => { delete jar[name]; } } as unknown as Response;
  return { req, res, jar };
}

describeWithDatabase("face handoff integration", () => {
  const marker = `handoff-${Date.now().toString(36)}`;
  let userId = 0;
  const grantOf = async () => (await getUserById(userId))!.faceGrantVersion;
  let otherUserId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for face handoff integration tests.");
    const inserted = await db.insert(users).values({ email: `${marker}@example.invalid`, phone: `${marker}-a`, passwordHash: await hashPassword("HandoffPassw0rd!"), name: "Handoff Test Admin", role: "admin" });
    userId = Number(inserted[0].insertId);
    const other = await db.insert(users).values({ email: `${marker}-b@example.invalid`, phone: `${marker}-b`, passwordHash: await hashPassword("HandoffPassw0rd!"), name: "Handoff Other", role: "admin" });
    otherUserId = Number(other[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of [userId, otherUserId]) {
      if (!id) continue;
      await db.delete(faceHandoffRequests).where(eq(faceHandoffRequests.userId, id));
      // Батлах/татгалзах бүр audit мөр үлдээдэг ба тэр нь users руу
      // ON DELETE RESTRICT-ээр холбогддог (санаатай: admin-ий үйлдлийн түүх
      // хүн устсанаас болж алга болох ёсгүй) — тестийн хэрэглэгчийг
      // цэвэрлэхийн тулд эхлээд өөрийнх нь мөрүүдийг устгана.
      await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("бүтэн урсгал: QR -> утас батална -> компьютер proof-оо авна", async () => {
    const desktop = fakeDevice();
    const phone = fakeDevice({ tab: "tab-phone-0002", ip: "198.51.100.5", agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1" });

    const started = await startFaceHandoff({ userId, sessionVersion: 0, req: desktop.req });
    expect(started.matchNumber).toBeGreaterThanOrEqual(10);
    expect(started.matchNumber).toBeLessThanOrEqual(99);

    // Утас юуг баталж байгаагаа хардаг; зөв тоо сонголтуудын дотор байна.
    const context = await getFaceHandoffContext({ token: started.token, userId, sessionVersion: 0, req: phone.req });
    expect(context.numberChoices).toContain(started.matchNumber);
    expect(context.device).toBe("Chrome · Windows");
    // Tom-ийн шийдвэр: өөр сүлжээ ЗӨВШӨӨРӨГДӨНӨ, зөвхөн тэмдэглэгдэнэ.
    expect(context.differentNetwork).toBe(true);

    // Компьютер батлагдахаас өмнө proof авахгүй.
    expect((await claimFaceHandoff({ token: started.token, userId, sessionVersion: 0, faceGrantVersion: await grantOf(), req: desktop.req, res: desktop.res })).status).toBe("pending");
    expect(await hasValidFaceProof(desktop.req, userId, 0, await grantOf())).toBe(false);

    await assertHandoffApprovable({ token: started.token, userId, sessionVersion: 0, matchNumber: started.matchNumber, req: phone.req });
    await approveFaceHandoff({ token: started.token, userId, sessionVersion: 0, matchNumber: started.matchNumber, req: phone.req });

    // Утас өөрөө ямар ч proof авахгүй.
    expect(await hasValidFaceProof(phone.req, userId, 0, await grantOf())).toBe(false);

    const claimed = await claimFaceHandoff({ token: started.token, userId, sessionVersion: 0, faceGrantVersion: await grantOf(), req: desktop.req, res: desktop.res });
    expect(claimed.status).toBe("approved");
    expect(await hasValidFaceProof(desktop.req, userId, 0, await grantOf())).toBe(true);

    // Нэг удаагийн: дахин авах боломжгүй.
    expect((await claimFaceHandoff({ token: started.token, userId, sessionVersion: 0, faceGrantVersion: await grantOf(), req: desktop.req, res: desktop.res })).status).toBe("expired");
  });

  it("өөр хэрэглэгч контекстийг ч харахгүй, батлах ч боломжгүй", async () => {
    const desktop = fakeDevice();
    const started = await startFaceHandoff({ userId, sessionVersion: 0, req: desktop.req });
    const attacker = fakeDevice({ tab: "tab-attacker", ip: "198.51.100.66" });

    await expect(getFaceHandoffContext({ token: started.token, userId: otherUserId, sessionVersion: 0, req: attacker.req })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertHandoffApprovable({ token: started.token, userId: otherUserId, sessionVersion: 0, matchNumber: started.matchNumber, req: attacker.req })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("буруу тоо хүсэлтийг шууд хаана (дахин таах боломжгүй)", async () => {
    const desktop = fakeDevice();
    const phone = fakeDevice({ tab: "tab-phone", ip: "198.51.100.5" });
    const started = await startFaceHandoff({ userId, sessionVersion: 0, req: desktop.req });
    const wrong = started.matchNumber === 99 ? 10 : started.matchNumber + 1;

    await expect(assertHandoffApprovable({ token: started.token, userId, sessionVersion: 0, matchNumber: wrong, req: phone.req })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Зөв тоогоор ч дахин оролдох боломжгүй — хүсэлт хаагдсан.
    await expect(assertHandoffApprovable({ token: started.token, userId, sessionVersion: 0, matchNumber: started.matchNumber, req: phone.req })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await claimFaceHandoff({ token: started.token, userId, sessionVersion: 0, faceGrantVersion: await grantOf(), req: desktop.req, res: desktop.res })).status).toBe("denied");
  });

  it("өөр таб батлагдсан хүсэлтийг ашиглаж чадахгүй", async () => {
    const desktop = fakeDevice({ tab: "tab-original" });
    const phone = fakeDevice({ tab: "tab-phone", ip: "198.51.100.5" });
    const started = await startFaceHandoff({ userId, sessionVersion: 0, req: desktop.req });
    await approveFaceHandoff({ token: started.token, userId, sessionVersion: 0, matchNumber: started.matchNumber, req: phone.req });

    const otherTab = fakeDevice({ tab: "tab-different" });
    expect((await claimFaceHandoff({ token: started.token, userId, sessionVersion: 0, faceGrantVersion: await grantOf(), req: otherTab.req, res: otherTab.res })).status).toBe("expired");
    expect(await hasValidFaceProof(otherTab.req, userId, 0, await grantOf())).toBe(false);
  });

  it("нэвтрэлт шинэчлэгдвэл (sessionVersion) хүсэлт үхнэ", async () => {
    const desktop = fakeDevice();
    const phone = fakeDevice({ tab: "tab-phone", ip: "198.51.100.5" });
    const started = await startFaceHandoff({ userId, sessionVersion: 0, req: desktop.req });
    await expect(getFaceHandoffContext({ token: started.token, userId, sessionVersion: 1, req: phone.req })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await claimFaceHandoff({ token: started.token, userId, sessionVersion: 1, faceGrantVersion: await grantOf(), req: desktop.req, res: desktop.res })).status).toBe("expired");
  });

  it("шинэ QR гаргахад өмнөх хүлээгдэж буй хүсэлт хүчингүй болно", async () => {
    const desktop = fakeDevice();
    const first = await startFaceHandoff({ userId, sessionVersion: 0, req: desktop.req });
    const second = await startFaceHandoff({ userId, sessionVersion: 0, req: desktop.req });
    expect(second.token).not.toBe(first.token);
    expect((await claimFaceHandoff({ token: first.token, userId, sessionVersion: 0, faceGrantVersion: await grantOf(), req: desktop.req, res: desktop.res })).status).toBe("expired");
  });

  it("хугацаа дууссан хүсэлт батлагдахгүй", async () => {
    const db = await getDb();
    const desktop = fakeDevice();
    const phone = fakeDevice({ tab: "tab-phone", ip: "198.51.100.5" });
    const started = await startFaceHandoff({ userId, sessionVersion: 0, req: desktop.req });
    await db!.update(faceHandoffRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(faceHandoffRequests.userId, userId));
    await expect(getFaceHandoffContext({ token: started.token, userId, sessionVersion: 0, req: phone.req })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("'би биш' дарвал хүсэлт хаагдана", async () => {
    const desktop = fakeDevice();
    const started = await startFaceHandoff({ userId, sessionVersion: 0, req: desktop.req });
    await denyFaceHandoff({ token: started.token, userId });
    expect((await claimFaceHandoff({ token: started.token, userId, sessionVersion: 0, faceGrantVersion: await grantOf(), req: desktop.req, res: desktop.res })).status).toBe("denied");
  });

  it("хуучин мөрүүд цэвэрлэгддэг", async () => {
    const db = await getDb();
    const desktop = fakeDevice();
    await startFaceHandoff({ userId, sessionVersion: 0, req: desktop.req });
    await db!.update(faceHandoffRequests).set({ createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) }).where(eq(faceHandoffRequests.userId, userId));
    const purged = await purgeExpiredFaceHandoffs(24);
    expect(purged).toBeGreaterThan(0);
  });

  it("хөтчийн тайлбар нь User-Agent-ийг бүтнээр нь дамжуулдаггүй", () => {
    expect(describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15")).toBe("Safari · macOS");
    expect(describeUserAgent(undefined)).toBe("Тодорхойгүй хөтөч");
  });
});
