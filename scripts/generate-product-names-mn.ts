// Монгол нэр (2026-09-20, Tom: "бүх барааг монгол хэл дээрх нэр рүү шилжүүл").
//
// 984 барааны нэр латин ("Cocochi Essence Cream & Mask") — Claude API-аар нэг
// удаа монгол нэр үүсгэнэ (`products.nameMn`). Сэтгэгдлийн moderation-тай ижил
// ANTHROPIC_API_KEY, ижил модель. Дүрэм: брэндийг ЛАТИНААР хэвээр (галиглахгүй),
// хэмжээ/тоо хэвээр, ≤60 тэмдэгт, монгол хэлний бүтээгдэхүүний нэршил.
//
// Анхдагчаар DRY RUN: docs/product-names-mn.csv бичнэ (id, sku, brand, name,
// nameMn) — Tom харна. `--apply` нь products.nameMn-ийг ЗӨВХӨН NULL мөрөнд
// бичнэ (admin-ий засварыг дарахгүй) — өмнө нь backup: powershell scripts/db-backup.ps1.
// `--limit N` нь эхний N барааг л (туршилт). CSV-г дахин ашиглах: `--from-csv`
// нь API дуудахгүй, docs/product-names-mn.csv-ийн nameMn-ийг бичнэ (Tom CSV-д
// засвар хийсэн бол яг тэр засвар орно).
//
//   pnpm exec tsx scripts/generate-product-names-mn.ts --limit 40        # туршилт
//   pnpm exec tsx scripts/generate-product-names-mn.ts                   # dry run → CSV
//   pnpm exec tsx scripts/generate-product-names-mn.ts --apply           # API + бичих
//   pnpm exec tsx scripts/generate-product-names-mn.ts --apply --from-csv # CSV-ээс бичих
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, invalidateCatalogSource } from "../server/db";
import { productCategories, products } from "../drizzle/schema";

const APPLY = process.argv.includes("--apply");
const FROM_CSV = process.argv.includes("--from-csv");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const CSV_PATH = "docs/product-names-mn.csv";
const BATCH_SIZE = 25;

const SYSTEM = `You translate Japanese retail product names into natural Mongolian (Cyrillic) product names for SUGI ASAYAKE, a Japanese skincare, hair, body, oral-care, supplement and household shop in Ulaanbaatar.

Rules for each name:
- Keep the BRAND exactly as written in Latin letters (Cocochi, PRIECLAT, S-Select, BA-YU, Daisy Doll). Never transliterate a brand into Cyrillic.
- Translate the product TYPE and descriptors into the Mongolian words Mongolian beauty retail actually uses: крем, эмульс, тонер, лосьон, серум, эссенц, нүүрний маск, нүүр угаагч, цэвэрлэгч тос, наранаас хамгаалагч, шампунь, кондиционер, үсний treatment → үсний нөхөн сэргээгч, бие угаагч, биеийн лосьон, гарын тос, дезодорант, шүдний оо, шүдний сойз, нойтон салфетка, хоол тэжээлийн нэмэлт, коллаген, цай.
- Keep sizes, counts and codes as written (600ml, 30 sheets → 30 ширхэг, x3 → 3 ширхэг, SPF50, No.2).
- Keep line/series names that are proper nouns in Latin (Gokujyun, Melano CC, Moist Diane) unless a Mongolian reading is standard.
- Skin/hair descriptors: for dry skin → хуурай арьсанд, moisturizing → чийгшүүлэгч, brightening → цайруулагч, anti-aging → хөгшрөлтийн эсрэг, sensitive → мэдрэмтгий арьсанд, damage repair → гэмтсэн үс сэргээгч.
- At most 60 characters. Title style: brand first, then the Mongolian type, then descriptors and size. No quotes, no trailing period.
- If a name is already Mongolian (Cyrillic), return it unchanged. Gift cards ("Бэлгийн карт") stay unchanged.

Return one Mongolian name per input id.`;

const OutputSchema = z.object({
  names: z.array(z.object({ id: z.number().int(), nameMn: z.string().min(1).max(200) })),
});

type Row = { id: number; sku: string; name: string; brand: string | null; categoryName: string | null; shortDescription: string | null; nameMn: string | null };

