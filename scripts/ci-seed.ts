// 2026-09-14: integration тестүүдийн байгаа гэж үздэг цөөн лавлах мөр (production-д
// migration-ээс өмнө гараар үүсгэгдсэн): 4 дэлгүүрийн салбар, эхнийх нь онлайн
// fulfilment-ийн үндсэн. Хоосон CI DB дээр scripts/db-apply-all-migrations.ts-ийн
// дараа ажиллуулна. Idempotent: байгаа slug-ийг хөндөхгүй.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { branches, productCategories, users } from "../drizzle/schema";
import { hashPassword } from "../server/_core/password";
import { getDb } from "../server/db";
import { refuseProductionDatabase } from "./_refuse-production";

/**
 * 2026-09-16: барааны ангилал нь салбаруудтай ижил "лавлах мөр". Долоон
 * integration багц ("No product category exists to attach the test product
 * to") бараагаа хавсаргах ангилал БАЙГАА гэж үздэг — хөгжүүлэгчийн DB-д 8
 * ангилал байдаг тул энэ таамаг хэзээ ч мэдэгддэггүй, харин CI-ийн цэвэр
 * схемд яг энд унана. Ганц лавлах ангилал хангалттай: тестүүд түүнд бараагаа
 * хавсаргаад өөрсдийнхөө өгөгдлийг өөрсдөө үүсгэдэг.
 */
const CATEGORY = { name: "Арьс арчилгаа", slug: "skincare", description: "CI reference category" };

const STORES = [
  { name: "Орос элчингийн салбар", slug: "russian-embassy", address: "Chin Van Handdorj St, SBD - 4 khoroo, Ulaanbaatar 13120", isFulfillmentDefault: true },
  { name: "Их наяд плаза", slug: "ikh-nayad", address: "Ikh Mongol State Street 4, HUD - 15 khoroo, Ulaanbaatar 17009", isFulfillmentDefault: false },
  { name: "Яармаг FOOD CITY", slug: "yarmag-food-city", address: "Naadamchid Rd, HUD - 24 khoroo, Ulaanbaatar 17080", isFulfillmentDefault: false },
  { name: "Japan Town C6, Four Seasons Garden Center 3 давхар", slug: "japan-town", address: "Hurd Horoololiin Zam 26, HUD - 18 khoroo, Ulaanbaatar 17013", isFulfillmentDefault: false },
];

async function main() {
  refuseProductionDatabase("ci-seed");
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

  // Лавлах ажилтан (2026-10-05): хэд хэдэн integration тест `actorUserId: 1`-ээр бичдэг
  // (стaging/prod дээр #1 = эзэн тул ногоон). `order_events.actorUserId` FK (0101)-тэй
  // болсноор хоосон CI схемд тэр id байхгүй бол захиалгын бичилт бүр унадаг байв.
  // Хоосон users хүснэгтэд энэ мөр #1 болно; байвал дахин үүсгэхгүй.
  const [existingStaff] = await db.select({ id: users.id }).from(users).where(eq(users.phone, "ci-reference-staff")).limit(1);
  if (existingStaff) {
    console.log(`users: reference staff already present (#${existingStaff.id})`);
  } else {
    const inserted = await db.insert(users).values({ name: "CI reference staff", phone: "ci-reference-staff", email: "ci-reference-staff@example.invalid", role: "admin", passwordHash: await hashPassword(randomBytes(24).toString("hex")) });
    console.log(`users: reference staff created (#${Number(inserted[0].insertId)})`);
  }

  const [existingCategory] = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.slug, CATEGORY.slug)).limit(1);
  if (existingCategory) {
    console.log("categories: already present");
  } else {
    await db.insert(productCategories).values({ name: CATEGORY.name, slug: CATEGORY.slug, description: CATEGORY.description, sortOrder: 1, isActive: true });
    console.log("categories: 1 created");
  }
  process.exit(0);
}
main().catch(error => { console.error(error); process.exit(1); });
