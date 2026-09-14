// 2026-09-14: integration тестүүдийн байгаа гэж үздэг цөөн лавлах мөр (production-д
// migration-ээс өмнө гараар үүсгэгдсэн): 4 дэлгүүрийн салбар, эхнийх нь онлайн
// fulfilment-ийн үндсэн. Хоосон CI DB дээр scripts/db-apply-all-migrations.ts-ийн
// дараа ажиллуулна. Idempotent: байгаа slug-ийг хөндөхгүй.
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
