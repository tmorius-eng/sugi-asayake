// Preference Profile v2 (2026-09-01) bulk auto-tag → v3 (2026-09-20).
//
// Амьд каталогийг бодитоор уншихад 937-оос ердөө 4 бараа personalization tag-тай
// байсан тул санал болгох хөдөлгүүрт оноо өгөх зүйл бараг байсангүй. Дүрэмд
// суурилсан keyword matcher (shared/product-tagging.ts suggestTagsForProduct):
// барааны өөрийн нэр/тайлбарт олдсон бодит дохио, ангиллаар хаалттай тул
// холилдохгүй (арьсны үг үсний барааг tag хийхгүй).
//
// v3 (Tom: шинж чанарыг ЗӨВХӨН дүрмээр, AI-гүй) — шинэ баганууд:
//   productType  — барааны төрөл (цэвэрлэгч/серум/шампунь/бие угаагч …)
//   skinTypes    — ОЛОН утга ("dry,normal,combination") эсвэл "all"
//   bodySkinType / bodyConcerns — биеийн арчилгаа
// ⛔ Хуучин 2-р шат ("ангиллын анхдагч": арьсны бараанд skinType="normal",
// үснийд hairType="normal") УСТГАГДСАН — 561 placeholder "normal" нь яг
// "санал болголт буруу" гэсэн Tom-ийн гомдлын шалтгаан байв (хэвийн арьстай
// хүн санамсаргүй 561 бараа, тослог арьстай хүн 5 бараа авдаг). Одоо
// дохиогүй арьсны бараа `skinTypes="all"` (бага жин) авна, ганц `skinType`
// хоосон үлдэнэ.
//
// Хоёулаа admin аль хэдийн тавьсан талбарыг ХЭЗЭЭ Ч дарж бичихгүй (бичилт бүр
// тухайн баганад isNull-аар хамгаалагдсан). Хэзээ ч дахин ажиллуулахад аюулгүй.
// Анхдагчаар DRY RUN (төрөл, төрлийн тархалтын тайлан хэвлэнэ, юу ч бичихгүй).
//
// Хэрэглээ:
//   pnpm exec tsx scripts/auto-tag-products.ts             # dry run (анхдагч)
//   pnpm exec tsx scripts/auto-tag-products.ts --apply      # бодитоор бичнэ
//
// Бодит DB дээр --apply хийхээсээ өмнө шинэ backup ав: powershell scripts/db-backup.ps1
import "dotenv/config";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../server/db";
import { adminAuditLogs, products, productCategories, type InsertProduct } from "../drizzle/schema";
import { suggestTagsForProduct, type SuggestedTags } from "../shared/product-tagging";

const APPLY = process.argv.includes("--apply");
// --retype: одоо байгаа productType-ийг ДАХИН тооцоолж зөрүүтэйг нь засна
// (2026-09-20). Дүрэм сайжрахад хуучин буруу ангилал (жишээ нь "30-Pack" →
// маск) өөрөө засагдахгүй байсан. Зөвхөн энэ нэг баганад үйлчилнэ.
const RETYPE = process.argv.includes("--retype");
// 2026-09-23: --retype нь admin-аас гараар засварласан барааг АЛГАСНА (толгойн
// "admin тавьсан талбарыг хэзээ ч дарж бичихгүй" амлалт). productType-ийн эх
// сурвалжийг хадгалдаггүй тул admin-ий маягтаар хадгалсан/үүсгэсэн (аудитын
// `product.created` / `product.updated`, bulk нийтлэлтээс бусад) бараа бүр
// "гараар тавьсан байж магадгүй" гэж тооцогдоно. Бүгдийг нь дахин ангилах бол --retype-all.
const RETYPE_ALL = process.argv.includes("--retype-all");

const COLUMNS = ["skinType", "skinTypes", "skinConcerns", "hairType", "hairConcerns", "fragrancePreference", "wellnessInterests", "productType", "bodySkinType", "bodyConcerns"] as const;
type Column = (typeof COLUMNS)[number];

