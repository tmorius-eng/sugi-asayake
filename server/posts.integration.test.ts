import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminAuditLogs, mediaLibrary, postCategories, postCategoryLinks, posts, postTagLinks, postTags, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";

// 2026-09-07: WordPress-classic-editor-parity admin Posts rebuild --
// categories/tags taxonomy, trash/restore/permanent-delete, scheduling
// (publishedAt <= NOW() gate, no cron), server-side HTML sanitization (the
// TinyMCE "Text" tab lets a staffer type raw HTML directly, so this is the
// real trust boundary), and the new media library. Same three-gate
// combination as discount-codes/site-media integration tests, since this
// file's scope spans both plain DB CRUD and a real R2 image upload.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" && process.env.RUN_MEDIA_INTEGRATION_TESTS === "1" ? describe : describe.skip;

// Real, sharp-decodable 4x4 PNG (reused verbatim from site-media.integration.test.ts) --
// a fixture that merely "looks like" a valid PNG header fails at the real
// sharp decode step even though it'd pass a magic-byte check alone.
const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWM4IWf0HxkzkC4AAGuYIXGU5TmSAAAAAElFTkSuQmCC";

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.118.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.118.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("WordPress-parity post editor integration", () => {
  const marker = `post-test-${Date.now()}`;
  const staffEmail = `${marker}-staff@example.invalid`;
  const shopperEmail = `${marker}-shopper@example.invalid`;
  let staffId = 0;
  let shopperId = 0;
  const createdPostIds: number[] = [];
  const createdCategoryIds: number[] = [];

  async function seedUsers() {
    if (staffId) return;
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for post editor integration tests.");
    const staffInsert = await db.insert(users).values({ email: staffEmail, passwordHash: await hashPassword("StaffPassw0rd!"), name: "Post Test Staff", role: "staff", emailVerifiedAt: new Date() });
    staffId = Number(staffInsert[0].insertId);
    const shopperInsert = await db.insert(users).values({ email: shopperEmail, passwordHash: await hashPassword("ShopperPassw0rd!"), name: "Post Test Shopper", role: "user", emailVerifiedAt: new Date() });
    shopperId = Number(shopperInsert[0].insertId);
  }

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of createdPostIds) {
      await db.delete(postCategoryLinks).where(eq(postCategoryLinks.postId, id));
      await db.delete(postTagLinks).where(eq(postTagLinks.postId, id));
      await db.delete(posts).where(eq(posts.id, id));
    }
    for (const id of createdCategoryIds) await db.delete(postCategories).where(eq(postCategories.id, id));
    await db.delete(postTags).where(eq(postTags.name, `${marker}-tag`));
    await db.delete(mediaLibrary).where(eq(mediaLibrary.uploadedByUserId, staffId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, staffId));
    if (staffId) await db.delete(users).where(eq(users.id, staffId));
    if (shopperId) await db.delete(users).where(eq(users.id, shopperId));
  });

  function staff() {
    return callerFor({ id: staffId, email: staffEmail, name: "Post Test Staff", role: "staff", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }
  function shopper() {
    return callerFor({ id: shopperId, email: shopperEmail, name: "Post Test Shopper", role: "user", emailVerifiedAt: new Date(), sessionVersion: 0, suspendedAt: null, suspendedReason: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
  }
  function guest() {
    return callerFor(null);
  }

  it("rejects a non-staff user from creating a post", async () => {
    await seedUsers();
    await expect(shopper().admin.createPost({
      title: `${marker} forbidden`, slug: `${marker}-forbidden`, content: "Should never be created.", isPublished: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("attaches categories and tags on create, and replaces (not merges) them on update", async () => {
    await seedUsers();
    const category = await staff().admin.createPostCategory({ name: `${marker}-category` });
    createdCategoryIds.push(category.id);

    const created = await staff().admin.createPost({
      title: `${marker} taxonomy`, slug: `${marker}-taxonomy`, content: "Real content for the taxonomy test.", isPublished: false,
      categoryIds: [category.id], tagNames: [`${marker}-tag`, "extra-tag-to-drop"],
    });
    createdPostIds.push(created.id);
    expect(created.categories.map(c => c.name)).toEqual([category.name]);
    expect(created.tags.map(t => t.name).sort()).toEqual([`${marker}-tag`, "extra-tag-to-drop"].sort());

    // Replaces the tag set entirely -- "extra-tag-to-drop" must be gone, not merged with.
    const updated = await staff().admin.updatePost({ id: created.id, tagNames: [`${marker}-tag`] });
    expect(updated.tags.map(t => t.name)).toEqual([`${marker}-tag`]);
    expect(updated.categories.map(c => c.name)).toEqual([category.name]); // untouched field stays as-is
  });

  it("sanitizes submitted HTML server-side, stripping a <script> tag while keeping safe markup", async () => {
    await seedUsers();
    const created = await staff().admin.createPost({
      title: `${marker} sanitize`, slug: `${marker}-sanitize`, isPublished: false,
      content: "<p>Safe <strong>bold</strong> text.</p><script>alert(1)</script><img src=\"/cdn/x.webp\" onerror=\"alert(2)\">",
    });
    createdPostIds.push(created.id);
    expect(created.content).toContain("<strong>bold</strong>");
    expect(created.content).not.toContain("<script");
    expect(created.content).not.toContain("alert(1)");
    expect(created.content).not.toContain("onerror");
    expect(created.content).toContain('src="/cdn/x.webp"');
  });

  it("gates a scheduled post from the public query but lets staff preview it, and it goes live once its date passes", async () => {
    await seedUsers();
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const created = await staff().admin.createPost({
      title: `${marker} scheduled`, slug: `${marker}-scheduled`, content: "Scheduled content.", isPublished: true, publishAt: future,
    });
    createdPostIds.push(created.id);

    await expect(guest().content.bySlug({ slug: created.slug })).resolves.toBeNull();
    await expect(staff().content.bySlug({ slug: created.slug })).resolves.toMatchObject({ slug: created.slug });

    // Backdate it (simulating the scheduled moment having passed) -- no
    // cron/worker involved, the public query's own `publishedAt <= NOW()`
    // gate is the entire mechanism.
    await staff().admin.updatePost({ id: created.id, publishAt: new Date(Date.now() - 1000) });
    await expect(guest().content.bySlug({ slug: created.slug })).resolves.toMatchObject({ slug: created.slug });
  });

  it("trash hides a post from the public query even for staff preview; restore brings it back; permanent delete only works once trashed", async () => {
    await seedUsers();
    const created = await staff().admin.createPost({
      title: `${marker} trash`, slug: `${marker}-trash`, content: "Trash-flow content.", isPublished: true,
    });
    createdPostIds.push(created.id);

    await expect(staff().admin.permanentlyDeletePost({ id: created.id })).rejects.toThrow();

    await staff().admin.trashPost({ id: created.id });
    await expect(guest().content.bySlug({ slug: created.slug })).resolves.toBeNull();
    await expect(staff().content.bySlug({ slug: created.slug })).resolves.toBeNull(); // deletedAt gate always applies, even to the preview bypass

    await staff().admin.restorePost({ id: created.id });
    await expect(guest().content.bySlug({ slug: created.slug })).resolves.toMatchObject({ slug: created.slug });

    await staff().admin.trashPost({ id: created.id });
    await staff().admin.permanentlyDeletePost({ id: created.id });
    createdPostIds.splice(createdPostIds.indexOf(created.id), 1); // already gone, afterAll shouldn't re-delete it
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for post editor integration tests.");
    await expect(db.select().from(posts).where(eq(posts.id, created.id))).resolves.toEqual([]);
  });

  it("uploadMedia stores a real R2 object and records it in the media library list", async () => {
    await seedUsers();
    const uploaded = await staff().admin.uploadMedia({ fileName: `${marker}-media.png`, contentType: "image/png", dataBase64: onePixelPng });
    expect(uploaded.url).toContain("media");

    const library = await staff().admin.mediaLibrary({ page: 1 });
    expect(library.items.some(item => item.id === uploaded.id)).toBe(true);

    const filtered = await staff().admin.mediaLibrary({ page: 1, search: marker });
    expect(filtered.items.map(item => item.id)).toEqual([uploaded.id]);
  });
});
