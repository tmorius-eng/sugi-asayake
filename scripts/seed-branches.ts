// Admin шинэчлэл (2026-09-08, Phase J): бодит 4 салбарыг client/src/components/
// home/locations-data.ts-ийн hardcode массиваас шинэ `branches` хүснэгт рүү нэг
// удаа seed хийнэ. Placeholder биш, бодит бизнесийн өгөгдөл (тэр файлтай ижил утга).
// 01-р салбар (анхны, хамгийн том байршил) isFulfillmentDefault — Tom өөр агуулах
// заагаагүй бөгөөд admin Салбарын панелаар засварлагддаг тул кодонд тогтсон
// шийдвэр биш, эхлэлийн анхдагч утга.
//
// Бодит DB дээр нэг удаа ажилласан (2026-09-08) — түүхийн бүртгэл болгож энд
// үлдээв, scripts/backfill-order-districts.ts-тэй ижил конвенц. Idempotent: байгаа
// slug-ийг алгасна тул дахин ажиллуулах аюулгүй.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { branches } from "../drizzle/schema";

const BRANCH_HOURS_NOTE = "Өдөр бүр 11:00–20:00";

const seedBranches = [
  { slug: "oros-elchin", name: "Орос элчингийн салбар", address: "Chin Van Handdorj St, SBD - 4 khoroo, Ulaanbaatar 13120", phone: "9450-9911", mapUrl: "https://www.google.com/maps/search/?api=1&query=Chin+Van+Handdorj+St%2C+SBD+-+4+khoroo%2C+Ulaanbaatar+13120", sortOrder: 1, isFulfillmentDefault: true },
  { slug: "ikh-nayad-plaza", name: "Их наяд плаза", address: "Ikh Mongol State Street 4, HUD - 15 khoroo, Ulaanbaatar 17009", phone: "9450-9911", mapUrl: "https://www.google.com/maps/search/?api=1&query=Ikh+Mongol+State+Street+4%2C+HUD+-+15+khoroo%2C+Ulaanbaatar+17009", sortOrder: 2, isFulfillmentDefault: false },
  { slug: "yarmag-food-city", name: "Яармаг FOOD CITY", address: "Naadamchid Rd, HUD - 24 khoroo, Ulaanbaatar 17080", phone: "9450-9911", mapUrl: "https://www.google.com/maps/search/?api=1&query=Naadamchid+Rd%2C+HUD+-+24+khoroo%2C+Ulaanbaatar+17080", sortOrder: 3, isFulfillmentDefault: false },
  { slug: "japan-town-c6", name: "Japan Town C6, Four Seasons Garden Center 3 давхар", address: "Hurd Horoololiin Zam 26, HUD - 18 khoroo, Ulaanbaatar 17013", phone: "9565-1578", mapUrl: "https://www.google.com/maps/search/?api=1&query=Hurd+Horoololiin+Zam+26%2C+HUD+-+18+khoroo%2C+Ulaanbaatar+17013", sortOrder: 4, isFulfillmentDefault: false },
];

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  for (const branch of seedBranches) {
    const existing = await db.select().from(branches).where(eq(branches.slug, branch.slug)).limit(1);
    if (existing[0]) { console.log(`Skipping "${branch.slug}" -- already seeded (id ${existing[0].id}).`); continue; }
    const inserted = await db.insert(branches).values({ ...branch, isActive: true });
    console.log(`Seeded "${branch.name}" (id ${inserted[0].insertId}).`);
  }
  console.log(`Hours note (same for all branches, unchanged from locations-data.ts): ${BRANCH_HOURS_NOTE}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
