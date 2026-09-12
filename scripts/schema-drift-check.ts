import "dotenv/config";
import { sql } from "drizzle-orm";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getDb } from "../server/db";
import * as schema from "../drizzle/schema";

// Compares drizzle/schema.ts against the live database: columns the code
// expects but the DB lacks (code ahead), and columns the DB has that the code
// does not know (DB ahead -- the two-laptop trap).
const db = await getDb();
if (!db) throw new Error("no db");
const [rows] = await db.execute(sql`SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE()`) as unknown as [{ t: string; c: string }[]];
const live = new Map<string, Set<string>>();
for (const row of rows) { if (!live.has(row.t)) live.set(row.t, new Set()); live.get(row.t)!.add(row.c); }
let problems = 0;
for (const [name, value] of Object.entries(schema)) {
  if (!value || typeof value !== "object" || !("_" in (value as object))) continue;
  let table: string;
  try { table = getTableName(value as never); } catch { continue; }
  const cols = Object.values(getTableColumns(value as never) as Record<string, { name: string }>).map(c => c.name);
  const liveCols = live.get(table);
  if (!liveCols) { console.log(`MISSING TABLE in DB: ${table} (${name})`); problems++; continue; }
  const codeOnly = cols.filter(c => !liveCols.has(c));
  const dbOnly = Array.from(liveCols).filter(c => !cols.includes(c));
  if (codeOnly.length || dbOnly.length) { problems++; console.log(`${table}: code-only=${JSON.stringify(codeOnly)} db-only=${JSON.stringify(dbOnly)}`); }
}
const codeTables = new Set<string>();
for (const value of Object.values(schema)) { try { codeTables.add(getTableName(value as never)); } catch { /* not a table export */ } }
for (const table of live.keys()) if (!codeTables.has(table)) console.log(`DB table not in schema.ts: ${table}`);
console.log(problems ? `${problems} drift(s)` : "schema.ts matches the live database");
// Are the FK columns schema.ts declares without an explicit index actually
// indexed in the live DB (MySQL creates one for a real FOREIGN KEY constraint)?
const [idx] = await db.execute(sql`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, INDEX_NAME AS i FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() AND SEQ_IN_INDEX = 1`) as unknown as [{ t: string; c: string; i: string }[]];
const indexed = new Set(idx.map(r => `${r.t}.${r.c}`));
const suspects = ["stock_movements.actorUserId","stock_receipts.createdByUserId","stock_receipts.postedByUserId","stock_transfer_lines.variantId","orders.fulfillingBranchId","orders.appliedRoutineId","orders.visitorSessionId","order_items.productId","product_reviews.orderId","media_library.uploadedByUserId","loyalty_tiers.updatedByUserId","discount_codes.createdByUserId","site_promotions.updatedByUserId","staff_invitations.invitedByUserId","staff_invitations.acceptedUserId","integration_configs.updatedByUserId"];
for (const s of suspects) console.log(`${indexed.has(s) ? "indexed  " : "NO INDEX "} ${s}`);
process.exit(0);
