import "dotenv/config";
import { getDb } from "../server/db";
import { getStockLedgerDrift, recordStockMovement } from "../server/stockLedger";

/**
 * Re-bases the stock movement ledger onto the live branch_stock numbers
 * (2026-09-11).
 *
 * The ledger (stock_movements, migration 0063) is supposed to add up, per
 * branch and variant, to exactly what branch_stock holds. It stops adding up
 * when something changes branch_stock WITHOUT recording a movement -- in this
 * project most likely the OTHER laptop running code from before the ledger
 * existed, against the same shared Aiven database (CLAUDE.md, "ХОЁР
 * ЛАПТОП"), or a hand-written SQL fix. The admin System Health card shows
 * the count; this script closes each gap with one 'rebaseline' movement
 * whose delta is exactly the difference, so history is never rewritten --
 * the correction itself is on the record.
 *
 * Dry run by default; nothing is written without --apply.
 *   pnpm exec tsx scripts/stock-ledger-rebaseline.ts
 *   pnpm exec tsx scripts/stock-ledger-rebaseline.ts --apply
 * Safe to run repeatedly: once everything adds up it finds nothing to do.
 */
async function main() {
  const apply = process.argv.includes("--apply");
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  const { driftCount, examples } = await getStockLedgerDrift(db, 100_000);
  console.log(`${driftCount} shelf/ledger mismatch(es)${examples.length > driftCount ? ` (+${examples.length - driftCount} ledger-only)` : ""}.`);
  for (const row of examples.slice(0, 20)) console.log(`  branch ${row.branchId} variant ${row.variantId}: shelf ${row.shelf}, ledger ${row.ledger} -> ${row.shelf - row.ledger > 0 ? "+" : ""}${row.shelf - row.ledger}`);
  if (!apply) {
    console.log(examples.length ? "\nDry run -- re-run with --apply to write the corrections." : "\nNothing to do.");
    process.exit(0);
  }
  let written = 0;
  await db.transaction(async tx => {
    for (const row of examples) {
      await recordStockMovement(tx, row.branchId, row.variantId, row.shelf - row.ledger, { type: "rebaseline", refType: "manual", note: "Ledger-ийг бодит үлдэгдэлтэй тааруулсан (scripts/stock-ledger-rebaseline.ts)" });
      written++;
    }
  });
  console.log(`\nWrote ${written} rebaseline movement(s).`);
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
