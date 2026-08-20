import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { userAddresses, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// Customer profile page (name/phone/avatar + saved address book). Opt-in
// against a real database, same convention as
// auth.account-recovery.integration.test.ts and commerce.database.integration.test.ts.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" ? describe : describe.skip;

// A tiny valid 1x1 PNG, same fixture other admin upload tests already use —
// enough to pass assertImageSignature without shipping a real binary fixture.
const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

function makeCaller(user: TrpcContext["user"]) {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `127.0.0.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "127.0.0.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("customer profile integration", () => {
  const marker = `profile-test-${Date.now()}`;
  let userId = 0;
  let otherUserId = 0;
  let sessionUser: TrpcContext["user"];
  let otherSessionUser: TrpcContext["user"];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for profile integration tests.");
    const inserted = await db.insert(users).values({
      email: `${marker}@example.invalid`,
      passwordHash: await hashPassword("Passw0rd!123"),
      name: "Profile Test User",
      role: "user",
      emailVerifiedAt: new Date(),
    });
    userId = Number(inserted[0].insertId);
    sessionUser = { id: userId, email: `${marker}@example.invalid`, name: "Profile Test User", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, phone: null, avatarUrl: null, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

    const insertedOther = await db.insert(users).values({
      email: `${marker}-other@example.invalid`,
      passwordHash: await hashPassword("Passw0rd!123"),
      name: "Other Test User",
      role: "user",
      emailVerifiedAt: new Date(),
    });
    otherUserId = Number(insertedOther[0].insertId);
    otherSessionUser = { ...sessionUser, id: otherUserId, email: `${marker}-other@example.invalid`, name: "Other Test User" };
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of [userId, otherUserId]) {
      if (!id) continue;
      await db.delete(userAddresses).where(eq(userAddresses.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("rejects anonymous access to every profile procedure", async () => {
    const caller = makeCaller(null);
    await expect(caller.profile.update({ name: "Nope" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.addresses.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.addresses.create({ label: "Гэр", recipientName: "Test", phone: "99001122", addressLine: "Test address line" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("updates name and phone, leaving email/role untouched", async () => {
    const caller = makeCaller(sessionUser);
    const updated = await caller.profile.update({ name: "Шинэ Нэр", phone: "99112233" });
    expect(updated.name).toBe("Шинэ Нэр");
    expect(updated.phone).toBe("99112233");
    expect(updated.email).toBe(sessionUser!.email);
    expect(updated.role).toBe("user");
    expect((updated as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it("uploads and removes an avatar", async () => {
    const caller = makeCaller(sessionUser);
    const uploaded = await caller.profile.uploadAvatar({ fileName: "me.png", contentType: "image/png", dataBase64: TINY_PNG_BASE64 });
    expect(uploaded.avatarUrl).toBeTruthy();

    const removed = await caller.profile.removeAvatar();
    expect(removed.avatarUrl).toBeNull();
  });

  it("makes the first saved address the default automatically, then lets a second default swap it", async () => {
    const caller = makeCaller(sessionUser);
    const first = await caller.profile.addresses.create({ label: "Гэр", recipientName: "Батаа", phone: "99001122", addressLine: "1-р хороо, 10-р байр" });
    expect(first.isDefault).toBe(true);

    const second = await caller.profile.addresses.create({ label: "Ажил", recipientName: "Батаа", phone: "99003344", addressLine: "Сүхбаатар дүүрэг, оффис" });
    expect(second.isDefault).toBe(false);

    const list = await caller.profile.addresses.list();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(first.id); // default sorts first

    const promoted = await caller.profile.addresses.update({ id: second.id, isDefault: true });
    expect(promoted.isDefault).toBe(true);
    const listAfter = await caller.profile.addresses.list();
    expect(listAfter.find(item => item.id === first.id)?.isDefault).toBe(false);
    expect(listAfter.find(item => item.id === second.id)?.isDefault).toBe(true);
  });

  it("promotes the next address to default when the default one is deleted", async () => {
    const caller = makeCaller(sessionUser);
    const list = await caller.profile.addresses.list();
    const defaultAddress = list.find(item => item.isDefault)!;
    await caller.profile.addresses.delete({ id: defaultAddress.id });
    const remaining = await caller.profile.addresses.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isDefault).toBe(true);
  });

  it("never lets one user read, edit, or delete another user's address", async () => {
    const owner = makeCaller(sessionUser);
    const intruder = makeCaller(otherSessionUser);
    const mine = await owner.profile.addresses.list();
    const targetId = mine[0].id;

    const intruderList = await intruder.profile.addresses.list();
    expect(intruderList.find(item => item.id === targetId)).toBeUndefined();

    await expect(intruder.profile.addresses.update({ id: targetId, label: "Hijacked" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(intruder.profile.addresses.delete({ id: targetId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
