// One-time-per-environment backfill: guesses orders.deliveryDistrict from
// the free-text deliveryAddress on every ub_delivery order that doesn't
// have a district yet (placed before the district field existed, or before
// the checkout dropdown was filled in for some other reason). Safe to
// re-run any time — it only ever touches rows where deliveryDistrict IS
// NULL, so it never overwrites a real customer-picked value.
//
// Usage: pnpm exec tsx scripts/backfill-order-districts.ts
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
