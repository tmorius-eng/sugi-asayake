// Орчин бүрт нэг удаагийн backfill: дүүрэггүй ub_delivery захиалга бүрийн чөлөөт
// текст deliveryAddress-аас orders.deliveryDistrict-ийг таана (дүүргийн талбар
// үүсэхээс өмнө хийгдсэн, эсвэл checkout-ийн dropdown бөглөгдөөгүй). Хэзээ ч дахин
// ажиллуулахад аюулгүй — зөвхөн deliveryDistrict IS NULL мөрийг л хөнддөг тул
// харилцагчийн бодит сонголтыг дарж бичихгүй.
//
// Хэрэглээ: pnpm exec tsx scripts/backfill-order-districts.ts
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../server/db";
import { orders } from "../drizzle/schema";
import { guessDistrictFromAddress } from "../shared/districts";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");

  const candidates = await db
    .select({ id: orders.id, deliveryAddress: orders.deliveryAddress })
    .from(orders)
    .where(and(eq(orders.deliveryMethod, "ub_delivery"), isNull(orders.deliveryDistrict)));

  let matched = 0;
  let unmatched = 0;
  for (const order of candidates) {
    const guess = guessDistrictFromAddress(order.deliveryAddress);
    if (!guess) { unmatched++; continue; }
    await db.update(orders).set({ deliveryDistrict: guess }).where(eq(orders.id, order.id));
    matched++;
  }

  console.log(`Backfilled ${matched} order(s) with a guessed district; ${unmatched} left unmatched (free-text address didn't mention a recognizable дүүрэг).`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
