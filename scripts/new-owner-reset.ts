/**
 * Эзэн солих B2 (2026-10-05): сайтыг шинэ эзэнд хүлээлгэхийн өмнө хуучин эзний харилцагч,
 * захиалга, нууц түлхүүр, лог бүгдийг устгаж, брэнд/каталогийг сонголтоор үлдээнэ.
 *
 *   pnpm exec tsx scripts/new-owner-reset.ts --keep-admin-phone=99112233             # dry-run (анхдагч)
 *   pnpm exec tsx scripts/new-owner-reset.ts --keep-admin-phone=99112233 --keep-catalog \
 *     --apply --i-have-a-backup --confirm="SUGI ASAYAKE Mongolia"                     # бодитоор
 *
 * Хамгаалалт: dry-run анхдагч; `--apply` нь `--confirm=<одоогийн сайтын нэр>` + `--i-have-a-backup`
 * шаардана; бодит дэлгүүрийн схемд (`defaultdb`) `--i-know-this-is-production`-гүй ажиллахгүй;
 * DB-д ангилалгүй хүснэгт байвал татгалзана (шинэ хүснэгт нэмбэл `TABLE_GROUPS`-д ангил —
 * server/new-owner-reset.test.ts барина). Бүх устгал НЭГ транзакц; дараа нь FK бүрийн өнчин мөрийг
 * шалгаж, нэг ч байвал буцаана (rollback).
 *
 * Сонголт:
 *   --staging        sugi_staging дээр (туршилт)
 *   --keep-admin-phone=… (заавал, таслалаар олон) — үлдэх admin(ууд); бусад бүх хэрэглэгч устна
 *   --keep-catalog   бараа, ангилал, хувилбар, онцлох брэнд, routine
 *   --keep-content   нийтлэл, медиа сан, ажлын зар, хямдралын код, кампанит хямдрал, зарын зурвас
 *   --keep-branches  салбарууд (ба каталог үлдсэн бол салбарын нөөц)
 *   --keep-brand     сайтын текст, зураг, баримт бичиг, дэлгүүрийн тохиргоо, Брэнд студийн загвар
 *                    (анхдагч: устгаж кодын анхдагч утга руу буцна → шинэ эзэн өөрөө бөглөнө)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { planMysqlConnection } from "../server/_core/dbConnection";
import { refuseProductionDatabase } from "./_refuse-production";

export const TABLE_GROUPS = {
  /** Хэзээ ч устгахгүй: migration бүртгэл, хайлтын толь, гишүүнчлэлийн дүрэм. `users`-ийг тусад нь шүүнэ. */
  keep: ["schema_migrations", "users", "brand_aliases", "search_synonyms", "loyalty_tiers"],
  /** Үргэлж устгана: харилцагчийн хувийн мэдээлэл, гүйлгээ, лог, хуучин эзний нууц түлхүүр. */
  customerData: [
    "user_addresses", "wishlist_items", "search_queries", "carts", "cart_items", "orders", "order_items", "order_events",
    "payment_attempts", "product_reviews", "product_review_replies", "product_review_likes", "product_questions",
    "product_question_answers", "visitor_sessions", "marketing_spend", "discount_code_redemptions", "login_attempts",
    "campaign_send_claims", "admin_audit_logs", "staff_invitations", "password_reset_tokens", "email_verification_tokens",
    "phone_verification_sessions", "job_applications", "integration_configs", "notification_outbox", "external_refs",
    "integration_sync_state", "scheduled_job_runs", "job_runs", "store_credit_ledger", "rate_limit_buckets",
    "face_enrollments", "face_challenges", "face_handoff_requests", "face_attempts", "session_revocations",
    "gift_cards", "push_subscriptions", "stock_movements", "stock_receipts", "stock_receipt_lines", "stock_counts",
    "stock_count_lines", "stock_transfers", "stock_transfer_lines",
  ],
  content: ["posts", "post_categories", "post_category_links", "post_tags", "post_tag_links", "media_library", "job_postings", "discount_codes", "price_campaigns", "site_promotions"],
  catalog: ["product_categories", "products", "product_variants", "featured_brands", "routines", "routine_steps"],
  branches: ["branches"],
  /** Каталог БА салбар хоёулаа үлдвэл л үлдэнэ (хоёуланд нь FK-тай). */
  branchStock: ["branch_stock"],
  brand: ["site_media", "site_text", "site_documents", "store_settings", "site_themes", "site_theme_versions", "site_layouts"],
} as const;

export interface ResetOptions {
  keepAdminPhones: string[];
  keepCatalog?: boolean;
  keepContent?: boolean;
  keepBranches?: boolean;
  keepBrand?: boolean;
}

