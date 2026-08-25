import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { productCategories, products } from "../drizzle/schema";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";

// ROADMAP.md TIER 2: server-side catalog search (products_search_idx
// FULLTEXT index — drizzle/0027_catalog_fulltext_search.sql). Opt-in
// against a real database, same convention as
// commerce.database.integration.test.ts — a FULLTEXT index's actual
// matching behavior can only be verified against a real MySQL instance,
// not mocked.
const describeWithDatabase = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

function makeCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {}, ip: "203.0.113.9", socket: { remoteAddress: "203.0.113.9" } } as unknown as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describeWithDatabase("catalog full-text search integration", () => {
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
      priceMnt: 45_000, stockQuantity: 10, isPublished: true, shortDescription: "Витамин C агуулсан тос",
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
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const id of [melanoId, hadaLaboId, unpublishedId]) {
      if (id) await db.delete(products).where(eq(products.id, id));
    }
    if (categoryId) await db.delete(productCategories).where(eq(productCategories.id, categoryId));
  });

  it("matches on brand name and ranks results without pulling in unrelated products", async () => {
    const caller = makeCaller();
    const results = await caller.catalog.search({ query: "Rohto" });
    const ids = results.map(item => item.id);
    expect(ids).toContain(melanoId);
    expect(ids).not.toContain(hadaLaboId);
  });

  it("matches on a word from the product name, not just the brand", async () => {
    const caller = makeCaller();
    const results = await caller.catalog.search({ query: "Gokujyun" });
    expect(results.map(item => item.id)).toEqual([hadaLaboId]);
  });

  it("matches Mongolian (Cyrillic) words from the short description", async () => {
    const caller = makeCaller();
    const results = await caller.catalog.search({ query: "чийгшүүлэгч" });
    expect(results.map(item => item.id)).toContain(hadaLaboId);
  });

  it("never returns an unpublished product, even when its name matches", async () => {
    const caller = makeCaller();
    const results = await caller.catalog.search({ query: "Hidden" });
    expect(results.map(item => item.id)).not.toContain(unpublishedId);
  });

  it("returns nothing for a query that matches no product", async () => {
    const caller = makeCaller();
    const results = await caller.catalog.search({ query: "zzznonexistentquery" });
    expect(results).toEqual([]);
  });

  it("rejects a query shorter than 2 characters at the input-validation level", async () => {
    const caller = makeCaller();
    await expect(caller.catalog.search({ query: "a" })).rejects.toThrow();
  });
});
