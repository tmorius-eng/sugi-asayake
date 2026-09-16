// 2026-09-14: ХООСОН DB-г drizzle/NNNN_*.sql бүрийг дарааллаар ажиллуулж одоогийн
// schema-д хүргэнэ — CI-ийн DB job-ийн эхний алхам (.github/workflows/ci.yml),
// мөн шинэ локал MySQL-д.
//
//   DATABASE_URL=mysql://root:root@127.0.0.1:3306/sugi_test pnpm exec tsx scripts/db-apply-all-migrations.ts
//
// multipleStatements асаалттай өөрийн mysql2 холболт нээнэ: хуучин migration
// файлууд `--> statement-breakpoint` тэмдэггүй хэд хэдэн `;`-ээр төгссөн statement
// агуулдаг бөгөөд аппын pool (зориуд нэг statement-тэй, docs/SECURITY-sqli.md)
// тэднийг ажиллуулж чадахгүй. Холболтыг аппын ашигладаг planner-аар үүсгэдэг тул
// алсын host-д TLS/CA дүрэм хэвээр.
//
// Дахин ажиллуулж болно: "already exists" / "duplicate column" алдааг мэдээлж
// алгасдаг тул зарим migration-той DB үлдсэнээ авна. Production руу ХЭЗЭЭ Ч
// чиглүүлэхгүй — тэнд migration нэг нэгээр (scripts/db-apply-migration.ts) хийгдэж
// HISTORY.md-д бүртгэгдэнэ.
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { planMysqlConnection } from "../server/_core/dbConnection";

const dir = join(process.cwd(), "drizzle");
const files = readdirSync(dir).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort();
const SKIPPABLE = /Duplicate foreign key constraint|already exists|Duplicate column|Duplicate key name|Duplicate entry|check that column\/key exists|Can't DROP|doesn't exist|Multiple primary key/i;
// The marker on a line of its own -- a comment that merely mentions the
// marker (0010 does) must not split a statement.
const BREAKPOINT = /^\s*-->\s*statement-breakpoint\s*$/m;
/**
 * 2026-09-16 (CI-ийн `database-tests` job-ийн ЭХНИЙ бодит ажиллалт улаан гарав):
 * drizzle-kit-ийн ЭХНИЙ 7 файл (0000–0006) тэмдгээ өөрийн мөрөнд биш, statement-
 * ийн ард нааж бичдэг байсан:
 *
 *     CREATE INDEX `orders_user_idx` ON `orders` (`userId`);--> statement-breakpoint
 *
 * Дээрх мөрийн эхлэлд тулгуурласан regex үүнийг хуваадаггүй тул MySQL-д тэмдэг нь
 * SQL-ийн нэг хэсэг болж очиж, "You have an error in your SQL syntax ... near
 * '--> statement-breakpoint'" гэж унадаг байв. Өөрөөр хэлбэл chain нь ХООСОН DB
 * дээр хэзээ ч бүрэн ажиллаж байгаагүй.
 *
 * `;`-ийн ард ирсэн тэмдгийг өөрийн мөрөнд буулгаж нормчилно. Зөвхөн `;`-ийн
 * дараах хэлбэрийг хүлээн авдаг тул тэмдгийг ЗҮГЭЭР дурдсан тайлбар (0010) хуваагдах
 * эрсдэл хэвээр байхгүй.
 */
const normaliseBreakpoints = (sql: string) => sql.replace(/;[ \t]*-->[ \t]*statement-breakpoint/g, ";\n--> statement-breakpoint");
/** True when the chunk holds something other than `--` / block comments. */
const hasStatement = (chunk: string) => chunk.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").some(line => line.trim() && !line.trim().startsWith("--"));

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const plan = planMysqlConnection(process.env.DATABASE_URL);
  const connection = await mysql.createConnection({ ...plan.options, multipleStatements: true, timezone: "Z" });
  let applied = 0, skipped = 0;
  for (const file of files) {
    const chunks = normaliseBreakpoints(readFileSync(join(dir, file), "utf8")).split(BREAKPOINT).map(chunk => chunk.trim()).filter(hasStatement);
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
