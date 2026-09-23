import "dotenv/config";
import { readdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb } from "../server/db";

/**
 * Аль migration ажилласан, аль нь дутуу байгааг харуулна (2026-09-20).
 *
 * Яагаад хэрэгтэй вэ: `deploy.ps1 -Staging` нь ЗӨВХӨН кодыг зөөдөг, migration-ийг
 * зөөдөггүй. Өмнө нь "аль нь ажилласан" гэдгийг HISTORY.md-ийн текстээс л мэдэх
 * боломжтой байсан тул production ба staging хоёрын схем чимээгүй зөрч,
 * 2026-09-16-нд staging дээр /careers болон admin-ий бүтээгдэхүүн хадгалах хоёр
 * 500 алдаа өгснөөр л илэрсэн. Одоо зөрүүг нэг командаар харна.
 *
 *   pnpm exec tsx scripts/db-migration-status.ts
 *   pnpm exec tsx scripts/db-migration-status.ts --staging
 *
 * Дутуу байвал exit code 1 (CI/скриптэд хэрэглэхэд тохиромжтой).
 *
 * ⚠️ `schema_migrations` хүснэгт 2026-09-20-нд нэмэгдсэн тул түүнээс ӨМНӨХ
 * migration-ууд бүртгэлгүй байж болно (схемд нь ажилласан байхад). Нэг удаа
 * бүртгэх: `db-apply-migration.ts <файлууд> --mark-applied` (ажиллуулахгүй,
 * зөвхөн бүртгэнэ). Тиймээс "дутуу" жагсаалтыг эхний удаад нүдээр шалга.
 */
async function main() {
  // 2026-09-23: admin URL нь ЗӨВХӨН ижил схем рүү заасан үед л DATABASE_URL-ийг
  // орлоно. Өмнө нь `$env:DATABASE_URL=".../sugi_staging"` гэж эхлээд staging-д
  // туршихаар тохируулсан ч .env-ийн DATABASE_ADMIN_URL (defaultdb) түүнийг
  // чимээгүй дарж, migration PRODUCTION-д ажиллаж бүртгэгддэг байв.
  const schemaOf = (value: string | undefined) => { try { return value ? new URL(value).pathname.replace(/^\//, "") : ""; } catch { return ""; } };
  if (process.env.DATABASE_ADMIN_URL) {
    if (process.env.DATABASE_URL && schemaOf(process.env.DATABASE_URL) !== schemaOf(process.env.DATABASE_ADMIN_URL)) {
      console.error(`DATABASE_URL (${schemaOf(process.env.DATABASE_URL)}) ба DATABASE_ADMIN_URL (${schemaOf(process.env.DATABASE_ADMIN_URL)}) өөр схем рүү заасан — аль рүү ажиллуулахаа тодорхойгүй тул зогслоо. Staging-д бол --staging ашигла.`);
      process.exit(2);
    }
    process.env.DATABASE_URL = process.env.DATABASE_ADMIN_URL;
  }
  const staging = process.argv.includes("--staging");
  if (staging && process.env.DATABASE_URL) {
    const swapped = process.env.DATABASE_URL.replace(/\/defaultdb(\?|$)/, "/sugi_staging$1");
    if (swapped === process.env.DATABASE_URL) {
      console.error("--staging: DATABASE_URL нь /defaultdb руу заагаагүй тул сольж чадсангүй.");
      process.exit(2);
    }
    process.env.DATABASE_URL = swapped;
  }

  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL тавигдаагүй (эсвэл холболт амжилтгүй).");
    process.exit(1);
  }

  const onDisk = readdirSync("drizzle").filter(name => name.endsWith(".sql")).sort();

  let applied = new Set<string>();
  try {
    const rows = await db.execute(sql`SELECT name FROM schema_migrations`);
    applied = new Set((rows[0] as unknown as { name: string }[]).map(row => row.name));
  } catch {
    console.log("schema_migrations хүснэгт хараахан үүсээгүй — бүртгэл хоосон гэж үзнэ.\n");
  }

  const missing = onDisk.filter(name => !applied.has(name));
  const unknown = [...applied].filter(name => !onDisk.includes(name)).sort();

  console.log(`Схем:      ${staging ? "sugi_staging" : "production (defaultdb)"}`);
  console.log(`Дискэн дээр: ${onDisk.length} migration`);
  console.log(`Бүртгэгдсэн: ${applied.size}`);
  console.log(`Дутуу:      ${missing.length}`);
  if (unknown.length) console.log(`⚠️ Бүртгэлд байгаа ч дискэн дээр алга: ${unknown.join(", ")}`);

  if (missing.length) {
    console.log("\nДутуу migration-ууд (дарааллаар нь ажиллуул):");
    for (const name of missing) {
      console.log(`  pnpm exec tsx scripts/db-apply-migration.ts drizzle/${name}${staging ? " --staging" : ""}`);
    }
    process.exit(1);
  }

  console.log("\n✅ Зөрүүгүй.");
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
