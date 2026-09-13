// 2026-09-13: import the products the shop's POS list has that the website
// does not, and create the "Хүнс" (Food) category they mostly belong to.
//
// Source: Tom's POS export "shine baraanuudad nemegdsen list.csv"
// (Selection;barcode;name;barcode;;;price — semicolon-separated, latin1,
// Cyrillic names came through as "?"). 980 rows; 937 barcodes already exist
// as products.sku, 43 do not. Those 43 are almost all food (mochi, jelly,
// tea, chocolate, cookies), plus toilet paper and two knee/calf supports.
//
// Goes through createAdminProduct / createAdminCategory so every invariant
// the admin form relies on holds (default variant, branch stock ledger,
// storefront cache invalidation) -- never a raw INSERT into products.
//
//   pnpm exec tsx scripts/import-pos-products.ts            # dry run
//   pnpm exec tsx scripts/import-pos-products.ts --apply    # write
//
// Defaults for what the POS list does not carry: stock 20 (what every
// existing product was seeded with), published, no photo. Names that lost
// their Cyrillic in the export are imported with the barcode appended so
// they are findable and renamable in /admin, and listed at the end.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createAdminCategory, createAdminProduct, findProductBySku, getDb } from "../server/db";
import { productCategories } from "../drizzle/schema";
import { slugify } from "../shared/slugify";
import { eq } from "drizzle-orm";

const apply = process.argv.includes("--apply");
const CSV = process.argv.find((a) => a.endsWith(".csv")) ?? "C:/Users/sugia/Downloads/shine baraanuudad nemegdsen list.csv";

type Row = { barcode: string; name: string; price: number };
const rows: Row[] = readFileSync(CSV, "latin1")
  .split(/\r?\n/)
  .slice(1)
  .filter((l) => l.trim() && !l.startsWith(";"))
  .map((l) => {
    const p = l.split(";");
    return { barcode: p[1].trim(), name: p[2].replace(/^"|"$/g, "").replace(/""/g, '"').replace(/\s+/g, " ").trim(), price: Number((p[6] ?? "").replace(/,/g, "")) };
  });

// Which of the shop's categories each new item belongs to. The POS has nine
// English categories; the website keeps its six Mongolian ones plus the new
// Хүнс. Anything not matched below goes to Хүнс -- the list is 35/43 food.
const HOUSEHOLD = /toilet paper|^SD LC/i;
const HEALTH = /knee support|calves/i;

const BRANDS = ["Meito", "Bourbon", "Kabaya", "Calbee", "Happy pocket", "Nikkon"];
function brandOf(name: string): string | null {
  const hit = BRANDS.find((b) => name.toLowerCase().startsWith(b.toLowerCase()));
  return hit ?? null;
}

/** "Toilet paper /?????/" -> "Toilet paper (4902727011443)": keeps the
 *  legible part, drops the lost Cyrillic, and makes the row unique. */
function cleanName(row: Row): { name: string; lostCyrillic: boolean } {
  const lost = /\?{2,}/.test(row.name);
  if (!lost) return { name: row.name, lostCyrillic: false };
  const kept = row.name.replace(/\/?\s*\?[\s?-]*\/?/g, " ").replace(/\s+/g, " ").trim();
  return { name: `${kept || "Бараа"} (${row.barcode})`, lostCyrillic: true };
}

const db = await getDb();
if (!db) throw new Error("no database");

const existingSlugs = new Set((await db.select({ slug: productCategories.slug }).from(productCategories)).map((r) => r.slug));
const bySlug = async (slug: string) => (await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.slug, slug)).limit(1))[0]?.id;

const fresh: Row[] = [];
for (const row of rows) if (!(await findProductBySku(row.barcode))) fresh.push(row);
console.log(`${rows.length} rows in POS list, ${fresh.length} not on the website yet.`);

let foodId = await bySlug("khuns");
if (!foodId) {
  console.log(`category "Хүнс" (khuns) ${apply ? "will be created" : "would be created"}`);
  if (apply) {
    const created = await createAdminCategory({ name: "Хүнс", slug: "khuns", description: "Японы амттан, цай, жимсний желе, чихэр — гэр бүлдээ зориулсан жижиг баяр.", sortOrder: 7, isActive: true });
    foodId = created.id;
  }
}
const householdId = await bySlug("eruul-akhui");
const healthId = await bySlug("eruul-mend");
if (!householdId || !healthId) throw new Error("expected categories eruul-akhui / eruul-mend to exist");

const renameLater: string[] = [];
let n = 0;
for (const row of fresh) {
  const { name, lostCyrillic } = cleanName(row);
  const categoryId = HOUSEHOLD.test(name) ? householdId : HEALTH.test(name) ? healthId : foodId!;
  const catLabel = categoryId === householdId ? "Эрүүл ахуй" : categoryId === healthId ? "Эрүүл мэнд" : "Хүнс";
  const slug = `${slugify(name.replace(/\(\d+\)$/, "").trim()) || "baraa"}-${row.barcode.slice(-6)}`;
  console.log(`${apply ? "+" : "~"} ${catLabel.padEnd(10)} ${String(row.price).padStart(7)}₮  ${name}${lostCyrillic ? "   <- нэр засах" : ""}`);
  if (lostCyrillic) renameLater.push(`${row.barcode}  ${name}`);
  if (!apply || !foodId) continue;
  await createAdminProduct({
    categoryId,
    name,
    slug,
    brand: brandOf(name),
    priceMnt: row.price,
    sku: row.barcode,
    stockQuantity: 20,
    isPublished: true,
  });
  n += 1;
}

if (renameLater.length) console.log(`\n${renameLater.length} name(s) lost their Cyrillic in the POS export -- rename in /admin → Бүтээгдэхүүн:\n  ${renameLater.join("\n  ")}`);
console.log(apply ? `\nImported ${n} product(s).` : `\nDry run. Re-run with --apply to write.`);
process.exit(0);
