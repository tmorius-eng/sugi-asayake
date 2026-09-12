import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { siteText } from "../drizzle/schema";

/**
 * One-off (2026-09-12, Tom: "ene 2 iin . tsegiin arilga! teneg haragdaj
 * baina"): drops the trailing full stop from the homepage section headings
 * an admin has already typed. The code-side fallbacks are fixed in
 * shared/site-text.ts in the same change; this only reaches the rows that
 * carry an admin's own text, which a code edit cannot touch.
 *
 * Reads first, prints what it would change, and only writes with --apply.
 */
const APPLY = process.argv.includes("--apply");
const SLOTS = [
  "home-text-cat-heading",
  "home-text-bestseller-heading",
  "home-text-recommended-heading",
  "home-text-care-heading",
  "home-text-finalcta-heading",
  "home-text-locator-heading",
  "home-text-qs-heading",
  "home-text-wcu-heading",
];

const main = async () => {
  const db = await getDb();
  if (!db) throw new Error("No database connection -- check DATABASE_URL.");
  const rows = await db.select().from(siteText);
  let changed = 0;
  for (const row of rows) {
    if (!SLOTS.includes(row.slotKey)) continue;
    // Only a period at the very end of a line, nothing else about the text.
    const next = row.textValue.replace(/\.(\s*)$/gm, "$1").trimEnd();
    if (next === row.textValue) continue;
    changed += 1;
    console.log(`${row.slotKey}: ${JSON.stringify(row.textValue)} -> ${JSON.stringify(next)}`);
    if (APPLY) await db.update(siteText).set({ textValue: next }).where(eq(siteText.slotKey, row.slotKey));
  }
  console.log(changed === 0 ? "Nothing to change." : APPLY ? `Updated ${changed} row(s).` : `${changed} row(s) would change -- re-run with --apply.`);
  process.exit(0);
};

main().catch(error => { console.error(error); process.exit(1); });
