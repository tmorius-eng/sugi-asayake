import "dotenv/config";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../server/db";

/**
 * Applies one hand-written drizzle/*.sql migration to whatever DATABASE_URL
 * points at, through the app's own connection (so Aiven TLS, the UTC
 * session time_zone and the query log all apply exactly as in production).
 *
 * Why this exists (2026-09-09): docs/PROJECT-GUIDE.md's documented way to run a
 * migration was to pipe the file into a local `mysql.exe`, which does not
 * carry Aiven's TLS settings and silently does nothing useful against the
 * shared production database -- every session since the Aiven move has
 * re-invented a throwaway script for this. drizzle-kit's own `db:push` is
 * also not trusted here because `drizzle/meta` was never exported (see
 * docs/PROJECT-GUIDE.md, "Migration-уудыг ажиллуулах тухай").
 *
 * Usage:
 *   pnpm exec tsx scripts/db-apply-migration.ts drizzle/0056_discount_code_per_customer_cap.sql
 *   pnpm exec tsx scripts/db-apply-migration.ts drizzle/0056_*.sql drizzle/0057_*.sql
 *
 * Each statement runs on its own (DDL is auto-committed by MySQL anyway, so
 * a file is NOT one transaction -- re-running a half-applied file fails on
 * the already-applied statement, which is the honest outcome). The
 * `--> statement-breakpoint` marker drizzle-kit emits is stripped, since
 * MySQL does not understand it (the same rule docs/PROJECT-GUIDE.md documents for the
 * manual path).
 */
async function main() {
  if (process.env.DATABASE_ADMIN_URL) process.env.DATABASE_URL = process.env.DATABASE_ADMIN_URL;
  // 2026-09-20: `--staging` нь ижил HeatWave дээрх `sugi_staging` схемд ажиллуулна
  // (deploy.ps1 -Staging migration зөөдөггүй — PROJECT-GUIDE-ийн дүрэм). URL-ийн
  // схемийн нэрийг л солино; өөр хост руу хэзээ ч заахгүй.
  const staging = process.argv.includes("--staging");
  if (staging && process.env.DATABASE_URL) {
    const swapped = process.env.DATABASE_URL.replace(/\/defaultdb(\?|$)/, "/sugi_staging$1");
    if (swapped === process.env.DATABASE_URL) { console.error("--staging: DATABASE_URL нь /defaultdb руу заагаагүй тул сольж чадсангүй."); process.exit(2); }
    process.env.DATABASE_URL = swapped;
    console.log("[staging] sugi_staging схем рүү ажиллуулна.");
  }
  const files = process.argv.slice(2).filter(argument => !argument.startsWith("--"));
  if (!files.length) {
    console.error("Usage: pnpm exec tsx scripts/db-apply-migration.ts <drizzle/NNNN_name.sql> [...more]");
    process.exit(2);
  }
  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL is not set (or the connection failed) -- nothing applied.");
    process.exit(1);
  }
  for (const file of files) {
    const raw = readFileSync(file, "utf8").replace(/--> statement-breakpoint/g, "");
    // Drop full-line comments, then split on statement-terminating
    // semicolons. Migrations in this repo never embed ";" inside strings.
    const statements = raw
      .split("\n").filter(line => !line.trimStart().startsWith("--")).join("\n")
      .split(/;\s*(?:\n|$)/).map(statement => statement.trim()).filter(Boolean);
    console.log(`\n== ${basename(file)}: ${statements.length} statement(s) ==`);
    for (const statement of statements) {
      const label = statement.replace(/\s+/g, " ").slice(0, 110);
      try {
        await db.execute(sql.raw(statement));
        console.log(`  ok   ${label}`);
      } catch (error) {
        console.error(`  FAIL ${label}\n       ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }
  }
  console.log("\nDone.");
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
