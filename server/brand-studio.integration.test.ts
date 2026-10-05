import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { adminAuditLogs, siteLayouts, siteText, siteThemeVersions, siteThemes, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getActiveThemeBundle, getDb, getHomeLayout, invalidateThemeCache } from "./db";
import { invalidateCached } from "./_core/ttlCache";
import { testSessionUser } from "./_test-helpers";
import { hashPassword } from "./_core/password";
import type { TrpcContext } from "./_core/context";
import { HOLIDAY_PALETTES } from "../shared/holiday-palettes";
import { HOLIDAY_POSTER_VERSION } from "../shared/holidays";

// Брэнд студи (2026-10-05): хадгалах → AA хамгаалалт → хувилбар → сэргээх → баярын идэвхжилт.
// site_themes бол админы бодит тохиргоо тул snapshot-and-restore (PROJECT-GUIDE): тест эхлэхээс
// өмнөх мөрийг хадгалж, дараа нь яг буцааж тавина.
const describeWithDatabase = process.env.RUN_AUTH_INTEGRATION_TESTS === "1" && process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function callerFor(user: TrpcContext["user"]): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.143.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.143.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

const KEY = "independence-day";

describeWithDatabase("Брэнд студи — хадгалах, AA, түүх, баяр", () => {
  const marker = `bst${Date.now().toString(36)}`;
  let adminId = 0;
  let snapshot: { theme: typeof siteThemes.$inferSelect; versions: Array<typeof siteThemeVersions.$inferSelect> } | null = null;
  const admin = () => callerFor(testSessionUser({ id: adminId, email: `${marker}@example.invalid`, name: "Brand Studio Admin", role: "admin" }));

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    adminId = Number((await db.insert(users).values({ email: `${marker}@example.invalid`, passwordHash: await hashPassword("BrandPassw0rd!"), name: "Brand Studio Admin", role: "admin", emailVerifiedAt: new Date() }))[0].insertId);
    const [existing] = await db.select().from(siteThemes).where(eq(siteThemes.themeKey, KEY)).limit(1);
    if (existing) snapshot = { theme: existing, versions: await db.select().from(siteThemeVersions).where(eq(siteThemeVersions.themeId, existing.id)) };
    if (existing) await db.delete(siteThemes).where(eq(siteThemes.id, existing.id)); // versions cascade
    invalidateThemeCache();
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const [mine] = await db.select({ id: siteThemes.id }).from(siteThemes).where(eq(siteThemes.themeKey, KEY)).limit(1);
    if (mine) await db.delete(siteThemes).where(eq(siteThemes.id, mine.id));
    if (snapshot) {
      await db.insert(siteThemes).values(snapshot.theme);
      if (snapshot.versions.length) await db.insert(siteThemeVersions).values(snapshot.versions);
    }
    if (adminId) {
      await db.delete(adminAuditLogs).where(eq(adminAuditLogs.actorUserId, adminId));
      await db.delete(users).where(inArray(users.id, [adminId]));
    }
    invalidateThemeCache();
  });

  it("унших боломжгүй өнгийг серверт ч хадгалуулахгүй", async () => {
    await expect(admin().admin.brandStudio.save({ themeKey: KEY, look: { light: { "primary-foreground": "#f5a0a8" } } }))
      .rejects.toThrow(/Унших боломжгүй/);
    await expect(admin().admin.brandStudio.save({ themeKey: "no-such-theme", look: {} })).rejects.toThrow(/Ийм загвар байхгүй/);
  });

  it("баярын загвар хадгалагдаж, хувилбар үлдэж, сэргээгдэнэ", async () => {
    const palette = HOLIDAY_PALETTES[KEY].palette;
    await admin().admin.brandStudio.save({ themeKey: KEY, look: { light: palette }, holiday: { enabled: false }, greeting: "" });
    let overview = await admin().admin.brandStudio.overview();
    let row = overview.holidays.find(h => h.key === KEY)!;
    expect((row.look as { light?: Record<string, string> }).light?.primary).toBe(palette.primary);
    expect(row.settings.enabled).toBe(false);

    // Унтраалттай үед тэр өдөр ч үндсэн загвар.
    invalidateThemeCache();
    expect((await getActiveThemeBundle("2026-12-28")).activeKey).not.toBe(KEY);

    await admin().admin.brandStudio.save({ themeKey: KEY, look: { light: { ...palette, primary: "#0a3a8a" } }, holiday: { enabled: true } });
    invalidateThemeCache();
    const bundle = await getActiveThemeBundle("2026-12-28");
    expect(bundle.activeKey).toBe(KEY);
    expect(bundle.reason).toBe("holiday");
    expect(bundle.look.light.primary).toBe("#0a3a8a");
    expect(bundle.greeting).toBeNull(); // "" хадгалсан = мэндчилгээгүй
    expect(bundle.poster).toBe(`/cdn/themes/holidays/${HOLIDAY_POSTER_VERSION}/${KEY}.webp`);

    const versions = await admin().admin.brandStudio.versions({ themeKey: KEY });
    expect(versions.length).toBeGreaterThanOrEqual(1);
    await admin().admin.brandStudio.rollback({ themeKey: KEY, version: versions[versions.length - 1].version });
    overview = await admin().admin.brandStudio.overview();
    row = overview.holidays.find(h => h.key === KEY)!;
    expect((row.look as { light?: Record<string, string> }).light?.primary).toBe(palette.primary);
    expect(row.settings.enabled).toBe(false); // v1 үед унтраалттай байсан — сэргээхэд ч унтраалттай

    // Баярын чимэглэл (A4): хадгалсан эффект/хээ идэвхтэй баярт гарна, үндсэн загварт үргэлж none.
    await admin().admin.brandStudio.save({ themeKey: KEY, effect: "snow", ornament: "alkhan", holiday: { enabled: true } });
    invalidateThemeCache();
    const decorated = await getActiveThemeBundle("2026-12-28");
    expect([decorated.effect, decorated.ornament]).toEqual(["snow", "alkhan"]);
    expect((await getActiveThemeBundle("2026-08-01")).effect).toBe("none");

    // null = анхдагч мэндчилгээ руу буцаах.
    await admin().admin.brandStudio.save({ themeKey: KEY, greeting: null, holiday: { enabled: true } });
    invalidateThemeCache();
    expect((await getActiveThemeBundle("2026-12-28")).greeting).toMatch(/тусгаар тогтнол/i);
  });

  it("marketing эрх нээгдэнэ, энгийн хэрэглэгчид хаалттай", async () => {
    const user = callerFor(testSessionUser({ id: adminId, email: `${marker}@example.invalid`, name: "x", role: "user" }));
    await expect(user.admin.brandStudio.overview()).rejects.toThrow();
  });

  it("нүүрний бүтэц хадгалагдаж цэвэрлэгдэнэ (snapshot-and-restore)", async () => {
    const db = (await getDb())!;
    const [before] = await db.select().from(siteLayouts).where(eq(siteLayouts.pageKey, "home")).limit(1);
    try {
      const saved = await admin().admin.brandStudio.saveHomeLayout({ sections: [
        { key: "stores", visible: true, variant: "default" },
        { key: "editorial", visible: true, variant: "image-right" },
        { key: "categories", visible: false, variant: "default" },
        { key: "hero", visible: false, variant: "default" },
      ] });
      expect(saved.slice(0, 3).map(s => `${s.visible ? "" : "-"}${s.key}:${s.variant}`)).toEqual(["stores:default", "editorial:image-right", "-categories:default"]);
      expect(saved.some(s => (s.key as string) === "hero")).toBe(false);
      expect((await getHomeLayout())[0].key).toBe("stores");
    } finally {
      if (before) await db.update(siteLayouts).set({ sectionsJson: before.sectionsJson, updatedByUserId: before.updatedByUserId }).where(eq(siteLayouts.id, before.id));
      else await db.delete(siteLayouts).where(eq(siteLayouts.pageKey, "home"));
      invalidateCached("storefront:layout:home");
    }
  });

  it("брэнд багц: харагдах тохиргоо л, нууц мэдээлэлгүй", async () => {
    const pack = await admin().admin.brandStudio.exportPack();
    expect(pack.format).toBe("brand-pack.v1");
    expect(pack.homeLayout.length).toBeGreaterThan(0);
    expect(Object.keys(pack).sort()).toEqual(["exportedAt", "format", "homeLayout", "siteMedia", "siteText", "themes"]);
    const json = JSON.stringify(pack);
    expect(json).not.toMatch(/passwordHash|apiKey|secret|clientSecret|INTEGRATIONS_ENCRYPTION/i);
  });

  it("брэнд багц импорт: мэдэгдэх slot л, AA унасан загварыг алгасна (snapshot-and-restore)", async () => {
    const db = (await getDb())!;
    const [before] = await db.select().from(siteText).where(eq(siteText.slotKey, "brand-text-short-name")).limit(1);
    const [layoutBefore] = await db.select().from(siteLayouts).where(eq(siteLayouts.pageKey, "home")).limit(1);
    try {
      const result = await admin().admin.brandStudio.importPack({
        format: "brand-pack.v1",
        themes: [{ themeKey: KEY, look: { light: { "primary-foreground": "#f5a0a8" } } }, { themeKey: "evil-theme", look: {} }],
        homeLayout: [],
        siteText: [{ slotKey: "brand-text-short-name", textValue: `ТЕСТ ${marker}` }, { slotKey: "not-a-slot", textValue: "x" }],
        siteMedia: [{ slotKey: "home-hero", imageUrl: "javascript:alert(1)" }],
      });
      expect(result.texts).toBe(1);
      expect(result.media).toBe(0);
      expect(result.skipped).toEqual(expect.arrayContaining([`загвар ${KEY} (AA)`, "загвар evil-theme", "текст not-a-slot", "зураг home-hero"]));
      const [row] = await db.select().from(siteText).where(eq(siteText.slotKey, "brand-text-short-name")).limit(1);
      expect(row.textValue).toBe(`ТЕСТ ${marker}`);
      await expect(callerFor(testSessionUser({ id: adminId, email: `${marker}@example.invalid`, name: "m", role: "marketing" })).admin.brandStudio.importPack({ format: "brand-pack.v1", themes: [], homeLayout: [], siteText: [], siteMedia: [] })).rejects.toThrow();
    } finally {
      if (before) await db.update(siteText).set({ textValue: before.textValue, updatedByUserId: before.updatedByUserId }).where(eq(siteText.id, before.id));
      else await db.delete(siteText).where(eq(siteText.slotKey, "brand-text-short-name"));
      if (layoutBefore) await db.update(siteLayouts).set({ sectionsJson: layoutBefore.sectionsJson, updatedByUserId: layoutBefore.updatedByUserId }).where(eq(siteLayouts.id, layoutBefore.id));
      else await db.delete(siteLayouts).where(eq(siteLayouts.pageKey, "home"));
      invalidateCached("storefront:layout:home");
    }
  });
});

