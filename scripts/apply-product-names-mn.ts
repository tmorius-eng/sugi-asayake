// Монгол нэрийг бичих (2026-09-20). Оролт нь `id<TAB>nameMn` бүхий энгийн
// текст файл (мөр бүр нэг бараа; `#`-ээр эхэлсэн мөр тайлбар). CSV биш учир нь
// нэр дотор таслал, хашилт чөлөөтэй байж болно.
//
// Зөвхөн `nameMn` нь ХООСОН мөрөнд бичнэ — admin эсвэл өмнөх ажиллалтын
// засварыг хэзээ ч дарж бичихгүй. `--force` нь энэ хамгаалалтыг тайлна
// (зөвхөн зориудаар дахин нэрлэх үед).
//
//   pnpm exec tsx scripts/apply-product-names-mn.ts docs/product-names-mn.tsv
//   pnpm exec tsx scripts/apply-product-names-mn.ts <file> --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, invalidateCatalogSource } from "../server/db";
import { products } from "../drizzle/schema";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

(async () => {
  const file = process.argv.slice(2).find(argument => !argument.startsWith("--"));
  if (!file) { console.error("Хэрэглээ: pnpm exec tsx scripts/apply-product-names-mn.ts <файл.tsv> [--apply] [--force]"); process.exit(2); }
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");

  const pairs: Array<{ id: number; nameMn: string }> = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [rawId, ...rest] = line.split("\t");
    const id = Number(rawId);
    const nameMn = rest.join("\t").trim();
    if (!id || !nameMn) { console.warn(`  алгассан мөр: ${line.slice(0, 60)}`); continue; }
    if (nameMn.length > 200) { console.warn(`  хэт урт (${nameMn.length}), алгаслаа: ${id}`); continue; }
    pairs.push({ id, nameMn });
  }
  console.log(`${pairs.length} нэр уншлаа (${file}).`);

  let written = 0;
  for (const pair of pairs) {
    const where = FORCE ? eq(products.id, pair.id) : and(eq(products.id, pair.id), isNull(products.nameMn));
    if (APPLY) {
      const result = await db.update(products).set({ nameMn: pair.nameMn }).where(where);
      written += Number((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
    }
  }
  if (!APPLY) { console.log("Dry run — юу ч бичээгүй. Бичихийн тулд --apply."); process.exit(0); }
  invalidateCatalogSource();
  console.log(`${written} бараанд монгол нэр бичигдлээ.`);
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
