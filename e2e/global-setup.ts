import { sql } from "drizzle-orm";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { getDb } from "../server/db";

/**
 * E2E эхлэхийн өмнөх схемийн шалгалт (2026-09-16).
 *
 * Яагаад: E2E нь `sugi_staging` схемд ажилладаг ч **staging deploy нь migration
 * ажиллуулдаггүй** — `scripts/oci/deploy.ps1` зөвхөн кодыг зөөдөг. Тиймээс
 * схем чимээгүй хоцрох боломжтой бөгөөд яг ингэсэн байв: 0081/0082/0083
 * (job_postings, job_applications, products.usageInstructions/warnings)
 * production-д орчихсон атлаа staging-д ороогүйгээс /careers болон admin-ий
 * бүтээгдэхүүн хадгалах хоёул 500 өгч байсныг энэ багц бичих явцад илрүүлэв.
 *
 * Тийм тохиолдолд тест "олдсонгүй / товч дарагдахгүй" гэсэн будлиантай
 * алдаагаар унадаг. Энд урьдчилж шалгаад ЯГ юу хийхийг хэлнэ.
 */
export default async function globalSetup() {
  const db = await getDb();
  if (!db) throw new Error("E2E: өгөгдлийн сан холбогдсонгүй. HeatWave-ийн ssh tunnel асаалттай юу?");

  const [rows] = (await db.execute(
    sql`SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE()`
  )) as unknown as [{ t: string; c: string }[]];
  const live = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!live.has(row.t)) live.set(row.t, new Set());
    live.get(row.t)!.add(row.c);
  }

  const missing: string[] = [];
  for (const value of Object.values(schema)) {
    if (!value || typeof value !== "object" || !("_" in (value as object))) continue;
    let table: string;
    try { table = getTableName(value as never); } catch { continue; }
    const liveColumns = live.get(table);
    if (!liveColumns) { missing.push(`${table} (бүтэн хүснэгт)`); continue; }
    for (const column of Object.values(getTableColumns(value as never) as Record<string, { name: string }>)) {
      if (!liveColumns.has(column.name)) missing.push(`${table}.${column.name}`);
    }
  }

  if (missing.length) {
    const [[{ schemaName }]] = (await db.execute(sql`SELECT DATABASE() AS schemaName`)) as unknown as [{ schemaName: string }[]];
    throw new Error(
      `E2E: "${schemaName}" схем код шаарддаг ${missing.length} багана/хүснэгтгүй байна:\n  ${missing.slice(0, 20).join("\n  ")}\n` +
        `Дутуу migration-уудыг тухайн схемд ажиллуулна (DATABASE_ADMIN_URL-ийн замыг /${schemaName} болгож):\n` +
        `  pnpm exec tsx scripts/db-apply-migration.ts drizzle/00NN_*.sql`
    );
  }
}
