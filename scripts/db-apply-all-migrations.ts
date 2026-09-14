// 2026-09-14: bring an EMPTY database up to the current schema by running
// every drizzle/NNNN_*.sql in order -- the CI database job's first step
// (.github/workflows/ci.yml), and a fresh local MySQL's.
//
//   DATABASE_URL=mysql://root:root@127.0.0.1:3306/sugi_test pnpm exec tsx scripts/db-apply-all-migrations.ts
//
// Opens its own mysql2 connection with multipleStatements on: the older
// migration files carry several `;`-terminated statements without a
// `--> statement-breakpoint` marker, which the app's pool (single-statement
// by design, see docs/SECURITY-sqli.md) cannot run. The connection is built
// by the same planner the app uses, so TLS/CA rules hold for a remote host.
//
// Re-runnable: "already exists" / "duplicate column" errors are reported and
// skipped, so a database that already has some migrations gets the rest.
// Never point this at production -- there, migrations are applied one at a
// time (scripts/db-apply-migration.ts) and recorded in HISTORY.md.
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { planMysqlConnection } from "../server/_core/dbConnection";

const dir = join(process.cwd(), "drizzle");
const files = readdirSync(dir).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort();
const SKIPPABLE = /already exists|Duplicate column|Duplicate key name|Duplicate entry|check that column\/key exists|Can't DROP|doesn't exist|Multiple primary key/i;
// The marker on a line of its own -- a comment that merely mentions the
// marker (0010 does) must not split a statement.
const BREAKPOINT = /^\s*-->\s*statement-breakpoint\s*$/m;
/** True when the chunk holds something other than `--` / block comments. */
const hasStatement = (chunk: string) => chunk.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").some(line => line.trim() && !line.trim().startsWith("--"));

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const plan = planMysqlConnection(process.env.DATABASE_URL);
  const connection = await mysql.createConnection({ ...plan.options, multipleStatements: true, timezone: "Z" });
  let applied = 0, skipped = 0;
  for (const file of files) {
    const chunks = readFileSync(join(dir, file), "utf8").split(BREAKPOINT).map(chunk => chunk.trim()).filter(hasStatement);
    for (const chunk of chunks) {
      try {
        await connection.query(chunk);
        applied += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (SKIPPABLE.test(message)) { skipped += 1; console.log(`skip ${file}: ${message.split("\n")[0].slice(0, 120)}`); continue; }
        console.error(`FAILED ${file}:\n${chunk.slice(0, 300)}\n${message}`);
        await connection.end();
        process.exit(1);
      }
    }
  }
  await connection.end();
  console.log(`Applied ${applied} chunk(s) from ${files.length} file(s), ${skipped} skipped.`);
  process.exit(0);
}
main().catch(error => { console.error(error); process.exit(1); });
