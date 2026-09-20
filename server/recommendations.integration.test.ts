import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { productCategories, products, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb, getRecommendedProducts } from "./db";
import { testSessionUser } from "./_test-helpers";
import { hashPassword } from "./_core/password";
import { explainPreferenceMatch } from "../shared/catalog-filter";
import type { TrpcContext } from "./_core/context";

/**
 * Санал болголт v3 (2026-09-20). getRecommendedProducts-д өмнө нь тест огт
 * байгаагүй — "профайлд арьс/үс/бие сонгосон ч санал буруу" гэдгийг ямар ч
 * автомат шалгалт барьдаггүй байв. Throwaway бараа + throwaway хэрэглэгч;
 * хөгжүүлэгчийн DB-д байгаа зүйлд НАЙДАХГҮЙ (2026-09-16-ны дүрэм).
 */
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function makeCaller(user: TrpcContext["user"]) {
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {}, ip: `203.0.114.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.114.1" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("recommendations v3 integration", () => {
  const marker = `reco-test-${Date.now()}`;
  let categoryId = 0;
  let bodyCategoryId = 0;
  let dryUserId = 0;
  let bodyUserId = 0;
  const productIds: number[] = [];
  const named: Record<string, number> = {};

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required.");
    const skin = await db.insert(productCategories).values({ name: `Reco skin ${marker}`, slug: `${marker}-skin`, sortOrder: 99998, isActive: true });
    categoryId = Number(skin[0].insertId);
    const body = await db.insert(productCategories).values({ name: `Reco body ${marker}`, slug: `${marker}-body`, sortOrder: 99999, isActive: true });
    bodyCategoryId = Number(body[0].insertId);

    const rows: Array<{ key: string; name: string; categoryId: number; skinTypes?: string; skinConcerns?: string; productType?: string; bodySkinType?: "dry" | "normal" | "sensitive"; bodyConcerns?: string; kind?: "physical" | "gift_card"; brand?: string }> = [
      { key: "dryCream", name: "Dry Cream", categoryId, skinTypes: "dry,normal", skinConcerns: "dryness", productType: "cream", brand: "A" },
      { key: "dryCream2", name: "Dry Cream 2", categoryId, skinTypes: "dry", skinConcerns: "dryness", productType: "cream", brand: "B" },
      { key: "dryCream3", name: "Dry Cream 3", categoryId, skinTypes: "dry", productType: "cream", brand: "C" },
      { key: "dryCleanser", name: "Dry Cleanser", categoryId, skinTypes: "dry,normal,combination", productType: "cleanser", brand: "A" },
      { key: "drySerum", name: "Dry Serum", categoryId, skinTypes: "dry", skinConcerns: "dryness,aging", productType: "serum", brand: "B" },
      { key: "oilyWash", name: "Oily Wash", categoryId, skinTypes: "oily,combination", skinConcerns: "acne", productType: "cleanser", brand: "C" },
      { key: "allToner", name: "All Toner", categoryId, skinTypes: "all", productType: "toner", brand: "D" },
      { key: "giftCard", name: "Gift Card", categoryId, skinTypes: "dry", kind: "gift_card", brand: "E" },
      { key: "bodyLotion", name: "Body Lotion Dry", categoryId: bodyCategoryId, bodySkinType: "dry", bodyConcerns: "dryness,relaxation,kids_safe", productType: "body_lotion", brand: "F" },
      { key: "bodyWash", name: "Body Wash Sensitive", categoryId: bodyCategoryId, bodySkinType: "sensitive", productType: "body_wash", brand: "F" },
    ];
    for (const row of rows) {
      const inserted = await db.insert(products).values({
        categoryId: row.categoryId, name: `${row.name} ${marker}`, slug: `${marker}-${row.key}`, sku: `${marker}-${row.key}`,
        priceMnt: 20_000, stockQuantity: 5, isPublished: true, kind: row.kind ?? "physical", brand: row.brand ?? null,
        skinTypes: row.skinTypes ?? null, skinConcerns: row.skinConcerns ?? null, productType: row.productType ?? null,
        bodySkinType: row.bodySkinType ?? null, bodyConcerns: row.bodyConcerns ?? null,
      });
      const id = Number(inserted[0].insertId);
      productIds.push(id);
      named[row.key] = id;
    }

    const passwordHash = await hashPassword("Passw0rd!123");
    const dryUser = await db.insert(users).values({ email: `${marker}-dry@example.test`, passwordHash, name: "Dry", role: "user", skinType: "dry", skinConcerns: "dryness,aging" });
    dryUserId = Number(dryUser[0].insertId);
    const bodyUser = await db.insert(users).values({ email: `${marker}-body@example.test`, passwordHash, name: "Body", role: "user", bodySkinType: "dry", bodyConcerns: "dryness,relaxation,kids_safe" });
    bodyUserId = Number(bodyUser[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (productIds.length) await db.delete(products).where(inArray(products.id, productIds));
    for (const id of [categoryId, bodyCategoryId]) if (id) await db.delete(productCategories).where(eq(productCategories.id, id));
    for (const id of [dryUserId, bodyUserId]) if (id) await db.delete(users).where(eq(users.id, id));
  });

  // Бодит каталогийн (984 бараа, одоо tag-тай) бараанууд ч оноо авдаг тул
  // limit-ийг том авч, ЗӨВХӨН өөрсдийн throwaway мөрүүдийн харьцангуй байрлалыг
  // шалгана; нэг ангиллаас дээд тал нь 3 (reco-max-per-category) гардаг.
  it("ranks products matching the shopper's skin type and concerns first, with reasons", async () => {
    const results = await getRecommendedProducts(dryUserId, 40, true);
    const ids = results.map(product => product.id);
    const ours = results.filter(product => productIds.includes(product.id));
    expect(ours.length).toBeGreaterThanOrEqual(3);
    // The serum matches skin type + both concerns -> top among our rows.
    expect(ours[0].id).toBe(named.drySerum);
    expect((ours[0] as { reasons?: string[] }).reasons).toEqual(expect.arrayContaining(["Хуурай арьсанд", "Хуурайшилт"]));
    // Oily-only wash never appears for a dry shopper; gift card never appears.
    expect(ids).not.toContain(named.oilyWash);
    expect(ids).not.toContain(named.giftCard);
  });

  it("caps one product type so the rail looks like a routine, not eight creams", async () => {
    const results = await getRecommendedProducts(dryUserId, 8, true);
    const ourCreams = results.filter(product => [named.dryCream, named.dryCream2, named.dryCream3].includes(product.id));
    expect(ourCreams.length).toBeLessThanOrEqual(2);
  });

  it("gives 'all skin types' products a small score, below an exact match", async () => {
    const preferences = { skinType: "dry" };
    const exact = explainPreferenceMatch({ id: 1, skinTypes: "dry,normal,combination", productType: "cleanser" }, preferences);
    const all = explainPreferenceMatch({ id: 2, skinTypes: "all", productType: "toner" }, preferences);
    expect(all.score).toBeGreaterThan(0);
    expect(all.score).toBeLessThan(exact.score);
    expect(exact.reasons).toContain("Хуурай арьсанд");
    expect(all.reasons).toEqual([]);
  });

  // Гурван зорилго бүгд таарах тул (3 + 1.5 + 1.2 + 1.0) бодит каталогийн аль ч
  // биеийн бараанаас өндөр оноотой — төрлийн хязгаар (2/төрөл) үүнийг хасахгүй.
  it("uses the body-care profile: a body-only shopper gets body products, not face creams", async () => {
    const results = await getRecommendedProducts(bodyUserId, 40, true);
    const ours = results.filter(product => productIds.includes(product.id));
    expect(ours.map(product => product.id)).toContain(named.bodyLotion);
    expect(ours.map(product => product.id)).not.toContain(named.bodyWash); // sensitive ≠ dry
    expect((ours.find(product => product.id === named.bodyLotion) as { reasons?: string[] })?.reasons).toContain("Хуурай биеийн арьсанд");
  });

  it("personalOnly returns nothing for a shopper with no profile and no history", async () => {
    const db = await getDb();
    const blank = await db!.insert(users).values({ email: `${marker}-blank@example.test`, passwordHash: await hashPassword("Passw0rd!123"), name: "Blank", role: "user" });
    const blankId = Number(blank[0].insertId);
    try {
      expect(await getRecommendedProducts(blankId, 8, true)).toEqual([]);
    } finally {
      await db!.delete(users).where(eq(users.id, blankId));
    }
  });

  it("the tRPC procedure carries reasons through to the client", async () => {
    const caller = makeCaller(testSessionUser({ id: dryUserId, skinType: "dry", skinConcerns: "dryness,aging" }));
    const results = await caller.catalog.recommended({ personalOnly: true });
    const serum = results.find(product => product.id === named.drySerum) as { reasons?: string[] } | undefined;
    expect(serum?.reasons?.length).toBeGreaterThan(0);
  });
});
