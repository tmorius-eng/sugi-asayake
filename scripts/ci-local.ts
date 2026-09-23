/**
 * CI-г локал дээр яг давтах (2026-09-16).
 *
 * Яагаад хэрэгтэй вэ: локал `pnpm test` нь ЖИНХЭНЭ production схем дээр
 * ажилладаг, CI нь migration гинжээс байгуулсан ХООСОН схем дээр. Хоёрын
 * зөрүү 2026-09-16-нд 42 файлыг CI-д унагаасан ба локал дээр бүгд ногоон
 * байсан. Энэ script нь CI-ийн алхмуудыг яг дараалуулж ажиллуулна:
 *
 *   1. `sugi_migtest` схемийн БҮХ хүснэгтийг устгана (CI бүрт хоосон DB).
 *   2. `db-apply-all-migrations.ts`
 *   3. `ci-seed.ts`
 *   4. CI-ийн орчны хувьсагчаар vitest (S3/verify.mn түлхүүрийг ХООСОН
 *      болгоно — эс бөгөөс локалын `.env` тэднийг нөхөж, CI-д унадаг
 *      тестүүд энд ногоон гарна).
 *
 * ⚠️ Схемээ цэвэрлэлгүйгээр дахин ажиллуулбал өмнөх ажиллалтын өгөгдөл
 * үлдэж ХУДАЛ ногоон гарна — 2026-09-16-нд яг ингэж хуурагдсан.
 *
 * Хэрэглээ:
 *   pnpm exec tsx scripts/ci-local.ts                      # бүх тест
 *   pnpm exec tsx scripts/ci-local.ts server/foo.test.ts   # зөвхөн нэг файл
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { spawnSync } from "node:child_process";
import { planMysqlConnection } from "../server/_core/dbConnection";

const SCHEMA = "sugi_migtest";
const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

const target = new URL(process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? "");
target.pathname = `/${SCHEMA}`;

async function wipe(): Promise<number> {
  const connection = await mysql.createConnection({ ...planMysqlConnection(target.toString()).options, multipleStatements: true });
  const [rows] = await connection.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [SCHEMA]);
  const names = (rows as { TABLE_NAME: string }[]).map(row => row.TABLE_NAME);
  if (names.length) {
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    await connection.query(names.map(name => `DROP TABLE IF EXISTS \`${name}\``).join(";"));
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
  }
  await connection.end();
  return names.length;
}

const baseEnv = { ...process.env, DATABASE_URL: target.toString(), DATABASE_ADMIN_URL: "" };

// 2026-09-23: алхам бүрийн exit code-ийг ШАЛГАНА. Өмнө нь үл тоодог байсан тул
// эвдэрсэн migration гинж юу ч хэвлэлгүй (шүүлтүүр "FAILED"-ийг барьдаггүй),
// vitest хагас схем дээр ажиллаж, скрипт 0-ээр гардаг — "push-ээс өмнө
// ci-local" дүрэм худал ногоон өгдөг байв.
function run(args: string[], env: NodeJS.ProcessEnv = baseEnv): { status: number; text: string } {
  const result = spawnSync("pnpm", args, { env, encoding: "utf8", shell: true });
  return { status: result.status ?? 1, text: ((result.stdout ?? "") + (result.stderr ?? "")).replace(ANSI, "") };
}
function step(label: string, args: string[], pattern: RegExp) {
  const result = run(args);
  console.log(pick(result.text, pattern));
  if (result.status !== 0) {
    console.error(`
${label} АМЖИЛТГҮЙ (exit ${result.status}):
${result.text.slice(-3000)}`);
    process.exit(result.status || 1);
  }
}

const pick = (text: string, pattern: RegExp) => text.split("\n").filter(line => pattern.test(line)).join("\n");

console.log(`wiped ${await wipe()} tables from ${SCHEMA}`);
step("migration гинж", ["exec", "tsx", "scripts/db-apply-all-migrations.ts", "--strict"], /Applied|FAILED|error|^skip/i);
step("ci-seed", ["exec", "tsx", "scripts/ci-seed.ts"], /branches:|categories:|error/i);

const testEnv: NodeJS.ProcessEnv = {
  ...baseEnv,
  RUN_AUTH_INTEGRATION_TESTS: "1",
  COMMERCE_INTEGRATION_TESTS: "1",
  NOTIFICATIONS_SUPPRESS: "1",
  ADMIN_FACE_GATE_ENABLED: "0",
  MODERATION_MODEL: "0",
  S3_BUCKET: "", S3_REGION: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "", S3_PUBLIC_BASE_URL: "",
  VERIFY_MN_API_KEY: "",
};
const tests = run(["exec", "vitest", "run", "--no-file-parallelism", ...process.argv.slice(2)], testEnv);
const output = tests.text;
const failures = output.indexOf("Failed Tests");
if (failures >= 0) console.log(output.slice(failures, failures + 4000));
console.log(pick(output, /Test Files|Tests {2}/));
process.exit(tests.status);
