// 2026-09-14: fill products.ingredients / netContent / countryOfOrigin from
// the Open Food Facts / Open Beauty Facts / Open Products Facts databases
// (Open Database License; per-record contents under the Database Contents
// License -- text facts, no images are copied).
//
// The projects ask that the live API is NOT looped over a catalogue ("1 API
// call = 1 real scan"), so this reads rows from their nightly CSV exports
// instead. The exports are large (food ~0.9 GB gz); the rows for our own
// barcodes are cut out on the VM with scripts/../off-extract (a streaming
// awk over the export, header kept) and the small TSV is passed here:
//
//   pnpm exec tsx scripts/enrich-products-from-open-facts.ts off-beauty.tsv --source openbeautyfacts          # dry run
//   pnpm exec tsx scripts/enrich-products-from-open-facts.ts off-beauty.tsv --source openbeautyfacts --apply
//
// Rules: only EMPTY fields are filled; a product whose factsSource is
// "admin" is never touched (a person edited it in /admin); every write sets
// factsSource to the source name. Nothing else on the product changes.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { products } from "../drizzle/schema";

const file = process.argv[2];
const sourceFlag = process.argv.indexOf("--source");
const source = sourceFlag > 0 ? process.argv[sourceFlag + 1] : "";
const apply = process.argv.includes("--apply");
if (!file || !/^open(food|beauty|products)facts$/.test(source)) {
  console.error("usage: enrich-products-from-open-facts.ts <rows.tsv> --source openfoodfacts|openbeautyfacts|openproductsfacts [--apply]");
  process.exit(1);
}

const text = readFileSync(file, "utf8");
const lines = text.split(/\r?\n/).filter(Boolean);
const header = lines[0].split("\t");
const col = (names: string[]) => names.map(name => header.indexOf(name)).find(index => index >= 0) ?? -1;
const columns = {
  code: col(["code"]),
  name: col(["product_name", "product_name_en"]),
  brands: col(["brands"]),
  quantity: col(["quantity"]),
  ingredients: col(["ingredients_text", "ingredients_text_en"]),
  origins: col(["origins_en", "origins", "manufacturing_places_en", "manufacturing_places"]),
  countries: col(["countries_en", "countries"]),
};
if (columns.code < 0) { console.error("no `code` column in header"); process.exit(1); }

const clean = (value: string | undefined, max: number) => {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  return trimmed && trimmed !== "-" ? trimmed.slice(0, max) : null;
};
/** "Japan", "Japon", "en:japan" -> "Япон"; anything else kept as typed (first entry). */
const originLabel = (raw: string | null): string | null => {
  if (!raw) return null;
  const first = raw.split(",")[0].replace(/^[a-z]{2}:/, "").trim();
  if (!first) return null;
  const map: Record<string, string> = { japan: "Япон", japon: "Япон", korea: "Солонгос", "south korea": "Солонгос", china: "Хятад", france: "Франц", "united states": "АНУ", usa: "АНУ", thailand: "Тайланд", taiwan: "Тайвань", germany: "Герман", italy: "Итали", australia: "Австрали", mongolia: "Монгол" };
  return map[first.toLowerCase()] ?? first.slice(0, 80);
};

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  let matched = 0, filled = 0, skippedAdmin = 0, nothingNew = 0;
  const fieldCounts = { ingredients: 0, netContent: 0, countryOfOrigin: 0 };
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const code = cells[columns.code]?.trim();
    if (!code) continue;
    const [product] = await db.select({ id: products.id, name: products.name, ingredients: products.ingredients, netContent: products.netContent, countryOfOrigin: products.countryOfOrigin, factsSource: products.factsSource })
      .from(products).where(eq(products.sku, code)).limit(1);
    if (!product) continue;
    matched += 1;
    if (product.factsSource === "admin") { skippedAdmin += 1; continue; }
    const ingredients = clean(columns.ingredients >= 0 ? cells[columns.ingredients] : undefined, 10_000);
    const netContent = clean(columns.quantity >= 0 ? cells[columns.quantity] : undefined, 80);
    // Origin: the product's stated origin first; else the country it is sold
    // in only when that is a single country (a Japanese product listed only
    // in Japan) -- a multi-country sales list says nothing about origin.
    const origins = clean(columns.origins >= 0 ? cells[columns.origins] : undefined, 200);
    const countries = clean(columns.countries >= 0 ? cells[columns.countries] : undefined, 200);
    const countryOfOrigin = originLabel(origins) ?? (countries && !countries.includes(",") ? originLabel(countries) : null);
    const changes: Partial<{ ingredients: string; netContent: string; countryOfOrigin: string; factsSource: string }> = {};
    if (!product.ingredients && ingredients) { changes.ingredients = ingredients; fieldCounts.ingredients += 1; }
    if (!product.netContent && netContent) { changes.netContent = netContent; fieldCounts.netContent += 1; }
    if (!product.countryOfOrigin && countryOfOrigin) { changes.countryOfOrigin = countryOfOrigin; fieldCounts.countryOfOrigin += 1; }
    if (!Object.keys(changes).length) { nothingNew += 1; continue; }
    changes.factsSource = source;
    filled += 1;
    console.log(`${apply ? "+" : "~"} ${code}  ${product.name.slice(0, 40).padEnd(40)}  ${Object.keys(changes).filter(key => key !== "factsSource").join(",")}`);
    if (apply) await db.update(products).set({ ...changes, updatedAt: new Date() }).where(eq(products.id, product.id));
  }
  console.log(`\n${source}: ${lines.length - 1} rows in file, ${matched} matched our catalogue, ${filled} ${apply ? "updated" : "would be updated"} (ingredients ${fieldCounts.ingredients}, netContent ${fieldCounts.netContent}, origin ${fieldCounts.countryOfOrigin}); ${skippedAdmin} admin-edited skipped, ${nothingNew} had nothing new.`);
  if (!apply) console.log("Dry run. Re-run with --apply to write.");
  process.exit(0);
}
main().catch(error => { console.error(error); process.exit(1); });
