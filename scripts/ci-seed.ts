// 2026-09-14: the few reference rows the integration suites assume exist
// (they were created by hand in production long before migrations tracked
// them): the four store branches, the first of them the online fulfilment
// default. Run after scripts/db-apply-all-migrations.ts on an empty CI
// database. Idempotent: existing slugs are left alone.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { branches } from "../drizzle/schema";
import { getDb } from "../server/db";

const STORES = [
  { name: "Орос элчингийн салбар", slug: "russian-embassy", address: "Chin Van Handdorj St, SBD - 4 khoroo, Ulaanbaatar 13120", isFulfillmentDefault: true },
  { name: "Их наяд плаза", slug: "ikh-nayad", address: "Ikh Mongol State Street 4, HUD - 15 khoroo, Ulaanbaatar 17009", isFulfillmentDefault: false },
  { name: "Яармаг FOOD CITY", slug: "yarmag-food-city", address: "Naadamchid Rd, HUD - 24 khoroo, Ulaanbaatar 17080", isFulfillmentDefault: false },
  { name: "Japan Town C6, Four Seasons Garden Center 3 давхар", slug: "japan-town", address: "Hurd Horoololiin Zam 26, HUD - 18 khoroo, Ulaanbaatar 17013", isFulfillmentDefault: false },
];

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  let created = 0;
  for (const [index, store] of STORES.entries()) {
    const [existing] = await db.select({ id: branches.id }).from(branches).where(eq(branches.slug, store.slug)).limit(1);
    if (existing) continue;
    await db.insert(branches).values({ name: store.name, slug: store.slug, address: store.address, phone: "94509911", sortOrder: index + 1, isActive: true, isFulfillmentDefault: store.isFulfillmentDefault, kind: "store", countsTowardOnlineStock: true });
    created += 1;
  }
  console.log(`branches: ${created} created, ${STORES.length - created} already present`);
  process.exit(0);
}
main().catch(error => { console.error(error); process.exit(1); });