function toCsv(rows: Array<{ id: number; sku: string; brand: string | null; name: string; nameMn: string }>): string {
  const cell = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return ["id,sku,brand,name,nameMn", ...rows.map(row => [row.id, row.sku, row.brand, row.name, row.nameMn].map(cell).join(","))].join("\n") + "\n";
}

function fromCsv(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = text.split(/\r?\n/).slice(1).filter(Boolean);
  for (const line of lines) {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      if (quoted) {
        if (char === '"' && line[index + 1] === '"') { current += '"'; index++; }
        else if (char === '"') quoted = false;
        else current += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") { cells.push(current); current = ""; }
      else current += char;
    }
    cells.push(current);
    const id = Number(cells[0]);
    const nameMn = (cells[4] ?? "").trim();
    if (id && nameMn) map.set(id, nameMn);
  }
  return map;
}

async function translateBatch(client: Anthropic, batch: Row[]): Promise<Map<number, string>> {
  const lines = batch.map(row => `id=${row.id} | brand=${row.brand ?? "-"} | category=${row.categoryName ?? "-"} | name=${row.name}${row.shortDescription && !/Японы жинхэнэ/.test(row.shortDescription) ? ` | note=${row.shortDescription.slice(0, 120)}` : ""}`);
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4_000,
    output_config: { effort: "low", format: zodOutputFormat(OutputSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Translate these ${batch.length} product names:\n${lines.join("\n")}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("Модель татгалзлаа (refusal).");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Хариу JSON-д таарсангүй.");
  const map = new Map<number, string>();
  for (const item of parsed.names) map.set(item.id, item.nameMn.trim().replace(/\.$/, "").slice(0, 200));
  return map;
}

(async () => {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");
  const rows: Row[] = await db.select({
    id: products.id, sku: products.sku, name: products.name, brand: products.brand,
    categoryName: productCategories.name, shortDescription: products.shortDescription, nameMn: products.nameMn,
  }).from(products).leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(eq(products.isPublished, true), isNull(products.nameMn)))
    .orderBy(asc(products.id))
    .limit(Number.isFinite(LIMIT) ? LIMIT : 100_000);
  console.log(`${rows.length} бараа монгол нэргүй.`);
  if (!rows.length) { process.exit(0); }

  let translations: Map<number, string>;
  if (FROM_CSV) {
    translations = fromCsv(readFileSync(CSV_PATH, "utf8"));
    console.log(`${CSV_PATH}-ээс ${translations.size} нэр уншлаа.`);
  } else {
    if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY тохируулаагүй — .env-д нэмнэ үү (moderation-тай ижил түлхүүр)."); process.exit(1); }
    const client = new Anthropic({ timeout: 120_000, maxRetries: 2 });
    translations = new Map();
    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      const batch = rows.slice(index, index + BATCH_SIZE);
      try {
        const result = await translateBatch(client, batch);
        result.forEach((value, key) => translations.set(key, value));
        console.log(`  ${Math.min(index + BATCH_SIZE, rows.length)}/${rows.length}`);
      } catch (error) {
        console.error(`  багц ${index}: ${error instanceof Error ? error.message : error}`);
      }
    }
    const csvRows = rows.map(row => ({ id: row.id, sku: row.sku, brand: row.brand, name: row.name, nameMn: translations.get(row.id) ?? "" }));
    writeFileSync(CSV_PATH, toCsv(csvRows), "utf8");
    console.log(`${CSV_PATH}: ${translations.size}/${rows.length} нэр бичигдлээ.`);
  }

  if (!APPLY) { console.log("Dry run — DB-д юу ч бичээгүй. Бичихийн тулд --apply (эсвэл CSV засаад --apply --from-csv)."); process.exit(0); }
  let written = 0;
  for (const row of rows) {
    const nameMn = translations.get(row.id);
    if (!nameMn || nameMn === row.name) continue;
    await db.update(products).set({ nameMn }).where(and(eq(products.id, row.id), isNull(products.nameMn)));
    written++;
  }
  invalidateCatalogSource();
  console.log(`${written} бараанд nameMn бичигдлээ.`);
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
