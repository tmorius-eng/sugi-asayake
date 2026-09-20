import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { productCategories, products } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb, invalidateCatalogSource } from "./db";
import { invalidateSearchDictionaries } from "./search/dictionaries";
import type { TrpcContext } from "./_core/context";

// Хайлт v3 (2026-09-20): процесс доторх индекс (server/search/catalogSearch.ts).
// Opt-in against a real database, same convention as
// commerce.database.integration.test.ts. 2026-08-25-ны FULLTEXT-ийн 6 case
// хэвээр + typo/кирилл/галиг/брэндийн санал — Tom-ийн бодит гомдлууд.
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function makeCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {}, ip: `203.0.113.${Math.floor(Math.random() * 250) + 1}`, socket: { remoteAddress: "203.0.113.9" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("catalog search integration (in-process index)", () => {
  const marker = `search-test-${Date.now()}`;
  let categoryId = 0;
  let melanoId = 0;
  let hadaLaboId = 0;
  let unpublishedId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for catalog search integration tests.");

    const categoryResult = await db.insert(productCategories).values({
      name: "Search test category",
      slug: `${marker}-category`,
      sortOrder: 99999,
      isActive: true,
    });
    categoryId = Number(categoryResult[0].insertId);

    const melano = await db.insert(products).values({
      categoryId, name: `Rohto Melano CC Essence ${marker}`, brand: "Rohto", slug: `${marker}-melano`, sku: `${marker}-SKU-1`,
      priceMnt: 45_000, stockQuantity: 10, isPublished: true, shortDescription: "Витамин C агуулсан тос", nameMn: "Рохто Мелано витамин C эссенц",
    });
    melanoId = Number(melano[0].insertId);

    const hadaLabo = await db.insert(products).values({
      categoryId, name: `Hada Labo Gokujyun Lotion ${marker}`, brand: "Hada Labo", slug: `${marker}-hadalabo`, sku: `${marker}-SKU-2`,
      priceMnt: 32_000, stockQuantity: 5, isPublished: true, shortDescription: "Гиалурон хүчил чийгшүүлэгч лосьон",
    });
    hadaLaboId = Number(hadaLabo[0].insertId);

    const unpublished = await db.insert(products).values({
      categoryId, name: `Rohto Hidden Product ${marker}`, brand: "Rohto", slug: `${marker}-hidden`, sku: `${marker}-SKU-3`,
      priceMnt: 20_000, stockQuantity: 3, isPublished: false, shortDescription: "Нийтлэгдээгүй туршилтын бараа",
    });
    unpublishedId = Number(unpublished[0].insertId);

    // Индекс каталогийн кэшээс баригддаг — шууд DB бичилт (энэ тест) admin-ий
    // бичигчийн замаар явдаггүй тул түлхүүрийг өөрсдөө унагаана. Хуучин
    // FULLTEXT-ийн OPTIMIZE TABLE-ийн хэрэгцээ алга.
    invalidateCatalogSource();
    invalidateSearchDictionaries();
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of [melanoId, hadaLaboId, unpublishedId]) {
      if (id) await db.delete(products).where(eq(products.id, id));
    }
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
    invalidateCatalogSource();
  });

  it("matches on brand name and ranks results without pulling in unrelated products", async () => {
    const results = await makeCaller().catalog.search({ query: "Rohto" });
    const ids = results.map(item => item.id);
    expect(ids).toContain(melanoId);
    expect(ids).not.toContain(hadaLaboId);
  });

  it("matches on a word from the product name, not just the brand", async () => {
    const results = await makeCaller().catalog.search({ query: "Gokujyun" });
    expect(results.map(item => item.id)).toEqual([hadaLaboId]);
  });

  it("matches Mongolian (Cyrillic) words from the short description", async () => {
    const results = await makeCaller().catalog.search({ query: "чийгшүүлэгч" });
    expect(results.map(item => item.id)).toContain(hadaLaboId);
  });

  it("never returns an unpublished product, even when its name matches", async () => {
    const results = await makeCaller().catalog.search({ query: "Hidden" });
    expect(results.map(item => item.id)).not.toContain(unpublishedId);
  });

  it("returns nothing for a query that matches no product", async () => {
    const results = await makeCaller().catalog.search({ query: "zzznonexistentquery" });
    expect(results).toEqual([]);
  });

  it("rejects a query shorter than 2 characters at the input-validation level", async () => {
    await expect(makeCaller().catalog.search({ query: "a" })).rejects.toThrow();
  });

  // ---- v3 (2026-09-20) ----------------------------------------------------
  it("tolerates a typo in a brand and a Cyrillic spelling of a Latin brand", async () => {
    expect((await makeCaller().catalog.search({ query: "Rohtoo" })).map(item => item.id)).toContain(melanoId);
    expect((await makeCaller().catalog.search({ query: "рохто" })).map(item => item.id)).toContain(melanoId);
    expect((await makeCaller().catalog.search({ query: "хада лабо" })).map(item => item.id)).toContain(hadaLaboId);
  });

  it("searches the Mongolian name and ships it in the row", async () => {
    const results = await makeCaller().catalog.search({ query: "мелано" });
    const melano = results.find(item => item.id === melanoId);
    expect(melano?.nameMn).toBe("Рохто Мелано витамин C эссенц");
  });

  it("finds a product by its barcode/sku exactly", async () => {
    const db = await getDb();
    await db!.update(products).set({ sku: "4909999000011" }).where(eq(products.id, melanoId));
    invalidateCatalogSource();
    const results = await makeCaller().catalog.search({ query: "4909999000011" });
    expect(results.map(item => item.id)).toEqual([melanoId]);
  });

  it("suggest returns brand matches and a small product list for the header box", async () => {
    const suggestion = await makeCaller().catalog.suggest({ query: "hada lab" });
    expect(suggestion.products.length).toBeGreaterThan(0);
    expect(suggestion.products.length).toBeLessThanOrEqual(6);
    expect(suggestion.brandMatches.map(match => match.brand)).toContain("Hada Labo");
    expect(suggestion.resultCount).toBeGreaterThanOrEqual(1);
  });

  it("a brand-new product is searchable immediately after the catalog cache is invalidated", async () => {
    const db = await getDb();
    const inserted = await db!.insert(products).values({
      categoryId, name: `Fresh Zinnia Mist ${marker}`, brand: "Zinnia", slug: `${marker}-fresh`, sku: `${marker}-SKU-4`,
      priceMnt: 10_000, stockQuantity: 1, isPublished: true, shortDescription: "Шинэ бараа",
    });
    const freshId = Number(inserted[0].insertId);
    try {
      invalidateCatalogSource();
      const results = await makeCaller().catalog.search({ query: "zinnia" });
      expect(results.map(item => item.id)).toContain(freshId);
    } finally {
      await db!.delete(products).where(eq(products.id, freshId));
      invalidateCatalogSource();
    }
  });
});