export const CLASSIFIED_TABLES: ReadonlySet<string> = new Set(Object.values(TABLE_GROUPS).flat());

export function tablesToWipe(options: ResetOptions): string[] {
  return [
    ...TABLE_GROUPS.customerData,
    ...(options.keepContent ? [] : TABLE_GROUPS.content),
    ...(options.keepCatalog ? [] : TABLE_GROUPS.catalog),
    ...(options.keepBranches ? [] : TABLE_GROUPS.branches),
    ...(options.keepCatalog && options.keepBranches ? [] : TABLE_GROUPS.branchStock),
    ...(options.keepBrand ? [] : TABLE_GROUPS.brand),
  ];
}

/** 8 оронтой монгол дугаар; +976/976 угтвар, зай, зураасыг хаяна. */
export const normalizePhone = (raw: string) => raw.replace(/\D/g, "").replace(/^976(?=\d{8}$)/, "");

type Conn = mysql.Connection;
type ForeignKey = { table: string; column: string; refTable: string; refColumn: string; nullable: boolean };

async function existingTables(conn: Conn): Promise<string[]> {
  const [rows] = await conn.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'");
  return (rows as Array<{ name: string }>).map(row => row.name);
}

async function foreignKeys(conn: Conn): Promise<ForeignKey[]> {
  const [rows] = await conn.query(`
    SELECT k.TABLE_NAME AS tableName, k.COLUMN_NAME AS columnName, k.REFERENCED_TABLE_NAME AS refTable, k.REFERENCED_COLUMN_NAME AS refColumn, c.IS_NULLABLE AS nullable
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA = k.TABLE_SCHEMA AND c.TABLE_NAME = k.TABLE_NAME AND c.COLUMN_NAME = k.COLUMN_NAME
    WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`);
  return (rows as Array<{ tableName: string; columnName: string; refTable: string; refColumn: string; nullable: string }>)
    .map(row => ({ table: row.tableName, column: row.columnName, refTable: row.refTable, refColumn: row.refColumn, nullable: row.nullable === "YES" }));
}

const q = (name: string) => `\`${name.replace(/`/g, "")}\``;
const count = async (conn: Conn, table: string) => Number(((await conn.query(`SELECT COUNT(*) AS n FROM ${q(table)}`))[0] as Array<{ n: number }>)[0].n);

export interface ResetPlan {
  schema: string;
  siteName: string;
  unknownTables: string[];
  wipe: Array<{ table: string; rows: number }>;
  keep: Array<{ table: string; rows: number }>;
  keptUsers: Array<{ id: number; phone: string; role: string }>;
  missingPhones: string[];
  usersToDelete: number;
}

export async function planReset(conn: Conn, options: ResetOptions): Promise<ResetPlan> {
  const [[schemaRow]] = (await conn.query("SELECT DATABASE() AS name")) as unknown as [Array<{ name: string }>];
  const tables = await existingTables(conn);
  const wipeSet = new Set(tablesToWipe(options));
  const unknownTables = tables.filter(table => !CLASSIFIED_TABLES.has(table));
  const wipe = [] as ResetPlan["wipe"];
  const keep = [] as ResetPlan["keep"];
  for (const table of tables.filter(t => CLASSIFIED_TABLES.has(t)).sort()) {
    (wipeSet.has(table) ? wipe : keep).push({ table, rows: await count(conn, table) });
  }
  const phones = [...new Set(options.keepAdminPhones.map(normalizePhone).filter(Boolean))];
  const [userRows] = phones.length
    ? await conn.query("SELECT id, phone, role FROM users WHERE phone IN (?)", [phones])
    : [[]];
  const keptUsers = (userRows as Array<{ id: number; phone: string; role: string }>).map(row => ({ id: Number(row.id), phone: row.phone, role: row.role }));
  const missingPhones = phones.filter(phone => !keptUsers.some(user => user.phone === phone));
  const totalUsers = await count(conn, "users");
  let siteName = "SUGI ASAYAKE Mongolia";
  if (tables.includes("site_text")) {
    const [rows] = await conn.query("SELECT textValue FROM site_text WHERE slotKey = 'seo-text-site-name' LIMIT 1");
    siteName = String((rows as Array<{ textValue: string | null }>)[0]?.textValue ?? "").trim() || siteName;
  }
  return { schema: schemaRow.name, siteName, unknownTables, wipe, keep, keptUsers, missingPhones, usersToDelete: totalUsers - keptUsers.length };
}