function tally(map: Map<string, number>, key: string | null | undefined) {
  const label = key ?? "(хоосон)";
  map.set(label, (map.get(label) ?? 0) + 1);
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required.");

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      shortDescription: products.shortDescription,
      description: products.description,
      categorySlug: productCategories.slug,
      categoryName: productCategories.name,
      skinType: products.skinType,
      skinTypes: products.skinTypes,
      skinConcerns: products.skinConcerns,
      hairType: products.hairType,
      hairConcerns: products.hairConcerns,
      fragrancePreference: products.fragrancePreference,
      wellnessInterests: products.wellnessInterests,
      productType: products.productType,
      bodySkinType: products.bodySkinType,
      bodyConcerns: products.bodyConcerns,
    })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(RETYPE ? eq(products.isPublished, true) : or(...COLUMNS.map(column => isNull(products[column])))!);

  const typeDistribution = new Map<string, number>();
  const retypes: Array<{ id: number; from: string | null; to: string; name: string }> = [];
  const skinTypesDistribution = new Map<string, number>();
  const bodyDistribution = new Map<string, number>();
  let writes = 0;
  let untyped = 0;
  const untypedSamples: string[] = [];

  const adminEdited = new Set<number>();
  if (RETYPE && !RETYPE_ALL) {
    const edits = await db.select({ id: adminAuditLogs.entityId, metadataJson: adminAuditLogs.metadataJson }).from(adminAuditLogs)
      .where(and(eq(adminAuditLogs.entityType, "product"), or(eq(adminAuditLogs.action, "product.updated"), eq(adminAuditLogs.action, "product.created"))));
    for (const edit of edits) if (edit.id != null && !(edit.metadataJson ?? "").includes('"bulk":true')) adminEdited.add(edit.id);
    console.log(`--retype: admin-аас засварласан ${adminEdited.size} барааг алгасна (--retype-all бол бүгд).`);
  }
  for (const row of rows) {
    const suggestion: SuggestedTags = suggestTagsForProduct({
      name: row.name, brand: row.brand, categorySlug: row.categorySlug,
      shortDescription: row.shortDescription, description: row.description,
    });

    const patch: Partial<Record<Column, string>> = {};
    if (row.skinType == null && suggestion.skinType) patch.skinType = suggestion.skinType;
    if (row.skinTypes == null && suggestion.skinTypes?.length) patch.skinTypes = suggestion.skinTypes.join(",");
    if (row.skinConcerns == null && suggestion.skinConcerns?.length) patch.skinConcerns = suggestion.skinConcerns.join(",");
    if (row.hairType == null && suggestion.hairType) patch.hairType = suggestion.hairType;
    if (row.hairConcerns == null && suggestion.hairConcerns?.length) patch.hairConcerns = suggestion.hairConcerns.join(",");
    if (row.fragrancePreference == null && suggestion.fragrancePreference) patch.fragrancePreference = suggestion.fragrancePreference;
    if (row.wellnessInterests == null && suggestion.wellnessInterests?.length) patch.wellnessInterests = suggestion.wellnessInterests.join(",");
    if (row.productType == null && suggestion.productType) patch.productType = suggestion.productType;
    else if (RETYPE && !adminEdited.has(row.id) && suggestion.productType && suggestion.productType !== row.productType) retypes.push({ id: row.id, from: row.productType, to: suggestion.productType, name: row.name });
    if (row.bodySkinType == null && suggestion.bodySkinType) patch.bodySkinType = suggestion.bodySkinType;
    if (row.bodyConcerns == null && suggestion.bodyConcerns?.length) patch.bodyConcerns = suggestion.bodyConcerns.join(",");

    tally(typeDistribution, row.productType ?? patch.productType ?? null);
    tally(skinTypesDistribution, row.skinTypes ?? patch.skinTypes ?? null);
    if (row.bodySkinType ?? patch.bodySkinType) tally(bodyDistribution, row.bodySkinType ?? patch.bodySkinType);
    if (!(row.productType ?? patch.productType)) { untyped++; if (untypedSamples.length < 25) untypedSamples.push(`${row.categoryName ?? "?"} · ${row.name}`); }

    if (Object.keys(patch).length > 0) {
      writes++;
      if (APPLY) {
        // Column-by-column isNull guard (not just the WHERE above, which is
        // OR'd across all columns) -- a product missing only e.g.
        // wellnessInterests must not get its untouched skinType clobbered.
        const guards = (Object.keys(patch) as Column[]).map(column => isNull(products[column]));
        // Enum баганууд (skinType, hairType …) зөвхөн suggestTagsForProduct-ийн
        // өөрийн union утгаас ирдэг тул энэ cast нь төрлийн хэлбэр л, утга биш.
        await db.update(products).set(patch as Partial<InsertProduct>).where(and(eq(products.id, row.id), ...guards));
      }
    }
  }

  if (RETYPE) {
    console.log(`\n--- дахин ангилах: ${retypes.length} бараа ---`);
    for (const item of retypes.slice(0, 40)) console.log(`  ${item.from} -> ${item.to}   ${item.name}`);
    if (APPLY) for (const item of retypes) await db.update(products).set({ productType: item.to }).where(eq(products.id, item.id));
  }
  const print = (title: string, map: Map<string, number>) => {
    console.log(`\n${title}`);
    for (const [key, count] of Array.from(map.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(5)}  ${key}`);
  };
  console.log(APPLY ? "APPLIED (real writes made):" : "DRY RUN (no writes made -- pass --apply to write for real):");
  print("productType тархалт (одоо байгаа + санал):", typeDistribution);
  print("skinTypes тархалт:", skinTypesDistribution);
  print("bodySkinType тархалт:", bodyDistribution);
  console.log(`\nТөрөлгүй үлдэх: ${untyped}`);
  for (const sample of untypedSamples) console.log(`    - ${sample}`);
  console.log(`\n${rows.length} бараанаас ${writes} ${APPLY ? "шинэчлэгдлээ" : "шинэчлэгдэнэ"}.`);
  if (!APPLY) console.log("\nThis was a dry run -- nothing was written. Re-run with --apply to write for real (take a fresh backup first: powershell scripts/db-backup.ps1).");
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
