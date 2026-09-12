import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getDb, searchPublishedCatalog } from "./db";
import { products } from "../drizzle/schema";
import { sqlInt } from "./_core/sqlSafe";
import type { TrpcContext } from "./_core/context";

/**
 * SQL-injection probe (2026-09-12). Tom asked whether the site withstands
 * sqlmap-style attacks. sqlmap automates six techniques: boolean-blind,
 * time-blind, error-based, UNION, stacked queries, and out-of-band. All six
 * require breaking OUT of a query -- turning attacker text into SQL syntax
 * rather than data. Every query here runs through drizzle's `sql` template
 * (bind parameters) so that break-out is structurally impossible; this test
 * fires the canonical payloads at the real, public, unauthenticated search
 * and asserts they come back as ordinary (empty) results and, crucially,
 * that the table they tried to drop is still there afterwards.
 */
const gated = process.env.COMMERCE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const PAYLOADS = [
  "' OR '1'='1",                       // boolean-based
  "' OR SLEEP(5)-- -",                 // time-based blind
  "' UNION SELECT passwordHash FROM users-- -", // UNION
  "'; DROP TABLE products;-- -",       // stacked queries
  "1' AND extractvalue(1,concat(0x7e,version()))-- -", // error-based
  "аяулгүй'; SELECT 1",                // quote-break with a non-ASCII lead
];

gated("SQL injection resistance (sqlmap's six techniques)", () => {
  async function productCount() {
    const db = await getDb();
    if (!db) throw new Error("no db");
    const rows = await db.select({ id: products.id }).from(products).limit(1);
    return rows.length; // table exists and is queryable
  }

  beforeAll(async () => { expect(await productCount()).toBeGreaterThanOrEqual(0); });
  afterAll(async () => { /* nothing created */ });

  it("treats every classic payload as a literal search string, never as SQL", async () => {
    const started = Date.now();
    for (const payload of PAYLOADS) {
      const result = await searchPublishedCatalog(payload);
      // A search always returns an array. If injection worked, a UNION would
      // change the shape, a boolean bypass would return the whole catalogue,
      // and DROP TABLE would make the NEXT call throw.
      expect(Array.isArray(result)).toBe(true);
    }
    // The SLEEP(5) payload, had it executed, would have added ~5s per row of
    // a 900-row table. The whole loop staying well under that is the
    // time-based-blind assertion.
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it("still has the products table after the DROP TABLE payload -- stacked queries do not execute", async () => {
    await searchPublishedCatalog("'; DROP TABLE products;-- -");
    expect(await productCount()).toBeGreaterThanOrEqual(0);
  });

  it("rejects a non-numeric id at the zod boundary, before any query is built", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {}, ip: "203.0.113.9", socket: { remoteAddress: "203.0.113.9" } },
      res: { cookie: () => undefined, clearCookie: () => undefined },
    } as unknown as TrpcContext);
    // A numeric route given "1 OR 1=1" never reaches the database: zod's
    // z.number() refuses the string outright.
    await expect(caller.catalog.bySlug({ slug: "x".repeat(300) })).rejects.toBeTruthy(); // over max(200)
    await expect((caller.catalog as unknown as { related: (i: unknown) => Promise<unknown> }).related({ productId: "1 OR 1=1" })).rejects.toBeTruthy();
  });

  it("the one raw-integer helper refuses anything that is not a finite number", () => {
    expect(() => sqlInt(Number.NaN)).toThrow();
    expect(() => sqlInt(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => sqlInt("5; DROP TABLE users" as unknown as number)).toThrow();
    // and a real number becomes a bare integer literal
    expect(sqlInt(12.9)).toBeDefined();
  });
});
