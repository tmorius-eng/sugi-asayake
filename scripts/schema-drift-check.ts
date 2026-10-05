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
// Per-column type / nullability / default as MySQL reports them.
type LiveColumn = { t: string; c: string; type: string; nullable: string; def: string | null };
const [typeRows] = await db.execute(sql`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE()`) as unknown as [LiveColumn[]];
const liveTypes = new Map<string, LiveColumn>();
for (const row of typeRows) liveTypes.set(`${row.t}.${row.c}`, row);

// Normalise MySQL / Drizzle spellings of the same type to one comparable string.
function normaliseType(raw: string): string {
  let t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  t = t.replace(/\s*,\s*/g, ",").replace(/\s*\(\s*/g, "(").replace(/\s*\)/g, ")");
  if (t === "boolean" || t === "bool") return "tinyint(1)";
  // MySQL 8.0.19+ drops display widths of integer types; older servers keep them.
  t = t.replace(/^(tinyint|smallint|mediumint|int|integer|bigint)\((\d+)\)/, (_m, base: string, width: string) => (base === "tinyint" && width === "1" ? "tinyint(1)" : base));
  t = t.replace(/^integer(?![a-z])/, "int");
  // Double quotes in enum lists -> single quotes.
  if (t.startsWith("enum(") || t.startsWith("set(")) t = t.replace(/"/g, "'");
  // timestamp / datetime without fsp == fsp 0.
  t = t.replace(/^(timestamp|datetime|time)\(0\)/, "$1");
  return t;
}

// Reduce a Drizzle default to a scalar string, or "expr" for SQL expressions.
function normaliseCodeDefault(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "string") return value;
  if (value instanceof Date) return "expr";
  if (typeof value === "object" && "queryChunks" in (value as object)) return "expr";
  try { return JSON.stringify(value); } catch { return "expr"; }
}
function normaliseLiveDefault(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  // Strip the quotes MySQL 8 puts around string defaults in JSON-ish dumps.
  return String(value).replace(/^'(.*)'$/s, "$1");
}
const typeDrifts: string[] = [];

let problems = 0;
for (const [name, value] of Object.entries(schema)) {
  if (!value || typeof value !== "object" || !("_" in (value as object))) continue;
  let table: string;
  try { table = getTableName(value as never); } catch { continue; }
  const cols = Object.values(getTableColumns(value as never) as Record<string, { name: string }>).map(c => c.name);
  const liveCols = live.get(table);
  if (!liveCols) { console.log(`MISSING TABLE in DB: ${table} (${name})`); problems++; continue; }
  const codeColumns = Object.values(getTableColumns(value as never) as Record<string, { name: string; notNull: boolean; hasDefault: boolean; default: unknown; getSQLType: () => string; autoIncrement?: boolean }>);
  for (const col of codeColumns) {
    const liveCol = liveTypes.get(`${table}.${col.name}`);
    if (!liveCol) continue; // already reported as code-only below
    const codeType = normaliseType(col.getSQLType());
    const dbType = normaliseType(liveCol.type);
    if (codeType !== dbType) typeDrifts.push(`${table}.${col.name}: төрөл код=${codeType} db=${dbType}`);
    const dbNullable = liveCol.nullable === "YES";
    if (dbNullable !== !col.notNull) typeDrifts.push(`${table}.${col.name}: nullable код=${!col.notNull ? "YES" : "NO"} db=${liveCol.nullable}`);
    if (col.autoIncrement) continue;
    const codeDefault = col.hasDefault ? normaliseCodeDefault(col.default) : null;
    const dbDefault = normaliseLiveDefault(liveCol.def);
    if (codeDefault === "expr") {
      if (dbDefault === null) typeDrifts.push(`${table}.${col.name}: default код=<илэрхийлэл> db=байхгүй`);
    } else if (codeDefault !== dbDefault) {
      // A nullable column without an explicit default reads back as NULL in MySQL, same as "no default".
      typeDrifts.push(`${table}.${col.name}: default код=${codeDefault === null ? "байхгүй" : JSON.stringify(codeDefault)} db=${dbDefault === null ? "байхгүй" : JSON.stringify(dbDefault)}`);
    }
  }
  const codeOnly = cols.filter(c => !liveCols.has(c));
  const dbOnly = Array.from(liveCols).filter(c => !cols.includes(c));
  if (codeOnly.length || dbOnly.length) { problems++; console.log(`${table}: code-only=${JSON.stringify(codeOnly)} db-only=${JSON.stringify(dbOnly)}`); }
}
const codeTables = new Set<string>();
for (const value of Object.values(schema)) { try { codeTables.add(getTableName(value as never)); } catch { /* not a table export */ } }
for (const table of live.keys()) if (!codeTables.has(table)) console.log(`DB table not in schema.ts: ${table}`);
console.log(problems ? `${problems} drift(s)` : "schema.ts matches the live database");
// Per-column type / nullability / default drift (separate from the name drift above).
if (typeDrifts.length) {
  console.log(`
Type/nullability drift (төрөл, null зөвшөөрөх, default-ийн зөрүү) -- ${typeDrifts.length}:`);
  for (const line of typeDrifts) console.log(`  ${line}`);
} else {
  console.log("Type/nullability drift: төрөл, null зөвшөөрөх, default бүгд таарч байна");
}
// Are the FK columns schema.ts declares without an explicit index actually
// indexed in the live DB (MySQL creates one for a real FOREIGN KEY constraint)?
const [idx] = await db.execute(sql`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, INDEX_NAME AS i FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() AND SEQ_IN_INDEX = 1`) as unknown as [{ t: string; c: string; i: string }[]];
const indexed = new Set(idx.map(r => `${r.t}.${r.c}`));
const suspects = ["stock_movements.actorUserId","stock_receipts.createdByUserId","stock_receipts.postedByUserId","stock_transfer_lines.variantId","orders.fulfillingBranchId","orders.appliedRoutineId","orders.visitorSessionId","order_items.productId","product_reviews.orderId","media_library.uploadedByUserId","loyalty_tiers.updatedByUserId","discount_codes.createdByUserId","site_promotions.updatedByUserId","staff_invitations.invitedByUserId","staff_invitations.acceptedUserId","integration_configs.updatedByUserId"];
for (const s of suspects) console.log(`${indexed.has(s) ? "indexed  " : "NO INDEX "} ${s}`);
process.exit(0);