export interface ResetReport { schema: string; deleted: Record<string, number>; usersDeleted: number; keptUserIds: number[]; reassigned: string[]; orphans: string[] }

/**
 * Бодит устгал — НЭГ транзакц. Үлдэх хүснэгтээс устгах хүснэгт/хэрэглэгч рүү заасан FK-г
 * (жишээ нь site_media.updatedByUserId) null эсвэл үлдэх admin руу шилжүүлнэ; эцэст нь FK бүрийн
 * өнчин мөрийг тоолж, байвал ROLLBACK.
 */
export async function applyReset(conn: Conn, options: ResetOptions): Promise<ResetReport> {
  const plan = await planReset(conn, options);
  if (plan.unknownTables.length) throw new Error(`Ангилалгүй хүснэгт: ${plan.unknownTables.join(", ")} — TABLE_GROUPS-д нэм.`);
  if (!plan.keptUsers.length || plan.missingPhones.length) throw new Error(`Үлдэх admin олдсонгүй: ${plan.missingPhones.join(", ") || "(дугаар өгөөгүй)"}`);
  const nonAdmin = plan.keptUsers.filter(user => user.role !== "admin");
  if (nonAdmin.length) throw new Error(`Үлдэх хэрэглэгч admin биш: ${nonAdmin.map(user => `#${user.id}`).join(", ")} — эхлээд scripts/make-admin.ts.`);

  const keptIds = plan.keptUsers.map(user => user.id);
  const primaryAdmin = keptIds[0];
  const wipeSet = new Set(plan.wipe.map(row => row.table));
  const fks = await foreignKeys(conn);
  const deleted: Record<string, number> = {};
  const reassigned: string[] = [];

  await conn.beginTransaction();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const { table } of plan.wipe) {
      const [result] = await conn.query(`DELETE FROM ${q(table)}`);
      deleted[table] = (result as { affectedRows: number }).affectedRows;
    }
    // Үлдэх хүснэгтийн мөр устах мөр рүү заасан бол — хэрэглэгч рүү бол үлдэх admin (null боломжтой бол null).
    for (const fk of fks) {
      if (wipeSet.has(fk.table) || fk.table === "users") continue;
      if (fk.refTable === "users") {
        const value = fk.nullable ? null : primaryAdmin;
        const [result] = await conn.query(`UPDATE ${q(fk.table)} SET ${q(fk.column)} = ? WHERE ${q(fk.column)} IS NOT NULL AND ${q(fk.column)} NOT IN (?)`, [value, keptIds]);
        if ((result as { affectedRows: number }).affectedRows) reassigned.push(`${fk.table}.${fk.column} → ${value ?? "NULL"} (${(result as { affectedRows: number }).affectedRows})`);
      } else if (wipeSet.has(fk.refTable)) {
        if (!fk.nullable) throw new Error(`${fk.table}.${fk.column} устах ${fk.refTable} руу заадаг, null болохгүй — энэ хослолоор үлдээх боломжгүй.`);
        const [result] = await conn.query(`UPDATE ${q(fk.table)} SET ${q(fk.column)} = NULL WHERE ${q(fk.column)} IS NOT NULL`);
        if ((result as { affectedRows: number }).affectedRows) reassigned.push(`${fk.table}.${fk.column} → NULL (${(result as { affectedRows: number }).affectedRows})`);
      }
    }
    const [usersResult] = await conn.query("DELETE FROM users WHERE id NOT IN (?)", [keptIds]);
    // Хуучин сешн/царайны эрх хүчингүй — үлдэх admin нэг удаа дахин нэвтэрч, царайгаа шинээр бүртгүүлнэ.
    await conn.query("UPDATE users SET sessionVersion = sessionVersion + 1, faceGrantVersion = faceGrantVersion + 1 WHERE id IN (?)", [keptIds]);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    const orphans: string[] = [];
    for (const fk of fks) {
      const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM ${q(fk.table)} c LEFT JOIN ${q(fk.refTable)} p ON c.${q(fk.column)} = p.${q(fk.refColumn)} WHERE c.${q(fk.column)} IS NOT NULL AND p.${q(fk.refColumn)} IS NULL`);
      const n = Number((rows as Array<{ n: number }>)[0].n);
      if (n) orphans.push(`${fk.table}.${fk.column} → ${fk.refTable}: ${n}`);
    }
    if (orphans.length) throw new Error(`Өнчин мөр үлдэх байсан — бүгдийг буцаав: ${orphans.join("; ")}`);
    await conn.commit();
    return { schema: plan.schema, deleted, usersDeleted: (usersResult as { affectedRows: number }).affectedRows, keptUserIds: keptIds, reassigned, orphans };
  } catch (error) {
    // Холболт тасарсан бол rollback ч шидэж болно — анхны алдааг нуухгүй.
    await conn.rollback().catch(() => undefined);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => undefined);
    throw error;
  }
}

function parseArgs(argv: string[]) {
  const value = (name: string) => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  return {
    apply: argv.includes("--apply"),
    backup: argv.includes("--i-have-a-backup"),
    confirm: value("confirm")?.replace(/^["']|["']$/g, ""),
    options: {
      keepAdminPhones: (value("keep-admin-phone") ?? "").split(",").map(s => s.trim()).filter(Boolean),
      keepCatalog: argv.includes("--keep-catalog"),
      keepContent: argv.includes("--keep-content"),
      keepBranches: argv.includes("--keep-branches"),
      keepBrand: argv.includes("--keep-brand"),
    } satisfies ResetOptions,
  };
}

async function main() {
  // `--staging`: sugi_staging дээр туршина (make-admin.ts-тэй ижил).
  if (process.argv.includes("--staging") && process.env.DATABASE_URL) {
    for (const key of ["DATABASE_URL", "DATABASE_ADMIN_URL"] as const) {
      if (!process.env[key]) continue;
      const staged = new URL(process.env[key]!);
      staged.pathname = "/sugi_staging";
      process.env[key] = staged.toString();
    }
  }
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL тохируулаагүй.");
  // Хамгаалалт ЯГ холбогдох URL-ийг шалгана (DATABASE_URL-ийг staging болгоод .env-ийн
  // DATABASE_ADMIN_URL production хэвээр байсан ч production руу орохгүй) — шалгагчийн олдвор 2026-10-06.
  refuseProductionDatabase("new-owner-reset", url);
  if (process.env.DATABASE_URL && url !== process.env.DATABASE_URL) refuseProductionDatabase("new-owner-reset", process.env.DATABASE_URL);
  const conn = await mysql.createConnection({ ...planMysqlConnection(url).options, multipleStatements: false });
  try {
    const plan = await planReset(conn, args.options);
    console.log(`Өгөгдлийн сан: ${plan.schema} · сайт: "${plan.siteName}" · ${args.apply ? "БОДИТ" : "dry-run"}`);
    console.log(`\nУСТГАХ (${plan.wipe.reduce((sum, row) => sum + row.rows, 0)} мөр):`);
    for (const row of plan.wipe.filter(r => r.rows)) console.log(`  ${row.table.padEnd(32)} ${row.rows}`);
    console.log(`\nҮЛДЭХ:`);
    for (const row of plan.keep) console.log(`  ${row.table.padEnd(32)} ${row.rows}${row.table === "users" ? ` → ${plan.keptUsers.length} (бусад ${plan.usersToDelete} устна)` : ""}`);
    if (plan.unknownTables.length) console.log(`\n⛔ Ангилалгүй хүснэгт: ${plan.unknownTables.join(", ")}`);
    if (plan.missingPhones.length) console.log(`\n⛔ Олдоогүй дугаар: ${plan.missingPhones.join(", ")}`);
    if (!args.options.keepAdminPhones.length) console.log("\n⛔ --keep-admin-phone=<утас> заавал (үлдэх admin).");
    if (!args.apply) { console.log("\nDry-run — юу ч өөрчлөгдөөгүй. Бодитоор: --apply --i-have-a-backup --confirm=\"<сайтын нэр>\""); return; }
    if (!args.backup) throw new Error("--i-have-a-backup заавал: эхлээд scripts/db-backup.ps1-ээр нөөц ав.");
    if (args.confirm !== plan.siteName) throw new Error(`--confirm нь одоогийн сайтын нэртэй ЯГ таарах ёстой: "${plan.siteName}"`);
    const report = await applyReset(conn, args.options);
    mkdirSync(join(process.cwd(), "backups"), { recursive: true });
    const file = join(process.cwd(), "backups", `reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify({ ...report, options: args.options }, null, 2));
    console.log(`\n✅ Дууслаа: ${Object.values(report.deleted).reduce((a, b) => a + b, 0)} мөр, ${report.usersDeleted} хэрэглэгч устгав. Тайлан: ${file}`);
    console.log("Дараа нь: сервер restart (кэш), admin нэвтэрч → Брэнд студи → эзэн солих жагсаалт.");
  } finally {
    await conn.end();
  }
}

if (process.argv[1] && /new-owner-reset/.test(process.argv[1])) {
  main().catch(error => { console.error(`⛔ ${error instanceof Error ? error.message : error}`); process.exit(1); });
}
