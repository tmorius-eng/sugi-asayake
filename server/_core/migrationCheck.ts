import { sql } from "drizzle-orm";
import { getDb } from "../db";

/**
 * Deploy-ийн хамгаалалт (2026-10-05).
 *
 * 2026-10-01-ний кодыг migration 0098/0099-гүй DB дээр deploy хийвэл checkout бүр
 * "Unknown column listPriceMnt"-ээр, сешн бүр "Unknown column faceGrantVersion"-оор
 * унадаг — гэхдээ сервер өөрөө "эрүүл" асаж, /health 200 өгдөг тул хэн ч анзаардаггүй.
 * Энэ жагсаалт нь КОД ямар migration-ийг болзолгүй уншдагийг нэрлэнэ; production-д
 * тэдгээр `schema_migrations`-д бүртгэгдээгүй бол сервер ЭХЛЭХГҮЙ (pm2 алдааг
 * харуулна), dev-д зөвхөн анхааруулна.
 *
 * ДҮРЭМ: хуучин кодоор уншигдахгүй шинэ хүснэгт/багана оруулсан migration бүрийг энд
 * нэм. `migrationCheck.test.ts` сүүлийн мөр нь drizzle/-ийн сүүлийн файлтай таарахыг
 * шаарддаг тул шинэ migration бичмэгц энд ч нэмэхийг шахна. VM дээр drizzle/ хавтас
 * байдаггүй (deploy зөвхөн dist/-ийг зөөдөг) тул диск биш энэ жагсаалтаар шалгана.
 * Түр унтраах: MIGRATION_CHECK=0.
 */
export const REQUIRED_MIGRATIONS = [
  "0098_price_campaigns.sql",
  "0099_session_revocations.sql",
  "0101_order_events.sql",
  "0102_job_runs.sql",
  "0103_site_themes.sql",
  "0104_site_theme_versions.sql",
  "0105_site_layouts.sql",
] as const;

export async function findMissingMigrations(): Promise<string[] | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.execute(sql`SELECT name FROM schema_migrations`);
  const rows = (Array.isArray(result[0]) ? result[0] : result) as Array<{ name: string }>;
  const applied = new Set(rows.map(row => row.name));
  return REQUIRED_MIGRATIONS.filter(name => !applied.has(name));
}

export async function assertMigrationsApplied(): Promise<void> {
  if (process.env.MIGRATION_CHECK === "0") return;
  const production = process.env.NODE_ENV === "production";
  let missing: string[] | null;
  try {
    missing = await findMissingMigrations();
  } catch (error) {
    const detail = String((error as { cause?: { message?: string } })?.cause?.message ?? (error as Error)?.message ?? error);
    // Зөвхөн ХҮСНЭГТ БАЙХГҮЙ (огт migration хийгдээгүй DB) бол fatal. Холболтын/TLS-ийн түр
    // алдаа (09-28-ны CA солигдолт шиг) бол өмнөх шигээ degraded асна — /health "down" өгч
    // watchdog эзэнд мэдэгдэнэ; crash-loop-д оруулж pm2-г дарахгүй.
    if (production && /doesn't exist|ER_NO_SUCH_TABLE/.test(detail)) {
      throw new Error(`[migrations] schema_migrations хүснэгт байхгүй — энэ DB-д migration огт ажиллаагүй. scripts/db-migration-status.ts-ээр шалгаад ажиллуул. Түр: MIGRATION_CHECK=0.`, { cause: error });
    }
    console.error(`[migrations] schema_migrations уншигдсангүй (DB холбогдохгүй байж магадгүй) — шалгалт алгасав: ${detail}`);
    return;
  }
  if (!missing || missing.length === 0) return;
  const message = `Кодын шаарддаг migration DB-д ороогүй: ${missing.join(", ")}. Эхлээд ажиллуул: ${missing.map(name => `pnpm exec tsx scripts/db-apply-migration.ts drizzle/${name}`).join(" ; ")} (PROJECT-GUIDE). Түр унтраах: MIGRATION_CHECK=0.`;
  if (production) throw new Error(`[migrations] ${message}`);
  console.warn(`[migrations] ${message}`);
}
